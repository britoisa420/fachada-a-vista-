import { html, formatBRL, formatDate, formatPhone, waLink } from '../util.js';
import { getSettings } from '../db.js';
import { layout, statusBadge, STATUS, CHANGE_TYPES, PRESERVE, flash, alert } from './common.js';
import { providerName } from '../payments.js';

function adminHeader(admin) {
  return html`<nav class="admin-nav" aria-label="Painel">
    <a href="/painel">Pedidos</a><a href="/painel/pacotes">Pacotes</a><a href="/painel/config">Configurações</a>
    <form method="post" action="/painel/sair"><button class="linklike" title="${admin.email}">Sair</button></form>
  </nav>`;
}
const adminLayout = (admin, title, body) =>
  layout({ title, body, noindex: true, header: adminHeader(admin), bodyClass: 'admin' });

function demoBanner() {
  const s = getSettings();
  const items = [];
  if (s.payment_provider === 'demo') items.push('pagamentos em modo demonstração');
  if (s.admin_demo_password === '1') items.push('senha padrão do painel');
  if (!items.length) return '';
  return html`<div class="alert alert-warn"><strong>Atenção:</strong> ${items.join(' e ')}. <a href="/painel/config">Ajustar em Configurações</a>.</div>`;
}

export function loginPage({ error, volta }) {
  const body = html`<main class="wrap narrow form-page">
    <div class="card">
      <h1>Painel da equipe</h1>
      ${error ? alert('error', error) : ''}
      <form method="post" action="/painel/login" class="stack">
        <input type="hidden" name="volta" value="${volta || ''}">
        <label class="field"><span class="label">E-mail</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span class="label">Senha</span><input name="senha" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary btn-lg btn-block">Entrar</button>
      </form>
    </div>
  </main>`;
  return layout({ title: 'Entrar', body, noindex: true });
}

export function ordersPage({ admin, orders, counts, status, q, req }) {
  const filters = [['', 'Todos'], ...['aguardando_pagamento', 'em_producao', 'entregue', 'ajuste_solicitado', 'concluido'].map((k) => [k, STATUS[k]])];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const body = html`<main class="wrap admin-main">
    ${demoBanner()}${flash(req)}
    <h1>Pedidos</h1>
    <form class="search" method="get" action="/painel">
      ${status ? html`<input type="hidden" name="status" value="${status}">` : ''}
      <input name="q" value="${q || ''}" placeholder="Buscar por código, loja, nome ou e-mail" aria-label="Buscar pedidos">
      <button class="btn btn-outline">Buscar</button>
    </form>
    <nav class="filters" aria-label="Filtrar por status">
      ${filters.map(([k, l]) => html`<a class="filter ${status === k ? 'active' : ''}" href="/painel${k ? `?status=${k}` : ''}" ${status === k ? 'aria-current="page"' : ''}>${l} <span>${k ? counts[k] || 0 : total}</span></a>`)}
    </nav>
    ${orders.length ? html`<ul class="order-list">${orders.map((o) => html`<li><a class="order-row" href="/painel/pedido/${o.id}">
      ${o.thumb ? html`<img src="/painel/arquivo/${o.thumb}" alt="" loading="lazy">` : html`<span class="thumb-empty"></span>`}
      <div class="order-row-main">
        <strong>${o.store_name}</strong>
        <span class="muted small">${o.id} · ${o.kind === 'pacote' ? `Pacote ${o.package_id}${o.company ? ` · ${o.company}` : ''}` : 'Avulso'} · ${formatDate(o.created_at)}</span>
        <span class="small">${o.name || ''}</span>
      </div>
      ${statusBadge(o.status)}
    </a></li>`)}</ul>` : html`<p class="muted">Nenhum pedido encontrado.</p>`}
  </main>`;
  return adminLayout(admin, 'Pedidos', body);
}

function fileThumb(f) {
  const isImg = f.mime.startsWith('image/') && f.mime !== 'image/svg+xml';
  return html`<figure class="file-card">
    ${isImg ? html`<a href="/painel/arquivo/${f.id}" target="_blank" rel="noopener"><img src="/painel/arquivo/${f.id}" alt="${f.original_name}" loading="lazy"></a>` : html`<div class="file-icon">${f.mime.split('/')[1].toUpperCase().replace('SVG+XML', 'SVG')}</div>`}
    <figcaption><span class="small">${({ fachada: 'Fachada', logo: 'Logo', referencia: 'Referência' })[f.role] || f.role}${f.width ? ` · ${f.width}×${f.height}` : ''}</span>
    <a class="btn btn-sm btn-outline" href="/painel/arquivo/${f.id}?dl=1">Baixar</a></figcaption>
  </figure>`;
}

export function orderDetailPage({ admin, order, pkg, files, proposals, adjustment, events, deliveryUrl, orderUrl, req, idem, waMessage, contactPhone }) {
  const types = JSON.parse(order.change_types || '[]');
  const pres = JSON.parse(order.preserve || '[]');
  const bySlot = {};
  for (const p of proposals) (bySlot[p.slot] ||= []).push(p);
  const unpublished = proposals.filter((p) => !p.published);
  const canPublish = unpublished.length > 0 && ['em_producao', 'ajuste_solicitado', 'entregue', 'concluido'].includes(order.status);
  const revisionNeeded = order.status === 'ajuste_solicitado';
  const revisionReady = revisionNeeded && unpublished.some((p) => p.slot === order.chosen_slot);
  const linkActive = order.delivery_token && !order.delivery_revoked;

  const body = html`<main class="wrap admin-main">
    <a class="back" href="/painel">← Pedidos</a>
    ${flash(req)}
    <div class="detail-head">
      <div>
        <p class="eyebrow">${order.id} · ${order.kind === 'pacote' ? html`Pacote <a href="/painel/pacote/${order.package_id}">${order.package_id}</a> · ${pkg?.company}` : 'Avulso'}</p>
        <h1>${order.store_name}</h1>
        <p>${statusBadge(order.status)} <span class="muted small">Criado em ${formatDate(order.created_at)}</span></p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        ${order.status === 'aguardando_pagamento' ? html`<section class="card">
          <h2 class="h3">Pagamento</h2>
          <p>Aguardando confirmação de ${formatBRL(order.price_cents)}. ${order.checkout_url ? 'Checkout aberto pelo cliente.' : 'O cliente ainda não abriu o checkout.'}</p>
          <form method="post" action="/painel/pedido/${order.id}/pagamento" class="stack" data-once>
            <div class="grid2">
              <label class="field"><span class="label">Forma</span><select name="forma"><option>Pix</option><option>Cartão</option><option>Transferência</option><option>Outro</option></select></label>
              <label class="field"><span class="label">Observação</span><input name="obs" maxlength="200" placeholder="Ex.: comprovante recebido no WhatsApp"></label>
            </div>
            <label class="consent"><input type="checkbox" name="confirmo" value="1" required><span>Conferi o recebimento de ${formatBRL(order.price_cents)}.</span></label>
            <button class="btn btn-primary">Registrar pagamento manualmente</button>
          </form>
        </section>` : html`<section class="card"><h2 class="h3">Pagamento</h2><p>${order.kind === 'pacote' ? 'Crédito do pacote (1 de 5).' : html`${formatBRL(order.price_cents)} confirmado em ${formatDate(order.paid_at)} · ${order.payment_method || ''}${order.payment_note ? ` · ${order.payment_note}` : ''}`}</p></section>`}

        <section class="card">
          <h2 class="h3">Briefing</h2>
          <dl class="dl">
            <dt>Cliente</dt><dd>${order.name || pkg?.name || '—'}</dd>
            <dt>E-mail</dt><dd>${order.email || pkg?.email || '—'}</dd>
            <dt>WhatsApp</dt><dd>${formatPhone(contactPhone) || '—'}</dd>
            <dt>Testar</dt><dd>${types.map((t) => CHANGE_TYPES[t]).join(', ')}${order.change_other ? ` (${order.change_other})` : ''}</dd>
            <dt>Cores</dt><dd>${order.colors || '—'}</dd>
            <dt>Descrição</dt><dd class="pre">${order.description || '—'}</dd>
            <dt>Preservar</dt><dd>${[...pres.map((p) => PRESERVE[p]), order.preserve_other].filter(Boolean).join(', ') || '—'}</dd>
          </dl>
        </section>

        <section class="card">
          <h2 class="h3">Arquivos do cliente</h2>
          <div class="file-grid">${files.map(fileThumb)}</div>
        </section>

        ${adjustment ? html`<section class="card ${adjustment.status === 'aberto' ? 'card-attn' : ''}">
          <h2 class="h3">Ajuste solicitado · Proposta ${adjustment.slot}</h2>
          <p class="muted small">${formatDate(adjustment.created_at)} · ${adjustment.status === 'aberto' ? 'Em aberto' : `Atendido em ${formatDate(adjustment.resolved_at)}`}</p>
          <blockquote>${adjustment.description}</blockquote>
        </section>` : ''}

        <section class="card">
          <h2 class="h3">Propostas</h2>
          ${Object.keys(bySlot).length ? Object.entries(bySlot).sort((a, b) => a[0].localeCompare(b[0])).map(([slot, list]) => html`<div class="slot-group">
            <h3 class="h4">Proposta ${slot}${order.chosen_slot === slot ? html` <span class="badge badge-chosen">★ Favorita do cliente</span>` : ''}</h3>
            <div class="file-grid">${list.map((p) => html`<figure class="file-card">
              <a href="/painel/arquivo/${p.file_id}" target="_blank" rel="noopener"><img src="/painel/arquivo/${p.file_id}" alt="Proposta ${slot} versão ${p.version}" loading="lazy"></a>
              <figcaption><span class="small">v${p.version}${p.title ? ` · ${p.title}` : ''} · ${p.published ? 'publicada' : html`<strong>não publicada</strong>`}</span>
              <form method="post" action="/painel/pedido/${order.id}/propostas/${p.id}/remover" data-confirm="Remover esta imagem?"><button class="btn btn-sm btn-ghost">Remover</button></form></figcaption>
            </figure>`)}</div></div>`) : html`<p class="muted">Nenhuma proposta enviada.</p>`}

          ${order.status !== 'aguardando_pagamento' ? html`<form method="post" action="/painel/pedido/${order.id}/propostas" enctype="multipart/form-data" class="stack upload-proposal" data-once>
            <input type="hidden" name="idem" value="${idem}">
            <h3 class="h4">${revisionNeeded ? `Enviar versão revisada da proposta ${order.chosen_slot}` : 'Enviar imagem de proposta'}</h3>
            <div class="grid2">
              <label class="field"><span class="label">Proposta</span><select name="slot">${['A', 'B', 'C'].map((s) => html`<option ${(revisionNeeded ? order.chosen_slot : Object.keys(bySlot).includes('A') && !bySlot.B ? 'B' : 'A') === s ? 'selected' : ''}>${s}</option>`)}</select></label>
              <label class="field"><span class="label">Título <span class="opt">opcional</span></span><input name="titulo" maxlength="80" placeholder="Ex.: Letreiro em ACM preto"></label>
            </div>
            <label class="field"><span class="label">Nota para o cliente <span class="opt">opcional</span></span><input name="nota" maxlength="400"></label>
            <label class="field"><span class="label">Imagem (JPG, PNG ou WEBP, até 20 MB)</span><input type="file" name="imagem" accept="image/jpeg,image/png,image/webp" required></label>
            <button class="btn btn-outline">Enviar imagem</button>
          </form>` : ''}

          ${canPublish ? html`<form method="post" action="/painel/pedido/${order.id}/publicar" data-once class="publish">
            ${revisionNeeded && !revisionReady ? html`<p class="small">Para concluir o ajuste, envie uma nova versão da proposta ${order.chosen_slot}.</p>` : ''}
            <button class="btn btn-primary btn-lg btn-block" ${revisionNeeded && !revisionReady ? 'disabled' : ''}>${revisionNeeded ? 'Publicar versão revisada' : order.delivered_at ? 'Publicar imagens novas' : 'Publicar entrega'}</button>
          </form>` : ''}
        </section>
      </div>

      <aside class="stack">
        <section class="card">
          <h2 class="h3">Link de entrega</h2>
          ${linkActive ? html`<div class="copy-row"><input readonly value="${deliveryUrl}" aria-label="Link privado de entrega" data-testid="delivery-link"><button class="btn btn-outline" type="button" data-copy="${deliveryUrl}">Copiar</button></div>
            <p class="small"><a href="${deliveryUrl}" target="_blank" rel="noopener">Abrir entrega</a> · ${order.delivered_at ? 'publicado' : 'ainda sem propostas publicadas'}</p>
            <form method="post" action="/painel/pedido/${order.id}/link/revogar" data-confirm="Revogar o link? Quem tiver o endereço atual perde o acesso."><button class="btn btn-sm btn-ghost danger">Revogar acesso</button></form>`
          : order.delivery_token ? html`<p>O link foi revogado.</p><form method="post" action="/painel/pedido/${order.id}/link/novo"><button class="btn btn-outline">Gerar novo link</button></form>`
          : html`<p class="muted small">O link é criado ao publicar a entrega.</p>`}
        </section>

        <section class="card">
          <h2 class="h3">WhatsApp</h2>
          <p class="small">Revise a mensagem antes de enviar.</p>
          <textarea rows="7" data-wa-text aria-label="Mensagem do WhatsApp">${waMessage}</textarea>
          <a class="btn btn-wa btn-block" href="${waLink(contactPhone, waMessage)}" data-wa-phone="${contactPhone}" target="_blank" rel="noopener">Abrir WhatsApp</a>
          <p class="small"><a href="${orderUrl}" target="_blank" rel="noopener">Link de acompanhamento do cliente</a></p>
        </section>

        <section class="card">
          <h2 class="h3">Status</h2>
          ${['entregue', 'ajuste_solicitado'].includes(order.status) ? html`<form method="post" action="/painel/pedido/${order.id}/status" data-once><input type="hidden" name="acao" value="concluir"><button class="btn btn-outline btn-block">Marcar como concluído</button></form>` : ''}
          ${order.status === 'concluido' ? html`<form method="post" action="/painel/pedido/${order.id}/status" data-once><input type="hidden" name="acao" value="reabrir"><button class="btn btn-outline btn-block">Reabrir pedido</button></form>` : ''}
          <ol class="events">${events.map((e) => html`<li><span class="muted small">${formatDate(e.created_at)} · ${e.actor}</span><br>${e.message}</li>`)}</ol>
        </section>
      </aside>
    </div>
  </main>`;
  return adminLayout(admin, `Pedido ${order.id}`, body);
}

export function packagesPage({ admin, packages, req }) {
  const body = html`<main class="wrap admin-main">
    ${demoBanner()}${flash(req)}
    <h1>Pacotes</h1>
    ${packages.length ? html`<ul class="order-list">${packages.map((p) => html`<li><a class="order-row" href="/painel/pacote/${p.id}">
      <span class="thumb-empty credits">${p.credits_total - p.used}</span>
      <div class="order-row-main"><strong>${p.company}</strong><span class="muted small">${p.id} · ${p.name} · ${formatDate(p.created_at)}</span><span class="small">${p.used} de ${p.credits_total} créditos usados</span></div>
      ${statusBadge(p.status)}
    </a></li>`)}</ul>` : html`<p class="muted">Nenhum pacote vendido ainda.</p>`}
  </main>`;
  return adminLayout(admin, 'Pacotes', body);
}

export function packageDetailPage({ admin, pkg, briefings, logo, link, req, events, waMessage }) {
  const used = briefings.length;
  const body = html`<main class="wrap admin-main">
    <a class="back" href="/painel/pacotes">← Pacotes</a>
    ${flash(req)}
    <p class="eyebrow">${pkg.id}</p>
    <h1>${pkg.company}</h1>
    <p>${statusBadge(pkg.status)} <span class="muted small">${used} de ${pkg.credits_total} créditos usados · saldo ${pkg.status === 'pago' ? pkg.credits_total - used : 0}</span></p>
    <div class="detail-grid">
      <div class="stack">
        ${pkg.status === 'aguardando_pagamento' ? html`<section class="card">
          <h2 class="h3">Pagamento</h2>
          <p>Aguardando ${formatBRL(pkg.price_cents)}. Os créditos são liberados após a confirmação.</p>
          <form method="post" action="/painel/pacote/${pkg.id}/pagamento" class="stack" data-once>
            <div class="grid2">
              <label class="field"><span class="label">Forma</span><select name="forma"><option>Pix</option><option>Cartão</option><option>Transferência</option><option>Outro</option></select></label>
              <label class="field"><span class="label">Observação</span><input name="obs" maxlength="200"></label>
            </div>
            <label class="consent"><input type="checkbox" name="confirmo" value="1" required><span>Conferi o recebimento de ${formatBRL(pkg.price_cents)}.</span></label>
            <button class="btn btn-primary">Registrar pagamento manualmente</button>
          </form>
        </section>` : html`<section class="card"><h2 class="h3">Pagamento</h2><p>${formatBRL(pkg.price_cents)} confirmado em ${formatDate(pkg.paid_at)} · ${pkg.payment_method || ''}</p></section>`}
        <section class="card">
          <h2 class="h3">Empresa</h2>
          <dl class="dl"><dt>Responsável</dt><dd>${pkg.name}</dd><dt>E-mail</dt><dd>${pkg.email}</dd><dt>WhatsApp</dt><dd>${formatPhone(pkg.whatsapp)}</dd><dt>Cor</dt><dd><span class="swatch" style="background:${pkg.brand_color || '#1f2937'}"></span> ${pkg.brand_color || 'padrão'}</dd></dl>
          ${logo ? html`<div class="file-grid">${fileThumb(logo)}</div>` : html`<p class="muted small">Sem logo enviada: as entregas mostram o nome da empresa.</p>`}
        </section>
        <section class="card">
          <h2 class="h3">Briefings</h2>
          ${briefings.length ? html`<ul class="list">${briefings.map((b) => html`<li class="list-item"><a href="/painel/pedido/${b.id}"><strong>${b.store_name}</strong></a><span class="list-end"><span class="muted small">${b.id}</span>${statusBadge(b.status)}</span></li>`)}</ul>` : html`<p class="muted">Nenhum briefing ainda.</p>`}
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <h2 class="h3">Link do cliente</h2>
          <div class="copy-row"><input readonly value="${link}" aria-label="Link do pacote"><button class="btn btn-outline" type="button" data-copy="${link}">Copiar</button></div>
          <textarea rows="5" data-wa-text aria-label="Mensagem do WhatsApp">${waMessage}</textarea>
          <a class="btn btn-wa btn-block" href="${waLink(pkg.whatsapp, waMessage)}" data-wa-phone="${pkg.whatsapp}" target="_blank" rel="noopener">Abrir WhatsApp</a>
        </section>
        <section class="card"><h2 class="h3">Histórico</h2><ol class="events">${events.map((e) => html`<li><span class="muted small">${formatDate(e.created_at)} · ${e.actor}</span><br>${e.message}</li>`)}</ol></section>
      </aside>
    </div>
  </main>`;
  return adminLayout(admin, `Pacote ${pkg.id}`, body);
}

export function configPage({ admin, admins, req, envInfo }) {
  const s = getSettings();
  const p = s.payment_provider;
  const body = html`<main class="wrap admin-main narrow">
    ${demoBanner()}${flash(req)}
    <h1>Configurações</h1>
    <form method="post" action="/painel/config" enctype="multipart/form-data" class="stack">
      <section class="card">
        <h2 class="h3">Marca</h2>
        <label class="field"><span class="label">Nome do app</span><input name="brand_name" value="${s.brand_name}" required maxlength="60"></label>
        <label class="field"><span class="label">Cor principal</span><input type="color" name="brand_color" value="${s.brand_color}" class="color-input"></label>
        <label class="field"><span class="label">Logo (PNG, WEBP, JPG ou SVG, até 5 MB)</span><input type="file" name="logo" accept="image/png,image/webp,image/jpeg,image/svg+xml"></label>
        ${s.brand_logo_file ? html`<div class="logo-preview"><img src="/marca/logo" alt="Logo atual"><label class="consent"><input type="checkbox" name="remover_logo" value="1"><span>Remover logo</span></label></div>` : ''}
        <label class="field"><span class="label">WhatsApp para dúvidas dos clientes <span class="opt">opcional</span></span><input name="contact_whatsapp" value="${s.contact_whatsapp}" inputmode="tel"></label>
        <label class="field"><span class="label">Endereço público do app</span><input name="public_url" value="${s.public_url}" placeholder="https://fachadaemvista.com.br"><span class="hint">Usado nos links enviados aos clientes e no retorno do checkout.</span></label>
      </section>
      <section class="card">
        <h2 class="h3">Pagamento</h2>
        <fieldset class="radio-list">
          <label><input type="radio" name="payment_provider" value="demo" ${p === 'demo' ? 'checked' : ''} ${envInfo.providerLocked ? 'disabled' : ''}> <span><strong>Demonstração</strong> — checkout simulado, nada é cobrado</span></label>
          <label><input type="radio" name="payment_provider" value="link" ${p === 'link' ? 'checked' : ''} ${envInfo.providerLocked ? 'disabled' : ''}> <span><strong>Link de pagamento</strong> — qualquer provedor (Pix/cartão); confirmação manual no painel</span></label>
          <label><input type="radio" name="payment_provider" value="mercadopago" ${p === 'mercadopago' ? 'checked' : ''} ${envInfo.providerLocked ? 'disabled' : ''}> <span><strong>Mercado Pago</strong> — Pix e cartão com confirmação automática ${envInfo.mp ? html`<span class="badge badge-concluido">token configurado</span>` : html`<span class="badge badge-aguardando_pagamento">defina MP_ACCESS_TOKEN no servidor</span>`}</span></label>
        </fieldset>
        ${envInfo.providerLocked ? html`<p class="small">Definido pela variável PAYMENT_PROVIDER no servidor.</p>` : ''}
        <label class="field"><span class="label">Link — simulação avulsa</span><input name="payment_link_single" value="${s.payment_link_single}" placeholder="https://pagamento.exemplo.com/delta?ref={pedido}"></label>
        <label class="field"><span class="label">Link — pacote de 5</span><input name="payment_link_package" value="${s.payment_link_package}" placeholder="https://pagamento.exemplo.com/delta-pacote?ref={pedido}"><span class="hint">Use {pedido} e {valor} para incluir o código e o valor.</span></label>
        <p class="small">Webhook do Mercado Pago: <code>${envInfo.webhookUrl}</code></p>
        <div class="grid2">
          <label class="field"><span class="label">Preço avulso (R$)</span><input name="price_single" value="${(s.price_single / 100).toFixed(2).replace('.', ',')}" inputmode="decimal"></label>
          <label class="field"><span class="label">Preço do pacote (R$)</span><input name="price_package" value="${(s.price_package / 100).toFixed(2).replace('.', ',')}" inputmode="decimal"></label>
        </div>
      </section>
      <button class="btn btn-primary btn-lg">Salvar configurações</button>
    </form>

    <section class="card">
      <h2 class="h3">Minha senha</h2>
      <form method="post" action="/painel/config/senha" class="stack">
        <label class="field"><span class="label">Senha atual</span><input type="password" name="atual" required autocomplete="current-password"></label>
        <label class="field"><span class="label">Nova senha (mín. 10 caracteres)</span><input type="password" name="nova" required minlength="10" autocomplete="new-password"></label>
        <button class="btn btn-outline">Alterar senha</button>
      </form>
    </section>
    <section class="card">
      <h2 class="h3">Equipe</h2>
      <ul class="list">${admins.map((a) => html`<li class="list-item"><span>${a.name || ''} <span class="muted">${a.email}</span></span></li>`)}</ul>
      <form method="post" action="/painel/config/equipe" class="stack">
        <div class="grid2">
          <label class="field"><span class="label">Nome</span><input name="nome" required maxlength="80"></label>
          <label class="field"><span class="label">E-mail</span><input name="email" type="email" required></label>
        </div>
        <label class="field"><span class="label">Senha inicial (mín. 10 caracteres)</span><input name="senha" type="password" required minlength="10" autocomplete="new-password"></label>
        <button class="btn btn-outline">Adicionar membro</button>
      </form>
    </section>
  </main>`;
  return adminLayout(admin, 'Configurações', body);
}
