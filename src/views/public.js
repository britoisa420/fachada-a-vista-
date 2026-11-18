import { html, formatBRL, formatDate, waLink } from '../util.js';
import { getSettings } from '../db.js';
import { layout, compare, includesList, check, statusBadge, CHANGE_TYPES, PRESERVE, DISCLAIMER, flash, alert } from './common.js';

const ctaHeader = html`<a class="btn btn-sm btn-primary hide-xs" href="/simular">Simular minha fachada</a>`;

// =====================================================================
// PÁGINA DE VENDAS
// =====================================================================
export function homePage() {
  const s = getSettings();
  const single = includesList('avulso');
  const pack = includesList('pacote');
  const perSim = formatBRL(Math.round(s.price_package / 5));
  const body = html`
<main>
  <section class="hero">
    <div class="wrap hero-in">
      <div class="hero-copy">
        <p class="eyebrow">Simulação de fachadas para lojistas</p>
        <h1>Veja como sua loja pode ficar antes de encomendar a placa</h1>
        <p class="lead">Envie uma foto da fachada e receba duas propostas aplicadas à imagem real da sua loja: placa nova, letreiro iluminado, pintura ou revestimento. Compare, escolha e encomende com segurança.</p>
        <div class="cta-row">
          <a class="btn btn-primary btn-lg" href="/simular">Simular minha fachada</a>
          <a class="btn btn-outline btn-lg" href="/pacote">Comprar pacote de 5</a>
        </div>
        <p class="muted small">Pagamento por Pix ou cartão. Entrega por link privado, fácil de compartilhar no WhatsApp.</p>
      </div>
      <div class="hero-media">
        ${compare({ before: '/static/demo/antes.svg', after: '/static/demo/depois.svg', width: 1200, height: 800, tag: 'Exemplo de simulação', label: 'Exemplo de simulação: arraste para comparar antes e depois' })}
        <p class="caption">Exemplo de simulação. Arraste a barra ou use as setas do teclado para comparar.</p>
      </div>
    </div>
  </section>

  <section class="section" id="como-funciona">
    <div class="wrap">
      <h2>Como funciona</h2>
      <ol class="steps">
        <li class="step"><span class="step-n">1</span><div><h3>Envie a foto da loja</h3><p>Uma foto de frente, bem iluminada, com a entrada inteira visível.</p></div></li>
        <li class="step"><span class="step-n">2</span><div><h3>Conte o que quer mudar</h3><p>Placa, letreiro iluminado, pintura, revestimento, cores e o que deve ser mantido.</p></div></li>
        <li class="step"><span class="step-n">3</span><div><h3>Receba duas propostas aplicadas à foto</h3><p>Em um link privado, com antes e depois de cada opção, para decidir e compartilhar.</p></div></li>
      </ol>
    </div>
  </section>

  <section class="section section-alt" id="ofertas">
    <div class="wrap">
      <h2>Escolha sua simulação</h2>
      <div class="offers">
        <article class="offer">
          <p class="offer-for">Para lojistas</p>
          <h3>${single.title}</h3>
          <p class="price">${single.price}</p>
          <ul class="checks">${single.items.map((i) => html`<li>${check}<span>${i}</span></li>`)}</ul>
          <a class="btn btn-primary btn-block btn-lg" href="/simular">Simular minha fachada</a>
        </article>
        <article class="offer offer-featured">
          <p class="offer-for">Para empresas de comunicação visual</p>
          <h3>Pacote com 5 simulações</h3>
          <p class="price">${pack.price} <span class="price-note">${perSim} por simulação</span></p>
          <ul class="checks">${pack.items.map((i) => html`<li>${check}<span>${i}</span></li>`)}</ul>
          <a class="btn btn-primary btn-block btn-lg" href="/pacote">Comprar pacote de 5</a>
        </article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap narrow">
      <h2>Perguntas frequentes</h2>
      <details class="faq"><summary>Que foto devo enviar?</summary><p>Uma foto tirada de frente para a loja, durante o dia, com boa luz e a entrada inteira aparecendo: portas, vitrines e a área onde vai a placa. Evite carros ou pessoas na frente.</p></details>
      <details class="faq"><summary>Como recebo as propostas?</summary><p>Por um link privado, difícil de adivinhar. Nele você vê a foto original, as duas propostas e o antes e depois de cada uma. Dá para baixar as imagens e enviar o link para quem vai produzir a placa.</p></details>
      <details class="faq"><summary>E se eu quiser mudar algo?</summary><p>Na simulação avulsa, você escolhe sua proposta favorita e pede um ajuste por escrito. A versão revisada aparece no mesmo link.</p></details>
      <details class="faq"><summary>Como funciona o pacote?</summary><p>Depois da confirmação do pagamento, você recebe 5 créditos. Cada briefing enviado usa 1 crédito, e você pode pedir as simulações aos poucos, conforme chegam seus clientes. As entregas são apresentadas com a marca da sua empresa.</p></details>
      <details class="faq"><summary>A simulação substitui o projeto da placa?</summary><p>Não. ${DISCLAIMER}</p></details>
    </div>
  </section>
</main>
${footer()}`;
  return layout({ body, header: ctaHeader, description: 'Envie a foto da sua loja e receba duas propostas de fachada aplicadas à imagem real antes de encomendar a placa ou o letreiro.' });
}

export function footer() {
  const s = getSettings();
  return html`<footer class="footer"><div class="wrap">
    <p><strong>${s.brand_name}</strong></p>
    <p class="muted small">${DISCLAIMER}</p>
    ${s.contact_whatsapp ? html`<p><a href="${waLink(s.contact_whatsapp, `Olá! Tenho uma dúvida sobre o ${s.brand_name}.`)}" target="_blank" rel="noopener">Falar conosco no WhatsApp</a></p>` : ''}
  </div></footer>`;
}

// =====================================================================
// FORMULÁRIO (avulso e briefing do pacote)
// =====================================================================
function fileSlot({ name, label, hint, required = false, accept, maxMb, multiple = 0 }) {
  return html`<div class="file-slot" data-file-slot data-name="${name}" data-max-mb="${maxMb}" ${multiple ? html`data-multiple="${multiple}"` : ''} ${required ? 'data-required' : ''}>
    <div class="file-head">
      <span class="label">${label}${required ? html` <span class="req">obrigatória</span>` : html` <span class="opt">opcional</span>`}</span>
      ${hint ? html`<span class="hint">${hint}</span>` : ''}
    </div>
    <div class="file-previews" data-previews></div>
    <label class="file-pick">
      <input type="file" name="${name}" accept="${accept}" ${multiple ? 'multiple' : ''} ${required ? 'required' : ''} data-input>
      <span class="file-pick-btn"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span data-pick-text>${multiple ? 'Adicionar imagens' : 'Escolher arquivo'}</span></span>
    </label>
    <p class="field-error" data-error hidden></p>
  </div>`;
}

export function briefingFields({ contact = true, contactLabel = 'Seus dados', storeHint = '' } = {}) {
  return html`
  ${contact ? html`<fieldset class="card">
    <legend>${contactLabel}</legend>
    <div class="grid2">
      <label class="field"><span class="label">Nome</span><input name="nome" autocomplete="name" required maxlength="120"></label>
      <label class="field"><span class="label">Nome da loja</span><input name="loja" autocomplete="organization" required maxlength="120"></label>
      <label class="field"><span class="label">E-mail</span><input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>
      <label class="field"><span class="label">WhatsApp</span><input name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="(11) 91234-5678" required maxlength="25"></label>
    </div>
  </fieldset>` : html`<fieldset class="card">
    <legend>Loja do cliente</legend>
    <label class="field"><span class="label">Nome da loja</span><input name="loja" required maxlength="120">${storeHint ? html`<span class="hint">${storeHint}</span>` : ''}</label>
  </fieldset>`}

  <fieldset class="card">
    <legend>Foto da fachada</legend>
    <div class="tips">
      <p><strong>Para um bom resultado:</strong></p>
      <ul>
        <li>Fique de frente para a loja, no meio da fachada.</li>
        <li>Fotografe de dia, com boa luz e sem contraluz.</li>
        <li>Mostre a entrada inteira: portas, vitrines e a área da placa.</li>
        <li>Evite carros, pessoas ou postes na frente.</li>
      </ul>
    </div>
    ${fileSlot({ name: 'fachada', label: 'Foto frontal da fachada', hint: 'JPG, PNG ou WEBP, até 15 MB', required: true, accept: 'image/jpeg,image/png,image/webp', maxMb: 15 })}
  </fieldset>

  <fieldset class="card">
    <legend>O que deseja testar</legend>
    <p class="hint">Marque uma ou mais opções.</p>
    <div class="chips" data-required-group="tipos">
      ${Object.entries(CHANGE_TYPES).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="tipos" value="${k}" ${k === 'outra' ? 'data-toggle="#outra-wrap"' : ''}><span>${v}</span></label>`)}
    </div>
    <label class="field" id="outra-wrap" hidden><span class="label">Qual alteração?</span><input name="outra" maxlength="200" placeholder="Ex.: toldo, adesivo na vitrine, iluminação"></label>
    <p class="field-error" data-error-for="tipos" hidden></p>
    <label class="field"><span class="label">Cores desejadas <span class="opt">opcional</span></span><input name="cores" maxlength="300" placeholder="Ex.: verde-escuro e dourado, como na logo"></label>
    <label class="field"><span class="label">Descreva o que você imagina</span><textarea name="descricao" rows="4" maxlength="3000" required placeholder="Ex.: placa em ACM com letras em relevo, nome da loja centralizado, fachada pintada em cinza-claro."></textarea></label>
  </fieldset>

  <fieldset class="card">
    <legend>O que deve ser preservado</legend>
    <p class="hint">Esses elementos ficam como estão na foto.</p>
    <div class="chips">
      ${Object.entries(PRESERVE).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="preservar" value="${k}" checked><span>${v}</span></label>`)}
    </div>
    <label class="field"><span class="label">Outros elementos a preservar <span class="opt">opcional</span></span><input name="preservar_outros" maxlength="300" placeholder="Ex.: grade, toldo, ar-condicionado, número da loja"></label>
  </fieldset>

  <fieldset class="card">
    <legend>Anexos</legend>
    ${fileSlot({ name: 'logo', label: 'Logo da loja', hint: 'PNG, JPG, WEBP, SVG ou PDF, até 10 MB', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,application/pdf', maxMb: 10 })}
    ${fileSlot({ name: 'referencias', label: 'Imagens de referência', hint: 'Até 3 imagens, 10 MB cada', accept: 'image/jpeg,image/png,image/webp', maxMb: 10, multiple: 3 })}
  </fieldset>`;
}

function summaryBox(kind) {
  const inc = includesList(kind);
  return html`<aside class="summary card" aria-label="Resumo do pedido">
    <p class="summary-title">${inc.title}</p>
    <p class="price">${inc.price}</p>
    <ul class="checks">${inc.items.map((i) => html`<li>${check}<span>${i}</span></li>`)}</ul>
    <p class="muted small">Pix ou cartão, no checkout seguro do provedor de pagamento.</p>
  </aside>`;
}

function progress() {
  return html`<div class="upload-progress" data-progress hidden><div class="upload-bar"><span data-progress-bar></span></div><p class="small" data-progress-text>Enviando…</p></div>`;
}

export function orderFormPage({ idem }) {
  const body = html`<main class="wrap form-page">
    <a class="back" href="/">← Voltar</a>
    <h1>Simular minha fachada</h1>
    <p class="lead">Preencha o briefing e envie a foto. Seu pedido fica salvo e, em seguida, você vai para o pagamento.</p>
    <div class="form-layout">
      <form class="stack" action="/api/pedidos" method="post" enctype="multipart/form-data" data-upload-form novalidate>
        <input type="hidden" name="idem" value="${idem}">
        <div data-form-error></div>
        ${briefingFields()}
        <div class="card">
          ${summaryBox('avulso')}
          <label class="consent"><input type="checkbox" name="aceite" value="1" required><span>Entendo que o resultado é uma simulação visual e que medidas, materiais e instalação devem ser conferidos com quem vai produzir a placa.</span></label>
          ${progress()}
          <button class="btn btn-primary btn-lg btn-block" type="submit">Continuar para o pagamento</button>
        </div>
      </form>
    </div>
  </main>${footer()}`;
  return layout({ title: 'Simular minha fachada', body });
}

// =====================================================================
// PEDIDO (status e pagamento)
// =====================================================================
export function orderPage({ order, files, baseUrl, req }) {
  const s = getSettings();
  const inc = includesList('avulso');
  const t = order.access_token;
  const fachada = files.find((f) => f.role === 'fachada');
  const linkSelf = `${baseUrl}/pedido/${order.id}?t=${t}`;
  let main;
  if (order.status === 'aguardando_pagamento') {
    main = html`<div class="card">
      <h2>Falta só o pagamento</h2>
      <p>Seu pedido <strong>${order.id}</strong> foi salvo. Confira o resumo e siga para o checkout.</p>
      <p class="summary-title">${inc.title}</p>
      <p class="price">${formatBRL(order.price_cents)}</p>
      <ul class="checks">${inc.items.map((i) => html`<li>${check}<span>${i}</span></li>`)}</ul>
      <form method="post" action="/pedido/${order.id}/pagar" data-once>
        <input type="hidden" name="t" value="${t}">
        <button class="btn btn-primary btn-lg btn-block">Ir para o pagamento</button>
      </form>
      <p class="muted small center">Pix ou cartão, conforme disponível no checkout.</p>
      ${order.checkout_url ? html`<p class="small center">Já pagou? <a href="/pagamento/retorno?ref=${order.id}&t=${t}">Ver confirmação do pagamento</a></p>` : ''}
    </div>`;
  } else {
    const delivered = order.delivery_token && !order.delivery_revoked && ['entregue', 'ajuste_solicitado', 'concluido'].includes(order.status);
    main = html`<div class="card">
      <h2>${order.status === 'em_producao' ? 'Pagamento confirmado. Estamos criando suas propostas.' : 'Suas propostas'}</h2>
      ${timeline(order)}
      ${delivered ? html`<a class="btn btn-primary btn-lg btn-block" href="/e/${order.delivery_token}">Ver as propostas</a>` : html`<p class="muted">Você vai receber o link das propostas pelo WhatsApp informado. Este link de acompanhamento também mostra quando estiverem prontas.</p>`}
    </div>`;
  }
  const body = html`<main class="wrap narrow form-page">
    ${flash(req)}
    <p class="eyebrow">Pedido ${order.id}</p>
    <h1>${order.store_name}</h1>
    <p>${statusBadge(order.status)}</p>
    ${main}
    <div class="card">
      <h2 class="h3">Guarde este link</h2>
      <p class="small">Use para acompanhar o pedido. Ele é pessoal: não compartilhe.</p>
      <div class="copy-row"><input readonly value="${linkSelf}" aria-label="Link de acompanhamento"><button class="btn btn-outline" type="button" data-copy="${linkSelf}">Copiar</button></div>
    </div>
    ${fachada ? html`<div class="card"><h2 class="h3">Foto enviada</h2><img class="photo" src="/pedido/${order.id}/f/${fachada.id}?t=${t}" alt="Foto da fachada enviada"></div>` : ''}
    ${s.contact_whatsapp ? html`<p class="center"><a href="${waLink(s.contact_whatsapp, `Olá! Tenho uma dúvida sobre o pedido ${order.id}.`)}" target="_blank" rel="noopener">Dúvidas? Fale conosco</a></p>` : ''}
  </main>${footer()}`;
  return layout({ title: `Pedido ${order.id}`, body, noindex: true });
}

function timeline(order) {
  const steps = [
    ['Pedido recebido', true],
    ['Pagamento confirmado', !!order.paid_at || order.kind === 'pacote'],
    ['Propostas entregues', !!order.delivered_at],
    ['Concluído', order.status === 'concluido'],
  ];
  return html`<ol class="timeline">${steps.map(([l, done]) => html`<li class="${done ? 'done' : ''}">${l}</li>`)}</ol>`;
}

export function returnPage({ kind, ref, t, status }) {
  const paid = !['aguardando_pagamento'].includes(status);
  const next = kind === 'package' ? `/pacote/${t}` : `/pedido/${ref}?t=${t}`;
  const body = html`<main class="wrap narrow form-page">
    <div class="card center" data-poll="/api/status?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}" data-next="${next}">
      <div class="${paid ? 'state-ok' : 'spinner'}" data-poll-icon aria-hidden="true"></div>
      <h1 data-poll-title>${paid ? 'Pagamento confirmado' : 'Aguardando confirmação'}</h1>
      <p data-poll-text>${paid
        ? 'Tudo certo! Você já pode seguir.'
        : 'Recebemos seu retorno do checkout. Assim que o provedor confirmar o pagamento, esta página atualiza sozinha. Pix costuma confirmar em instantes; cartão pode levar alguns minutos.'}</p>
      <p class="muted small">Pedido ${ref}</p>
      <a class="btn ${paid ? 'btn-primary' : 'btn-outline'} btn-lg btn-block" href="${next}" data-poll-btn>${paid ? (kind === 'package' ? 'Ver meus créditos' : 'Acompanhar pedido') : 'Ver meu pedido'}</a>
    </div>
  </main>`;
  return layout({ title: 'Aguardando confirmação', body, noindex: true });
}

// =====================================================================
// PACOTE
// =====================================================================
export function packageFormPage({ idem }) {
  const body = html`<main class="wrap form-page">
    <a class="back" href="/">← Voltar</a>
    <h1>Comprar pacote de 5 simulações</h1>
    <p class="lead">Para empresas de comunicação visual. Depois da confirmação do pagamento, você recebe 5 créditos e envia os briefings quando quiser.</p>
    <form class="stack" action="/api/pacotes" method="post" enctype="multipart/form-data" data-upload-form novalidate>
      <input type="hidden" name="idem" value="${idem}">
      <div data-form-error></div>
      <fieldset class="card">
        <legend>Dados da empresa</legend>
        <div class="grid2">
          <label class="field"><span class="label">Seu nome</span><input name="nome" autocomplete="name" required maxlength="120"></label>
          <label class="field"><span class="label">Nome da empresa</span><input name="empresa" autocomplete="organization" required maxlength="120"></label>
          <label class="field"><span class="label">E-mail</span><input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160"></label>
          <label class="field"><span class="label">WhatsApp</span><input name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="(11) 91234-5678" required maxlength="25"></label>
        </div>
      </fieldset>
      <fieldset class="card">
        <legend>Sua marca nas apresentações</legend>
        <p class="hint">As entregas do pacote mostram a logo e o nome da sua empresa, para você apresentar ao seu cliente.</p>
        ${fileSlot({ name: 'logo', label: 'Logo da empresa', hint: 'PNG, JPG, WEBP ou SVG, até 10 MB', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', maxMb: 10 })}
        <label class="field"><span class="label">Cor da sua marca <span class="opt">opcional</span></span><input type="color" name="cor" value="#1f2937" class="color-input"></label>
      </fieldset>
      <div class="card">
        ${summaryBox('pacote')}
        ${progress()}
        <button class="btn btn-primary btn-lg btn-block" type="submit">Continuar para o pagamento</button>
      </div>
    </form>
  </main>${footer()}`;
  return layout({ title: 'Comprar pacote de 5', body });
}

export function packagePage({ pkg, briefings, remaining, baseUrl, req }) {
  const t = pkg.access_token;
  const link = `${baseUrl}/pacote/${t}`;
  const paid = pkg.status === 'pago';
  const body = html`<main class="wrap form-page">
    ${flash(req)}
    <p class="eyebrow">Pacote ${pkg.id}</p>
    <h1>${pkg.company}</h1>
    ${!paid ? html`<div class="card">
      <h2>Falta só o pagamento</h2>
      <p>Seu pacote foi salvo. Os 5 créditos ficam disponíveis assim que o pagamento for confirmado.</p>
      <p class="price">${formatBRL(pkg.price_cents)}</p>
      <ul class="checks">${includesList('pacote').items.map((i) => html`<li>${check}<span>${i}</span></li>`)}</ul>
      <form method="post" action="/pacote/${t}/pagar" data-once><button class="btn btn-primary btn-lg btn-block">Ir para o pagamento</button></form>
      ${pkg.checkout_url ? html`<p class="small center">Já pagou? <a href="/pagamento/retorno?ref=${pkg.id}&t=${t}">Ver confirmação do pagamento</a></p>` : ''}
    </div>` : html`<div class="card balance">
      <div><p class="muted small">Saldo disponível</p><p class="balance-n" data-testid="saldo">${remaining} <span>de ${pkg.credits_total} créditos</span></p></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${pkg.credits_total}" aria-valuenow="${remaining}" aria-label="Créditos disponíveis">${Array.from({ length: pkg.credits_total }, (_, i) => html`<span class="${i < remaining ? 'on' : ''}"></span>`)}</div>
      ${remaining > 0 ? html`<a class="btn btn-primary btn-lg btn-block" href="/pacote/${t}/briefing">Enviar novo briefing</a>` : html`<p>Todos os créditos foram usados. <a href="/pacote">Comprar novo pacote</a></p>`}
    </div>`}
    <section class="card">
      <h2 class="h3">Briefings enviados</h2>
      ${briefings.length ? html`<ul class="list">${briefings.map((b) => html`<li class="list-item">
        <div><strong>${b.store_name}</strong><br><span class="muted small">${b.id} · ${formatDate(b.created_at)}</span></div>
        <div class="list-end">${statusBadge(b.status)}${b.delivery_token && !b.delivery_revoked && ['entregue', 'ajuste_solicitado', 'concluido'].includes(b.status) ? html`<a class="btn btn-sm btn-outline" href="/e/${b.delivery_token}">Ver entrega</a>` : ''}</div>
      </li>`)}</ul>` : html`<p class="muted">Nenhum briefing enviado ainda.</p>`}
    </section>
    <div class="card">
      <h2 class="h3">Guarde este link</h2>
      <p class="small">É por ele que você consulta o saldo e envia novos briefings. Não compartilhe.</p>
      <div class="copy-row"><input readonly value="${link}" aria-label="Link do pacote"><button class="btn btn-outline" type="button" data-copy="${link}">Copiar</button></div>
    </div>
  </main>${footer()}`;
  return layout({ title: `Pacote ${pkg.id}`, body, noindex: true });
}

export function briefingFormPage({ pkg, remaining, idem }) {
  const t = pkg.access_token;
  const body = html`<main class="wrap form-page">
    <a class="back" href="/pacote/${t}">← Voltar ao pacote</a>
    <h1>Novo briefing</h1>
    <p class="lead">Saldo: <strong>${remaining} de ${pkg.credits_total}</strong> créditos. Este envio usa 1 crédito.</p>
    <form class="stack" action="/api/pacotes/${t}/briefings" method="post" enctype="multipart/form-data" data-upload-form novalidate>
      <input type="hidden" name="idem" value="${idem}">
      <div data-form-error></div>
      ${briefingFields({ contact: false, storeHint: 'A entrega será apresentada com a marca da sua empresa.' })}
      <div class="card">
        ${progress()}
        <button class="btn btn-primary btn-lg btn-block" type="submit">Enviar briefing (usa 1 crédito)</button>
      </div>
    </form>
  </main>${footer()}`;
  return layout({ title: 'Novo briefing', body, noindex: true });
}

// =====================================================================
// ENTREGA
// =====================================================================
export function deliveryPage({ order, slots, original, adjustment, brand, baseUrl, req, partner }) {
  const t = order.delivery_token;
  const link = `${baseUrl}/e/${t}`;
  const fileUrl = (id, dl = false) => `/e/${t}/f/${id}${dl ? '?dl=1' : ''}`;
  const isSingle = order.kind === 'avulso';
  const canChoose = order.status === 'entregue';
  const canAdjust = isSingle && order.status === 'entregue' && !order.adjustment_used;
  const shareText = `Simulação da fachada da ${order.store_name}: ${link}`;
  const statusMsg = {
    entregue: order.adjustment_used ? 'A versão revisada está pronta.' : 'Suas propostas estão prontas. Compare e escolha a favorita.',
    ajuste_solicitado: 'Ajuste solicitado. A equipe está preparando a versão revisada, que vai aparecer neste mesmo link.',
    concluido: 'Pedido concluído. As imagens continuam disponíveis para download.',
  }[order.status];

  const body = html`<main class="wrap delivery">
    ${flash(req)}
    <p class="eyebrow">${partner ? `Apresentação ${partner}` : 'Simulação de fachada'} · ${order.id}</p>
    <h1>${order.store_name}</h1>
    ${statusMsg ? alert(order.status === 'ajuste_solicitado' ? 'info' : 'success', statusMsg) : ''}

    <div class="share-bar">
      <button class="btn btn-primary" type="button" data-share="${link}" data-share-text="${shareText}">Compartilhar link</button>
      <a class="btn btn-outline" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
      <button class="btn btn-outline" type="button" data-copy="${link}">Copiar link</button>
    </div>

    <section class="block">
      <h2>Foto original</h2>
      <img class="photo" src="${fileUrl(original.id)}" alt="Foto original da fachada">
      <a class="btn btn-sm btn-outline" href="${fileUrl(original.id, true)}" download>Baixar foto original</a>
    </section>

    ${slots.map((sl) => {
      const cur = sl.versions[0];
      const chosen = order.chosen_slot === sl.slot;
      return html`<section class="block proposal ${chosen ? 'is-chosen' : ''}" id="proposta-${sl.slot}">
        <div class="proposal-head">
          <h2>Proposta ${sl.slot}${cur.title ? html` <span class="muted">· ${cur.title}</span>` : ''}</h2>
          <div class="proposal-tags">${cur.version > 1 ? html`<span class="badge badge-entregue">Versão revisada</span>` : ''}${chosen ? html`<span class="badge badge-chosen">★ Favorita</span>` : ''}</div>
        </div>
        ${cur.note ? html`<p>${cur.note}</p>` : ''}
        ${compare({ before: fileUrl(original.id), after: fileUrl(cur.file_id), width: original.width, height: original.height, label: `Proposta ${sl.slot}: arraste para comparar antes e depois`, afterLabel: `Proposta ${sl.slot}` })}
        <div class="proposal-actions">
          <a class="btn btn-outline" href="${fileUrl(cur.file_id, true)}" download>Baixar proposta ${sl.slot}</a>
          ${canChoose && !chosen ? html`<form method="post" action="/e/${t}/favorita" data-once><input type="hidden" name="slot" value="${sl.slot}"><button class="btn btn-primary">Escolher como favorita</button></form>` : ''}
        </div>
        ${sl.versions.length > 1 ? html`<details class="older"><summary>Versões anteriores</summary>${sl.versions.slice(1).map((v) => html`<p><a href="${fileUrl(v.file_id, true)}" download>Baixar versão ${v.version}</a> <span class="muted small">· ${formatDate(v.created_at)}</span></p>`)}</details>` : ''}
      </section>`;
    })}

    ${isSingle ? html`<section class="block card" id="ajuste">
      <h2>Ajuste</h2>
      ${adjustment ? html`<p><strong>Ajuste solicitado na proposta ${adjustment.slot}</strong> em ${formatDate(adjustment.created_at)}:</p><blockquote>${adjustment.description}</blockquote>
        <p class="muted small">${adjustment.status === 'atendido' ? 'Atendido: a versão revisada está acima.' : 'Em andamento.'}</p>`
      : canAdjust ? html`<p>Você tem direito a <strong>um ajuste</strong> na proposta escolhida. Descreva com detalhes o que quer mudar.</p>
        <form method="post" action="/e/${t}/ajuste" class="stack" data-once>
          <label class="field"><span class="label">Proposta</span>
            <select name="slot" required>${slots.map((sl) => html`<option value="${sl.slot}" ${order.chosen_slot === sl.slot ? 'selected' : ''}>Proposta ${sl.slot}</option>`)}</select></label>
          <label class="field"><span class="label">O que deve mudar?</span><textarea name="descricao" rows="4" required minlength="10" maxlength="2000" placeholder="Ex.: deixar as letras maiores e trocar o fundo da placa para preto."></textarea></label>
          <button class="btn btn-primary btn-lg">Solicitar ajuste</button>
        </form>` : html`<p class="muted">O ajuste não está disponível no momento.</p>`}
    </section>` : ''}

    ${order.status === 'entregue' && order.chosen_slot ? html`<section class="block card center">
      <p>Gostou da proposta ${order.chosen_slot}${canAdjust ? ' como está' : ''}?</p>
      <form method="post" action="/e/${t}/concluir" data-once><button class="btn btn-outline btn-lg">Aprovar a proposta ${order.chosen_slot} e concluir</button></form>
    </section>` : ''}

    <p class="disclaimer">${DISCLAIMER}</p>
  </main>
  ${partner ? html`<footer class="footer"><div class="wrap"><p class="muted small">Apresentação de ${partner}</p></div></footer>` : ''}`;
  return layout({ title: `Simulação · ${order.store_name}`, body, noindex: true, brand });
}

export function messagePage({ title, text, status = 200, brand = null }) {
  const body = html`<main class="wrap narrow form-page"><div class="card center"><h1>${title}</h1><p>${text}</p><a class="btn btn-outline" href="/">Ir para o início</a></div></main>`;
  return layout({ title, body, noindex: true, brand });
}

// =====================================================================
// CHECKOUT DE DEMONSTRAÇÃO
// =====================================================================
export function demoCheckoutPage({ co, ref }) {
  const body = html`<main class="wrap narrow form-page">
    <div class="alert alert-info"><strong>Modo demonstração.</strong> Este checkout simula o provedor de pagamento. Nada é cobrado.</div>
    <div class="card">
      <p class="eyebrow">Checkout · ${co.ref_id}</p>
      <h1>${formatBRL(co.amount_cents)}</h1>
      <p>${ref.store_name || ref.company}</p>
      <div class="chips"><span class="chip chip-static">Pix</span><span class="chip chip-static">Cartão de crédito</span></div>
      <form method="post" action="/checkout-demo/${co.id}/aprovar" data-once class="stack">
        <button class="btn btn-primary btn-lg btn-block">Simular pagamento aprovado</button>
      </form>
      <a class="btn btn-outline btn-block" href="${co.url}">Voltar sem pagar</a>
      <p class="muted small">"Simular pagamento aprovado" envia ao sistema a mesma notificação que o provedor enviaria (webhook) e depois retorna à loja.</p>
    </div>
  </main>`;
  return layout({ title: 'Checkout (demonstração)', body, noindex: true });
}
