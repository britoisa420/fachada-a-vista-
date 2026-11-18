import { html, raw, sanitizeColor, contrastText } from '../util.js';
import { getSettings, get } from '../db.js';

const GLYPH = raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v1.5a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0V9M5 13v7h14v-7M10 20v-4h4v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>');

/** Contadores para a navegação (mensagens não lidas e itens que pedem ação). */
function navCounts(u) {
  if (u.role === 'empresa') {
    return {
      msgs: get(`SELECT COUNT(*) AS n FROM messages m JOIN proposals p ON p.id = m.proposal_id JOIN requests r ON r.id = p.request_id
        LEFT JOIN reads rd ON rd.user_id = ? AND rd.proposal_id = p.id
        WHERE r.empresa_id = ? AND m.author_id <> ? AND m.id > COALESCE(rd.last_id, 0)`, u.id, u.id, u.id).n,
    };
  }
  if (u.role === 'prestador') {
    return {
      msgs: get(`SELECT COUNT(*) AS n FROM messages m JOIN proposals p ON p.id = m.proposal_id
        LEFT JOIN reads rd ON rd.user_id = ? AND rd.proposal_id = p.id
        WHERE p.prestador_id = ? AND m.author_id <> ? AND m.id > COALESCE(rd.last_id, 0)`, u.id, u.id, u.id).n,
      assinar: get("SELECT COUNT(*) AS n FROM contracts WHERE prestador_id = ? AND status = 'aguardando_prestador'", u.id).n,
    };
  }
  return {};
}
const dot = (n) => (n ? html` <span class="count" aria-label="${n} novos">${n}</span>` : '');

function nav(u, active) {
  const cur = (k) => (active === k ? raw(' aria-current="page"') : '');
  if (!u) {
    return html`<nav class="nav" aria-label="Menu">
      <a href="/criar"${cur('criar')}>Simular fachada</a>
      <a href="/para-prestadores"${cur('prest')}>Sou prestador</a>
      <a href="/entrar"${cur('entrar')}>Entrar</a>
      <a class="btn btn-sm btn-primary" href="/cadastro?tipo=empresa">Cadastrar</a>
    </nav>`;
  }
  const c = navCounts(u);
  const out = html`<form method="post" action="/sair" class="inline"><button class="linklike">Sair</button></form>`;
  if (u.role === 'empresa') {
    return html`<nav class="nav" aria-label="Menu">
      <a href="/painel"${cur('painel')}>Meus pedidos${dot(c.msgs)}</a>
      <a href="/pedidos/novo"${cur('novo')}>Novo pedido</a>
      <a href="/criar"${cur('criar')}>Simular</a>
      <a href="/conta"${cur('conta')}>Conta</a>${out}
    </nav>`;
  }
  if (u.role === 'prestador') {
    return html`<nav class="nav" aria-label="Menu">
      <a href="/oportunidades"${cur('oport')}>Oportunidades</a>
      <a href="/painel"${cur('painel')}>Minhas propostas${dot(c.msgs + c.assinar)}</a>
      <a href="/conta"${cur('conta')}>Perfil</a>${out}
    </nav>`;
  }
  return html`<nav class="nav" aria-label="Menu"><a href="/admin"${cur('admin')}>Administração</a>${out}</nav>`;
}

export function layout({ title, body, user = null, active = '', noindex = true, description = '' }) {
  const s = getSettings();
  const color = sanitizeColor(s.brand_color);
  const on = contrastText(color);
  const fullTitle = title ? `${title} | ${s.brand_name}` : `${s.brand_name}: fachada e comunicação visual para o seu negócio`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${html`${fullTitle}`}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="theme-color" content="#f4f3f1">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${color}'/><g transform='translate(4 4)' fill='none' stroke='${on}' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M3 9l1.5-5h15L21 9M3 9h18M5 13v7h14v-7M10 20v-4h4v4'/></g></svg>`)}">
<link rel="stylesheet" href="/static/app.css?v=10">
<style>:root{--brand:${color};--on-brand:${on};}</style>
<script src="/static/app.js?v=10" defer></script>
</head>
<body>
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="topbar"><div class="wrap topbar-in">
  <a class="brand" href="${user ? (user.role === 'admin' ? '/admin' : '/painel') : '/'}"><span class="brand-glyph">${GLYPH}</span><span class="brand-name">${html`${s.brand_name}`}</span></a>
  ${nav(user, active)}
</div></header>
<div id="conteudo">${body}</div>
<footer class="footer"><div class="wrap small muted">
  <p><strong>${html`${s.brand_name}`}</strong> aproxima empresas e prestadores de comunicação visual. A plataforma não é parte dos contratos, não recebe pagamentos e não executa serviços.</p>
  <p><a href="/termos">Termos de uso</a> · <a href="/privacidade">Privacidade</a> · <a href="/criar">Simulador de fachada</a></p>
</div></footer>
</body>
</html>`;
}

export const page = (inner, cls = 'narrow') => html`<main class="wrap ${cls} page">${inner}</main>`;

export function alert(type, msg) {
  if (!msg) return '';
  return html`<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${msg}</div>`;
}
export const badge = (key, label) => html`<span class="badge badge-${key}">${label}</span>`;

export const MESSAGES = {
  bemvindo: ['success', 'Conta criada. Bem-vindo(a)!'],
  pedido: ['success', 'Pedido publicado! Os prestadores da sua região já podem enviar propostas.'],
  pedido_editado: ['success', 'Pedido atualizado.'],
  cancelado: ['success', 'Pedido cancelado. Os prestadores não podem mais enviar propostas.'],
  proposta: ['success', 'Proposta enviada. A empresa vai ser avisada no painel dela.'],
  proposta_editada: ['success', 'Proposta atualizada.'],
  retirada: ['success', 'Proposta retirada.'],
  msg: ['success', 'Mensagem enviada.'],
  aceita: ['success', 'Proposta aceita e contrato assinado por você. Agora falta o prestador assinar.'],
  assinado: ['success', 'Contrato assinado pelas duas partes. Ele já está em vigor.'],
  recusado: ['info', 'Você recusou o contrato. O pedido voltou a receber propostas.'],
  desistiu: ['info', 'Contrato cancelado. O pedido voltou a receber propostas.'],
  concluido: ['success', 'Serviço marcado como concluído. Que tal avaliar o prestador?'],
  avaliado: ['success', 'Obrigado pela avaliação!'],
  conta: ['success', 'Dados salvos.'],
  senha: ['success', 'Senha alterada.'],
  bloqueado: ['success', 'Conta bloqueada.'],
  desbloqueado: ['success', 'Conta desbloqueada.'],
};
export function flash(req) {
  const m = MESSAGES[req.query.msg];
  return m ? alert(m[0], m[1]) : '';
}

export function stars(avg, n) {
  if (!n) return html`<span class="muted small">Sem avaliações ainda</span>`;
  const full = Math.round(avg);
  return html`<span class="stars" aria-label="Nota ${avg.toFixed(1)} de 5, ${n} avaliações">${'★'.repeat(full)}<span class="stars-off">${'★'.repeat(5 - full)}</span> <span class="small muted">${avg.toFixed(1).replace('.', ',')} (${n})</span></span>`;
}

/** Campo de anexo com prévia (o comportamento fica em /static/app.js). */
export function fileSlot({ name, label, hint, required = false, accept = 'image/jpeg,image/png,image/webp', maxMb = 10, multiple = 0 }) {
  return html`<div class="file-slot" data-file-slot data-name="${name}" data-multiple="${multiple || 1}" data-max-mb="${maxMb}">
    <div class="file-head"><span class="label">${label}${required ? html`<span class="req">obrigatório</span>` : html`<span class="opt">opcional</span>`}</span>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>
    <div class="file-previews" data-previews></div>
    <label class="file-pick"><input type="file" name="${name}" accept="${accept}" ${multiple ? raw('multiple') : ''} ${required ? raw('required') : ''} data-input><span class="file-pick-btn"><span data-pick-text>${multiple ? 'Adicionar imagens' : 'Escolher arquivo'}</span></span></label>
    <p class="field-error" data-error hidden></p>
  </div>`;
}

export function field({ name, label, value = '', type = 'text', required = true, hint = '', attrs = '', error = '' }) {
  return html`<label class="field ${error ? 'has-error' : ''}"><span class="label">${label}${required ? '' : html`<span class="opt">opcional</span>`}</span>
    ${type === 'textarea'
      ? html`<textarea name="${name}" ${required ? raw('required') : ''} ${raw(attrs)}>${value}</textarea>`
      : html`<input type="${type}" name="${name}" value="${value}" ${required ? raw('required') : ''} ${raw(attrs)}>`}
    ${hint ? html`<span class="hint">${hint}</span>` : ''}${error ? html`<p class="field-error">${error}</p>` : ''}</label>`;
}
export function select({ name, label, options, value = '', required = true, placeholder = 'Selecione', error = '' }) {
  const opts = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  return html`<label class="field ${error ? 'has-error' : ''}"><span class="label">${label}${required ? '' : html`<span class="opt">opcional</span>`}</span>
    <select name="${name}" ${required ? raw('required') : ''}><option value="">${placeholder}</option>${opts.map(([k, v]) => html`<option value="${k}" ${k === value ? raw('selected') : ''}>${v}</option>`)}</select>
    ${error ? html`<p class="field-error">${error}</p>` : ''}</label>`;
}
export function chips({ name, options, values = [], group = '', error = '' }) {
  return html`<div class="chips" ${group ? raw(`data-required-group="${group}"`) : ''}>${Object.entries(options).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="${name}" value="${k}" ${values.includes(k) ? raw('checked') : ''}><span>${v}</span></label>`)}</div>
    <p class="field-error" data-error-for="${group || name}" ${error ? '' : raw('hidden')}>${error}</p>`;
}
