import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, all, run, tx, logEvent, TMP_DIR } from './db.js';
import { inspect, store, cleanupTmp, sendStored } from './files.js';
import * as auth from './auth.js';
import { shortCode, token, nowIso, UserError, isIdem, clip, onlyDigits, sha256 } from './util.js';
import { CATEGORIAS, SITUACAO, ORCAMENTO, PRAZO, DOC_TIPO, UFS, validCPF, validCNPJ, contractText } from './domain.js';
import * as V from './views/pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

auth.seedAdmin();
setInterval(auth.cleanupSessions, 3600_000).unref();

// ---------- Segurança ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  });
  next();
});
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(auth.loadUser);

const send = (res, s, status = 200) => res.status(status).type('html').send(String(s));
const wantsJson = (req) => (req.get('accept') || '').includes('application/json');
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const nomeDe = (u) => u.empresa || u.nome;
const okEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const ua = (req) => clip(req.get('user-agent'), 300);
const notFound = (req, res, txt = 'Não encontramos o que você procurava.') => send(res, V.erro({ user: req.user, titulo: 'Não encontrado', texto: txt }), 404);

// ---------- Uploads (vão para pasta temporária e só são guardados após validação) ----------
const upload = multer({ dest: TMP_DIR, limits: { fileSize: 15 * 1024 * 1024, files: 10, fields: 40, fieldSize: 20000 } });
function uploadFields(fields) {
  const mw = upload.fields(fields);
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    cleanupTmp(req);
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Um dos arquivos passou de 15 MB.' : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Arquivos demais: até 4 fotos, 1 logo e 3 referências.' : 'Não foi possível receber os arquivos. Tente novamente.';
    return res.status(400).json({ error: msg });
  });
}
const filesOf = (req, name) => (req.files && req.files[name]) || [];

// Limite de criação por IP
const hits = new Map();
const rateLimit = (max, windowMs) => (req, res, next) => {
  const k = `${req.route ? req.route.path : req.path}|${req.ip}`; const now = Date.now();
  const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { cleanupTmp(req); return wantsJson(req) ? res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }) : send(res, V.erro({ user: req.user, titulo: 'Calma aí', texto: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }), 429); }
  list.push(now); hits.set(k, list); next();
};

// ---------- Avaliação média do prestador ----------
const ratingOf = (id) => { const r = get('SELECT AVG(nota) AS avg, COUNT(*) AS n FROM reviews WHERE prestador_id = ?', id); return { avg: r.avg || 0, n: r.n }; };

// ====================================================================
// Público e contas
// ====================================================================
app.get('/', (req, res) => {
  const stats = { pedidos: get('SELECT COUNT(*) AS n FROM requests').n, prestadores: get("SELECT COUNT(*) AS n FROM users WHERE role = 'prestador' AND blocked = 0").n };
  send(res, V.home({ user: req.user, stats: stats.pedidos + stats.prestadores > 0 ? stats : null }));
});
app.get('/para-prestadores', (req, res) => send(res, V.paraPrestadores({ user: req.user })));
app.get('/criar', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'criar.html')));
app.get('/termos', (req, res) => send(res, V.textoPagina({ user: req.user, titulo: 'Termos de uso', paragrafos: [
  'A Fachada em Vista é uma plataforma que aproxima empresas, MEIs e lojistas (contratantes) de prestadores de serviços de comunicação visual. Ao criar uma conta, você declara que as informações fornecidas são verdadeiras e que tem poderes para representar o negócio cadastrado.',
  'A plataforma não presta os serviços, não é parte dos contratos firmados entre os usuários, não recebe nem intermedeia pagamentos e não garante a execução, a qualidade ou os prazos dos serviços. Cabe a cada parte verificar as informações da outra antes de contratar.',
  'O contrato gerado pela plataforma é um modelo preenchido com os dados do pedido e da proposta. As partes podem ajustá-lo de comum acordo fora da plataforma. Recomendamos consultar um advogado para contratos de valor elevado.',
  'É proibido publicar conteúdo falso, ofensivo ou ilegal, usar dados de terceiros sem autorização ou usar a plataforma para fins diferentes da contratação de serviços. Contas que violarem estas regras podem ser bloqueadas.',
  'O uso da plataforma é gratuito nesta fase. Qualquer cobrança futura será comunicada com antecedência e só valerá após aceite.',
] })));
app.get('/privacidade', (req, res) => send(res, V.textoPagina({ user: req.user, titulo: 'Política de privacidade', paragrafos: [
  'Coletamos os dados que você informa no cadastro (nome, e-mail, WhatsApp, CNPJ ou CPF, cidade) e nos pedidos (descrição, fotos, logo), além de registros técnicos de acesso (IP e data), usados para segurança e para o registro das assinaturas dos contratos.',
  'Pedidos ficam visíveis para prestadores cadastrados com a cidade, o bairro, a descrição e as fotos. Nome, e-mail, WhatsApp e documento do contratante só são compartilhados com o prestador cujo contrato foi assinado pelas duas partes.',
  'O perfil público do prestador mostra o nome da empresa, a cidade, os serviços, a apresentação e as avaliações. O documento e o contato do prestador só aparecem no contrato.',
  'Os dados são usados apenas para o funcionamento da plataforma, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). Você pode pedir a correção ou a exclusão dos seus dados pelos canais de contato da plataforma; contratos assinados são mantidos pelo prazo legal.',
] })));

app.get('/entrar', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/painel');
  send(res, V.entrar({ user: null, volta: clip(req.query.volta, 300) }));
});
app.post('/entrar', (req, res) => {
  const email = clip(req.body.email, 160).toLowerCase();
  const volta = /^\/[^/\\]/.test(req.body.volta || '') ? req.body.volta : '';
  if (!auth.loginAllowed(req.ip)) return send(res, V.entrar({ user: null, email, volta, error: 'Muitas tentativas. Aguarde 15 minutos.' }), 429);
  const u = get('SELECT * FROM users WHERE email = ?', email);
  if (!u || !auth.verifyPassword(req.body.senha || '', u.pass_hash)) { auth.loginFailed(req.ip); return send(res, V.entrar({ user: null, email, volta, error: 'E-mail ou senha incorretos.' }), 401); }
  if (u.blocked) return send(res, V.entrar({ user: null, email, volta, error: 'Esta conta está bloqueada. Fale com a administração.' }), 403);
  auth.startSession(res, req, u.id);
  res.redirect(303, volta || (u.role === 'admin' ? '/admin' : '/painel'));
});
app.post('/sair', (req, res) => { auth.endSession(req, res); res.redirect(303, '/'); });

/** Valida os dados de perfil (cadastro e edição). */
function parsePerfil(body, tipo) {
  const e = {};
  const v = {
    empresa: clip(body.empresa, 120), nome: clip(body.nome, 120), doc_tipo: DOC_TIPO[body.doc_tipo] ? body.doc_tipo : '',
    documento: onlyDigits(body.documento), whatsapp: onlyDigits(body.whatsapp), cidade: clip(body.cidade, 80), uf: UFS.includes(body.uf) ? body.uf : '',
    categorias: arr(body.categorias).filter((c) => CATEGORIAS[c]), atende_estado: body.atende_estado ? 1 : 0, bio: clip(body.bio, 1500), site: clip(body.site, 200),
  };
  if (v.empresa.length < 2) e.empresa = 'Informe o nome.';
  if (v.nome.length < 2) e.nome = 'Informe o nome do responsável.';
  if (!v.doc_tipo) e.doc_tipo = 'Escolha o tipo de cadastro.';
  else if (v.doc_tipo === 'cpf' ? !validCPF(v.documento) : !validCNPJ(v.documento)) e.documento = v.doc_tipo === 'cpf' ? 'CPF inválido. Confira os números.' : 'CNPJ inválido. Confira os números.';
  if (v.whatsapp.length < 10 || v.whatsapp.length > 13) e.whatsapp = 'Informe o WhatsApp com DDD.';
  if (v.cidade.length < 2) e.cidade = 'Informe a cidade.';
  if (!v.uf) e.uf = 'Escolha a UF.';
  if (tipo === 'prestador' && !v.categorias.length) e.categorias = 'Selecione pelo menos um serviço.';
  if (v.site && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v.site)) e.site = 'Endereço inválido.';
  return { v, e };
}

app.get('/cadastro', (req, res) => {
  if (req.user) return res.redirect('/painel');
  send(res, V.cadastro({ user: null, tipo: req.query.tipo === 'prestador' ? 'prestador' : 'empresa' }));
});
app.post('/cadastro', rateLimit(8, 3600_000), (req, res) => {
  const tipo = req.body.tipo === 'prestador' ? 'prestador' : 'empresa';
  const { v, e } = parsePerfil(req.body, tipo);
  v.email = clip(req.body.email, 160).toLowerCase();
  if (!okEmail(v.email)) e.email = 'Informe um e-mail válido.';
  else if (get('SELECT 1 FROM users WHERE email = ?', v.email)) e.email = 'Já existe uma conta com este e-mail. Entre ou use outro.';
  if (String(req.body.senha || '').length < 8) e.senha = 'A senha precisa ter pelo menos 8 caracteres.';
  if (!req.body.termos) e.termos = 'É preciso aceitar os termos.';
  if (Object.keys(e).length) return send(res, V.cadastro({ user: null, tipo, v, e, error: 'Revise os campos destacados.' }), 400);
  const t = nowIso();
  const r = run(`INSERT INTO users (role, email, pass_hash, nome, empresa, doc_tipo, documento, whatsapp, cidade, uf, categorias, atende_estado, bio, site, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, tipo, v.email, auth.hashPassword(req.body.senha), v.nome, v.empresa, v.doc_tipo, v.documento, v.whatsapp, v.cidade, v.uf,
  JSON.stringify(tipo === 'prestador' ? v.categorias : []), v.atende_estado, v.bio, v.site, t, t);
  auth.startSession(res, req, Number(r.lastInsertRowid));
  res.redirect(303, (tipo === 'prestador' ? '/oportunidades' : '/painel') + '?msg=bemvindo');
});

app.get('/conta', auth.requireRole('empresa', 'prestador'), (req, res) => {
  const u = req.user;
  send(res, V.conta({ user: u, req, v: { ...u, categorias: JSON.parse(u.categorias || '[]') }, avaliacoes: ratingOf(u.id) }));
});
app.post('/conta', auth.requireRole('empresa', 'prestador'), (req, res) => {
  const u = req.user;
  const { v, e } = parsePerfil(req.body, u.role);
  if (Object.keys(e).length) return send(res, V.conta({ user: u, req, v, e, error: 'Revise os campos destacados.', avaliacoes: ratingOf(u.id) }), 400);
  run(`UPDATE users SET nome=?, empresa=?, doc_tipo=?, documento=?, whatsapp=?, cidade=?, uf=?, categorias=?, atende_estado=?, bio=?, site=?, updated_at=? WHERE id = ?`,
    v.nome, v.empresa, v.doc_tipo, v.documento, v.whatsapp, v.cidade, v.uf, JSON.stringify(u.role === 'prestador' ? v.categorias : []), v.atende_estado, v.bio, v.site, nowIso(), u.id);
  res.redirect(303, '/conta?msg=conta');
});
app.post('/conta/senha', auth.requireRole('empresa', 'prestador', 'admin'), (req, res) => {
  const row = get('SELECT pass_hash FROM users WHERE id = ?', req.user.id);
  const back = req.user.role === 'admin' ? '/admin' : '/conta';
  if (!auth.verifyPassword(req.body.atual || '', row.pass_hash)) return send(res, V.erro({ user: req.user, titulo: 'Senha atual incorreta', texto: 'Volte e tente de novo.' }), 400);
  if (String(req.body.nova || '').length < 8) return send(res, V.erro({ user: req.user, titulo: 'Senha curta', texto: 'A nova senha precisa ter pelo menos 8 caracteres.' }), 400);
  run('UPDATE users SET pass_hash = ?, updated_at = ? WHERE id = ?', auth.hashPassword(req.body.nova), nowIso(), req.user.id);
  res.redirect(303, back + '?msg=senha');
});

app.get('/painel', auth.requireRole(), (req, res) => {
  const u = req.user;
  if (u.role === 'admin') return res.redirect('/admin');
  if (u.role === 'empresa') {
    const pedidos = all(`SELECT r.*, (SELECT COUNT(*) FROM proposals p WHERE p.request_id = r.id AND p.status <> 'retirada') AS n_prop,
      (SELECT id FROM files f WHERE f.owner_type='pedido' AND f.owner_id = r.id AND f.role IN ('foto','simulacao') ORDER BY f.role = 'simulacao' DESC, f.created_at LIMIT 1) AS thumb_id,
      (SELECT COUNT(*) FROM messages m JOIN proposals p ON p.id = m.proposal_id LEFT JOIN reads rd ON rd.user_id = ? AND rd.proposal_id = p.id WHERE p.request_id = r.id AND m.author_id <> ? AND m.id > COALESCE(rd.last_id,0)) AS unread
      FROM requests r WHERE r.empresa_id = ? ORDER BY r.created_at DESC`, u.id, u.id, u.id).map((r) => ({ ...r, thumb: r.thumb_id ? { id: r.thumb_id } : null }));
    return send(res, V.painelEmpresa({ user: u, req, pedidos }));
  }
  const props = all(`SELECT p.*, r.titulo, r.cidade, r.uf, r.status AS r_status,
    (SELECT COUNT(*) FROM messages m LEFT JOIN reads rd ON rd.user_id = ? AND rd.proposal_id = p.id WHERE m.proposal_id = p.id AND m.author_id <> ? AND m.id > COALESCE(rd.last_id,0)) AS unread
    FROM proposals p JOIN requests r ON r.id = p.request_id WHERE p.prestador_id = ? ORDER BY p.updated_at DESC`, u.id, u.id, u.id);
  const contratos = all(`SELECT c.*, r.titulo, COALESCE(e.empresa, e.nome) AS e_nome FROM contracts c JOIN requests r ON r.id = c.request_id JOIN users e ON e.id = c.empresa_id
    WHERE c.prestador_id = ? AND c.status <> 'cancelado' ORDER BY c.created_at DESC`, u.id);
  send(res, V.painelPrestador({ user: u, req, props, contratos }));
});

// ====================================================================
// Pedidos (empresa)
// ====================================================================
app.get('/pedidos/novo', auth.requireRole('empresa'), (req, res) => send(res, V.novoPedido({ user: req.user, idem: token() })));

app.post('/pedidos', auth.requireRole('empresa'), rateLimit(20, 3600_000),
  uploadFields([{ name: 'fotos', maxCount: 4 }, { name: 'logo', maxCount: 1 }, { name: 'referencias', maxCount: 3 }, { name: 'simulacao', maxCount: 1 }]),
  (req, res) => {
    try {
      const b = req.body; const e = {};
      if (!isIdem(b.idem)) throw new UserError('Recarregue a página e tente de novo.');
      const dup = get('SELECT id FROM requests WHERE idem_key = ?', b.idem);
      if (dup) { cleanupTmp(req); return res.json({ redirect: `/pedidos/${dup.id}?msg=pedido` }); }
      const d = {
        titulo: clip(b.titulo, 100), categorias: arr(b.categorias).filter((c) => CATEGORIAS[c]), descricao: clip(b.descricao, 4000), medidas: clip(b.medidas, 200),
        situacao: SITUACAO[b.situacao] ? b.situacao : 'tenho', cidade: clip(b.cidade, 80), uf: UFS.includes(b.uf) ? b.uf : '', bairro: clip(b.bairro, 80),
        orcamento: ORCAMENTO[b.orcamento] ? b.orcamento : '', prazo: PRAZO[b.prazo] ? b.prazo : '',
      };
      if (d.titulo.length < 5) e.titulo = 'Escreva um título com pelo menos 5 caracteres.';
      if (!d.categorias.length) e.categorias = 'Selecione pelo menos um tipo de serviço.';
      if (d.descricao.length < 15) e.descricao = 'Descreva com pelo menos 15 caracteres.';
      if (d.cidade.length < 2) e.cidade = 'Informe a cidade.';
      if (!d.uf) e.uf = 'Escolha a UF.';
      if (!d.orcamento) e.orcamento = 'Escolha uma faixa.';
      if (!d.prazo) e.prazo = 'Escolha um prazo.';
      if (!b.aceite) e.aceite = 'Confirme para publicar.';
      if (Object.keys(e).length) throw new UserError('Revise os campos destacados.', 400, e);
      const checks = [['fotos', 'foto'], ['logo', 'logo'], ['referencias', 'referencia'], ['simulacao', 'simulacao']]
        .flatMap(([n, role]) => filesOf(req, n).map((f) => { try { return [f, role, inspect(f, role)]; } catch (err) { err.fields = { [n]: err.message }; throw err; } }));
      const id = shortCode('PD', 6); const t = nowIso();
      tx(() => {
        run(`INSERT INTO requests (id, idem_key, empresa_id, titulo, categorias, descricao, situacao, cidade, uf, bairro, medidas, orcamento, prazo, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, b.idem, req.user.id, d.titulo, JSON.stringify(d.categorias), d.descricao, d.situacao, d.cidade, d.uf, d.bairro, d.medidas, d.orcamento, d.prazo, t, t);
        for (const [f, role, info] of checks) store(f, info, { ownerType: 'pedido', ownerId: id, role });
        logEvent(id, nomeDe(req.user), 'Pedido publicado.');
      });
      res.json({ redirect: `/pedidos/${id}?msg=pedido` });
    } catch (err) {
      cleanupTmp(req);
      if (err instanceof UserError) return res.status(err.status).json({ error: err.message, fields: err.fields });
      console.error(err); res.status(500).json({ error: 'Não foi possível publicar agora. Tente novamente.' });
    }
  });

const reqFiles = (id) => all("SELECT id, role, mime, width, height FROM files WHERE owner_type = 'pedido' AND owner_id = ? ORDER BY role = 'simulacao' DESC, created_at", id);
function unreadByProposal(userId, reqId) {
  const out = {};
  for (const r of all(`SELECT p.id, COUNT(m.id) AS n FROM proposals p JOIN messages m ON m.proposal_id = p.id LEFT JOIN reads rd ON rd.user_id = ? AND rd.proposal_id = p.id
    WHERE p.request_id = ? AND m.author_id <> ? AND m.id > COALESCE(rd.last_id,0) GROUP BY p.id`, userId, reqId, userId)) out[r.id] = r.n;
  return out;
}
const propsWithPrestador = (reqId) => all(`SELECT p.*, COALESCE(u.empresa,u.nome) AS p_nome, u.cidade AS p_cidade, u.uf AS p_uf,
  (SELECT AVG(nota) FROM reviews WHERE prestador_id = u.id) AS avg, (SELECT COUNT(*) FROM reviews WHERE prestador_id = u.id) AS n_rev
  FROM proposals p JOIN users u ON u.id = p.prestador_id WHERE p.request_id = ? ORDER BY p.created_at`, reqId);

app.get('/pedidos/:id', auth.requireRole('empresa'), (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ? AND empresa_id = ?', req.params.id, req.user.id);
  if (!r) return notFound(req, res);
  const contract = get(`SELECT c.*, COALESCE(u.empresa,u.nome) AS p_nome FROM contracts c JOIN users u ON u.id = c.prestador_id WHERE c.request_id = ? AND c.status <> 'cancelado'`, r.id);
  send(res, V.pedidoEmpresa({ user: req.user, req, r, files: reqFiles(r.id), props: propsWithPrestador(r.id), contract, unread: unreadByProposal(req.user.id, r.id) }));
});
app.post('/pedidos/:id/cancelar', auth.requireRole('empresa'), (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ? AND empresa_id = ?', req.params.id, req.user.id);
  if (!r) return notFound(req, res);
  if (r.status === 'aberto') { run("UPDATE requests SET status = 'cancelado', updated_at = ? WHERE id = ?", nowIso(), r.id); logEvent(r.id, nomeDe(req.user), 'Pedido cancelado.'); }
  res.redirect(303, `/pedidos/${r.id}?msg=cancelado`);
});

// ====================================================================
// Oportunidades e propostas (prestador)
// ====================================================================
app.get('/oportunidades', auth.requireRole('prestador'), (req, res) => {
  const u = req.user;
  const todos = !!req.query.todos;
  const f = { uf: UFS.includes(req.query.uf) ? req.query.uf : (todos || 'uf' in req.query ? '' : u.uf), cidade: clip(req.query.cidade, 80), cat: CATEGORIAS[req.query.cat] ? req.query.cat : '' };
  const where = ["r.status = 'aberto'"]; const params = [];
  if (f.uf) { where.push('r.uf = ?'); params.push(f.uf); }
  if (f.cidade) { where.push('r.cidade LIKE ?'); params.push(`%${f.cidade}%`); }
  if (f.cat) { where.push('r.categorias LIKE ?'); params.push(`%"${f.cat}"%`); }
  const list = all(`SELECT r.*, (SELECT COUNT(*) FROM proposals p WHERE p.request_id = r.id AND p.status <> 'retirada') AS n_prop,
    (SELECT status FROM proposals p WHERE p.request_id = r.id AND p.prestador_id = ?) AS minha,
    (SELECT id FROM files fl WHERE fl.owner_type='pedido' AND fl.owner_id = r.id AND fl.role IN ('foto','simulacao') ORDER BY fl.role = 'simulacao' DESC, fl.created_at LIMIT 1) AS thumb_id
    FROM requests r WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT 200`, u.id, ...params).map((r) => ({ ...r, thumb: r.thumb_id ? { id: r.thumb_id } : null }));
  send(res, V.oportunidades({ user: u, req, list, f }));
});

function loadOportunidade(req) {
  const r = get('SELECT * FROM requests WHERE id = ?', req.params.id);
  if (!r) return null;
  const mine = get('SELECT * FROM proposals WHERE request_id = ? AND prestador_id = ?', r.id, req.user.id);
  if (r.status !== 'aberto' && !mine) return null; // pedidos fechados só para quem participou
  const owner = get('SELECT empresa, nome FROM users WHERE id = ?', r.empresa_id);
  return { r, mine, owner };
}
app.get('/oportunidades/:id', auth.requireRole('prestador'), (req, res) => {
  const o = loadOportunidade(req); if (!o) return notFound(req, res, 'Este pedido não existe ou não está mais aberto.');
  send(res, V.oportunidade({ user: req.user, req, ...o, files: reqFiles(o.r.id), idem: token() }));
});
/** Valor em reais no formato brasileiro (4.700 · 4.700,50 · 4700 · 4700.5) para centavos. */
const parseCents = (s) => {
  const t = String(s || '').replace(/[^\d,.]/g, '');
  let n;
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''));
  else n = Number(t);
  return t && Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
app.post('/oportunidades/:id/proposta', auth.requireRole('prestador'), rateLimit(60, 3600_000), (req, res) => {
  const o = loadOportunidade(req); if (!o) return notFound(req, res);
  const b = req.body; const e = {};
  const v = { valor: clip(b.valor, 20), prazo_dias: parseInt(b.prazo_dias, 10), inclui: clip(b.inclui, 3000), pagamento: clip(b.pagamento, 600), garantia: clip(b.garantia, 200), validade_dias: parseInt(b.validade_dias, 10) || 15 };
  const cents = parseCents(v.valor);
  if (!(cents >= 1000 && cents <= 100_000_000)) e.valor = 'Informe um valor entre R$ 10 e R$ 1.000.000.';
  if (!(v.prazo_dias >= 1 && v.prazo_dias <= 365)) e.prazo_dias = 'Prazo entre 1 e 365 dias.';
  if (v.inclui.length < 15) e.inclui = 'Descreva o que está incluído (pelo menos 15 caracteres).';
  if (v.pagamento.length < 5) e.pagamento = 'Informe as condições de pagamento.';
  if (!(v.validade_dias >= 1 && v.validade_dias <= 90)) e.validade_dias = 'Entre 1 e 90 dias.';
  const errMsg = o.r.status !== 'aberto' ? 'Este pedido não está mais recebendo propostas.' : Object.keys(e).length ? 'Revise os campos: ' + Object.values(e).join(' ') : '';
  if (errMsg) return send(res, V.oportunidade({ user: req.user, req, ...o, files: reqFiles(o.r.id), idem: token(), error: errMsg, v }), 400);
  const t = nowIso();
  const editing = o.mine && ['enviada', 'retirada'].includes(o.mine.status);
  if (o.mine && !editing) return res.redirect(303, `/oportunidades/${o.r.id}`);
  tx(() => {
    if (editing) run(`UPDATE proposals SET valor_cents=?, prazo_dias=?, inclui=?, pagamento=?, garantia=?, validade_dias=?, status='enviada', updated_at=? WHERE id = ?`, cents, v.prazo_dias, v.inclui, v.pagamento, v.garantia, v.validade_dias, t, o.mine.id);
    else run(`INSERT INTO proposals (id, request_id, prestador_id, valor_cents, prazo_dias, inclui, pagamento, garantia, validade_dias, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      shortCode('PR', 6), o.r.id, req.user.id, cents, v.prazo_dias, v.inclui, v.pagamento, v.garantia, v.validade_dias, t, t);
    logEvent(o.r.id, nomeDe(req.user), editing ? 'Proposta atualizada.' : 'Proposta enviada.');
  });
  res.redirect(303, `/oportunidades/${o.r.id}?msg=${editing ? 'proposta_editada' : 'proposta'}`);
});
app.post('/propostas/:id/retirar', auth.requireRole('prestador'), (req, res) => {
  const p = get('SELECT * FROM proposals WHERE id = ? AND prestador_id = ?', req.params.id, req.user.id);
  if (!p) return notFound(req, res);
  if (p.status === 'enviada') run("UPDATE proposals SET status = 'retirada', updated_at = ? WHERE id = ?", nowIso(), p.id);
  res.redirect(303, `/oportunidades/${p.request_id}?msg=retirada`);
});

// ====================================================================
// Conversa (empresa e prestador da proposta)
// ====================================================================
function loadProposalFor(req) {
  const p = get(`SELECT p.*, COALESCE(u.empresa,u.nome) AS p_nome FROM proposals p JOIN users u ON u.id = p.prestador_id WHERE p.id = ?`, req.params.id);
  if (!p) return null;
  const r = get('SELECT * FROM requests WHERE id = ?', p.request_id);
  if (req.user.id !== p.prestador_id && req.user.id !== r.empresa_id) return null;
  return { p, r };
}
app.get('/propostas/:id/conversa', auth.requireRole('empresa', 'prestador'), (req, res) => {
  const o = loadProposalFor(req); if (!o) return notFound(req, res);
  const msgs = all('SELECT m.*, COALESCE(u.empresa,u.nome) AS a_nome FROM messages m JOIN users u ON u.id = m.author_id WHERE m.proposal_id = ? ORDER BY m.id', o.p.id);
  const last = msgs.length ? msgs[msgs.length - 1].id : 0;
  run('INSERT INTO reads (user_id, proposal_id, last_id) VALUES (?,?,?) ON CONFLICT(user_id, proposal_id) DO UPDATE SET last_id = excluded.last_id', req.user.id, o.p.id, last);
  const other = req.user.id === o.p.prestador_id ? (get('SELECT empresa, nome FROM users WHERE id = ?', o.r.empresa_id).empresa || 'a empresa') : o.p.p_nome;
  send(res, V.conversa({ user: req.user, ...o, msgs, other, idem: token() }));
});
app.post('/propostas/:id/mensagens', auth.requireRole('empresa', 'prestador'), rateLimit(120, 3600_000), (req, res) => {
  const o = loadProposalFor(req); if (!o) return notFound(req, res);
  const body = clip(req.body.body, 2000);
  if (body.length >= 1 && isIdem(req.body.idem) && !get('SELECT 1 FROM messages WHERE idem_key = ?', req.body.idem)) {
    run('INSERT INTO messages (proposal_id, author_id, body, idem_key, created_at) VALUES (?,?,?,?,?)', o.p.id, req.user.id, body, req.body.idem, nowIso());
  }
  res.redirect(303, `/propostas/${o.p.id}/conversa#fim`);
});

// ====================================================================
// Contrato
// ====================================================================
function buildContract(p, r) {
  const empresa = get('SELECT * FROM users WHERE id = ?', r.empresa_id);
  const prestador = get('SELECT * FROM users WHERE id = ?', p.prestador_id);
  const id = shortCode('CT', 6); const createdAt = nowIso();
  return { id, createdAt, texto: contractText({ id, req: r, prop: p, empresa, prestador, createdAt }) };
}
app.get('/propostas/:id/contrato', auth.requireRole('empresa'), (req, res) => {
  const o = loadProposalFor(req); if (!o || o.r.empresa_id !== req.user.id) return notFound(req, res);
  if (o.r.status !== 'aberto' || o.p.status !== 'enviada') return res.redirect(`/pedidos/${o.r.id}`);
  const { texto } = buildContract(o.p, o.r);
  send(res, V.contratoPreview({ user: req.user, ...o, texto: texto.replace(/Nº CT-\w+/, 'Nº (gerado ao aceitar)') }));
});
app.post('/propostas/:id/aceitar', auth.requireRole('empresa'), (req, res) => {
  const o = loadProposalFor(req); if (!o || o.r.empresa_id !== req.user.id) return notFound(req, res);
  if (!req.body.aceite) return res.redirect(303, `/propostas/${o.p.id}/contrato`);
  let cid = null;
  tx(() => {
    const r = get('SELECT * FROM requests WHERE id = ?', o.r.id); const p = get('SELECT * FROM proposals WHERE id = ?', o.p.id);
    if (r.status !== 'aberto' || p.status !== 'enviada') return;
    const c = buildContract(p, r); cid = c.id;
    run(`INSERT INTO contracts (id, request_id, proposal_id, empresa_id, prestador_id, texto, texto_hash, valor_cents, empresa_aceite_at, empresa_aceite_ip, empresa_aceite_ua, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, c.id, r.id, p.id, r.empresa_id, p.prestador_id, c.texto, sha256(c.texto), p.valor_cents, c.createdAt, req.ip, ua(req), c.createdAt, c.createdAt);
    run("UPDATE requests SET status = 'em_contratacao', updated_at = ? WHERE id = ?", c.createdAt, r.id);
    run("UPDATE proposals SET status = 'aceita', updated_at = ? WHERE id = ?", c.createdAt, p.id);
    logEvent(r.id, nomeDe(req.user), `Proposta ${p.id} aceita; contrato ${c.id} assinado pela contratante.`);
  });
  if (!cid) { const c = get("SELECT id FROM contracts WHERE proposal_id = ? AND status <> 'cancelado'", o.p.id); return res.redirect(303, c ? `/contratos/${c.id}` : `/pedidos/${o.r.id}`); }
  res.redirect(303, `/contratos/${cid}?msg=aceita`);
});

function loadContract(req) {
  const c = get('SELECT c.*, r.titulo FROM contracts c JOIN requests r ON r.id = c.request_id WHERE c.id = ?', req.params.id);
  if (!c || (req.user.id !== c.empresa_id && req.user.id !== c.prestador_id && req.user.role !== 'admin')) return null;
  return c;
}
app.get('/contratos/:id', auth.requireRole(), (req, res) => {
  const c = loadContract(req); if (!c) return notFound(req, res);
  const pick = (id) => get('SELECT id, nome, empresa, email, whatsapp, doc_tipo, documento, cidade, uf FROM users WHERE id = ?', id);
  const review = get('SELECT * FROM reviews WHERE contract_id = ?', c.id);
  const canReview = req.user.id === c.empresa_id && c.status === 'concluido' && !review;
  send(res, V.contrato({ user: req.user, req, c, texto: c.texto, empresa: pick(c.empresa_id), prestador: pick(c.prestador_id), review, canReview }));
});
function contractAction(role, fn) {
  return [auth.requireRole(role), (req, res) => {
    const c = loadContract(req); if (!c || req.user.id !== (role === 'empresa' ? c.empresa_id : c.prestador_id)) return notFound(req, res);
    const msg = tx(() => fn(get('SELECT * FROM contracts WHERE id = ?', c.id), req));
    res.redirect(303, `/contratos/${c.id}${msg ? '?msg=' + msg : ''}`);
  }];
}
app.post('/contratos/:id/assinar', ...contractAction('prestador', (c, req) => {
  if (c.status !== 'aguardando_prestador' || !req.body.aceite) return '';
  const t = nowIso();
  run("UPDATE contracts SET status = 'vigente', prestador_aceite_at = ?, prestador_aceite_ip = ?, prestador_aceite_ua = ?, updated_at = ? WHERE id = ?", t, req.ip, ua(req), t, c.id);
  run("UPDATE requests SET status = 'contratado', updated_at = ? WHERE id = ?", t, c.request_id);
  run("UPDATE proposals SET status = 'recusada', updated_at = ? WHERE request_id = ? AND id <> ? AND status = 'enviada'", t, c.request_id, c.proposal_id);
  logEvent(c.request_id, nomeDe(req.user), `Contrato ${c.id} assinado pela contratada. Em vigor.`);
  return 'assinado';
}));
app.post('/contratos/:id/recusar', ...contractAction('prestador', (c, req) => {
  if (c.status !== 'aguardando_prestador') return '';
  const t = nowIso();
  run("UPDATE contracts SET status = 'cancelado', cancelado_por = ?, cancelado_motivo = 'Recusado pela contratada', updated_at = ? WHERE id = ?", req.user.id, t, c.id);
  run("UPDATE proposals SET status = 'recusada', updated_at = ? WHERE id = ?", t, c.proposal_id);
  run("UPDATE requests SET status = 'aberto', updated_at = ? WHERE id = ?", t, c.request_id);
  logEvent(c.request_id, nomeDe(req.user), `Contrato ${c.id} recusado pela contratada.`);
  return 'recusado';
}));
app.post('/contratos/:id/desistir', ...contractAction('empresa', (c, req) => {
  if (c.status !== 'aguardando_prestador') return '';
  const t = nowIso();
  run("UPDATE contracts SET status = 'cancelado', cancelado_por = ?, cancelado_motivo = 'Desistência da contratante antes da assinatura', updated_at = ? WHERE id = ?", req.user.id, t, c.id);
  run("UPDATE proposals SET status = 'enviada', updated_at = ? WHERE id = ?", t, c.proposal_id);
  run("UPDATE requests SET status = 'aberto', updated_at = ? WHERE id = ?", t, c.request_id);
  logEvent(c.request_id, nomeDe(req.user), `Contrato ${c.id} cancelado pela contratante antes da assinatura.`);
  return 'desistiu';
}));
app.post('/contratos/:id/concluir', ...contractAction('empresa', (c, req) => {
  if (c.status !== 'vigente') return '';
  const t = nowIso();
  run("UPDATE contracts SET status = 'concluido', concluido_at = ?, updated_at = ? WHERE id = ?", t, t, c.id);
  run("UPDATE requests SET status = 'concluido', updated_at = ? WHERE id = ?", t, c.request_id);
  logEvent(c.request_id, nomeDe(req.user), 'Serviço concluído.');
  return 'concluido';
}));
app.post('/contratos/:id/avaliar', ...contractAction('empresa', (c, req) => {
  const nota = parseInt(req.body.nota, 10);
  if (c.status !== 'concluido' || !(nota >= 1 && nota <= 5) || get('SELECT 1 FROM reviews WHERE contract_id = ?', c.id)) return '';
  run('INSERT INTO reviews (contract_id, prestador_id, empresa_id, nota, comentario, created_at) VALUES (?,?,?,?,?,?)', c.id, c.prestador_id, c.empresa_id, nota, clip(req.body.comentario, 1000), nowIso());
  return 'avaliado';
}));

// ====================================================================
// Perfil público do prestador (para usuários logados)
// ====================================================================
app.get('/prestadores/:id', auth.requireRole(), (req, res) => {
  const p = get("SELECT * FROM users WHERE id = ? AND role = 'prestador' AND blocked = 0", req.params.id);
  if (!p) return notFound(req, res);
  const reviews = all('SELECT rv.*, COALESCE(u.empresa,u.nome) AS e_nome FROM reviews rv JOIN users u ON u.id = rv.empresa_id WHERE rv.prestador_id = ? ORDER BY rv.created_at DESC LIMIT 50', p.id);
  const feitos = get("SELECT COUNT(*) AS n FROM contracts WHERE prestador_id = ? AND status = 'concluido'", p.id).n;
  send(res, V.perfilPrestador({ user: req.user, p, rev: ratingOf(p.id), reviews, feitos }));
});

// ====================================================================
// Arquivos privados
// ====================================================================
app.get('/arquivos/:id', auth.requireRole(), (req, res) => {
  const f = get('SELECT * FROM files WHERE id = ?', req.params.id);
  if (!f || f.owner_type !== 'pedido') return notFound(req, res);
  const r = get('SELECT * FROM requests WHERE id = ?', f.owner_id);
  const u = req.user;
  const ok = u.role === 'admin' || u.id === r.empresa_id
    || (u.role === 'prestador' && (r.status === 'aberto' || get('SELECT 1 FROM proposals WHERE request_id = ? AND prestador_id = ?', r.id, u.id)));
  if (!ok) return notFound(req, res);
  sendStored(res, f, { download: req.query.baixar === '1' });
});

// ====================================================================
// Administração
// ====================================================================
app.get('/admin', auth.requireRole('admin'), (req, res) => {
  const counts = {
    empresa: get("SELECT COUNT(*) AS n FROM users WHERE role='empresa'").n, prestador: get("SELECT COUNT(*) AS n FROM users WHERE role='prestador'").n,
    pedidos: get('SELECT COUNT(*) AS n FROM requests').n, contratos: get("SELECT COUNT(*) AS n FROM contracts WHERE status IN ('vigente','concluido')").n,
  };
  const users = all("SELECT id, role, email, nome, empresa, doc_tipo, documento, cidade, uf, blocked, created_at FROM users ORDER BY created_at DESC LIMIT 300");
  const requests = all(`SELECT r.*, COALESCE(u.empresa,u.nome) AS e_nome, (SELECT COUNT(*) FROM proposals p WHERE p.request_id = r.id AND p.status <> 'retirada') AS n_prop
    FROM requests r JOIN users u ON u.id = r.empresa_id ORDER BY r.created_at DESC LIMIT 100`);
  send(res, V.admin({ user: req.user, req, users, requests, counts }));
});
app.post('/admin/usuarios/:id/:acao', auth.requireRole('admin'), (req, res) => {
  const block = req.params.acao === 'bloquear' ? 1 : req.params.acao === 'desbloquear' ? 0 : null;
  if (block === null) return notFound(req, res);
  run("UPDATE users SET blocked = ?, updated_at = ? WHERE id = ? AND role <> 'admin'", block, nowIso(), req.params.id);
  if (block) run('DELETE FROM sessions WHERE user_id = ?', req.params.id);
  res.redirect(303, `/admin?msg=${block ? 'bloqueado' : 'desbloqueado'}`);
});

app.get('/saude', (req, res) => res.json({ ok: true }));
app.use((req, res) => notFound(req, res));
app.use((err, req, res, _next) => {
  console.error(err);
  cleanupTmp(req);
  if (wantsJson(req)) return res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  send(res, V.erro({ user: req.user, titulo: 'Algo deu errado', texto: 'Tente novamente em instantes.' }), 500);
});

const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`Fachada em Vista em http://localhost:${PORT}`));
