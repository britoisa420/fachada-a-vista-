import crypto from 'node:crypto';
import { get, run, all, setSetting } from './db.js';
import { token, sha256, nowIso } from './util.js';

const COOKIE = 'fv_admin';
const TTL_MS = 7 * 24 * 3600 * 1000;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hashHex, 'hex'));
}

/** Cria o primeiro acesso da equipe (ADMIN_EMAIL / ADMIN_PASSWORD ou credenciais de demonstração). */
export function seedAdmin() {
  if (get('SELECT COUNT(*) AS n FROM admins').n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@fachadaemvista.local').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || 'fachada-demo-2026';
  run('INSERT INTO admins (email, name, pass_hash, created_at) VALUES (?,?,?,?)', email, 'Equipe', hashPassword(pw), nowIso());
  if (!process.env.ADMIN_PASSWORD) {
    setSetting('admin_demo_password', '1');
    console.log(`\n[Fachada em Vista] Acesso de demonstração ao painel: ${email} / ${pw}  (troque em Configurações)\n`);
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function startSession(res, req, adminId) {
  const t = token();
  run('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?,?,?,?)', sha256(t), adminId, Date.now() + TTL_MS, nowIso());
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}

export function endSession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) run('DELETE FROM sessions WHERE token_hash = ?', sha256(t));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function currentAdmin(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const s = get('SELECT s.expires_at, a.id, a.email, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?', sha256(t));
  if (!s || s.expires_at < Date.now()) return null;
  return s;
}

/** Protege as rotas do painel: exige login e bloqueia POST vindo de outra origem (CSRF). */
export function requireAdmin(req, res, next) {
  const admin = currentAdmin(req);
  if (!admin) {
    if (req.method === 'GET') return res.redirect(`/painel/login?volta=${encodeURIComponent(req.originalUrl)}`);
    return res.status(401).send('Sessão expirada. Entre novamente.');
  }
  if (req.method !== 'GET') {
    const origin = req.get('origin') || req.get('referer') || '';
    let host = null;
    try { host = origin ? new URL(origin).host : req.get('host'); } catch { host = null; }
    if (host !== req.get('host')) return res.status(403).send('Origem inválida.');
  }
  req.admin = admin;
  next();
}

export function cleanupSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}

export const listAdmins = () => all('SELECT id, email, name, created_at FROM admins ORDER BY id');

// Limite simples de tentativas de login por IP
const attempts = new Map();
export function loginAllowed(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, a);
  return a.length < 10;
}
export const loginFailed = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
