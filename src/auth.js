import crypto from 'node:crypto';
import { get, run } from './db.js';
import { token, sha256, nowIso } from './util.js';

const COOKIE = 'fv_sess';
const TTL_MS = 30 * 24 * 3600 * 1000;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hashHex, 'hex'));
}

/** Cria o acesso de administrador (ADMIN_EMAIL / ADMIN_PASSWORD ou credenciais de demonstração). */
export function seedAdmin() {
  if (get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@fachadaemvista.local').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || 'fachada-demo-2026';
  const t = nowIso();
  run("INSERT INTO users (role, email, pass_hash, nome, empresa, created_at, updated_at) VALUES ('admin',?,?,?,?,?,?)", email, hashPassword(pw), 'Administração', 'Fachada em Vista', t, t);
  if (!process.env.ADMIN_PASSWORD) console.log(`\n[Fachada em Vista] Acesso de administrador (demonstração): ${email} / ${pw}\n`);
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function startSession(res, req, userId) {
  const t = token();
  run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)', sha256(t), userId, Date.now() + TTL_MS, nowIso());
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}
export function endSession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token_hash = ?', sha256(t));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function currentUser(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const u = get('SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', sha256(t));
  if (!u || u.expires_at < Date.now() || u.blocked) return null;
  delete u.pass_hash;
  return u;
}

/** Carrega o usuário em req.user e barra POST vindo de outra origem (CSRF). */
export function loadUser(req, res, next) {
  req.user = currentUser(req);
  res.locals.user = req.user;
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.path.startsWith('/webhooks/')) {
    const origin = req.get('origin') || req.get('referer') || '';
    let host = null;
    try { host = origin ? new URL(origin).host : req.get('host'); } catch { host = null; }
    if (host !== req.get('host')) return res.status(403).send('Origem inválida.');
  }
  next();
}

/** Exige login (e, opcionalmente, um papel). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.method === 'GET') return res.redirect(`/entrar?volta=${encodeURIComponent(req.originalUrl)}`);
      return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
    }
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).type('html').send('Esta página é para outro tipo de conta.');
    next();
  };
}

export function cleanupSessions() { run('DELETE FROM sessions WHERE expires_at < ?', Date.now()); }

// Limite de tentativas de login por IP
const attempts = new Map();
export function loginAllowed(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, a);
  return a.length < 10;
}
export const loginFailed = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
