import { html, raw, formatBRL, formatDate, formatPhone, waLink } from '../util.js';
import { layout, page, alert, badge, flash, stars, fileSlot, field, select, chips } from './common.js';
import { CATEGORIAS, SITUACAO, ORCAMENTO, PRAZO, DOC_TIPO, UFS, REQ_STATUS, PROP_STATUS, CT_STATUS, formatDoc, docLabel } from '../domain.js';

const cats = (json) => JSON.parse(json || '[]').map((c) => CATEGORIAS[c] || c);
const catTags = (json) => html`<span class="tags">${cats(json).map((c) => html`<span class="tag">${c}</span>`)}</span>`;
const reqBadge = (s) => badge(s, REQ_STATUS[s] || s);
const propBadge = (s) => badge('p-' + s, PROP_STATUS[s] || s);
const ctBadge = (s) => badge('c-' + s, CT_STATUS[s] || s);
const nomeDe = (u) => u.empresa || u.nome;
const fileUrl = (f) => `/arquivos/${f.id}`;
const dias = (n) => `${n} dia${n == 1 ? '' : 's'}`;

// ====================================================================
// Público
// ====================================================================
export function home({ user, stats }) {
  return layout({
    user, noindex: false, description: 'Publique o que a sua fachada precisa e receba propostas de prestadores de comunicação visual. Grátis para empresas e MEIs.',
    body: html`<main>
    <section class="hero"><div class="wrap hero-in">
      <div>
        <p class="eyebrow">Para empresas, MEIs e lojistas</p>
        <h1>Conte o que a sua fachada precisa e receba propostas de quem faz</h1>
        <p class="lead">Placa em ACM, letreiro, luminoso, adesivo, toldo ou a fachada inteira. Publique o pedido, compare as propostas dos prestadores da sua região e feche com contrato assinado pela plataforma.</p>
        <div class="cta-row"><a class="btn btn-primary btn-lg" href="${user && user.role === 'empresa' ? '/pedidos/novo' : '/cadastro?tipo=empresa'}">Publicar meu pedido</a><a class="btn btn-outline btn-lg" href="/para-prestadores">Sou prestador</a></div>
        <p class="small muted">Grátis. Sem intermediação de pagamento: você combina direto com o prestador.</p>
      </div>
      <a class="hero-art" href="/criar" aria-label="Abrir o simulador de fachada"><img src="/static/mockups/exemplo.jpg" alt="Exemplo de placa aplicada numa foto de fachada pelo simulador" width="1600" height="1200"><span class="hero-art-tag">Simule a sua placa antes de pedir</span></a>
    </div></section>
    <section class="section section-alt"><div class="wrap"><h2>Como funciona</h2><ol class="steps">
      <li class="step"><span class="step-n">1</span><div><h3>Publique o pedido</h3><p>Diga o que precisa, onde fica e envie fotos do local. Se quiser, monte antes uma simulação da placa.</p></div></li>
      <li class="step"><span class="step-n">2</span><div><h3>Receba e compare propostas</h3><p>Prestadores da sua região mandam valor, prazo e o que está incluído. Converse com cada um pelo chat.</p></div></li>
      <li class="step"><span class="step-n">3</span><div><h3>Feche com contrato</h3><p>Aceite a melhor proposta: o contrato é gerado na hora e assinado eletronicamente pelas duas partes.</p></div></li>
    </ol></div></section>
    <section class="section"><div class="wrap two">
      <div class="card"><h2 class="h3">Para empresas e MEIs</h2><ul class="checks">
        <li>Um pedido, várias propostas, sem ligar para ninguém</li><li>Avaliações de outras empresas sobre cada prestador</li><li>Contrato com escopo, valor, prazo e garantia</li><li>Seu WhatsApp só é liberado para quem você contratar</li></ul>
        <a class="btn btn-primary btn-block" href="/cadastro?tipo=empresa">Criar conta de empresa</a></div>
      <div class="card"><h2 class="h3">Para prestadores de comunicação visual</h2><ul class="checks">
        <li>Pedidos de clientes da sua cidade e do seu estado</li><li>Fotos, medidas e briefing antes de orçar</li><li>Proposta e contrato prontos, sem papelada</li><li>Perfil com avaliações para ganhar a confiança de novos clientes</li></ul>
        <a class="btn btn-outline btn-block" href="/cadastro?tipo=prestador">Criar conta de prestador</a></div>
    </div>
    ${stats ? html`<p class="center muted small" style="margin-top:20px">${stats.pedidos} pedido(s) publicados · ${stats.prestadores} prestador(es) cadastrados</p>` : ''}
    </section>
    <section class="section section-alt"><div class="wrap narrow"><h2>Perguntas frequentes</h2>
      <details class="faq"><summary>Quanto custa?</summary><p>Nada, por enquanto. Empresas publicam pedidos e prestadores enviam propostas de graça.</p></details>
      <details class="faq"><summary>A plataforma recebe o pagamento?</summary><p>Não. O pagamento é combinado e feito direto entre a empresa e o prestador, nas condições escritas na proposta e no contrato.</p></details>
      <details class="faq"><summary>O contrato tem validade?</summary><p>Sim. As duas partes aceitam o contrato com login e senha pessoais, e a plataforma registra data, hora e IP de cada aceite (assinatura eletrônica simples, MP 2.200-2/2001 e Lei 14.063/2020). Para valores altos, vocês podem também assinar com certificado digital ou no papel.</p></details>
      <details class="faq"><summary>Ainda não tenho o ponto. Posso pedir?</summary><p>Pode. No pedido, marque "Ainda não tenho o ponto". Use o <a href="/criar">simulador</a> para mostrar a ideia da placa.</p></details>
    </div></section></main>`,
  });
}

export function paraPrestadores({ user }) {
  return layout({ user, active: 'prest', noindex: false, body: page(html`
    <p class="eyebrow">Para prestadores</p><h1>Receba pedidos de fachada e comunicação visual da sua região</h1>
    <p class="lead">Empresas e MEIs publicam o que precisam, com fotos e medidas. Você envia sua proposta, conversa com o cliente e fecha com contrato gerado pela plataforma.</p>
    <div class="cta-row"><a class="btn btn-primary btn-lg" href="/cadastro?tipo=prestador">Criar conta de prestador</a><a class="btn btn-outline btn-lg" href="/entrar">Já tenho conta</a></div>
    <div class="card"><h2 class="h3">Quem pode se cadastrar</h2><p>Empresas de comunicação visual (CNPJ), MEIs e profissionais autônomos (CPF) que fazem placas, letreiros, luminosos, adesivos, toldos, pintura ou fachadas completas.</p><p class="small muted" style="margin:0">É grátis. O contato do cliente é liberado quando ele aceita a sua proposta e você assina o contrato.</p></div>
  `) });
}

export function entrar({ user, error, email = '', volta = '' }) {
  return layout({ user, active: 'entrar', body: page(html`
    <h1>Entrar</h1>${alert('error', error)}
    <form method="post" action="/entrar" class="card" data-once>
      <input type="hidden" name="volta" value="${volta}">
      ${field({ name: 'email', label: 'E-mail', type: 'email', value: email, attrs: 'autocomplete="email" inputmode="email"' })}
      ${field({ name: 'senha', label: 'Senha', type: 'password', attrs: 'autocomplete="current-password"' })}
      <button class="btn btn-primary btn-lg btn-block">Entrar</button>
    </form>
    <p class="center">Ainda não tem conta? <a href="/cadastro?tipo=empresa">Sou empresa</a> · <a href="/cadastro?tipo=prestador">Sou prestador</a></p>`) });
}

function perfilFields(v, e, tipo) {
  const isP = tipo === 'prestador';
  return html`
    <fieldset class="card"><legend>${isP ? 'Sua empresa' : 'Seu negócio'}</legend>
      <div class="grid2">
        ${field({ name: 'empresa', label: isP ? 'Nome da empresa (como os clientes conhecem)' : 'Nome do negócio', value: v.empresa, error: e.empresa, attrs: 'maxlength="120" autocomplete="organization"' })}
        ${field({ name: 'nome', label: 'Seu nome (responsável)', value: v.nome, error: e.nome, attrs: 'maxlength="120" autocomplete="name"' })}
        ${select({ name: 'doc_tipo', label: 'Tipo de cadastro', options: DOC_TIPO, value: v.doc_tipo, error: e.doc_tipo })}
        ${field({ name: 'documento', label: 'CNPJ ou CPF', value: v.documento ? formatDoc(v.doc_tipo, v.documento) : '', error: e.documento, attrs: 'inputmode="numeric" maxlength="20"', hint: 'Usado no contrato. Não aparece no seu perfil público.' })}
        ${field({ name: 'whatsapp', label: 'WhatsApp', type: 'tel', value: v.whatsapp ? formatPhone(v.whatsapp) : '', error: e.whatsapp, attrs: 'inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678"', hint: 'Só é mostrado depois de um contrato assinado.' })}
        <div class="grid2 tight">${field({ name: 'cidade', label: 'Cidade', value: v.cidade, error: e.cidade, attrs: 'maxlength="80" autocomplete="address-level2"' })}${select({ name: 'uf', label: 'UF', options: UFS, value: v.uf, error: e.uf, placeholder: '--' })}</div>
      </div>
    </fieldset>
    ${isP ? html`<fieldset class="card"><legend>Serviços que você faz</legend>
      ${chips({ name: 'categorias', options: CATEGORIAS, values: v.categorias || [], group: 'categorias', error: e.categorias })}
      <label class="consent"><input type="checkbox" name="atende_estado" value="1" ${v.atende_estado ? raw('checked') : ''}><span>Atendo o estado inteiro, não só a minha cidade</span></label>
      ${field({ name: 'bio', label: 'Apresentação', type: 'textarea', value: v.bio, required: false, error: e.bio, attrs: 'maxlength="1500" rows="4" placeholder="Há quanto tempo atua, equipamentos, tipos de trabalho, diferenciais."' })}
      ${field({ name: 'site', label: 'Site ou Instagram', value: v.site, required: false, error: e.site, attrs: 'maxlength="200" placeholder="https://instagram.com/suaempresa"' })}
    </fieldset>` : ''}`;
}

export function cadastro({ user, tipo, v = {}, e = {}, error }) {
  const isP = tipo === 'prestador';
  return layout({ user, active: 'entrar', body: page(html`
    <div class="seg" role="tablist" aria-label="Tipo de conta"><a href="/cadastro?tipo=empresa" role="tab" aria-selected="${!isP}" ${!isP ? raw('class="on"') : ''}>Sou empresa / MEI</a><a href="/cadastro?tipo=prestador" role="tab" aria-selected="${isP}" ${isP ? raw('class="on"') : ''}>Sou prestador</a></div>
    <h1>${isP ? 'Cadastro de prestador' : 'Cadastro de empresa'}</h1>
    <p class="lead">${isP ? 'Receba pedidos de clientes da sua região e envie propostas.' : 'Publique o que a sua fachada precisa e receba propostas.'}</p>
    ${alert('error', error)}
    <form method="post" action="/cadastro" class="stack" data-once novalidate>
      <input type="hidden" name="tipo" value="${tipo}">
      ${perfilFields(v, e, tipo)}
      <fieldset class="card"><legend>Acesso</legend>
        ${field({ name: 'email', label: 'E-mail', type: 'email', value: v.email, error: e.email, attrs: 'autocomplete="email" inputmode="email" maxlength="160"' })}
        ${field({ name: 'senha', label: 'Senha', type: 'password', error: e.senha, hint: 'Pelo menos 8 caracteres.', attrs: 'autocomplete="new-password" minlength="8"' })}
        <label class="consent ${e.termos ? 'has-error' : ''}"><input type="checkbox" name="termos" value="1" required><span>Li e aceito os <a href="/termos" target="_blank">termos de uso</a> e a <a href="/privacidade" target="_blank">política de privacidade</a>.</span></label>
        ${e.termos ? html`<p class="field-error">${e.termos}</p>` : ''}
      </fieldset>
      <button class="btn btn-primary btn-lg btn-block">Criar conta</button>
    </form>`) });
}

export function conta({ user, v, e = {}, error, req, avaliacoes }) {
  return layout({ user, active: 'conta', body: page(html`
    <h1>${user.role === 'prestador' ? 'Seu perfil' : 'Sua conta'}</h1>${flash(req)}${alert('error', error)}
    ${user.role === 'prestador' ? html`<p><a href="/prestadores/${user.id}">Ver meu perfil como os clientes veem</a> · ${stars(avaliacoes.avg, avaliacoes.n)}</p>` : ''}
    <form method="post" action="/conta" class="stack" data-once novalidate>
      <input type="hidden" name="tipo" value="${user.role}">
      ${perfilFields(v, e, user.role)}
      <button class="btn btn-primary btn-lg">Salvar</button>
    </form>
    <form method="post" action="/conta/senha" class="card" style="margin-top:20px" data-once>
      <h2 class="h3">Trocar senha</h2>
      <div class="grid2">${field({ name: 'atual', label: 'Senha atual', type: 'password', attrs: 'autocomplete="current-password"' })}${field({ name: 'nova', label: 'Nova senha', type: 'password', attrs: 'autocomplete="new-password" minlength="8"' })}</div>
      <button class="btn btn-outline" style="margin-top:12px">Trocar senha</button>
    </form>`) });
}

// ====================================================================
// Empresa
// ====================================================================
export function painelEmpresa({ user, req, pedidos }) {
  return layout({ user, active: 'painel', body: page(html`
    <div class="row-between"><h1>Meus pedidos</h1><a class="btn btn-primary" href="/pedidos/novo">Novo pedido</a></div>${flash(req)}
    ${pedidos.length ? html`<ul class="cards">${pedidos.map((p) => html`<li><a class="rcard" href="/pedidos/${p.id}">
      ${p.thumb ? html`<img src="${fileUrl(p.thumb)}" alt="" loading="lazy">` : html`<span class="rcard-ph" aria-hidden="true">${p.id.slice(-2)}</span>`}
      <span class="rcard-main"><strong>${p.titulo}</strong><span class="muted small">${p.id} · ${p.cidade}/${p.uf} · ${formatDate(p.created_at)}</span>
        <span class="rcard-meta">${reqBadge(p.status)} <span class="small">${p.n_prop} proposta(s)</span>${p.unread ? html` <span class="count">${p.unread} nova(s) mensagem(ns)</span>` : ''}</span></span></a></li>`)}</ul>`
      : html`<div class="card center empty"><h2 class="h3">Você ainda não publicou nenhum pedido</h2><p>Conte o que precisa e receba propostas de prestadores da sua região.</p><a class="btn btn-primary" href="/pedidos/novo">Publicar meu primeiro pedido</a></div>`}`, 'mid') });
}

export function novoPedido({ user, idem, simulacao }) {
  return layout({ user, active: 'novo', body: page(html`
    <a class="back" href="/painel">← Meus pedidos</a><h1>Novo pedido</h1>
    <p class="lead">Quanto mais detalhes e fotos, mais precisas as propostas.</p>
    <form method="post" action="/pedidos" enctype="multipart/form-data" class="stack" data-upload-form novalidate>
      <input type="hidden" name="idem" value="${idem}">
      <div data-form-error></div>
      <fieldset class="card"><legend>O que você precisa</legend>
        ${field({ name: 'titulo', label: 'Título do pedido', attrs: 'maxlength="100" placeholder="Ex.: Placa em ACM com letra caixa para padaria"' })}
        <p class="label" style="margin:4px 0 0">Tipo de serviço</p>
        ${chips({ name: 'categorias', options: CATEGORIAS, group: 'categorias' })}
        ${field({ name: 'descricao', label: 'Descreva o que você imagina', type: 'textarea', attrs: 'maxlength="4000" rows="5" placeholder="Material, cores, iluminação, o que deve ser mantido, se precisa retirar a placa antiga…"' })}
        ${field({ name: 'medidas', label: 'Medidas aproximadas', required: false, attrs: 'maxlength="200" placeholder="Ex.: fachada de 6 m de largura; placa de 5 × 1 m"' })}
      </fieldset>
      <fieldset class="card"><legend>Onde</legend>
        <div class="radio-list">${Object.entries(SITUACAO).map(([k, v], i) => html`<label><input type="radio" name="situacao" value="${k}" ${i === 0 ? raw('checked') : ''}><span>${v}</span></label>`)}</div>
        <div class="grid2">${field({ name: 'cidade', label: 'Cidade', value: user.cidade, attrs: 'maxlength="80"' })}${select({ name: 'uf', label: 'UF', options: UFS, value: user.uf, placeholder: '--' })}</div>
        ${field({ name: 'bairro', label: 'Bairro', required: false, attrs: 'maxlength="80"', hint: 'O endereço completo só é passado ao prestador contratado.' })}
      </fieldset>
      <fieldset class="card"><legend>Orçamento e prazo</legend>
        <div class="grid2">${select({ name: 'orcamento', label: 'Quanto pretende investir', options: ORCAMENTO })}${select({ name: 'prazo', label: 'Para quando', options: PRAZO })}</div>
      </fieldset>
      <fieldset class="card"><legend>Fotos e arquivos</legend>
        <div class="tips small"><strong>Foto do local:</strong> de frente, de dia, mostrando a fachada inteira. Ajuda o prestador a medir e orçar.</div>
        ${fileSlot({ name: 'fotos', label: 'Fotos do local', hint: 'Até 4 fotos, 15 MB cada', maxMb: 15, multiple: 4 })}
        ${fileSlot({ name: 'logo', label: 'Logo', hint: 'PNG, JPG, SVG ou PDF', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,application/pdf' })}
        ${fileSlot({ name: 'referencias', label: 'Referências que você gosta', hint: 'Até 3 imagens', multiple: 3 })}
        <div data-simulacao-slot ${simulacao ? '' : raw('hidden')}>
          <p class="label">Sua simulação<span class="opt">do simulador</span></p>
          <div class="sim-attach"><img data-sim-img alt="Simulação feita no simulador"><div><p class="small" style="margin:0 0 8px">Ela vai junto com o pedido.</p><button type="button" class="btn btn-sm btn-ghost" data-sim-remove>Não enviar</button></div></div>
          <input type="file" name="simulacao" accept="image/jpeg,image/png" hidden data-sim-input>
        </div>
        <p class="small muted" data-sim-hint>Quer mostrar a ideia da placa? <a href="/criar?voltar=pedido">Monte uma simulação</a> e ela volta anexada aqui.</p>
      </fieldset>
      <div class="card">
        <label class="consent"><input type="checkbox" name="aceite" value="1" required><span>Confirmo que as informações são verdadeiras e autorizo que prestadores cadastrados vejam este pedido, as fotos e a minha cidade. Meu nome, WhatsApp e e-mail só são liberados ao prestador que eu contratar.</span></label>
        <div class="upload-progress" data-progress hidden><div class="upload-bar"><span data-progress-bar></span></div><p class="small muted" data-progress-text>Enviando…</p></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Publicar pedido</button>
      </div>
    </form>`) });
}

function reqInfo(r, files, { showOwner = false, owner = null } = {}) {
  const fotos = files.filter((f) => f.role === 'foto' || f.role === 'simulacao' || f.role === 'referencia' || f.role === 'logo');
  const label = { foto: 'Foto do local', simulacao: 'Simulação', referencia: 'Referência', logo: 'Logo' };
  return html`<section class="card">
    <div class="row-between"><h2 class="h3" style="margin:0">Detalhes do pedido</h2>${catTags(r.categorias)}</div>
    <dl class="dl" style="margin-top:12px">
      ${showOwner && owner ? html`<dt>Empresa</dt><dd>${nomeDe(owner)}</dd>` : ''}
      <dt>Local</dt><dd>${r.bairro ? r.bairro + ', ' : ''}${r.cidade}/${r.uf}</dd>
      <dt>Situação</dt><dd>${SITUACAO[r.situacao]}</dd>
      <dt>Orçamento</dt><dd>${ORCAMENTO[r.orcamento] || '—'}</dd>
      <dt>Prazo</dt><dd>${PRAZO[r.prazo] || '—'}</dd>
      ${r.medidas ? html`<dt>Medidas</dt><dd>${r.medidas}</dd>` : ''}
      <dt>Descrição</dt><dd class="pre">${r.descricao}</dd>
      <dt>Publicado</dt><dd>${formatDate(r.created_at)}</dd>
    </dl>
    ${fotos.length ? html`<div class="gallery">${fotos.map((f) => html`<figure><a href="${fileUrl(f)}" target="_blank" rel="noopener">${f.mime === 'application/pdf' ? html`<span class="file-icon">PDF</span>` : html`<img src="${fileUrl(f)}" alt="${label[f.role]}" loading="lazy">`}</a><figcaption>${label[f.role]}</figcaption></figure>`)}</div>` : ''}
  </section>`;
}

function propCard(p, { forEmpresa, reqStatus, unread = 0 }) {
  return html`<article class="pcard ${p.status === 'aceita' ? 'is-on' : ''}">
    <div class="row-between"><div><h3 style="margin:0">${forEmpresa ? html`<a href="/prestadores/${p.prestador_id}">${p.p_nome}</a>` : 'Sua proposta'}</h3>
      ${forEmpresa ? html`<div class="small">${stars(p.avg || 0, p.n_rev)} · ${p.p_cidade}/${p.p_uf}</div>` : ''}</div>${propBadge(p.status)}</div>
    <div class="pnums"><div><span class="small muted">Valor</span><strong>${formatBRL(p.valor_cents)}</strong></div><div><span class="small muted">Prazo</span><strong>${dias(p.prazo_dias)}</strong></div><div><span class="small muted">Validade</span><strong>${dias(p.validade_dias)}</strong></div></div>
    <dl class="dl"><dt>Inclui</dt><dd class="pre">${p.inclui}</dd><dt>Pagamento</dt><dd class="pre">${p.pagamento}</dd>${p.garantia ? html`<dt>Garantia</dt><dd>${p.garantia}</dd>` : ''}</dl>
    <div class="row" style="margin-top:12px">
      <a class="btn btn-outline btn-sm" href="/propostas/${p.id}/conversa">Conversar${unread ? html` <span class="count">${unread}</span>` : ''}</a>
      ${forEmpresa && reqStatus === 'aberto' && p.status === 'enviada' ? html`<a class="btn btn-primary btn-sm" href="/propostas/${p.id}/contrato">Aceitar e ver contrato</a>` : ''}
    </div>
    <p class="small muted" style="margin:10px 0 0">Enviada em ${formatDate(p.created_at)}${p.updated_at !== p.created_at ? ` · atualizada em ${formatDate(p.updated_at)}` : ''}</p>
  </article>`;
}

export function pedidoEmpresa({ user, req, r, files, props, contract, unread }) {
  const ativas = props.filter((p) => p.status !== 'retirada');
  return layout({ user, active: 'painel', body: page(html`
    <a class="back" href="/painel">← Meus pedidos</a>
    <p class="eyebrow">${r.id}</p><h1>${r.titulo}</h1><p>${reqBadge(r.status)}</p>${flash(req)}
    ${contract ? html`<div class="card card-attn"><h2 class="h3">Contrato ${contract.id}</h2><p>${ctBadge(contract.status)} com ${contract.p_nome}.</p><a class="btn btn-primary" href="/contratos/${contract.id}">Abrir contrato</a></div>` : ''}
    <div class="detail-grid"><div class="stack">
      <section><h2>Propostas (${ativas.length})</h2>
        ${ativas.length ? html`<div class="stack">${ativas.sort((a, b) => a.valor_cents - b.valor_cents).map((p) => propCard(p, { forEmpresa: true, reqStatus: r.status, unread: unread[p.id] || 0 }))}</div>`
          : html`<div class="card empty"><p style="margin:0">${r.status === 'aberto' ? 'Ainda não chegaram propostas. Os prestadores da sua região já podem ver o seu pedido.' : 'Nenhuma proposta.'}</p></div>`}
      </section>
    </div><aside class="stack">
      ${reqInfo(r, files)}
      ${r.status === 'aberto' ? html`<form method="post" action="/pedidos/${r.id}/cancelar" data-confirm="Cancelar este pedido? Os prestadores não poderão mais enviar propostas."><button class="btn btn-ghost danger btn-block">Cancelar pedido</button></form>` : ''}
    </aside></div>`, 'wide') });
}

// ====================================================================
// Prestador
// ====================================================================
export function oportunidades({ user, req, list, f }) {
  return layout({ user, active: 'oport', body: page(html`
    <h1>Oportunidades</h1>${flash(req)}
    <form method="get" action="/oportunidades" class="filters-form card">
      <div class="grid3">${select({ name: 'uf', label: 'Estado', options: UFS, value: f.uf, required: false, placeholder: 'Todos' })}
        ${field({ name: 'cidade', label: 'Cidade', value: f.cidade, required: false, attrs: 'maxlength="80"' })}
        ${select({ name: 'cat', label: 'Serviço', options: CATEGORIAS, value: f.cat, required: false, placeholder: 'Todos' })}</div>
      <div class="row"><button class="btn btn-primary btn-sm">Filtrar</button><a class="btn btn-ghost btn-sm" href="/oportunidades?todos=1">Ver todos</a></div>
    </form>
    ${list.length ? html`<ul class="cards">${list.map((r) => html`<li><a class="rcard" href="/oportunidades/${r.id}">
      ${r.thumb ? html`<img src="${fileUrl(r.thumb)}" alt="" loading="lazy">` : html`<span class="rcard-ph" aria-hidden="true">${r.uf}</span>`}
      <span class="rcard-main"><strong>${r.titulo}</strong><span class="muted small">${r.cidade}/${r.uf} · ${ORCAMENTO[r.orcamento]} · ${PRAZO[r.prazo]}</span>
      <span class="rcard-meta">${catTags(r.categorias)} <span class="small muted">${r.n_prop} proposta(s)</span>${r.minha ? html` ${propBadge(r.minha)}` : ''}</span></span></a></li>`)}</ul>`
      : html`<div class="card empty"><p style="margin:0">Nenhum pedido aberto com esses filtros. ${f.uf || f.cidade || f.cat ? html`<a href="/oportunidades?todos=1">Ver todos os pedidos</a>.` : ''}</p></div>`}`, 'mid') });
}

export function oportunidade({ user, req, r, files, owner, mine, idem, error, v = {} }) {
  const p = mine && mine.status !== 'retirada' ? mine : null;
  const val = (k, d = '') => v[k] ?? (p ? p[k] : d);
  const open = r.status === 'aberto';
  return layout({ user, active: 'oport', body: page(html`
    <a class="back" href="/oportunidades">← Oportunidades</a>
    <p class="eyebrow">${r.id}</p><h1>${r.titulo}</h1><p>${reqBadge(r.status)}</p>${flash(req)}${alert('error', error)}
    <div class="detail-grid"><div class="stack">
      ${reqInfo(r, files, { showOwner: true, owner })}
    </div><aside class="stack">
      ${p && (p.status === 'aceita' || p.status === 'recusada') ? propCard(p, { forEmpresa: false }) : ''}
      ${open ? html`<form method="post" action="/oportunidades/${r.id}/proposta" class="card" data-once novalidate>
        <h2 class="h3">${p ? 'Editar sua proposta' : 'Enviar proposta'}</h2>
        <input type="hidden" name="idem" value="${idem}">
        <div class="grid2">${field({ name: 'valor', label: 'Valor total (R$)', value: v.valor ?? (p ? (p.valor_cents / 100).toFixed(2).replace('.', ',') : ''), attrs: 'inputmode="decimal" placeholder="Ex.: 2.450,00"' })}
          ${field({ name: 'prazo_dias', label: 'Prazo (dias)', type: 'number', value: val('prazo_dias'), attrs: 'min="1" max="365" inputmode="numeric"' })}</div>
        ${field({ name: 'inclui', label: 'O que está incluído', type: 'textarea', value: val('inclui'), attrs: 'maxlength="3000" rows="5" placeholder="Material, medidas, iluminação, arte, instalação, retirada da placa antiga, transporte…"' })}
        ${field({ name: 'pagamento', label: 'Condições de pagamento', type: 'textarea', value: val('pagamento'), attrs: 'maxlength="600" rows="2" placeholder="Ex.: 50% na aprovação da arte e 50% na instalação, via Pix."' })}
        <div class="grid2">${field({ name: 'garantia', label: 'Garantia', value: val('garantia'), required: false, attrs: 'maxlength="200" placeholder="Ex.: 12 meses na estrutura e iluminação"' })}
          ${field({ name: 'validade_dias', label: 'Validade da proposta (dias)', type: 'number', value: val('validade_dias', 15), attrs: 'min="1" max="90"' })}</div>
        <button class="btn btn-primary btn-lg btn-block">${p ? 'Salvar alterações' : 'Enviar proposta'}</button>
        ${p ? html`<a class="btn btn-outline btn-block" style="margin-top:10px" href="/propostas/${p.id}/conversa">Conversar com a empresa</a>` : ''}
      </form>
      ${p ? html`<form method="post" action="/propostas/${p.id}/retirar" data-confirm="Retirar sua proposta deste pedido?"><button class="btn btn-ghost danger btn-block">Retirar proposta</button></form>` : ''}`
      : !p ? html`<div class="card"><p style="margin:0">Este pedido não está mais recebendo propostas.</p></div>` : ''}
    </aside></div>`, 'wide') });
}

export function painelPrestador({ user, req, props, contratos }) {
  const pend = contratos.filter((c) => c.status === 'aguardando_prestador');
  return layout({ user, active: 'painel', body: page(html`
    <div class="row-between"><h1>Minhas propostas</h1><a class="btn btn-primary" href="/oportunidades">Ver oportunidades</a></div>${flash(req)}
    ${pend.map((c) => html`<div class="card card-attn"><h2 class="h3">Contrato para assinar</h2><p>${c.e_nome} aceitou a sua proposta para “${c.titulo}”, no valor de ${formatBRL(c.valor_cents)}.</p><a class="btn btn-primary" href="/contratos/${c.id}">Ler e assinar o contrato</a></div>`)}
    ${contratos.filter((c) => c.status !== 'aguardando_prestador').length ? html`<h2>Contratos</h2><ul class="cards">${contratos.filter((c) => c.status !== 'aguardando_prestador').map((c) => html`<li><a class="rcard" href="/contratos/${c.id}"><span class="rcard-ph">CT</span><span class="rcard-main"><strong>${c.titulo}</strong><span class="muted small">${c.id} · ${c.e_nome} · ${formatBRL(c.valor_cents)}</span><span class="rcard-meta">${ctBadge(c.status)}</span></span></a></li>`)}</ul>` : ''}
    <h2>Propostas enviadas</h2>
    ${props.length ? html`<ul class="cards">${props.map((p) => html`<li><a class="rcard" href="/oportunidades/${p.request_id}"><span class="rcard-ph">${p.uf}</span><span class="rcard-main"><strong>${p.titulo}</strong><span class="muted small">${p.cidade}/${p.uf} · ${formatBRL(p.valor_cents)} · ${dias(p.prazo_dias)}</span><span class="rcard-meta">${propBadge(p.status)} ${reqBadge(p.r_status)}${p.unread ? html` <span class="count">${p.unread} nova(s) mensagem(ns)</span>` : ''}</span></span></a></li>`)}</ul>`
      : html`<div class="card empty"><p>Você ainda não enviou propostas.</p><a class="btn btn-primary" href="/oportunidades">Ver pedidos abertos</a></div>`}`, 'mid') });
}

export function perfilPrestador({ user, p, rev, reviews, feitos }) {
  return layout({ user, body: page(html`
    <p class="eyebrow">Prestador</p><h1>${nomeDe(p)}</h1>
    <p>${stars(rev.avg || 0, rev.n)} · ${p.cidade}/${p.uf}${p.atende_estado ? ` · atende todo o estado (${p.uf})` : ''} · ${feitos} serviço(s) concluído(s) pela plataforma</p>
    <div class="card">${catTags(p.categorias)}${p.bio ? html`<p class="pre" style="margin-top:12px">${p.bio}</p>` : ''}${p.site ? html`<p class="small" style="margin:0"><a href="${/^https?:\/\//.test(p.site) ? p.site : 'https://' + p.site}" target="_blank" rel="noopener nofollow">${p.site}</a></p>` : ''}
      <p class="small muted" style="margin:8px 0 0">${DOC_TIPO[p.doc_tipo]} · na plataforma desde ${formatDate(p.created_at).split(' ')[0]}</p></div>
    <h2>Avaliações</h2>
    ${reviews.length ? html`<div class="stack">${reviews.map((r) => html`<div class="card"><p style="margin:0 0 6px">${stars(r.nota, 1)}</p>${r.comentario ? html`<p class="pre" style="margin:0 0 6px">${r.comentario}</p>` : ''}<p class="small muted" style="margin:0">${r.e_nome} · ${formatDate(r.created_at)}</p></div>`)}</div>`
      : html`<p class="muted">Ainda sem avaliações.</p>`}`) });
}

// ====================================================================
// Conversa e contrato (empresa e prestador)
// ====================================================================
export function conversa({ user, p, r, msgs, other, idem }) {
  const back = user.role === 'empresa' ? `/pedidos/${r.id}` : `/oportunidades/${r.id}`;
  return layout({ user, active: 'painel', body: page(html`
    <a class="back" href="${back}">← ${r.titulo}</a>
    <h1>Conversa com ${other}</h1>
    <p class="small muted">Proposta ${p.id} · ${formatBRL(p.valor_cents)} · ${dias(p.prazo_dias)} · ${propBadge(p.status)}</p>
    <div class="alert alert-info small">Não compartilhe senhas nem pague antes de ter o contrato assinado pelas duas partes.</div>
    <ol class="chat" aria-live="polite">${msgs.length ? msgs.map((m) => html`<li class="${m.author_id === user.id ? 'me' : ''}"><p class="pre">${m.body}</p><span class="small muted">${m.author_id === user.id ? 'Você' : m.a_nome} · ${formatDate(m.created_at)}</span></li>`) : html`<li class="empty-chat muted">Nenhuma mensagem ainda. Tire dúvidas sobre medidas, materiais e prazos.</li>`}</ol>
    <form method="post" action="/propostas/${p.id}/mensagens" class="card chat-form" data-once>
      <input type="hidden" name="idem" value="${idem}">
      <label class="field" style="margin:0"><span class="label">Mensagem</span><textarea name="body" rows="3" maxlength="2000" required></textarea></label>
      <button class="btn btn-primary" style="margin-top:10px">Enviar</button>
    </form>`) });
}

export function contratoPreview({ user, p, r, texto }) {
  return layout({ user, active: 'painel', body: page(html`
    <a class="back" href="/pedidos/${r.id}">← Voltar às propostas</a>
    <h1>Aceitar a proposta de ${p.p_nome}</h1>
    <p class="lead">Leia o contrato abaixo. Ao aceitar, você assina eletronicamente como CONTRATANTE e ele vai para o prestador assinar. As outras propostas ficam em espera até lá.</p>
    <pre class="contract">${texto}</pre>
    <form method="post" action="/propostas/${p.id}/aceitar" class="card" data-once>
      <label class="consent"><input type="checkbox" name="aceite" value="1" required><span>Li e aceito este contrato. Confirmo que sou ${user.nome}, responsável por ${user.empresa || user.nome}, e que estou assinando eletronicamente.</span></label>
      <button class="btn btn-primary btn-lg btn-block">Aceitar proposta e assinar</button>
    </form>`) });
}

export function contrato({ user, req, c, texto, empresa, prestador, review, canReview }) {
  const isE = user.id === c.empresa_id, isP = user.id === c.prestador_id;
  const contato = (u) => html`<div><strong>${nomeDe(u)}</strong><br>${u.nome} · <a href="mailto:${u.email}">${u.email}</a>${u.whatsapp ? html` · <a href="${waLink(u.whatsapp, `Olá! Sobre o contrato ${c.id} (Fachada em Vista).`)}" target="_blank" rel="noopener">WhatsApp ${formatPhone(u.whatsapp)}</a>` : ''}</div>`;
  return layout({ user, active: 'painel', body: page(html`
    <a class="back" href="${isE ? `/pedidos/${c.request_id}` : '/painel'}">← Voltar</a>
    <p class="eyebrow">Contrato ${c.id}</p><h1>${c.titulo}</h1><p>${ctBadge(c.status)}</p>${flash(req)}
    ${c.status === 'vigente' || c.status === 'concluido' ? html`<section class="card"><h2 class="h3">Contatos</h2><div class="grid2">${isE ? contato(prestador) : contato(empresa)}</div></section>` : ''}
    ${isP && c.status === 'aguardando_prestador' ? html`<div class="card card-attn"><h2 class="h3">${empresa.empresa || empresa.nome} aceitou a sua proposta</h2><p>Leia o contrato e assine para confirmar. O contato da empresa é liberado depois da assinatura.</p>
      <form method="post" action="/contratos/${c.id}/assinar" data-once><label class="consent"><input type="checkbox" name="aceite" value="1" required><span>Li e aceito este contrato. Confirmo que sou ${user.nome}, responsável por ${user.empresa || user.nome}, e que estou assinando eletronicamente.</span></label><button class="btn btn-primary btn-lg btn-block">Assinar contrato</button></form>
      <form method="post" action="/contratos/${c.id}/recusar" data-confirm="Recusar este contrato? A empresa poderá escolher outra proposta." style="margin-top:10px"><button class="btn btn-ghost danger btn-block">Recusar</button></form></div>` : ''}
    ${isE && c.status === 'aguardando_prestador' ? html`<div class="card"><p style="margin:0 0 10px">Aguardando ${prestador.empresa || prestador.nome} assinar.</p><form method="post" action="/contratos/${c.id}/desistir" data-confirm="Desistir deste contrato? O pedido volta a receber propostas."><button class="btn btn-ghost danger">Desistir e escolher outra proposta</button></form></div>` : ''}
    ${isE && c.status === 'vigente' ? html`<form method="post" action="/contratos/${c.id}/concluir" class="card" data-confirm="Confirmar que o serviço foi entregue?"><p style="margin:0 0 10px">Quando o serviço estiver entregue e instalado, marque como concluído.</p><button class="btn btn-primary">Marcar serviço como concluído</button></form>` : ''}
    ${canReview ? html`<form method="post" action="/contratos/${c.id}/avaliar" class="card" data-once><h2 class="h3">Avalie ${prestador.empresa || prestador.nome}</h2>
      <div class="rate" role="radiogroup" aria-label="Nota">${[5, 4, 3, 2, 1].map((n) => html`<label><input type="radio" name="nota" value="${n}" required><span>${n} ★</span></label>`)}</div>
      ${field({ name: 'comentario', label: 'Comentário', type: 'textarea', required: false, attrs: 'maxlength="1000" rows="3" placeholder="Como foi o atendimento, a qualidade e o prazo?"' })}
      <button class="btn btn-primary">Enviar avaliação</button></form>` : ''}
    ${review ? html`<div class="card"><h2 class="h3">Avaliação</h2>${stars(review.nota, 1)}${review.comentario ? html`<p class="pre">${review.comentario}</p>` : ''}</div>` : ''}
    <section class="card"><div class="row-between"><h2 class="h3" style="margin:0">Texto do contrato</h2><button class="btn btn-sm btn-outline" data-print>Imprimir / salvar PDF</button></div>
      <pre class="contract">${texto}</pre>
      <h3 class="h4">Registro das assinaturas</h3>
      <ul class="sig">
        <li><strong>Contratante:</strong> ${c.empresa_aceite_at ? `assinado em ${formatDate(c.empresa_aceite_at)} · IP ${c.empresa_aceite_ip}` : 'pendente'}</li>
        <li><strong>Contratada:</strong> ${c.prestador_aceite_at ? `assinado em ${formatDate(c.prestador_aceite_at)} · IP ${c.prestador_aceite_ip}` : 'pendente'}</li>
        <li class="small muted">Código de verificação do texto (SHA-256): <code>${c.texto_hash}</code></li>
      </ul></section>`) });
}

// ====================================================================
// Administração
// ====================================================================
export function admin({ user, req, users, requests, counts }) {
  return layout({ user, active: 'admin', body: page(html`
    <h1>Administração</h1>${flash(req)}
    <div class="pnums card"><div><span class="small muted">Empresas</span><strong>${counts.empresa}</strong></div><div><span class="small muted">Prestadores</span><strong>${counts.prestador}</strong></div><div><span class="small muted">Pedidos</span><strong>${counts.pedidos}</strong></div><div><span class="small muted">Contratos</span><strong>${counts.contratos}</strong></div></div>
    <h2>Pedidos recentes</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Empresa</th><th>Local</th><th>Status</th><th>Propostas</th></tr></thead><tbody>
      ${requests.map((r) => html`<tr><td><strong>${r.titulo}</strong><br><span class="small muted">${r.id} · ${formatDate(r.created_at)}</span></td><td>${r.e_nome}</td><td>${r.cidade}/${r.uf}</td><td>${reqBadge(r.status)}</td><td>${r.n_prop}</td></tr>`)}
    </tbody></table></div>
    <h2>Contas</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Conta</th><th>Tipo</th><th>Documento</th><th>Local</th><th></th></tr></thead><tbody>
      ${users.map((u) => html`<tr><td><strong>${nomeDe(u)}</strong><br><span class="small muted">${u.nome} · ${u.email}</span></td><td>${u.role}</td><td>${u.documento ? `${docLabel(u.doc_tipo)} ${formatDoc(u.doc_tipo, u.documento)}` : '—'}</td><td>${u.cidade ? `${u.cidade}/${u.uf}` : '—'}</td>
        <td>${u.role !== 'admin' ? html`<form method="post" action="/admin/usuarios/${u.id}/${u.blocked ? 'desbloquear' : 'bloquear'}" ${u.blocked ? '' : raw('data-confirm="Bloquear esta conta? A pessoa não consegue mais entrar."')}><button class="btn btn-sm ${u.blocked ? 'btn-outline' : 'btn-ghost danger'}">${u.blocked ? 'Desbloquear' : 'Bloquear'}</button></form>` : ''}</td></tr>`)}
    </tbody></table></div>`, 'wide') });
}

export function textoPagina({ user, titulo, paragrafos }) {
  return layout({ user, noindex: false, body: page(html`<h1>${titulo}</h1>${paragrafos.map((p) => html`<p>${p}</p>`)}`) });
}

export function erro({ user, status, titulo, texto }) {
  return layout({ user, body: page(html`<div class="card center"><h1>${titulo}</h1><p>${texto}</p><a class="btn btn-outline" href="/">Ir para o início</a></div>`) });
}
