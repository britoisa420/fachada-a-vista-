// Teste ponta a ponta: sobe um servidor com banco novo e percorre os fluxos reais no navegador.
//   node tests/e2e.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright'); // usa o Playwright instalado no sistema ou no projeto

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(root, 'tests', 'fixtures');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-e2e-'));
const SHOTS = process.env.SHOTS_DIR || path.join(root, 'tests', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;

let passed = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error('FALHOU: ' + msg);
  passed++;
  console.log('  ✓ ' + msg);
};
const step = (s) => console.log('\n▶ ' + s);

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, PAYMENT_PROVIDER: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 50 && !serverLog.includes('rodando'); i++) await new Promise((r) => setTimeout(r, 100));

const db = () => new DatabaseSync(path.join(DATA, 'app.db'), { readOnly: true });
const q1 = (sql, ...p) => { const d = db(); const r = d.prepare(sql).get(...p); d.close(); return r; };

const browser = await chromium.launch();
const mobile = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE });
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
const page = await mobile.newPage();
const admin = await desk.newPage();
const problems = [];
function watch(p, label) {
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) problems.push(`[${label}] console: ${m.text()} @ ${p.url()}`); });
  p.on('pageerror', (e) => problems.push(`[${label}] erro JS: ${e.message} @ ${p.url()}`));
  p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon') && !(r.status() === 401 && r.url().endsWith('/painel/login'))) problems.push(`[${label}] HTTP ${r.status()} ${r.url()}`); });
}
watch(page, 'cliente');
watch(admin, 'painel');
// Captura a tela e confere se nada estoura a largura em celulares pequenos (360px) nem na largura atual
async function shot(p, name) {
  await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
  const vp = p.viewportSize();
  for (const w of [vp.width, 360]) {
    await p.setViewportSize({ width: w, height: vp.height });
    const over = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.filters, .rail, .compare, .sr-only'); });
      return { doc: document.documentElement.scrollWidth > W, els: bad.slice(0, 5).map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') + ' ' + Math.round(e.getBoundingClientRect().right) + '/' + W) };
    });
    if (over.doc || over.els.length) problems.push(`[${name} @${w}px] estouro de largura: ${over.els.join(', ')}`);
  }
  await p.setViewportSize(vp);
}

async function multipart(url, fields, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) [].concat(v).forEach((x) => fd.append(k, x));
  for (const [k, list] of Object.entries(files)) for (const f of [].concat(list)) fd.append(k, new Blob([fs.readFileSync(path.join(FX, f))], { type: 'image/jpeg' }), f);
  const r = await fetch(BASE + url, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
  return { status: r.status, json: await r.json() };
}

try {
  // ===================================================================
  step('Página de vendas');
  await page.goto('/');
  ok((await page.locator('h1').innerText()).includes('Veja como sua loja pode ficar antes de encomendar a placa'), 'título principal');
  ok(await page.getByText('Exemplo de simulação', { exact: true }).first().isVisible(), 'imagem demonstrativa identificada como "Exemplo de simulação"');
  ok(await page.getByText('R$ 99,00').first().isVisible() && await page.getByText('R$ 349,00').first().isVisible(), 'ofertas R$ 99 e R$ 349');
  ok(await page.getByRole('link', { name: 'Simular minha fachada' }).first().isVisible() && await page.getByRole('link', { name: 'Comprar pacote de 5' }).first().isVisible(), 'botões principais');
  const cmp = page.locator('[data-compare]').first();
  const range = cmp.locator('.compare-range');
  await range.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  ok((await range.inputValue()) === '60', 'slider responde ao teclado (setas → 60%)');
  const box = await cmp.boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height / 2);
  const posTap = Number(await range.inputValue());
  ok(posTap >= 22 && posTap <= 28, `slider responde ao toque (toque em 25% → ${posTap}%)`);
  await shot(page, '01-vendas-celular');

  // ===================================================================
  step('Fluxo avulso: formulário com anexos');
  await page.getByRole('link', { name: 'Simular minha fachada' }).first().click();
  await page.waitForURL('**/simular');
  await page.getByRole('button', { name: 'Continuar para o pagamento' }).click();
  ok(await page.getByText('Revise os campos destacados.').isVisible(), 'validação de campos obrigatórios');
  const fachadaInput = page.locator('[data-file-slot][data-name=fachada] input[type=file]');
  await fachadaInput.setInputFiles(path.join(FX, 'pequena.jpg'));
  await page.waitForTimeout(300);
  ok((await page.locator('[data-file-slot][data-name=fachada] [data-error]').innerText()).includes('pequena demais'), 'foto pequena demais é recusada no navegador');
  await fachadaInput.setInputFiles(path.join(FX, 'ref1.jpg'));
  await page.waitForTimeout(300);
  ok(await page.locator('[data-file-slot][data-name=fachada] .preview img').isVisible(), 'prévia da foto da fachada');
  await page.locator('[data-file-slot][data-name=fachada]').getByRole('button', { name: 'Trocar' }).isVisible();
  await fachadaInput.setInputFiles(path.join(FX, 'fachada.jpg')); // substituir
  await page.waitForTimeout(300);
  ok((await page.locator('[data-file-slot][data-name=fachada] .preview-name').innerText()) === 'fachada.jpg', 'foto substituída antes do envio');
  const refs = page.locator('[data-file-slot][data-name=referencias] input[type=file]');
  await refs.setInputFiles(['ref1.jpg', 'ref2.jpg'].map((f) => path.join(FX, f)));
  await refs.setInputFiles(['ref3.jpg', 'ref4.jpg'].map((f) => path.join(FX, f)));
  await page.waitForTimeout(300);
  ok((await page.locator('[data-file-slot][data-name=referencias] .preview').count()) === 3, 'referências limitadas a 3');
  await page.locator('[data-file-slot][data-name=referencias] .preview').nth(1).getByRole('button', { name: /Remover/ }).click();
  ok((await page.locator('[data-file-slot][data-name=referencias] .preview').count()) === 2, 'referência removida antes do envio');
  await page.locator('[data-file-slot][data-name=logo] input[type=file]').setInputFiles(path.join(FX, 'logo.png'));
  await page.fill('[name=nome]', 'Marina Souza');
  await page.fill('[name=loja]', 'Café Aurora');
  await page.fill('[name=email]', 'marina@example.com');
  await page.fill('[name=whatsapp]', '(11) 98765-4321');
  await page.getByLabel('Letreiro iluminado').check();
  await page.getByLabel('Pintura').check();
  await page.getByLabel('Outra alteração').check();
  ok(await page.locator('#outra-wrap').isVisible(), 'campo "Qual alteração?" aparece ao marcar "Outra alteração"');
  await page.fill('[name=outra]', 'Toldo novo');
  await page.fill('[name=cores]', 'Grafite e dourado');
  await page.fill('[name=descricao]', 'Letreiro em letras caixa iluminadas, fachada grafite.');
  await page.fill('[name=preservar_outros]', 'Toldo');
  ok(await page.locator('.summary').getByText('R$ 99,00').isVisible() && await page.locator('.summary').getByText('Direito a um ajuste na opção escolhida').isVisible(), 'preço e itens inclusos exibidos antes do pagamento');
  await page.locator('[name=aceite]').check();
  await shot(page, '02-formulario-preenchido');
  await page.getByRole('button', { name: 'Continuar para o pagamento' }).click();
  await page.waitForURL(/\/pedido\/FV-/);
  const orderId = page.url().match(/FV-[A-Z0-9]+/)[0];
  ok(await page.getByText('Falta só o pagamento').isVisible(), `pedido ${orderId} salvo antes do checkout`);
  const o0 = q1('SELECT * FROM orders WHERE id = ?', orderId);
  ok(o0.status === 'aguardando_pagamento' && o0.price_cents === 9900, 'status inicial "aguardando pagamento" e valor R$ 99');
  ok(q1("SELECT COUNT(*) n FROM files WHERE owner_id = ? AND role = 'referencia'", orderId).n === 2 && q1("SELECT COUNT(*) n FROM files WHERE owner_id = ? AND role = 'logo'", orderId).n === 1, 'anexos salvos (logo + 2 referências)');

  step('Validação de anexos no servidor e pedidos duplicados');
  const bad = await multipart('/api/pedidos', { idem: 'x'.repeat(32), nome: 'Teste', loja: 'Loja', email: 'a@b.com', whatsapp: '11999999999', tipos: 'placa', descricao: 'Placa nova', aceite: '1' }, { fachada: 'falsa.jpg' });
  ok(bad.status === 400 && bad.json.error.includes('formato não aceito'), 'arquivo falso com extensão .jpg é recusado pelo servidor');
  const dupIdem = 'dup' + 'k'.repeat(30);
  const fields = { idem: dupIdem, nome: 'Teste Dup', loja: 'Loja Dup', email: 'd@b.com', whatsapp: '11999999999', tipos: 'placa', descricao: 'Placa nova', aceite: '1' };
  const [d1, d2] = await Promise.all([multipart('/api/pedidos', fields, { fachada: 'fachada.jpg' }), multipart('/api/pedidos', fields, { fachada: 'fachada.jpg' })]);
  ok(d1.json.redirect === d2.json.redirect && q1('SELECT COUNT(*) n FROM orders WHERE idem_key = ?', dupIdem).n === 1, 'envio repetido do mesmo formulário gera um único pedido');

  step('Pagamento: retorno sem confirmação');
  await page.getByRole('button', { name: 'Ir para o pagamento' }).click();
  await page.waitForURL(/checkout-demo/);
  const checkoutUrl1 = page.url();
  ok(await page.getByText('Modo demonstração').isVisible(), 'checkout externo (demonstração) aberto');
  await page.getByRole('link', { name: 'Voltar sem pagar' }).click();
  await page.waitForURL(/pagamento\/retorno/);
  ok((await page.locator('h1').innerText()) === 'Aguardando confirmação', 'retorno do checkout exibe "Aguardando confirmação"');
  await page.waitForTimeout(2000);
  ok((await page.locator('h1').innerText()) === 'Aguardando confirmação' && q1('SELECT status FROM orders WHERE id = ?', orderId).status === 'aguardando_pagamento', 'retorno sozinho não confirma o pagamento');
  await shot(page, '03-aguardando-confirmacao');
  await page.getByRole('link', { name: 'Ver meu pedido' }).click();
  await page.getByRole('button', { name: 'Ir para o pagamento' }).click();
  await page.waitForURL(/checkout-demo/);
  ok(page.url() === checkoutUrl1, 'reabrir o pagamento reaproveita o mesmo checkout (sem cobrança duplicada)');

  step('Pagamento confirmado pelo provedor (notificação)');
  await page.getByRole('button', { name: 'Simular pagamento aprovado' }).click();
  await page.waitForURL(/pagamento\/retorno/);
  await page.getByRole('heading', { name: 'Pagamento confirmado' }).waitFor({ timeout: 8000 });
  ok(true, 'página de retorno atualiza para "Pagamento confirmado"');
  const coId = checkoutUrl1.split('/').pop();
  await fetch(`${BASE}/checkout-demo/${coId}/aprovar`, { method: 'POST', redirect: 'manual' });
  await fetch(`${BASE}/checkout-demo/${coId}/aprovar`, { method: 'POST', redirect: 'manual' });
  ok(q1('SELECT COUNT(*) n FROM payments WHERE ref_id = ?', orderId).n === 1 && q1('SELECT status FROM orders WHERE id = ?', orderId).status === 'em_producao', 'notificação repetida não duplica pagamento; pedido em produção');

  // ===================================================================
  step('Painel: login e filtros');
  await admin.goto('/painel');
  ok(admin.url().includes('/painel/login'), 'painel exige login');
  await admin.fill('[name=email]', 'admin@fachadaemvista.local');
  await admin.fill('[name=senha]', 'errada');
  await admin.getByRole('button', { name: 'Entrar' }).click();
  ok(await admin.getByText('E-mail ou senha incorretos.').isVisible(), 'senha errada é recusada');
  await admin.fill('[name=email]', 'admin@fachadaemvista.local');
  await admin.fill('[name=senha]', 'fachada-demo-2026');
  await admin.getByRole('button', { name: 'Entrar' }).click();
  await admin.waitForURL(BASE + '/painel');
  await admin.locator('.filters').getByRole('link', { name: /Em produção/ }).click();
  ok(await admin.getByText(orderId).isVisible(), 'pedido aparece no filtro "Em produção"');
  ok(!(await admin.getByText('Loja Dup').isVisible()), 'pedido não pago não aparece em "Em produção"');
  await admin.locator('.filters').getByRole('link', { name: /Aguardando pagamento/ }).click();
  ok(await admin.getByText('Loja Dup').isVisible(), 'filtro "Aguardando pagamento"');
  await shot(admin, '04-painel-lista');
  const anon = await fetch(`${BASE}/painel/arquivo/${q1("SELECT id FROM files WHERE owner_id = ? AND role='fachada'", orderId).id}`, { redirect: 'manual' });
  ok(anon.status === 302, 'arquivos privados não abrem sem login');

  step('Painel: briefing, arquivos e envio das propostas');
  await admin.goto(`/painel/pedido/${orderId}`);
  ok(await admin.getByText('Letreiro em letras caixa iluminadas').isVisible() && await admin.getByText('Portas, Vitrines, Janelas, Toldo').isVisible(), 'briefing completo visível');
  const dl = await admin.request.get(await admin.locator('.file-card a.btn').first().getAttribute('href'));
  ok(dl.status() === 200 && (dl.headers()['content-disposition'] || '').startsWith('attachment'), 'download do arquivo do cliente');
  const upload = async (slot, file, title) => {
    await admin.selectOption('select[name=slot]', slot);
    if (title) await admin.fill('[name=titulo]', title);
    await admin.setInputFiles('input[name=imagem]', path.join(FX, file));
    await admin.getByRole('button', { name: 'Enviar imagem' }).click();
    await admin.waitForURL(/msg=proposta/);
  };
  await upload('A', 'proposta-a.jpg', 'Letreiro grafite');
  await upload('B', 'proposta-b.jpg', 'Placa azul-petróleo');
  ok((await admin.locator('.slot-group').count()) === 2, 'propostas A e B enviadas');
  await admin.getByRole('button', { name: 'Publicar entrega' }).click();
  await admin.waitForURL(/msg=publicado/);
  const deliveryUrl = await admin.locator('[data-testid=delivery-link]').inputValue();
  ok(/\/e\/[A-Za-z0-9_-]{32}$/.test(deliveryUrl), 'link privado de entrega gerado (token de 192 bits)');
  ok(q1('SELECT status FROM orders WHERE id = ?', orderId).status === 'entregue', 'status "entregue"');
  const wa = await admin.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href');
  ok(wa.startsWith('https://wa.me/5511987654321?text=') && decodeURIComponent(wa).includes(deliveryUrl), 'botão do WhatsApp com mensagem pronta e link');
  await shot(admin, '05-painel-pedido');

  step('Entrega ao cliente');
  await page.goto(deliveryUrl);
  ok(await page.getByRole('heading', { name: 'Foto original' }).isVisible(), 'foto original');
  ok((await page.locator('.proposal [data-compare]').count()) === 2, 'antes e depois para cada proposta');
  ok(await page.getByText('Simulação visual. Confira medidas, materiais e instalação com a empresa responsável pela produção.').first().isVisible(), 'observação da simulação visual');
  const dlA = await page.request.get(await page.getByRole('link', { name: 'Baixar proposta A' }).getAttribute('href'));
  ok(dlA.status() === 200 && dlA.headers()['content-type'] === 'image/jpeg', 'download da proposta');
  ok(await page.getByRole('button', { name: 'Compartilhar link' }).isVisible() && (await page.getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href')).includes(encodeURIComponent(deliveryUrl)), 'compartilhar link (WhatsApp)');
  await shot(page, '06-entrega');
  await page.locator('#proposta-A').getByRole('button', { name: 'Escolher como favorita' }).click();
  await page.waitForURL(/msg=favorita/);
  ok(await page.locator('#proposta-A .badge-chosen').isVisible(), 'proposta A escolhida como favorita');
  await page.fill('[name=descricao]', 'Aumentar as letras e trocar o grafite por verde-escuro.');
  await page.getByRole('button', { name: 'Solicitar ajuste' }).click();
  await page.waitForURL(/msg=ajuste/);
  ok(await page.getByText('Ajuste solicitado. A equipe está preparando').isVisible(), 'ajuste solicitado registrado');
  const rep = await fetch(deliveryUrl + '/ajuste', { method: 'POST', body: new URLSearchParams({ slot: 'B', descricao: 'Segundo ajuste não permitido' }), redirect: 'manual' });
  ok(rep.status === 303 && q1('SELECT COUNT(*) n FROM adjustments WHERE order_id = ?', orderId).n === 1 && q1('SELECT slot FROM adjustments WHERE order_id = ?', orderId).slot === 'A', 'apenas um ajuste por pedido');

  step('Painel: ajuste e versão revisada');
  await admin.goto('/painel?status=ajuste_solicitado');
  ok(await admin.getByText(orderId).isVisible(), 'pedido aparece em "Ajuste solicitado"');
  await admin.goto(`/painel/pedido/${orderId}`);
  ok(await admin.getByText('Aumentar as letras e trocar o grafite por verde-escuro.').isVisible(), 'descrição do ajuste no painel');
  ok(await admin.getByRole('button', { name: 'Publicar versão revisada' }).isHidden() || await admin.getByRole('button', { name: 'Publicar versão revisada' }).isDisabled(), 'publicar revisão exige nova versão');
  await upload('A', 'proposta-a-v2.jpg', 'Letreiro verde-escuro');
  await admin.getByRole('button', { name: 'Publicar versão revisada' }).click();
  await admin.waitForURL(/msg=revisao/);
  ok(q1('SELECT status FROM orders WHERE id = ?', orderId).status === 'entregue' && q1('SELECT status FROM adjustments WHERE order_id = ?', orderId).status === 'atendido', 'versão revisada publicada, ajuste atendido');

  step('Cliente recebe a revisão e conclui');
  await page.goto(deliveryUrl);
  ok(await page.locator('#proposta-A').getByText('Versão revisada').isVisible(), 'proposta A mostra "Versão revisada"');
  ok(await page.locator('#proposta-A').getByText('Versões anteriores').isVisible(), 'versão anterior continua disponível');
  ok(!(await page.getByRole('button', { name: 'Solicitar ajuste' }).isVisible()), 'novo ajuste não é oferecido');
  await shot(page, '07-entrega-revisada');
  await page.getByRole('button', { name: /Aprovar a proposta A/ }).click();
  await page.waitForURL(/msg=aprovado/);
  ok(q1('SELECT status FROM orders WHERE id = ?', orderId).status === 'concluido', 'pedido concluído');
  await admin.goto('/painel?status=concluido');
  ok(await admin.getByText(orderId).isVisible(), 'pedido aparece em "Concluído"');

  step('Revogar e gerar novo link');
  await admin.goto(`/painel/pedido/${orderId}`);
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Revogar acesso' }).click();
  await admin.waitForURL(/msg=revogado/);
  ok((await fetch(deliveryUrl)).status === 410, 'link revogado deixa de funcionar');
  await admin.getByRole('button', { name: 'Gerar novo link' }).click();
  await admin.waitForURL(/msg=novo_link/);
  const newUrl = await admin.locator('[data-testid=delivery-link]').inputValue();
  ok(newUrl !== deliveryUrl && (await fetch(newUrl)).status === 200 && (await fetch(deliveryUrl)).status === 404, 'novo link funciona e o antigo continua bloqueado');

  // ===================================================================
  step('Pacote: compra');
  const pp = await mobile.newPage();
  watch(pp, 'pacote');
  await pp.goto('/');
  await pp.getByRole('link', { name: 'Comprar pacote de 5' }).first().click();
  await pp.fill('[name=nome]', 'Rafael Lima');
  await pp.fill('[name=empresa]', 'Lumen Comunicação Visual');
  await pp.fill('[name=email]', 'rafael@lumen.example');
  await pp.fill('[name=whatsapp]', '21 99876-5432');
  await pp.locator('[data-file-slot][data-name=logo] input[type=file]').setInputFiles(path.join(FX, 'logo.png'));
  ok(await pp.locator('.summary').getByText('R$ 349,00').isVisible(), 'preço do pacote antes do pagamento');
  await pp.getByRole('button', { name: 'Continuar para o pagamento' }).click();
  await pp.waitForURL(/\/pacote\/[A-Za-z0-9_-]{32}$/);
  const pkgUrl = pp.url();
  const pkgToken = pkgUrl.split('/').pop();
  const pkgId = q1('SELECT id FROM packages WHERE access_token = ?', pkgToken).id;
  ok(await pp.getByText('Falta só o pagamento').isVisible(), `pacote ${pkgId} salvo aguardando pagamento`);
  const early = await multipart(`/api/pacotes/${pkgToken}/briefings`, { idem: 'early' + 'e'.repeat(20), loja: 'X', tipos: 'placa', descricao: 'Placa nova' }, { fachada: 'fachada.jpg' });
  ok(early.status === 409, 'briefing bloqueado antes da confirmação do pagamento');

  step('Pacote: pagamento registrado manualmente no painel');
  await admin.goto('/painel/pacotes');
  await admin.getByText('Lumen Comunicação Visual').click();
  await admin.locator('[name=confirmo]').check();
  await admin.getByRole('button', { name: 'Registrar pagamento manualmente' }).click();
  await admin.waitForURL(/msg=pago/);
  const againManual = await admin.request.post(`/painel/pacote/${pkgId}/pagamento`, { form: { confirmo: '1', forma: 'Pix' }, headers: { origin: BASE } });
  ok(againManual.url().includes('msg=pago_ja') && q1('SELECT COUNT(*) n FROM payments WHERE ref_id = ?', pkgId).n === 1, 'registro manual repetido não duplica');
  await pp.reload();
  ok((await pp.getByTestId('saldo').innerText()).startsWith('5'), 'saldo de 5 créditos liberado');
  await shot(pp, '08-pacote-saldo');

  step('Pacote: briefings enviados aos poucos');
  const sendBriefing = async (store) => {
    await pp.getByRole('link', { name: 'Enviar novo briefing' }).click();
    await pp.fill('[name=loja]', store);
    await pp.locator('[data-file-slot][data-name=fachada] input[type=file]').setInputFiles(path.join(FX, 'fachada.jpg'));
    await pp.getByLabel('Troca de placa').check();
    await pp.fill('[name=descricao]', `Placa nova para ${store}`);
    await pp.getByRole('button', { name: /Enviar briefing/ }).click();
    await pp.waitForURL(/msg=briefing/);
  };
  await sendBriefing('Padaria Sol');
  ok((await pp.getByTestId('saldo').innerText()).startsWith('4'), 'após 1º briefing: saldo 4');
  await sendBriefing('Ótica Visão');
  ok((await pp.getByTestId('saldo').innerText()).startsWith('3'), 'após 2º briefing: saldo 3');
  const dupB = 'dupbrief' + 'z'.repeat(20);
  const bf = { idem: dupB, loja: 'Pet Shop Amigo', tipos: 'placa', descricao: 'Placa nova' };
  const [b1, b2] = await Promise.all([multipart(`/api/pacotes/${pkgToken}/briefings`, bf, { fachada: 'fachada.jpg' }), multipart(`/api/pacotes/${pkgToken}/briefings`, bf, { fachada: 'fachada.jpg' })]);
  let saldo = await (await fetch(`${BASE}/api/pacotes/${pkgToken}/saldo`)).json();
  ok(b1.status === 200 && b2.status === 200 && saldo.saldo === 2, 'briefing repetido desconta um único crédito (saldo 2)');
  const rest = await Promise.all(['Loja 4', 'Loja 5', 'Loja 6'].map((l, i) => multipart(`/api/pacotes/${pkgToken}/briefings`, { idem: `rest${i}` + 'r'.repeat(20), loja: l, tipos: 'pintura', descricao: 'Pintura nova' }, { fachada: 'fachada.jpg' })));
  saldo = await (await fetch(`${BASE}/api/pacotes/${pkgToken}/saldo`)).json();
  ok(rest.filter((r) => r.status === 200).length === 2 && rest.filter((r) => r.status === 409).length === 1 && saldo.saldo === 0 && saldo.usados === 5, 'saldo nunca fica negativo (5 usados, envio extra recusado)');
  await pp.reload();
  ok(await pp.getByText('Todos os créditos foram usados.').isVisible(), 'cliente vê saldo zerado');

  step('Pacote: entrega com a marca da empresa');
  const bId = q1("SELECT id FROM orders WHERE package_id = ? AND store_name = 'Padaria Sol'", pkgId).id;
  await admin.goto('/painel?status=em_producao');
  ok(await admin.getByText('Padaria Sol').isVisible(), 'briefing do pacote aparece "Em produção" no painel');
  await admin.goto(`/painel/pedido/${bId}`);
  await upload('A', 'proposta-a.jpg');
  await upload('B', 'proposta-b.jpg');
  await admin.getByRole('button', { name: 'Publicar entrega' }).click();
  await admin.waitForURL(/msg=publicado/);
  const bUrl = await admin.locator('[data-testid=delivery-link]').inputValue();
  await pp.goto(bUrl);
  ok(await pp.locator('.topbar img[alt="Lumen Comunicação Visual"]').isVisible(), 'entrega exibe a logo da empresa do pacote');
  ok(!(await pp.getByRole('button', { name: 'Solicitar ajuste' }).isVisible()), 'pacote não oferece ajuste (exclusivo da avulsa)');
  await shot(pp, '09-entrega-pacote');
  await pp.goto(pkgUrl);
  ok(await pp.getByRole('link', { name: 'Ver entrega' }).isVisible(), 'saldo e entregas visíveis na página do pacote');

  step('Configuração da marca');
  await admin.goto('/painel/config');
  await admin.fill('input[name=brand_color]', '#0f766e');
  await admin.setInputFiles('input[name=logo]', path.join(FX, 'logo.png'));
  await admin.getByRole('button', { name: 'Salvar configurações' }).click();
  await admin.waitForURL(/msg=config/);
  const home = await (await fetch(BASE + '/')).text();
  ok(home.includes('--brand:#0f766e') && home.includes('/marca/logo'), 'cor principal e logo configuráveis');

  console.log(`\n✅ ${passed} verificações passaram.`);
  if (problems.length) { console.log(`\n⚠ ${problems.length} problemas de auditoria:`); [...new Set(problems)].forEach((x) => console.log('  - ' + x)); process.exitCode = 1; }
  else console.log('✅ Auditoria: sem erros de console, sem falhas HTTP, sem estouro de largura (inclusive em 360px).');
} catch (e) {
  console.error('\n❌', e.message);
  console.error(serverLog.split('\n').slice(-30).join('\n'));
  await shot(page, 'erro-cliente').catch(() => {});
  await shot(admin, 'erro-painel').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}
