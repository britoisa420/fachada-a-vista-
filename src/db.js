import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // privado: nunca servido como estático
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  idem_key TEXT UNIQUE NOT NULL,
  access_token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL, whatsapp TEXT NOT NULL,
  brand_color TEXT,
  credits_total INTEGER NOT NULL DEFAULT 5,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  checkout_url TEXT, checkout_provider TEXT,
  paid_at TEXT, payment_method TEXT, payment_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                       -- avulso | pacote
  package_id TEXT REFERENCES packages(id),
  idem_key TEXT UNIQUE NOT NULL,
  access_token TEXT UNIQUE NOT NULL,
  delivery_token TEXT UNIQUE,
  delivery_revoked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  name TEXT, store_name TEXT NOT NULL, email TEXT, whatsapp TEXT,
  change_types TEXT NOT NULL DEFAULT '[]', change_other TEXT,
  colors TEXT, description TEXT,
  preserve TEXT NOT NULL DEFAULT '[]', preserve_other TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  checkout_url TEXT, checkout_provider TEXT,
  paid_at TEXT, payment_method TEXT, payment_note TEXT,
  chosen_slot TEXT,
  adjustment_used INTEGER NOT NULL DEFAULT 0,
  delivered_at TEXT, concluded_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_package ON orders(package_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,   -- order | package | settings
  owner_id TEXT NOT NULL,
  role TEXT NOT NULL,         -- fachada | logo | referencia | proposta | marca
  stored_name TEXT NOT NULL,
  original_name TEXT, mime TEXT NOT NULL, size INTEGER, width INTEGER, height INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  slot TEXT NOT NULL,         -- A | B | C
  version INTEGER NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  title TEXT, note TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  idem_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),   -- um ajuste por pedido
  slot TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',                  -- aberto | atendido
  created_at TEXT NOT NULL, resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  provider TEXT NOT NULL, provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL, amount_cents INTEGER, method TEXT, note TEXT, actor TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_payment_id)
);

CREATE TABLE IF NOT EXISTS checkouts (
  id TEXT PRIMARY KEY,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  provider TEXT NOT NULL, url TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_id TEXT NOT NULL, actor TEXT, message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ref ON events(ref_id);
`);

const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
export const get = (sql, ...p) => db.prepare(sql).get(...norm(p));
export const all = (sql, ...p) => db.prepare(sql).all(...norm(p));
export const run = (sql, ...p) => db.prepare(sql).run(...norm(p));

let depth = 0;
/** Transação síncrona (BEGIN IMMEDIATE) — garante que operações repetidas não dupliquem dados. */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function logEvent(refId, actor, message) {
  run('INSERT INTO events (ref_id, actor, message, created_at) VALUES (?,?,?,?)', refId, actor, message, new Date().toISOString());
}

// ---------- Configurações ----------
export const DEFAULT_SETTINGS = {
  brand_name: 'Delta',
  app_name: 'Fachada em Vista',
  brand_color: '#C4431B',
  brand_logo_file: '',
  payment_provider: 'demo', // demo | link | mercadopago
  payment_link_single: '',
  payment_link_package: '',
  price_single_cents: '9900',
  price_package_cents: '34900',
  delta_whatsapp: '',
  public_url: '',
};
let cache = null;
export function getSettings() {
  if (!cache) {
    const s = { ...DEFAULT_SETTINGS };
    for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
    if (process.env.PAYMENT_PROVIDER) s.payment_provider = process.env.PAYMENT_PROVIDER;
    s.price_single = parseInt(s.price_single_cents, 10) || 9900;
    s.price_package = parseInt(s.price_package_cents, 10) || 34900;
    cache = s;
  }
  return cache;
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value ?? ''));
  cache = null;
}
