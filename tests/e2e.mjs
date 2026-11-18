// Teste ponta a ponta do marketplace (Playwright + Chromium).
// Uso: BASE=http://localhost:3000 npm run test:e2e
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
const FIX = path.resolve('tests/fixtures');
const SHOTS = process.env.SHOTS || '';
let pass = 0; const fails = [];
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fails.push(msg); console.log('  ✗', msg); } };
const uniq = Date.now().toString(36);

function cpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const d = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(d(n)); n.push(d(n)); return n.join('');
}
function cnpj() {
  const n = [...Array.from({ length: 8 }, () => Math.floor(Math.random() * 9)), 0, 0, 0, 1];
  const d = (arr) => { const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; arr.forEach((v, i) => { s += v * w[i]; }); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  n.push(d(n)); n.push(d(n)); return n.join('');
}

const browser = await chromium.launch();
const problems = [];
async function ctx(name) {
  const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(`${name} console: ${m.text()}`); });
  p.on('response', (r) => { if (r.status() >= 500) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  return { c, p };
}
async function signup(p, tipo, d) {
  await p.goto(`${BASE}/cadastro?tipo=${tipo}`);
  await p.fill('input[name=empresa]', d.empresa); await p.fill('input[name=nome]', d.nome);
  await p.selectOption('select[name=doc_tipo]', d.doc_tipo); await p.fill('input[name=documento]', d.documento);
  await p.fill('input[name=whatsapp]', d.whatsapp); await p.fill('input[name=cidade]', d.cidade); await p.selectOption('select[name=uf]', d.uf);
  if (tipo === 'prestador') for (const c of d.categorias) await p.locator(`.chip:has(input[value=${c}])`).click();
  await p.fill('input[name=email]', d.email); await p.fill('input[name=senha]', 'senha-forte-123');
  await p.check('input[name=termos]');
  await p.click('form button:has-text("Criar conta")');
}

console.log('\n1. Cadastros');
const E = await ctx('empresa'); const P1 = await ctx('prestador1'); const P2 = await ctx('prestador2'); const X = await ctx('intruso');
// documento inválido
await signup(E.p, 'empresa', { empresa: 'Padaria Aurora', nome: 'Ana Souza', doc_tipo: 'cnpj', documento: '11.111.111/1111-11', whatsapp: '11912345678', cidade: 'Campinas', uf: 'SP', email: `ana-${uniq}@exemplo.com` });
ok(await E.p.locator('text=CNPJ inválido').count() > 0, 'CNPJ inválido é recusado');
await E.p.fill('input[name=documento]', cnpj()); await E.p.fill('input[name=senha]', 'senha-forte-123'); await E.p.check('input[name=termos]');
await E.p.click('form button:has-text("Criar conta")');
ok(E.p.url().includes('/painel') && await E.p.locator('text=Conta criada').count() > 0, 'empresa cadastrada (CNPJ) e no painel');
await signup(P1.p, 'prestador', { empresa: 'Luz Placas', nome: 'Bruno Lima', doc_tipo: 'mei', documento: cnpj(), whatsapp: '19988887777', cidade: 'Campinas', uf: 'SP', categorias: ['placa_acm', 'letreiro'], email: `bruno-${uniq}@exemplo.com` });
ok(P1.p.url().includes('/oportunidades'), 'prestador MEI cadastrado e em Oportunidades');
await signup(P2.p, 'prestador', { empresa: 'Carla Comunicação', nome: 'Carla Dias', doc_tipo: 'cpf', documento: cpf(), whatsapp: '19977776666', cidade: 'Sumaré', uf: 'SP', categorias: ['placa_acm', 'luminoso'], email: `carla-${uniq}@exemplo.com` });
ok(P2.p.url().includes('/oportunidades'), 'prestador autônomo (CPF) cadastrado');
await signup(X.p, 'empresa', { empresa: 'Outra Loja', nome: 'Davi Reis', doc_tipo: 'cnpj', documento: cnpj(), whatsapp: '11955554444', cidade: 'Santos', uf: 'SP', email: `davi-${uniq}@exemplo.com` });
await P1.p.goto(`${BASE}/cadastro`);
ok(!P1.p.url().includes('/cadastro'), 'usuário logado não vê o cadastro de novo');

console.log('\n2. Simulador → novo pedido');
await E.p.goto(`${BASE}/criar`);
await E.p.waitForSelector('#prev canvas');
await E.p.fill('#nome', 'Padaria Aurora'); await E.p.fill('input[data-k=slogan]', 'Pães e doces');
await E.p.setInputFiles('#logo-in', path.join(FIX, 'logo.png'));
await E.p.waitForSelector('#logo-thumb img');
await E.p.locator('.tile:has(input[value=mk_bairro])').click();
await E.p.waitForFunction(() => !document.querySelector('#prev').classList.contains('busy'));
if (SHOTS) await E.p.screenshot({ path: `${SHOTS}/simulador.png` });
await E.p.click('#usar');
await E.p.waitForURL('**/pedidos/novo');
await E.p.waitForSelector('[data-simulacao-slot]:not([hidden])');
ok(await E.p.inputValue('input[name=titulo]') === 'Placa para Padaria Aurora', 'simulação volta anexada ao pedido, com título sugerido');
// validação no navegador
await E.p.click('button:has-text("Publicar pedido")');
ok(await E.p.locator('[data-form-error] .alert-error').count() > 0, 'campos obrigatórios do pedido são verificados');
await E.p.locator('.chip:has(input[value=placa_acm])').click(); await E.p.locator('.chip:has(input[value=letreiro])').click();
await E.p.fill('textarea[name=descricao]', 'Placa em ACM preta com letra caixa iluminada, retirar a placa antiga.');
await E.p.fill('input[name=medidas]', 'Fachada 6 m; placa 5 × 1 m');
await E.p.fill('input[name=bairro]', 'Cambuí');
await E.p.selectOption('select[name=orcamento]', '3a8k'); await E.p.selectOption('select[name=prazo]', '30d');
await E.p.setInputFiles('.file-slot[data-name=fotos] input[type=file]', [path.join(FIX, 'fachada.jpg')]);
await E.p.check('input[name=aceite]');
await E.p.click('button:has-text("Publicar pedido")');
await E.p.waitForURL(/\/pedidos\/PD-/);
const pedidoUrl = E.p.url().split('?')[0]; const pedidoId = pedidoUrl.split('/').pop();
ok(await E.p.locator('text=Pedido publicado').count() > 0, `pedido publicado (${pedidoId})`);
ok(await E.p.locator('.gallery img').count() === 2, 'pedido mostra a simulação e a foto do local');

console.log('\n3. Prestadores enviam propostas');
await P1.p.goto(`${BASE}/oportunidades`);
ok(await P1.p.locator(`a[href="/oportunidades/${pedidoId}"]`).count() === 1, 'pedido aparece nas oportunidades do estado do prestador');
await P1.p.goto(`${BASE}/oportunidades/${pedidoId}`);
ok(await P1.p.locator('text=11912345678').count() === 0 && await P1.p.locator(`text=ana-${uniq}`).count() === 0, 'contato da empresa fica oculto antes do contrato');
const fileHref = await P1.p.locator('.gallery a').first().getAttribute('href');
ok((await P1.p.request.get(BASE + fileHref)).status() === 200, 'prestador abre as fotos do pedido aberto');
await P1.p.fill('input[name=valor]', '4.850,00'); await P1.p.fill('input[name=prazo_dias]', '20');
await P1.p.fill('textarea[name=inclui]', 'Placa ACM preta 5 × 1 m, letra caixa em acrílico com LED, arte, instalação e retirada da placa antiga.');
await P1.p.fill('textarea[name=pagamento]', '50% na aprovação da arte e 50% na instalação, via Pix.');
await P1.p.fill('input[name=garantia]', '12 meses');
await P1.p.click('button:has-text("Enviar proposta")');
ok(await P1.p.locator('text=Proposta enviada').count() > 0, 'prestador 1 enviou proposta');
// editar
await P1.p.fill('input[name=valor]', '4.700'); await P1.p.click('button:has-text("Salvar alterações")');
ok(await P1.p.locator('text=Proposta atualizada').count() > 0, 'prestador 1 editou a proposta (sem duplicar)');
await P2.p.goto(`${BASE}/oportunidades/${pedidoId}`);
if (SHOTS) await P2.p.screenshot({ path: `${SHOTS}/oportunidade.png`, fullPage: true });
await P2.p.fill('input[name=valor]', '5200'); await P2.p.fill('input[name=prazo_dias]', '15');
await P2.p.fill('textarea[name=inclui]', 'Fachada em ACM com luminoso de LED, projeto 3D, instalação.');
await P2.p.fill('textarea[name=pagamento]', 'Entrada de 40% e restante na entrega.');
await P2.p.click('button:has-text("Enviar proposta")');
ok(await P2.p.locator('text=Proposta enviada').count() > 0, 'prestador 2 enviou proposta');

console.log('\n4. Conversa');
await E.p.goto(pedidoUrl);
ok(await E.p.locator('.pcard').count() === 2, 'empresa vê 2 propostas');
if (SHOTS) await E.p.screenshot({ path: `${SHOTS}/pedido-empresa.png`, fullPage: true });
ok(await E.p.locator('.pcard').first().locator('text=R$ 4.700,00').count() > 0, 'propostas ordenadas pelo menor valor, com valor editado');
await E.p.locator('.pcard').first().locator('a:has-text("Conversar")').click();
await E.p.fill('textarea[name=body]', 'A letra caixa pode ser dourada?');
await E.p.click('button:has-text("Enviar")');
ok(await E.p.locator('.chat li.me:has-text("dourada")').count() === 1, 'empresa enviou mensagem');
await P1.p.goto(`${BASE}/painel`);
ok(await P1.p.locator('.count').count() > 0, 'prestador vê aviso de mensagem nova');
await P1.p.goto(E.p.url().split('#')[0]);
ok(await P1.p.locator('.chat li:has-text("dourada")').count() === 1, 'prestador lê a mensagem');
await P1.p.fill('textarea[name=body]', 'Pode sim, sem custo extra.'); await P1.p.click('button:has-text("Enviar")');
ok((await X.p.goto(E.p.url().split('#')[0])).status() === 404, 'outra empresa não acessa a conversa');

console.log('\n5. Contrato');
await E.p.goto(pedidoUrl);
await E.p.locator('.pcard').first().locator('a:has-text("Aceitar")').click();
ok(await E.p.locator('pre.contract:has-text("CONTRATO DE PRESTAÇÃO")').count() === 1, 'empresa vê o contrato antes de aceitar');
ok(await E.p.locator('pre.contract:has-text("R$ 4.700,00")').count() === 1, 'contrato traz valor da proposta');
await E.p.check('input[name=aceite]'); await E.p.click('button:has-text("Aceitar proposta e assinar")');
await E.p.waitForURL(/\/contratos\/CT-/);
const ctUrl = E.p.url().split('?')[0];
ok(await E.p.locator('text=Aguardando o prestador').count() > 0, 'contrato aguarda o prestador');
ok(await E.p.locator('text=19988887777').count() === 0, 'contato do prestador ainda oculto');
await P1.p.goto(`${BASE}/painel`);
ok(await P1.p.locator('text=Contrato para assinar').count() === 1, 'prestador vê contrato para assinar');
await P1.p.goto(ctUrl);
await P1.p.check('input[name=aceite]'); await P1.p.click('button:has-text("Assinar contrato")');
ok(await P1.p.locator('text=Em vigor').count() > 0, 'contrato assinado pelas duas partes');
ok(await P1.p.locator('a[href^="https://wa.me/5511912345678"]').count() === 1, 'prestador recebe o WhatsApp da empresa após assinar');
ok((await P2.p.goto(ctUrl)).status() === 404, 'outro prestador não acessa o contrato');
await P2.p.goto(`${BASE}/painel`);
ok(await P2.p.locator('text=Não escolhida').count() === 1, 'proposta do prestador 2 marcada como não escolhida');
ok((await X.p.request.get(BASE + fileHref)).status() === 404, 'empresa sem relação não abre as fotos');
await P2.p.goto(`${BASE}/oportunidades`);
ok(await P2.p.locator(`a[href="/oportunidades/${pedidoId}"]`).count() === 0, 'pedido contratado sai das oportunidades');

console.log('\n6. Conclusão e avaliação');
await E.p.goto(ctUrl);
ok(await E.p.locator('a[href^="https://wa.me/5519988887777"]').count() === 1, 'empresa recebe o WhatsApp do prestador');
E.p.once('dialog', (d) => d.accept());
await E.p.click('button:has-text("Marcar serviço como concluído")');
await E.p.waitForSelector('text=Avalie');
await E.p.locator('.rate label:has(input[value="5"])').click();
await E.p.fill('textarea[name=comentario]', 'Ótimo trabalho, no prazo.');
await E.p.click('button:has-text("Enviar avaliação")');
ok(await E.p.locator('text=Obrigado pela avaliação').count() > 0, 'empresa avaliou o prestador');
if (SHOTS) await E.p.screenshot({ path: `${SHOTS}/contrato.png`, fullPage: true });
const p1id = await E.p.evaluate(async (u) => { const r = await fetch(u); const t = await r.text(); return (t.match(/\/prestadores\/(\d+)/) || [])[1]; }, pedidoUrl);
await E.p.goto(`${BASE}/prestadores/${p1id}`);
ok(await E.p.locator('text=Ótimo trabalho').count() === 1 && await E.p.locator('text=1 serviço(s) concluído(s)').count() === 1, 'perfil do prestador mostra avaliação e serviço concluído');

console.log('\n7. Segurança');
const r1 = await E.p.request.post(`${BASE}/pedidos/${pedidoId}/cancelar`, { headers: { Origin: 'https://site-malicioso.com' } });
ok(r1.status() === 403, 'POST de outra origem é bloqueado (CSRF)');
ok((await X.p.goto(pedidoUrl)).status() === 404, 'outra empresa não vê o pedido');
ok((await P1.p.goto(`${BASE}/pedidos/novo`)).status() === 403, 'prestador não cria pedido');
const anon = await browser.newPage();
await anon.goto(`${BASE}/painel`);
ok(anon.url().includes('/entrar'), 'painel exige login');
await anon.fill('input[name=email]', `ana-${uniq}@exemplo.com`); await anon.fill('input[name=senha]', 'errada'); await anon.click('button:has-text("Entrar")');
ok(await anon.locator('text=E-mail ou senha incorretos').count() === 1, 'senha errada é recusada');

console.log('\n8. Administração');
await anon.goto(`${BASE}/entrar`);
await anon.fill('input[name=email]', process.env.ADMIN_EMAIL || 'admin@fachadaemvista.local'); await anon.fill('input[name=senha]', process.env.ADMIN_PASSWORD || 'fachada-demo-2026');
await anon.click('button:has-text("Entrar")');
ok(anon.url().includes('/admin'), 'admin entra no painel de administração');
ok(await anon.locator(`text=${pedidoId}`).count() === 1, 'admin vê o pedido');
anon.once('dialog', (d) => d.accept());
await anon.locator(`tr:has-text("davi-${uniq}") button:has-text("Bloquear")`).click();
ok(await anon.locator('text=Conta bloqueada').count() === 1, 'admin bloqueia conta');
await X.p.goto(`${BASE}/painel`);
ok(X.p.url().includes('/entrar'), 'conta bloqueada perde o acesso');

console.log('\n9. Celular (360 px)');
if (SHOTS) { const h = await browser.newPage({ viewport: { width: 1280, height: 860 } }); await h.goto(BASE + '/'); await h.screenshot({ path: `${SHOTS}/home.png` }); await h.close(); }
const m = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 1 });
const mp = await m.newPage();
mp.on('pageerror', (e) => problems.push('mobile: ' + e.message));
for (const u of ['/', '/criar', '/cadastro?tipo=prestador', '/para-prestadores', '/entrar']) {
  await mp.goto(BASE + u); await mp.waitForTimeout(u === '/criar' ? 800 : 100);
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `sem rolagem lateral em ${u}`);
}
for (const [pg, u] of [[E.p, pedidoUrl], [P1.p, `${BASE}/oportunidades`], [E.p, ctUrl]]) {
  await pg.setViewportSize({ width: 360, height: 780 }); await pg.goto(u);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `sem rolagem lateral em ${u.replace(BASE, '')}`);
  if (SHOTS) await pg.screenshot({ path: `${SHOTS}/m-${u.replace(BASE, '').split('/')[1]}.png` });
}

ok(problems.length === 0, 'sem erros de JavaScript, console ou HTTP 5xx' + (problems.length ? ': ' + problems.slice(0, 5).join(' | ') : ''));
await browser.close();
console.log(`\n${pass} verificações passaram, ${fails.length} falharam.`);
if (fails.length) { console.log('Falhas:\n- ' + fails.join('\n- ')); process.exit(1); }
