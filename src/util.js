import crypto from 'node:crypto';

// ---------- HTML seguro (escapa tudo, exceto o que vier marcado como raw) ----------
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(String(v));
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// ---------- Identificadores e tokens ----------
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function shortCode(prefix, len = 6) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return `${prefix}-${s}`;
}
/** Token de 192 bits, seguro para URLs, praticamente impossível de adivinhar. */
export const token = () => crypto.randomBytes(24).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomId = () => crypto.randomBytes(12).toString('hex');

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ---------- Formatação ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (cents) => brl.format((cents || 0) / 100).replace(/ /g, ' ');

const dtf = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
export const formatDate = (iso) => (iso ? dtf.format(new Date(iso)) : '');
export const nowIso = () => new Date().toISOString();

export function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}
/** Normaliza para o formato do wa.me (DDI 55 quando o número for brasileiro sem DDI). */
export function waNumber(s) {
  let d = onlyDigits(s);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
export function waLink(phone, text) {
  const n = waNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
export function formatPhone(s) {
  const d = onlyDigits(s).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '';
}

export function sanitizeColor(c, fallback = '#C4431B') {
  return /^#[0-9a-fA-F]{6}$/.test(String(c || '').trim()) ? String(c).trim() : fallback;
}
/** Cor de texto (preto/branco) com melhor contraste sobre a cor da marca. */
export function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

export class UserError extends Error {
  constructor(message, status = 400, fields = null) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const isIdem = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(s);
export const clip = (s, n) => String(s ?? '').trim().slice(0, n);
