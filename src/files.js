import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';
import { UPLOAD_DIR, run, get } from './db.js';
import { UserError, randomId, nowIso } from './util.js';

const MB = 1024 * 1024;

/** Regras de validação por tipo de anexo. */
export const RULES = {
  foto: { label: 'Foto do local', maxBytes: 15 * MB, types: ['jpg', 'png', 'webp'], minSide: 480 },
  referencia: { label: 'Imagem de referência', maxBytes: 10 * MB, types: ['jpg', 'png', 'webp'] },
  logo: { label: 'Logo', maxBytes: 10 * MB, types: ['jpg', 'png', 'webp', 'svg', 'pdf'] },
  simulacao: { label: 'Simulação', maxBytes: 10 * MB, types: ['jpg', 'png', 'webp'] },
  perfil: { label: 'Logo da empresa', maxBytes: 5 * MB, types: ['jpg', 'png', 'webp'] },
  portfolio: { label: 'Foto de trabalho', maxBytes: 10 * MB, types: ['jpg', 'png', 'webp'] },
};

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' };

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  const head = buf.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if ((head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) && head.includes('<svg')) return 'svg';
  if (head.includes('ftypheic') || buf.toString('ascii', 4, 12).startsWith('ftyphei')) return 'heic';
  return null;
}

const typeNames = (types) => types.map((t) => t.toUpperCase()).join(', ');

/** Verifica o conteúdo real do arquivo (não confia na extensão nem no Content-Type enviado). */
export function inspect(file, role) {
  const rule = RULES[role];
  if (!file) throw new UserError(`${rule.label}: arquivo ausente.`);
  if (file.size === 0) throw new UserError(`${rule.label}: o arquivo está vazio.`);
  if (file.size > rule.maxBytes) {
    throw new UserError(`${rule.label}: o arquivo tem ${(file.size / MB).toFixed(1)} MB. O limite é ${rule.maxBytes / MB} MB.`);
  }
  const buf = fs.readFileSync(file.path);
  const type = sniff(buf);
  if (type === 'heic') {
    throw new UserError(`${rule.label}: fotos HEIC não são aceitas. No iPhone, envie como JPG (Ajustes › Câmera › Formatos › Mais compatível) ou faça uma captura de tela.`);
  }
  if (!type || !rule.types.includes(type)) {
    throw new UserError(`${rule.label}: formato não aceito. Envie ${typeNames(rule.types)}.`);
  }
  let width = null;
  let height = null;
  if (['jpg', 'png', 'webp'].includes(type)) {
    try {
      const d = imageSize(buf);
      width = d.width;
      height = d.height;
      if (d.orientation && d.orientation >= 5) [width, height] = [height, width];
    } catch {
      throw new UserError(`${rule.label}: não foi possível ler a imagem. O arquivo pode estar corrompido.`);
    }
    if (rule.minSide && Math.min(width, height) < rule.minSide) {
      throw new UserError(`${rule.label}: a imagem tem ${width}×${height} px e ficou pequena demais. Envie uma foto com pelo menos ${rule.minSide} px no menor lado.`);
    }
  }
  return { type, mime: MIME[type], width, height };
}

/** Move o arquivo temporário para o armazenamento privado e registra no banco. */
export function store(file, info, { ownerType, ownerId, role }) {
  const id = randomId();
  const stored = `${id}.${info.type}`;
  fs.renameSync(file.path, path.join(UPLOAD_DIR, stored));
  const original = Buffer.from(file.originalname || 'arquivo', 'latin1').toString('utf8').slice(0, 160);
  run(
    `INSERT INTO files (id, owner_type, owner_id, role, stored_name, original_name, mime, size, width, height, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, ownerType, ownerId, role, stored, original, info.mime, file.size, info.width, info.height, nowIso(),
  );
  return id;
}

export function removeFile(id) {
  const f = get('SELECT * FROM files WHERE id = ?', id);
  if (!f) return;
  run('DELETE FROM files WHERE id = ?', id);
  fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
}

/** Remove temporários de um upload que não foi aproveitado. */
export function cleanupTmp(req) {
  const list = [];
  if (req.file) list.push(req.file);
  if (Array.isArray(req.files)) list.push(...req.files);
  else if (req.files) for (const arr of Object.values(req.files)) list.push(...arr);
  for (const f of list) if (f?.path && fs.existsSync(f.path)) fs.rm(f.path, { force: true }, () => {});
}

/** Envia um arquivo privado com cabeçalhos seguros. */
export function sendStored(res, f, { download = false, noCache = false } = {}) {
  const p = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(p)) return res.status(404).send('Arquivo não encontrado');
  const ext = f.stored_name.split('.').pop();
  const base = (f.original_name || 'arquivo').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'arquivo';
  res.set({
    'Content-Type': f.mime,
    'Cache-Control': noCache ? 'private, no-cache' : 'private, max-age=3600',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Content-Disposition': `${download || ext === 'pdf' ? 'attachment' : 'inline'}; filename="${base}.${ext}"`,
  });
  fs.createReadStream(p).pipe(res);
}
