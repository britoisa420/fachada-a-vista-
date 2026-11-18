import { html, raw, sanitizeColor, contrastText, formatBRL } from '../util.js';
import { getSettings } from '../db.js';

export const STATUS = {
  aguardando_pagamento: 'Aguardando pagamento',
  em_producao: 'Em produção',
  entregue: 'Entregue',
  ajuste_solicitado: 'Ajuste solicitado',
  concluido: 'Concluído',
  pago: 'Pago',
};
export const CHANGE_TYPES = {
  placa: 'Troca de placa',
  letreiro: 'Letreiro iluminado',
  pintura: 'Pintura',
  revestimento: 'Revestimento',
  outra: 'Outra alteração',
};
export const PRESERVE = { portas: 'Portas', vitrines: 'Vitrines', janelas: 'Janelas' };

export const statusBadge = (s) => html`<span class="badge badge-${s}">${STATUS[s] || s}</span>`;

export const DISCLAIMER = 'Simulação visual. Confira medidas, materiais e instalação com a empresa responsável pela produção.';

export function brandMark({ name, logoUrl, appName, href = '/' }) {
  return html`<a class="brand" href="${href}">
    ${logoUrl ? html`<img src="${logoUrl}" alt="${name}" class="brand-logo">` : html`<span class="brand-glyph" aria-hidden="true">Δ</span><span class="brand-name">${name}</span>`}
    ${appName ? html`<span class="brand-app">${appName}</span>` : ''}
  </a>`;
}

/**
 * Página completa. `brand` permite exibir outra marca (entregas do pacote com a marca do parceiro).
 */
export function layout({ title, body, noindex = false, brand = null, header = null, bodyClass = '', description = '' }) {
  const s = getSettings();
  const color = sanitizeColor(brand?.color || s.brand_color);
  const on = contrastText(color);
  const b = brand || { name: s.brand_name, logoUrl: s.brand_logo_file ? '/marca/logo' : null, appName: s.app_name };
  const fullTitle = title ? `${title} | ${s.app_name} · ${s.brand_name}` : `${s.app_name} | ${s.brand_name} — Simulador de fachadas`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${html`${fullTitle}`}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="theme-color" content="#f4f3f1">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${color}'/><text x='16' y='23' font-size='20' text-anchor='middle' fill='${on}' font-family='Arial' font-weight='700'>Δ</text></svg>`)}">
<link rel="stylesheet" href="/static/app.css?v=3">
<style>:root{--brand:${color};--on-brand:${on};}</style>
<script src="/static/app.js?v=3" defer></script>
</head>
<body class="${html`${bodyClass}`}">
<header class="topbar"><div class="wrap topbar-in">
  ${brandMark(b)}
  ${header ?? ''}
</div></header>
${body}
</body>
</html>`;
}

/** Comparação antes/depois: arraste (mouse/toque) ou use as setas do teclado. */
export function compare({ before, after, width, height, label = 'Comparação antes e depois', tag = null, beforeLabel = 'Antes', afterLabel = 'Depois' }) {
  const ratio = width && height ? `${width} / ${height}` : '3 / 2';
  return html`<figure class="compare" style="aspect-ratio:${ratio}" data-compare>
    <img class="compare-img" src="${after}" alt="${afterLabel}" loading="lazy" draggable="false">
    <div class="compare-before"><img class="compare-img" src="${before}" alt="${beforeLabel}" loading="lazy" draggable="false"></div>
    <span class="compare-label compare-label-l" aria-hidden="true">${beforeLabel}</span>
    <span class="compare-label compare-label-r" aria-hidden="true">${afterLabel}</span>
    ${tag ? html`<span class="compare-tag">${tag}</span>` : ''}
    <div class="compare-handle" aria-hidden="true"><span class="compare-knob">
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span></div>
    <input class="compare-range" type="range" min="0" max="100" value="50" step="1" aria-label="${label}" aria-valuetext="50% antes, 50% depois">
  </figure>`;
}

export function includesList(kind) {
  const s = getSettings();
  if (kind === 'pacote') {
    return {
      title: 'Pacote para empresas de comunicação visual',
      price: formatBRL(s.price_package),
      items: [
        'Cinco simulações de fachada',
        'Solicite uma de cada vez, quando precisar',
        'Duas propostas aplicadas à foto em cada simulação',
        'Apresentação com a marca da sua empresa',
        'Saldo de créditos sempre visível',
      ],
    };
  }
  return {
    title: 'Simulação avulsa',
    price: formatBRL(s.price_single),
    items: [
      'Duas propostas aplicadas à foto da mesma fachada',
      'Comparação de antes e depois em cada proposta',
      'Direito a um ajuste na opção escolhida',
      'Link privado para compartilhar pelo WhatsApp',
      'Imagens para baixar',
    ],
  };
}

export const check = raw('<svg class="ico-check" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');

export function alert(type, msg) {
  if (!msg) return '';
  return html`<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">${msg}</div>`;
}

/** Mensagens curtas passadas por ?msg= após redirecionamentos. */
export const MESSAGES = {
  pago: ['success', 'Pagamento registrado. O pedido entrou em produção.'],
  pago_ja: ['info', 'Este pagamento já estava registrado. Nada foi duplicado.'],
  proposta: ['success', 'Imagem da proposta enviada. Ela só aparece para o cliente depois de publicar.'],
  proposta_dup: ['info', 'Este envio já tinha sido recebido.'],
  proposta_removida: ['success', 'Proposta removida.'],
  publicado: ['success', 'Entrega publicada. Copie o link ou abra o WhatsApp para avisar o cliente.'],
  revisao: ['success', 'Versão revisada publicada no link de entrega.'],
  revogado: ['success', 'Link revogado. Quem tinha o endereço antigo não consegue mais acessar.'],
  novo_link: ['success', 'Novo link de entrega gerado.'],
  concluido: ['success', 'Pedido marcado como concluído.'],
  reaberto: ['success', 'Pedido reaberto.'],
  config: ['success', 'Configurações salvas.'],
  senha: ['success', 'Senha alterada.'],
  membro: ['success', 'Acesso criado para o novo membro da equipe.'],
  favorita: ['success', 'Proposta favorita registrada.'],
  ajuste: ['success', 'Pedido de ajuste enviado. Você vai receber a versão revisada neste mesmo link.'],
  aprovado: ['success', 'Obrigado! Pedido concluído. As imagens continuam disponíveis para download.'],
  briefing: ['success', 'Briefing enviado. 1 crédito foi descontado do saldo.'],
  briefing_dup: ['info', 'Este briefing já tinha sido recebido. Nenhum crédito extra foi descontado.'],
};
export function flash(req) {
  const m = MESSAGES[req.query.msg];
  const err = typeof req.query.erro === 'string' ? req.query.erro.slice(0, 300) : '';
  return [m ? alert(m[0], m[1]) : '', err ? alert('error', err) : ''];
}
