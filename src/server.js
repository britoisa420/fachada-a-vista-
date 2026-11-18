import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, get, all, run, tx, logEvent, getSettings, setSetting, TMP_DIR } from './db.js';
import { inspect, store, removeFile, cleanupTmp, sendStored } from './files.js';
import { getOrCreateCheckout, confirmPayment, verifyMpSignature, handleMpNotification, pollProvider } from './payments.js';
import * as auth from './auth.js';
import { shortCode, token, randomId, nowIso, UserError, isIdem, clip, onlyDigits, sanitizeColor, waLink } from './util.js';
import * as pub from './views/public.js';
import * as adm from './views/admin.js';
import { CHANGE_TYPES, PRESERVE } from './views/common.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

auth.seedAdmin();
setInterval(auth.cleanupSessions, 3600_000).unref();

// ---------- Cabeçalhos de segurança ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin', // tokens dos links privados nunca vazam para outros sites
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (!res.get('Content-Security-Policy')) {
    res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  }
  next();
});
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

const baseUrl = (req) => (getSettings().public_url || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const sendHtml = (res, s, status = 200) => res.status(status).type('html').send(String(s));
const wantsJson = (req) => (req.get('accept') || '').includes('application/json');

// ---------- Uploads (sempre em pasta temporária; só vão para o armazenamento privado após validação) ----------
const upload = multer({ dest: TMP_DIR, limits: { fileSize: 20 * 1024 * 1024, files: 6, fields: 40, fieldSize: 20000 } });
function uploadFields(fields) {
  const mw = upload.fields(fields);
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      cleanupTmp(req);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Um dos arquivos passou do tamanho máximo permitido.'
        : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Arquivos demais: envie 1 foto da fachada, 1 logo e até 3 referências.'
        : 'Não foi possível receber os arquivos. Tente novamente.';
      if (wantsJson(req) || req.path.startsWith('/api/')) return res.status(400).json({ error: msg });
      return res.status(400).send(msg);
    });
}
const filesOf = (req, name) => (req.files && req.files[name]) || [];

// Limite simples de criação por IP (evita abuso)
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const k = `${req.path}|${req.ip}`;
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      cleanupTmp(req);
      return res.status(429).json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' });
    }
    list.push(now);
    hits.set(k, list);
    next();
  };
}

// ---------- Validação do briefing ----------
function parseBriefing(body, { contact }) {
  const errors = {};
  const d = {
    name: clip(body.nome, 120),
    store_name: clip(body.loja, 120),
    email: clip(body.email, 160).toLowerCase(),
    whatsapp: onlyDigits(body.whatsapp).slice(0, 15),
    change_types: [].concat(body.tipos || []).filter((t) => t in CHANGE_TYPES),
    change_other: clip(body.outra, 200),
    colors: clip(body.cores, 300),
    description: clip(body.descricao, 3000),
    preserve: [].concat(body.preservar || []).filter((t) => t in PRESERVE),
    preserve_other: clip(body.preservar_outros, 300),
  };
  if (contact) {
    if (d.name.length < 2) errors.nome = 'Informe seu nome.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Informe um e-mail válido.';
    if (d.whatsapp.length < 10 || d.whatsapp.length > 13) errors.whatsapp = 'Informe o WhatsApp com DDD.';
  }
  if (d.store_name.length < 2) errors.loja = 'Informe o nome da loja.';
  if (!d.change_types.length) errors.tipos = 'Selecione pelo menos uma opção.';
  if (d.change_types.includes('outra') && !d.change_other) errors.outra = 'Conte qual alteração deseja testar.';
  if (d.description.length < 5) errors.descricao = 'Descreva o que você imagina para a fachada.';
  return { d, errors };
}

function inspectBriefingFiles(req) {
  const fachada = filesOf(req, 'fachada')[0];
  if (!fachada) throw new UserError('Envie a foto frontal da fachada.', 400, { fachada: 'Envie a foto frontal da fachada.' });
  const out = [{ file: fachada, role: 'fachada', info: inspect(fachada, 'fachada') }];
  const logo = filesOf(req, 'logo')[0];
  if (logo) out.push({ file: logo, role: 'logo', info: inspect(logo, 'logo') });
  const refs = filesOf(req, 'referencias');
  if (refs.length > 3) throw new UserError('Envie no máximo 3 imagens de referência.');
  for (const f of refs) out.push({ file: f, role: 'referencia', info: inspect(f, 'referencia') });
  return out;
}

function insertOrder({ d, kind, packageId = null, idem, status, price }) {
  let id;
  do id = shortCode('FV'); while (get('SELECT 1 FROM orders WHERE id = ?', id));
  const now = nowIso();
  run(
    `INSERT INTO orders (id, kind, package_id, idem_key, access_token, status, name, store_name, email, whatsapp,
      change_types, change_other, colors, description, preserve, preserve_other, price_cents, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, kind, packageId, idem, token(), status, d.name || null, d.store_name, d.email || null, d.whatsapp || null,
    JSON.stringify(d.change_types), d.change_other, d.colors, d.description, JSON.stringify(d.preserve), d.preserve_other, price, now, now,
  );
  return id;
}

function jsonError(res, req, e) {
  cleanupTmp(req);
  if (e instanceof UserError) return res.status(e.status).json({ error: e.message, fields: e.fields });
  console.error(e);
  return res.status(500).json({ error: 'Erro inesperado. Tente novamente em instantes.' });
}

// =====================================================================
// PÁGINAS PÚBLICAS
// =====================================================================
app.get('/', (req, res) => sendHtml(res, pub.homePage()));
app.get('/simular', (req, res) => sendHtml(res, pub.orderFormPage({ idem: randomId() + randomId() })));
app.get('/pacote', (req, res) => sendHtml(res, pub.packageFormPage({ idem: randomId() + randomId() })));

app.get('/marca/logo', (req, res) => {
  const id = getSettings().brand_logo_file;
  const f = id && get("SELECT * FROM files WHERE id = ? AND owner_type = 'settings'", id);
  if (!f) return res.status(404).end();
  sendStored(res, f);
});

// ---------- Criar pedido avulso ----------
app.post('/api/pedidos', rateLimit(20, 3600_000), uploadFields([{ name: 'fachada', maxCount: 1 }, { name: 'logo', maxCount: 1 }, { name: 'referencias', maxCount: 3 }]), (req, res) => {
  try {
    const idem = req.body.idem;
    if (!isIdem(idem)) throw new UserError('Formulário expirado. Recarregue a página.');
    const existing = get('SELECT id, access_token FROM orders WHERE idem_key = ?', idem);
    if (existing) {
      cleanupTmp(req);
      return res.json({ redirect: `/pedido/${existing.id}?t=${existing.access_token}`, duplicate: true });
    }
    const { d, errors } = parseBriefing(req.body, { contact: true });
    if (req.body.aceite !== '1') errors.aceite = 'Confirme que leu a observação sobre a simulação.';
    if (Object.keys(errors).length) throw new UserError('Revise os campos destacados.', 400, errors);
    const files = inspectBriefingFiles(req);
    const s = getSettings();
    const id = tx(() => {
      const id = insertOrder({ d, kind: 'avulso', idem, status: 'aguardando_pagamento', price: s.price_single });
      for (const f of files) store(f.file, f.info, { ownerType: 'order', ownerId: id, role: f.role });
      logEvent(id, 'cliente', 'Pedido avulso criado.');
      return id;
    });
    const o = get('SELECT access_token FROM orders WHERE id = ?', id);
    res.json({ redirect: `/pedido/${id}?t=${o.access_token}` });
  } catch (e) {
    if (String(e.message).includes('UNIQUE') && String(e.message).includes('idem_key')) {
      const ex = get('SELECT id, access_token FROM orders WHERE idem_key = ?', req.body.idem);
      cleanupTmp(req);
      return res.json({ redirect: `/pedido/${ex.id}?t=${ex.access_token}`, duplicate: true });
    }
    jsonError(res, req, e);
  }
});

function orderByToken(req) {
  const o = get('SELECT * FROM orders WHERE id = ?', req.params.id);
  const t = req.query.t || req.body?.t;
  if (!o || !t || o.access_token !== t) return null;
  return o;
}

app.get('/pedido/:id', (req, res) => {
  const order = orderByToken(req);
  if (!order) return sendHtml(res, pub.messagePage({ title: 'Pedido não encontrado', text: 'Confira se o link está completo.' }), 404);
  const files = all("SELECT * FROM files WHERE owner_type = 'order' AND owner_id = ?", order.id);
  sendHtml(res, pub.orderPage({ order, files, baseUrl: baseUrl(req), req }));
});

app.get('/pedido/:id/f/:fileId', (req, res) => {
  const order = orderByToken(req);
  const f = order && get("SELECT * FROM files WHERE id = ? AND owner_type = 'order' AND owner_id = ? AND role != 'proposta'", req.params.fileId, order.id);
  if (!f) return res.status(404).end();
  sendStored(res, f);
});

app.post('/pedido/:id/pagar', async (req, res) => {
  const order = orderByToken(req);
  if (!order) return sendHtml(res, pub.messagePage({ title: 'Pedido não encontrado', text: 'Confira se o link está completo.' }), 404);
  if (order.status !== 'aguardando_pagamento') return res.redirect(303, `/pedido/${order.id}?t=${order.access_token}`);
  try {
    const url = await getOrCreateCheckout({ refType: 'order', refId: order.id, baseUrl: baseUrl(req), accessToken: order.access_token });
    res.redirect(303, url);
  } catch (e) {
    sendHtml(res, pub.messagePage({ title: 'Pagamento indisponível', text: e.message }), e.status || 500);
  }
});

// ---------- Retorno do checkout: nunca confirma o pagamento por conta própria ----------
function refByToken(ref, t) {
  if (!ref || !t) return null;
  if (ref.startsWith('PK-')) {
    const p = get('SELECT * FROM packages WHERE id = ? AND access_token = ?', ref, t);
    return p && { kind: 'package', row: p };
  }
  const o = get('SELECT * FROM orders WHERE id = ? AND access_token = ?', ref, t);
  return o && { kind: 'order', row: o };
}
app.get('/pagamento/retorno', (req, res) => {
  const r = refByToken(String(req.query.ref || ''), String(req.query.t || ''));
  if (!r) return sendHtml(res, pub.messagePage({ title: 'Pedido não encontrado', text: 'Confira se o link está completo.' }), 404);
  sendHtml(res, pub.returnPage({ kind: r.kind, ref: r.row.id, t: r.row.access_token, status: r.row.status }));
});
app.get('/api/status', async (req, res) => {
  let r = refByToken(String(req.query.ref || ''), String(req.query.t || ''));
  if (!r) return res.status(404).json({ error: 'não encontrado' });
  if (r.row.status === 'aguardando_pagamento') {
    await pollProvider(r.kind, r.row.id);
    r = refByToken(r.row.id, r.row.access_token);
  }
  res.set('Cache-Control', 'no-store').json({ status: r.row.status, paid: r.row.status !== 'aguardando_pagamento' });
});

// ---------- Checkout de demonstração (simula o provedor externo) ----------
app.get('/checkout-demo/:id', (req, res) => {
  const co = get("SELECT * FROM checkouts WHERE id = ? AND provider = 'demo'", req.params.id);
  if (!co) return sendHtml(res, pub.messagePage({ title: 'Checkout não encontrado', text: 'Volte ao pedido e tente novamente.' }), 404);
  const ref = get(`SELECT * FROM ${co.ref_type === 'order' ? 'orders' : 'packages'} WHERE id = ?`, co.ref_id);
  sendHtml(res, pub.demoCheckoutPage({ co, ref }));
});
app.post('/checkout-demo/:id/aprovar', (req, res) => {
  if (getSettings().payment_provider !== 'demo') return res.status(403).send('Checkout de demonstração desativado.');
  const co = get("SELECT * FROM checkouts WHERE id = ? AND provider = 'demo'", req.params.id);
  if (!co) return res.status(404).send('Checkout não encontrado');
  // Mesmo caminho de um webhook real: idempotente por id do pagamento
  confirmPayment({ refType: co.ref_type, refId: co.ref_id, provider: 'demo', providerPaymentId: `demo-${co.id}`, amountCents: co.amount_cents, method: 'Demonstração' });
  res.redirect(303, co.url);
});

// ---------- Webhook Mercado Pago ----------
app.post('/webhooks/mercadopago', async (req, res) => {
  if (!verifyMpSignature(req)) return res.status(401).send('assinatura inválida');
  const type = req.query.type || req.query.topic || req.body?.type || req.body?.topic;
  const id = req.query['data.id'] || req.body?.data?.id || (req.query.topic === 'payment' && req.query.id);
  if (type !== 'payment' || !id || !process.env.MP_ACCESS_TOKEN) return res.status(200).send('ok');
  try {
    await handleMpNotification(id);
    res.status(200).send('ok');
  } catch (e) {
    console.error('webhook MP', e.message);
    res.status(500).send('erro'); // o provedor tenta novamente
  }
});

// ---------- Pacote ----------
app.post('/api/pacotes', rateLimit(20, 3600_000), uploadFields([{ name: 'logo', maxCount: 1 }]), (req, res) => {
  try {
    const idem = req.body.idem;
    if (!isIdem(idem)) throw new UserError('Formulário expirado. Recarregue a página.');
    const ex = get('SELECT access_token FROM packages WHERE idem_key = ?', idem);
    if (ex) {
      cleanupTmp(req);
      return res.json({ redirect: `/pacote/${ex.access_token}`, duplicate: true });
    }
    const errors = {};
    const d = {
      name: clip(req.body.nome, 120), company: clip(req.body.empresa, 120), email: clip(req.body.email, 160).toLowerCase(),
      whatsapp: onlyDigits(req.body.whatsapp).slice(0, 15), color: sanitizeColor(req.body.cor, '#1f2937'),
    };
    if (d.name.length < 2) errors.nome = 'Informe seu nome.';
    if (d.company.length < 2) errors.empresa = 'Informe o nome da empresa.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Informe um e-mail válido.';
    if (d.whatsapp.length < 10 || d.whatsapp.length > 13) errors.whatsapp = 'Informe o WhatsApp com DDD.';
    if (Object.keys(errors).length) throw new UserError('Revise os campos destacados.', 400, errors);
    const logo = filesOf(req, 'logo')[0];
    const logoInfo = logo && inspect(logo, 'logo');
    if (logoInfo?.type === 'pdf') throw new UserError('Para a apresentação, envie a logo em PNG, JPG, WEBP ou SVG.', 400, { logo: 'Envie em PNG, JPG, WEBP ou SVG.' });
    const s = getSettings();
    const accessToken = tx(() => {
      let id;
      do id = shortCode('PK'); while (get('SELECT 1 FROM packages WHERE id = ?', id));
      const t = token();
      run(
        `INSERT INTO packages (id, idem_key, access_token, name, company, email, whatsapp, brand_color, credits_total, price_cents, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,5,?,'aguardando_pagamento',?,?)`,
        id, idem, t, d.name, d.company, d.email, d.whatsapp, d.color, s.price_package, nowIso(), nowIso(),
      );
      if (logo) store(logo, logoInfo, { ownerType: 'package', ownerId: id, role: 'logo' });
      logEvent(id, 'cliente', 'Pacote de 5 simulações criado.');
      return t;
    });
    res.json({ redirect: `/pacote/${accessToken}` });
  } catch (e) {
    jsonError(res, req, e);
  }
});

const pkgByToken = (t) => get('SELECT * FROM packages WHERE access_token = ?', String(t || ''));
const usedCredits = (pkgId) => get('SELECT COUNT(*) AS n FROM orders WHERE package_id = ?', pkgId).n;
const remainingCredits = (pkg) => (pkg.status === 'pago' ? Math.max(0, pkg.credits_total - usedCredits(pkg.id)) : 0);

app.get('/pacote/:token', (req, res) => {
  const pkg = pkgByToken(req.params.token);
  if (!pkg) return sendHtml(res, pub.messagePage({ title: 'Pacote não encontrado', text: 'Confira se o link está completo.' }), 404);
  const briefings = all('SELECT * FROM orders WHERE package_id = ? ORDER BY created_at DESC', pkg.id);
  sendHtml(res, pub.packagePage({ pkg, briefings, remaining: remainingCredits(pkg), baseUrl: baseUrl(req), req }));
});
app.get('/api/pacotes/:token/saldo', (req, res) => {
  const pkg = pkgByToken(req.params.token);
  if (!pkg) return res.status(404).json({ error: 'não encontrado' });
  res.set('Cache-Control', 'no-store').json({ status: pkg.status, total: pkg.credits_total, usados: usedCredits(pkg.id), saldo: remainingCredits(pkg) });
});
app.post('/pacote/:token/pagar', async (req, res) => {
  const pkg = pkgByToken(req.params.token);
  if (!pkg) return res.status(404).send('Pacote não encontrado');
  if (pkg.status !== 'aguardando_pagamento') return res.redirect(303, `/pacote/${pkg.access_token}`);
  try {
    res.redirect(303, await getOrCreateCheckout({ refType: 'package', refId: pkg.id, baseUrl: baseUrl(req), accessToken: pkg.access_token }));
  } catch (e) {
    sendHtml(res, pub.messagePage({ title: 'Pagamento indisponível', text: e.message }), e.status || 500);
  }
});
app.get('/pacote/:token/briefing', (req, res) => {
  const pkg = pkgByToken(req.params.token);
  if (!pkg) return res.status(404).send('Pacote não encontrado');
  const remaining = remainingCredits(pkg);
  if (pkg.status !== 'pago' || remaining < 1) return res.redirect(`/pacote/${pkg.access_token}`);
  sendHtml(res, pub.briefingFormPage({ pkg, remaining, idem: randomId() + randomId() }));
});
app.get('/pacote/:token/f/:fileId', (req, res) => {
  const pkg = pkgByToken(req.params.token);
  const f = pkg && get("SELECT * FROM files WHERE id = ? AND owner_type = 'package' AND owner_id = ?", req.params.fileId, pkg.id);
  if (!f) return res.status(404).end();
  sendStored(res, f);
});

// Envio de briefing do pacote: desconta 1 crédito de forma atômica e idempotente
app.post('/api/pacotes/:token/briefings', rateLimit(30, 3600_000), uploadFields([{ name: 'fachada', maxCount: 1 }, { name: 'logo', maxCount: 1 }, { name: 'referencias', maxCount: 3 }]), (req, res) => {
  try {
    const pkg = pkgByToken(req.params.token);
    if (!pkg) throw new UserError('Pacote não encontrado.', 404);
    const idem = req.body.idem;
    if (!isIdem(idem)) throw new UserError('Formulário expirado. Recarregue a página.');
    const ex = get('SELECT id FROM orders WHERE idem_key = ? AND package_id = ?', idem, pkg.id);
    if (ex) {
      cleanupTmp(req);
      return res.json({ redirect: `/pacote/${pkg.access_token}?msg=briefing_dup`, duplicate: true });
    }
    if (pkg.status !== 'pago') throw new UserError('O pagamento do pacote ainda não foi confirmado.', 409);
    const { d, errors } = parseBriefing(req.body, { contact: false });
    if (Object.keys(errors).length) throw new UserError('Revise os campos destacados.', 400, errors);
    const files = inspectBriefingFiles(req);
    tx(() => {
      const fresh = get('SELECT * FROM packages WHERE id = ?', pkg.id);
      if (usedCredits(pkg.id) >= fresh.credits_total) throw new UserError('Seu pacote não tem mais créditos disponíveis.', 409);
      const id = insertOrder({ d: { ...d, name: pkg.name, email: pkg.email, whatsapp: pkg.whatsapp }, kind: 'pacote', packageId: pkg.id, idem, status: 'em_producao', price: 0 });
      for (const f of files) store(f.file, f.info, { ownerType: 'order', ownerId: id, role: f.role });
      logEvent(id, 'cliente', `Briefing enviado pelo pacote ${pkg.id}.`);
      logEvent(pkg.id, 'cliente', `1 crédito usado no briefing ${id} (${d.store_name}).`);
    });
    res.json({ redirect: `/pacote/${pkg.access_token}?msg=briefing` });
  } catch (e) {
    jsonError(res, req, e);
  }
});

// =====================================================================
// ENTREGA (link privado)
// =====================================================================
function deliveryByToken(t) {
  const o = get('SELECT * FROM orders WHERE delivery_token = ?', String(t || ''));
  if (!o) return { error: 404 };
  if (o.delivery_revoked) return { error: 410, order: o };
  if (!o.delivered_at) return { error: 404 };
  return { order: o };
}
function partnerBrand(order) {
  if (order.kind !== 'pacote') return null;
  const pkg = get('SELECT * FROM packages WHERE id = ?', order.package_id);
  const logo = get("SELECT id FROM files WHERE owner_type = 'package' AND owner_id = ? AND role = 'logo'", pkg.id);
  return { name: pkg.company, logoUrl: logo ? `/e/${order.delivery_token}/marca` : null, color: pkg.brand_color, appName: null, href: '#' };
}
function deliveryError(res, r) {
  if (r.error === 410) return sendHtml(res, pub.messagePage({ title: 'Link desativado', text: 'O acesso a esta simulação foi revogado. Peça um novo link para quem enviou.' }), 410);
  return sendHtml(res, pub.messagePage({ title: 'Link não encontrado', text: 'Confira se o endereço está completo.' }), 404);
}

app.get('/e/:token', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error) return deliveryError(res, r);
  const order = r.order;
  const original = get("SELECT * FROM files WHERE owner_type = 'order' AND owner_id = ? AND role = 'fachada'", order.id);
  const props = all('SELECT * FROM proposals WHERE order_id = ? AND published = 1 ORDER BY slot, version DESC', order.id);
  const slots = [];
  for (const p of props) {
    let sl = slots.find((x) => x.slot === p.slot);
    if (!sl) slots.push((sl = { slot: p.slot, versions: [] }));
    sl.versions.push(p);
  }
  const adjustment = get('SELECT * FROM adjustments WHERE order_id = ?', order.id);
  const brand = partnerBrand(order);
  res.set('Cache-Control', 'no-store');
  sendHtml(res, pub.deliveryPage({ order, slots, original, adjustment, brand, baseUrl: baseUrl(req), req, partner: brand?.name }));
});
app.get('/e/:token/f/:fileId', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error) return res.status(r.error).end();
  const f = get(
    `SELECT f.* FROM files f WHERE f.id = ? AND f.owner_type = 'order' AND f.owner_id = ?
     AND (f.role = 'fachada' OR EXISTS (SELECT 1 FROM proposals p WHERE p.file_id = f.id AND p.published = 1))`,
    req.params.fileId, r.order.id,
  );
  if (!f) return res.status(404).end();
  sendStored(res, f, { download: req.query.dl === '1' });
});
app.get('/e/:token/marca', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error || r.order.kind !== 'pacote') return res.status(404).end();
  const f = get("SELECT * FROM files WHERE owner_type = 'package' AND owner_id = ? AND role = 'logo'", r.order.package_id);
  if (!f) return res.status(404).end();
  sendStored(res, f);
});
const publishedSlot = (orderId, slot) => get('SELECT 1 FROM proposals WHERE order_id = ? AND slot = ? AND published = 1', orderId, slot);

app.post('/e/:token/favorita', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error) return deliveryError(res, r);
  const slot = String(req.body.slot || '');
  if (r.order.status === 'entregue' && publishedSlot(r.order.id, slot)) {
    run("UPDATE orders SET chosen_slot = ?, updated_at = ? WHERE id = ? AND status = 'entregue'", slot, nowIso(), r.order.id);
    logEvent(r.order.id, 'cliente', `Escolheu a proposta ${slot} como favorita.`);
  }
  res.redirect(303, `/e/${req.params.token}?msg=favorita#proposta-${slot}`);
});
app.post('/e/:token/ajuste', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error) return deliveryError(res, r);
  const o = r.order;
  const slot = String(req.body.slot || '');
  const desc = clip(req.body.descricao, 2000);
  const back = (q) => res.redirect(303, `/e/${req.params.token}?${q}#ajuste`);
  if (o.kind !== 'avulso') return back('erro=' + encodeURIComponent('O ajuste está disponível apenas na simulação avulsa.'));
  if (o.adjustment_used) return back('msg=ajuste'); // repetição: já registrado, nada é duplicado
  if (!publishedSlot(o.id, slot)) return back('erro=' + encodeURIComponent('Escolha uma das propostas.'));
  if (desc.length < 10) return back('erro=' + encodeURIComponent('Descreva o ajuste com pelo menos 10 caracteres.'));
  const ok = tx(() => {
    const u = run("UPDATE orders SET adjustment_used = 1, chosen_slot = ?, status = 'ajuste_solicitado', updated_at = ? WHERE id = ? AND adjustment_used = 0 AND status = 'entregue'", slot, nowIso(), o.id);
    if (u.changes !== 1) return false;
    run('INSERT INTO adjustments (order_id, slot, description, created_at) VALUES (?,?,?,?)', o.id, slot, desc, nowIso());
    logEvent(o.id, 'cliente', `Solicitou ajuste na proposta ${slot}.`);
    return true;
  });
  back(ok ? 'msg=ajuste' : 'erro=' + encodeURIComponent('Não foi possível registrar o ajuste agora.'));
});
app.post('/e/:token/concluir', (req, res) => {
  const r = deliveryByToken(req.params.token);
  if (r.error) return deliveryError(res, r);
  const u = run("UPDATE orders SET status = 'concluido', concluded_at = ?, updated_at = ? WHERE id = ? AND status = 'entregue' AND chosen_slot IS NOT NULL", nowIso(), nowIso(), r.order.id);
  if (u.changes) logEvent(r.order.id, 'cliente', `Aprovou a proposta ${r.order.chosen_slot} e concluiu o pedido.`);
  res.redirect(303, `/e/${req.params.token}?msg=aprovado`);
});

// =====================================================================
// PAINEL DA DELTA
// =====================================================================
app.get('/painel/login', (req, res) => {
  if (auth.currentAdmin(req)) return res.redirect('/painel');
  sendHtml(res, adm.loginPage({ volta: req.query.volta }));
});
app.post('/painel/login', (req, res) => {
  const ip = req.ip;
  const volta = String(req.body.volta || '');
  const safeVolta = volta.startsWith('/painel') && !volta.startsWith('//') ? volta : '/painel';
  if (!auth.loginAllowed(ip)) return sendHtml(res, adm.loginPage({ error: 'Muitas tentativas. Aguarde 15 minutos.', volta }), 429);
  const a = get('SELECT * FROM admins WHERE email = ?', String(req.body.email || '').trim().toLowerCase());
  if (!a || !auth.verifyPassword(String(req.body.senha || ''), a.pass_hash)) {
    auth.loginFailed(ip);
    return sendHtml(res, adm.loginPage({ error: 'E-mail ou senha incorretos.', volta }), 401);
  }
  auth.startSession(res, req, a.id);
  res.redirect(303, safeVolta);
});
app.post('/painel/sair', (req, res) => {
  auth.endSession(req, res);
  res.redirect(303, '/painel/login');
});

const P = express.Router();
P.use(auth.requireAdmin);

P.get('/', (req, res) => {
  const status = ['aguardando_pagamento', 'em_producao', 'entregue', 'ajuste_solicitado', 'concluido'].includes(req.query.status) ? req.query.status : '';
  const q = clip(req.query.q, 80);
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.id LIKE ? OR o.store_name LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR pk.company LIKE ?)'); params.push(...Array(5).fill(`%${q}%`)); }
  const orders = all(
    `SELECT o.*, pk.company,
       (SELECT id FROM files f WHERE f.owner_type = 'order' AND f.owner_id = o.id AND f.role = 'fachada') AS thumb
     FROM orders o LEFT JOIN packages pk ON pk.id = o.package_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY CASE o.status WHEN 'ajuste_solicitado' THEN 0 WHEN 'em_producao' THEN 1 WHEN 'aguardando_pagamento' THEN 2 WHEN 'entregue' THEN 3 ELSE 4 END, o.created_at DESC LIMIT 300`,
    ...params,
  );
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
  sendHtml(res, adm.ordersPage({ admin: req.admin, orders, counts, status, q, req }));
});

P.get('/arquivo/:id', (req, res) => {
  const f = get('SELECT * FROM files WHERE id = ?', req.params.id);
  if (!f) return res.status(404).end();
  sendStored(res, f, { download: req.query.dl === '1' });
});

function loadOrder(req, res) {
  const o = get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!o) res.status(404).send('Pedido não encontrado');
  return o;
}
function waMessageFor(order, pkg, base) {
  const s = getSettings();
  const first = (order.name || pkg?.name || '').split(' ')[0];
  const link = order.delivery_token && !order.delivery_revoked ? `${base}/e/${order.delivery_token}` : null;
  const track = `${base}/pedido/${order.id}?t=${order.access_token}`;
  const hi = `Olá${first ? `, ${first}` : ''}! Aqui é da ${s.brand_name}.`;
  if (order.status === 'aguardando_pagamento') return `${hi}\n\nRecebemos o pedido ${order.id} da simulação da fachada da ${order.store_name}. Para começarmos, falta só concluir o pagamento por aqui:\n${track}`;
  if (!link || order.status === 'em_producao') return `${hi}\n\nO pedido ${order.id} (${order.store_name}) está em produção. Avisamos assim que as propostas estiverem prontas.\n\nAcompanhe: ${pkg ? `${base}/pacote/${pkg.access_token}` : track}`;
  if (order.adjustment_used && order.status === 'entregue') return `${hi}\n\nA versão revisada da proposta ${order.chosen_slot} da ${order.store_name} está pronta, no mesmo link:\n${link}`;
  if (pkg) return `${hi}\n\nAs simulações da ${order.store_name} (pedido ${order.id}) estão prontas, já com a marca da ${pkg.company} para você apresentar ao seu cliente:\n${link}`;
  return `${hi}\n\nAs simulações da fachada da ${order.store_name} estão prontas. Veja as propostas e compare o antes e depois neste link privado:\n${link}\n\nPor lá você escolhe sua favorita e, se quiser, pede um ajuste. Pode compartilhar o link com quem vai produzir a placa.`;
}

P.get('/pedido/:id', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  const pkg = order.package_id ? get('SELECT * FROM packages WHERE id = ?', order.package_id) : null;
  const files = all("SELECT * FROM files WHERE owner_type = 'order' AND owner_id = ? AND role != 'proposta' ORDER BY CASE role WHEN 'fachada' THEN 0 WHEN 'logo' THEN 1 ELSE 2 END, created_at", order.id);
  const proposals = all('SELECT * FROM proposals WHERE order_id = ? ORDER BY slot, version', order.id);
  const adjustment = get('SELECT * FROM adjustments WHERE order_id = ?', order.id);
  const events = all('SELECT * FROM events WHERE ref_id = ? ORDER BY id DESC', order.id);
  const base = baseUrl(req);
  sendHtml(res, adm.orderDetailPage({
    admin: req.admin, order, pkg, files, proposals, adjustment, events, req,
    deliveryUrl: order.delivery_token ? `${base}/e/${order.delivery_token}` : '',
    orderUrl: pkg ? `${base}/pacote/${pkg.access_token}` : `${base}/pedido/${order.id}?t=${order.access_token}`,
    idem: randomId() + randomId(),
    waMessage: waMessageFor(order, pkg, base),
    contactPhone: order.whatsapp || pkg?.whatsapp || '',
  }));
});

P.post('/pedido/:id/pagamento', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  if (req.body.confirmo !== '1') return res.redirect(303, `/painel/pedido/${order.id}?erro=${encodeURIComponent('Confirme que conferiu o recebimento.')}`);
  const r = confirmPayment({ refType: 'order', refId: order.id, provider: 'manual', providerPaymentId: `manual-${order.id}`, method: clip(req.body.forma, 30), note: clip(req.body.obs, 200), actor: req.admin.email });
  res.redirect(303, `/painel/pedido/${order.id}?msg=${r.already ? 'pago_ja' : 'pago'}`);
});

const proposalUpload = upload.single('imagem');
P.post('/pedido/:id/propostas', (req, res, next) => proposalUpload(req, res, (err) => {
  if (err) { cleanupTmp(req); return res.redirect(303, `/painel/pedido/${req.params.id}?erro=${encodeURIComponent('Arquivo grande demais (limite de 20 MB).')}`); }
  next();
}), (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return cleanupTmp(req);
  const back = (q) => res.redirect(303, `/painel/pedido/${order.id}?${q}`);
  try {
    if (order.status === 'aguardando_pagamento') throw new UserError('Registre o pagamento antes de enviar propostas.');
    const idem = String(req.body.idem || '');
    if (isIdem(idem) && get('SELECT 1 FROM proposals WHERE idem_key = ?', idem)) { cleanupTmp(req); return back('msg=proposta_dup'); }
    const slot = ['A', 'B', 'C'].includes(req.body.slot) ? req.body.slot : 'A';
    if (!req.file) throw new UserError('Escolha a imagem da proposta.');
    const info = inspect(req.file, 'proposta');
    tx(() => {
      const fileId = store(req.file, info, { ownerType: 'order', ownerId: order.id, role: 'proposta' });
      const v = (get('SELECT MAX(version) AS v FROM proposals WHERE order_id = ? AND slot = ?', order.id, slot).v || 0) + 1;
      run('INSERT INTO proposals (order_id, slot, version, file_id, title, note, idem_key, created_at) VALUES (?,?,?,?,?,?,?,?)',
        order.id, slot, v, fileId, clip(req.body.titulo, 80) || null, clip(req.body.nota, 400) || null, isIdem(idem) ? idem : null, nowIso());
      logEvent(order.id, req.admin.email, `Enviou a proposta ${slot} (versão ${v}).`);
    });
    back('msg=proposta');
  } catch (e) {
    cleanupTmp(req);
    if (!(e instanceof UserError)) console.error(e);
    back('erro=' + encodeURIComponent(e instanceof UserError ? e.message : 'Falha ao enviar a imagem.'));
  }
});

P.post('/pedido/:id/propostas/:pid/remover', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  const p = get('SELECT * FROM proposals WHERE id = ? AND order_id = ?', req.params.pid, order.id);
  if (p) {
    tx(() => {
      run('DELETE FROM proposals WHERE id = ?', p.id);
      removeFile(p.file_id);
      logEvent(order.id, req.admin.email, `Removeu a proposta ${p.slot} (versão ${p.version}).`);
    });
  }
  res.redirect(303, `/painel/pedido/${order.id}?msg=proposta_removida`);
});

P.post('/pedido/:id/publicar', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  const back = (q) => res.redirect(303, `/painel/pedido/${order.id}?${q}`);
  try {
    const msg = tx(() => {
      const o = get('SELECT * FROM orders WHERE id = ?', order.id);
      const pending = all('SELECT * FROM proposals WHERE order_id = ? AND published = 0', o.id);
      if (!pending.length) throw new UserError('Não há imagens novas para publicar.');
      if (o.status === 'aguardando_pagamento') throw new UserError('O pagamento ainda não foi confirmado.');
      if (o.status === 'ajuste_solicitado' && !pending.some((p) => p.slot === o.chosen_slot)) throw new UserError(`Envie a versão revisada da proposta ${o.chosen_slot} antes de publicar.`);
      run('UPDATE proposals SET published = 1 WHERE order_id = ? AND published = 0', o.id);
      const tokenD = o.delivery_token || token();
      if (o.status === 'ajuste_solicitado') {
        run("UPDATE orders SET status = 'entregue', updated_at = ? WHERE id = ?", nowIso(), o.id);
        run("UPDATE adjustments SET status = 'atendido', resolved_at = ? WHERE order_id = ?", nowIso(), o.id);
        logEvent(o.id, req.admin.email, 'Publicou a versão revisada.');
        return 'revisao';
      }
      run(`UPDATE orders SET delivery_token = ?, status = CASE WHEN status = 'em_producao' THEN 'entregue' ELSE status END,
           delivered_at = COALESCE(delivered_at, ?), updated_at = ? WHERE id = ?`, tokenD, nowIso(), nowIso(), o.id);
      logEvent(o.id, req.admin.email, o.delivered_at ? 'Publicou imagens novas na entrega.' : 'Publicou a entrega.');
      return 'publicado';
    });
    back(`msg=${msg}`);
  } catch (e) {
    back('erro=' + encodeURIComponent(e.message));
  }
});

P.post('/pedido/:id/link/revogar', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  run('UPDATE orders SET delivery_revoked = 1, updated_at = ? WHERE id = ?', nowIso(), order.id);
  logEvent(order.id, req.admin.email, 'Revogou o link de entrega.');
  res.redirect(303, `/painel/pedido/${order.id}?msg=revogado`);
});
P.post('/pedido/:id/link/novo', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  run('UPDATE orders SET delivery_token = ?, delivery_revoked = 0, updated_at = ? WHERE id = ? AND delivery_revoked = 1', token(), nowIso(), order.id);
  logEvent(order.id, req.admin.email, 'Gerou um novo link de entrega.');
  res.redirect(303, `/painel/pedido/${order.id}?msg=novo_link`);
});
P.post('/pedido/:id/status', (req, res) => {
  const order = loadOrder(req, res);
  if (!order) return;
  if (req.body.acao === 'concluir' && ['entregue', 'ajuste_solicitado'].includes(order.status)) {
    run("UPDATE orders SET status = 'concluido', concluded_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), order.id);
    logEvent(order.id, req.admin.email, 'Marcou o pedido como concluído.');
    return res.redirect(303, `/painel/pedido/${order.id}?msg=concluido`);
  }
  if (req.body.acao === 'reabrir' && order.status === 'concluido') {
    run("UPDATE orders SET status = 'entregue', concluded_at = NULL, updated_at = ? WHERE id = ?", nowIso(), order.id);
    logEvent(order.id, req.admin.email, 'Reabriu o pedido.');
    return res.redirect(303, `/painel/pedido/${order.id}?msg=reaberto`);
  }
  res.redirect(303, `/painel/pedido/${order.id}`);
});

// ---------- Pacotes (painel) ----------
P.get('/pacotes', (req, res) => {
  const packages = all('SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.package_id = p.id) AS used FROM packages p ORDER BY created_at DESC LIMIT 300');
  sendHtml(res, adm.packagesPage({ admin: req.admin, packages, req }));
});
P.get('/pacote/:id', (req, res) => {
  const pkg = get('SELECT * FROM packages WHERE id = ?', req.params.id);
  if (!pkg) return res.status(404).send('Pacote não encontrado');
  const briefings = all('SELECT * FROM orders WHERE package_id = ? ORDER BY created_at DESC', pkg.id);
  const logo = get("SELECT * FROM files WHERE owner_type = 'package' AND owner_id = ? AND role = 'logo'", pkg.id);
  const events = all('SELECT * FROM events WHERE ref_id = ? ORDER BY id DESC', pkg.id);
  const link = `${baseUrl(req)}/pacote/${pkg.access_token}`;
  const s = getSettings();
  const first = pkg.name.split(' ')[0];
  const waMessage = pkg.status === 'pago'
    ? `Olá, ${first}! Aqui é da ${s.brand_name}. Os 5 créditos do seu pacote estão liberados. Consulte o saldo e envie os briefings, um de cada vez, por este link:\n${link}`
    : `Olá, ${first}! Aqui é da ${s.brand_name}. Recebemos o pedido do pacote ${pkg.id}. Para liberar os 5 créditos, falta concluir o pagamento:\n${link}`;
  sendHtml(res, adm.packageDetailPage({ admin: req.admin, pkg, briefings, logo, link, req, events, waMessage }));
});
P.post('/pacote/:id/pagamento', (req, res) => {
  const pkg = get('SELECT * FROM packages WHERE id = ?', req.params.id);
  if (!pkg) return res.status(404).send('Pacote não encontrado');
  if (req.body.confirmo !== '1') return res.redirect(303, `/painel/pacote/${pkg.id}?erro=${encodeURIComponent('Confirme que conferiu o recebimento.')}`);
  const r = confirmPayment({ refType: 'package', refId: pkg.id, provider: 'manual', providerPaymentId: `manual-${pkg.id}`, method: clip(req.body.forma, 30), note: clip(req.body.obs, 200), actor: req.admin.email });
  res.redirect(303, `/painel/pacote/${pkg.id}?msg=${r.already ? 'pago_ja' : 'pago'}`);
});

// ---------- Configurações ----------
const envInfo = (req) => ({ mp: !!process.env.MP_ACCESS_TOKEN, providerLocked: !!process.env.PAYMENT_PROVIDER, webhookUrl: `${baseUrl(req)}/webhooks/mercadopago` });
P.get('/config', (req, res) => sendHtml(res, adm.configPage({ admin: req.admin, admins: auth.listAdmins(), req, envInfo: envInfo(req) })));
const brandUpload = upload.single('logo');
P.post('/config', (req, res, next) => brandUpload(req, res, (err) => {
  if (err) { cleanupTmp(req); return res.redirect(303, `/painel/config?erro=${encodeURIComponent('Logo grande demais.')}`); }
  next();
}), (req, res) => {
  try {
    const b = req.body;
    const s = getSettings();
    if (req.file) {
      const info = inspect(req.file, 'marca');
      const id = store(req.file, info, { ownerType: 'settings', ownerId: 'brand', role: 'marca' });
      if (s.brand_logo_file) removeFile(s.brand_logo_file);
      setSetting('brand_logo_file', id);
    } else if (b.remover_logo === '1' && s.brand_logo_file) {
      removeFile(s.brand_logo_file);
      setSetting('brand_logo_file', '');
    }
    setSetting('brand_name', clip(b.brand_name, 60) || 'Delta');
    setSetting('app_name', clip(b.app_name, 60) || 'Fachada em Vista');
    setSetting('brand_color', sanitizeColor(b.brand_color, s.brand_color));
    setSetting('delta_whatsapp', onlyDigits(b.delta_whatsapp));
    const pu = clip(b.public_url, 200);
    if (pu && !/^https?:\/\/[^\s/]+/.test(pu)) throw new UserError('Endereço público inválido.');
    setSetting('public_url', pu.replace(/\/$/, ''));
    if (!process.env.PAYMENT_PROVIDER && ['demo', 'link', 'mercadopago'].includes(b.payment_provider)) setSetting('payment_provider', b.payment_provider);
    for (const k of ['payment_link_single', 'payment_link_package']) {
      const v = clip(b[k], 400);
      if (v && !/^https:\/\//.test(v)) throw new UserError('Os links de pagamento devem começar com https://');
      setSetting(k, v);
    }
    const money = (v, d) => { const n = Math.round(parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) * 100); return n > 0 ? n : d; };
    setSetting('price_single_cents', money(b.price_single, s.price_single));
    setSetting('price_package_cents', money(b.price_package, s.price_package));
    res.redirect(303, '/painel/config?msg=config');
  } catch (e) {
    cleanupTmp(req);
    res.redirect(303, '/painel/config?erro=' + encodeURIComponent(e instanceof UserError ? e.message : 'Falha ao salvar.'));
  }
});
P.post('/config/senha', (req, res) => {
  const a = get('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!auth.verifyPassword(String(req.body.atual || ''), a.pass_hash)) return res.redirect(303, '/painel/config?erro=' + encodeURIComponent('Senha atual incorreta.'));
  const nova = String(req.body.nova || '');
  if (nova.length < 10) return res.redirect(303, '/painel/config?erro=' + encodeURIComponent('A nova senha precisa de pelo menos 10 caracteres.'));
  run('UPDATE admins SET pass_hash = ? WHERE id = ?', auth.hashPassword(nova), a.id);
  setSetting('admin_demo_password', '0');
  res.redirect(303, '/painel/config?msg=senha');
});
P.post('/config/equipe', (req, res) => {
  const email = clip(req.body.email, 160).toLowerCase();
  const senha = String(req.body.senha || '');
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || senha.length < 10) return res.redirect(303, '/painel/config?erro=' + encodeURIComponent('Informe e-mail válido e senha com 10+ caracteres.'));
  if (get('SELECT 1 FROM admins WHERE email = ?', email)) return res.redirect(303, '/painel/config?erro=' + encodeURIComponent('Este e-mail já tem acesso.'));
  run('INSERT INTO admins (email, name, pass_hash, created_at) VALUES (?,?,?,?)', email, clip(req.body.nome, 80), auth.hashPassword(senha), nowIso());
  res.redirect(303, '/painel/config?msg=membro');
});

app.use('/painel', P);

app.use((req, res) => sendHtml(res, pub.messagePage({ title: 'Página não encontrada', text: 'O endereço pode estar incompleto.' }), 404));
app.use((err, req, res, next) => {
  console.error(err);
  cleanupTmp(req);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  sendHtml(res, pub.messagePage({ title: 'Algo deu errado', text: 'Tente novamente em instantes.' }), 500);
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`[Fachada em Vista] rodando em http://localhost:${PORT}  (pagamento: ${getSettings().payment_provider})`));

process.on('SIGTERM', () => { db.close(); process.exit(0); });
