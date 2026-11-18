import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // privado: nunca servido como estático
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'marketplace.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- Contas: empresa (contrata), prestador (presta o serviço) ou admin (modera)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('empresa','prestador','admin')),
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  nome TEXT NOT NULL,                -- responsável
  empresa TEXT,                      -- nome fantasia / razão social
  doc_tipo TEXT,                     -- cnpj | mei | cpf
  documento TEXT,
  whatsapp TEXT,
  cidade TEXT, uf TEXT,
  categorias TEXT NOT NULL DEFAULT '[]',  -- prestador: serviços que oferece
  atende_estado INTEGER NOT NULL DEFAULT 0, -- prestador: atende o estado todo
  bio TEXT, site TEXT,
  logo_file TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Pedidos publicados pelas empresas
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  idem_key TEXT UNIQUE NOT NULL,
  empresa_id INTEGER NOT NULL REFERENCES users(id),
  titulo TEXT NOT NULL,
  categorias TEXT NOT NULL DEFAULT '[]',
  descricao TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'tenho',  -- tenho | vazio | sem_ponto
  cidade TEXT NOT NULL, uf TEXT NOT NULL, bairro TEXT,
  medidas TEXT,
  orcamento TEXT,          -- faixa
  prazo TEXT,              -- quando precisa
  status TEXT NOT NULL DEFAULT 'aberto', -- aberto | em_contratacao | contratado | concluido | cancelado
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, uf);

-- Propostas dos prestadores (uma por prestador e pedido)
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  prestador_id INTEGER NOT NULL REFERENCES users(id),
  valor_cents INTEGER NOT NULL,
  prazo_dias INTEGER NOT NULL,
  inclui TEXT NOT NULL,
  pagamento TEXT NOT NULL,
  garantia TEXT,
  validade_dias INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'enviada', -- enviada | retirada | aceita | recusada
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (request_id, prestador_id)
);

-- Conversa entre empresa e prestador, dentro de cada proposta
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL REFERENCES proposals(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  idem_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reads (
  user_id INTEGER NOT NULL, proposal_id TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, proposal_id)
);

-- Contrato gerado ao aceitar uma proposta (aceite eletrônico das duas partes)
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  proposal_id TEXT UNIQUE NOT NULL REFERENCES proposals(id),
  empresa_id INTEGER NOT NULL REFERENCES users(id),
  prestador_id INTEGER NOT NULL REFERENCES users(id),
  texto TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  valor_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_prestador', -- aguardando_prestador | vigente | concluido | cancelado
  empresa_aceite_at TEXT, empresa_aceite_ip TEXT, empresa_aceite_ua TEXT,
  prestador_aceite_at TEXT, prestador_aceite_ip TEXT, prestador_aceite_ua TEXT,
  cancelado_por INTEGER, cancelado_motivo TEXT,
  concluido_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_active ON contracts(request_id) WHERE status <> 'cancelado';

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id TEXT UNIQUE NOT NULL REFERENCES contracts(id),
  prestador_id INTEGER NOT NULL REFERENCES users(id),
  empresa_id INTEGER NOT NULL REFERENCES users(id),
  nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario TEXT,
  created_at TEXT NOT NULL
);

-- Arquivos privados (fotos do pedido, simulação, logo do prestador)
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL, owner_id TEXT NOT NULL,
  role TEXT NOT NULL,
  stored_name TEXT NOT NULL, original_name TEXT,
  mime TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER, height INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_type, owner_id);

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
/** Transação síncrona (BEGIN IMMEDIATE): operações repetidas não duplicam dados. */
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
export const DEFAULT_SETTINGS = { brand_name: 'Fachada em Vista', brand_color: '#C4431B', public_url: '' };
let cache = null;
export function getSettings() {
  if (!cache) {
    const s = { ...DEFAULT_SETTINGS };
    for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
    cache = s;
  }
  return cache;
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value ?? ''));
  cache = null;
}
