// Integração de pagamento com checkout externo configurável.
//   demo        → checkout simulado (modo demonstração, nada é cobrado)
//   link        → link de pagamento fixo do provedor (ex.: link Pix/cartão); confirmação manual no painel
//   mercadopago → Checkout Pro (Pix + cartão), confirmação automática via webhook
import { get, run, tx, logEvent, getSettings } from './db.js';
import { nowIso, randomId, UserError } from './util.js';
import crypto from 'node:crypto';

const MP_API = 'https://api.mercadopago.com';

export function providerName(p = getSettings().payment_provider) {
  return { demo: 'Checkout de demonstração', link: 'Link de pagamento (confirmação manual)', mercadopago: 'Mercado Pago (Pix e cartão)' }[p] || p;
}

function refRow(refType, refId) {
  return refType === 'order' ? get('SELECT * FROM orders WHERE id = ?', refId) : get('SELECT * FROM packages WHERE id = ?', refId);
}
const table = (refType) => (refType === 'order' ? 'orders' : 'packages');

/**
 * Abre (ou reaproveita) o checkout de um pedido/pacote já salvo.
 * Chamadas repetidas devolvem o mesmo checkout — nunca geram cobrança duplicada.
 */
export async function getOrCreateCheckout({ refType, refId, baseUrl, accessToken }) {
  const row = refRow(refType, refId);
  if (!row) throw new UserError('Pedido não encontrado.', 404);
  if (row.status !== 'aguardando_pagamento') throw new UserError('Este pedido já foi pago.', 409);
  const s = getSettings();
  const provider = s.payment_provider;
  if (row.checkout_url && row.checkout_provider === provider) return row.checkout_url;

  const title = refType === 'order' ? `Simulação de fachada ${refId}` : `Pacote 5 simulações ${refId}`;
  const amount = row.price_cents;
  const returnUrl = `${baseUrl}/pagamento/retorno?ref=${encodeURIComponent(refId)}&t=${encodeURIComponent(accessToken)}`;
  let url;

  if (provider === 'demo') {
    const id = randomId();
    url = `${baseUrl}/checkout-demo/${id}`;
    run('INSERT INTO checkouts (id, ref_type, ref_id, provider, url, amount_cents, created_at) VALUES (?,?,?,?,?,?,?)', id, refType, refId, 'demo', returnUrl, amount, nowIso());
  } else if (provider === 'link') {
    const tpl = refType === 'order' ? s.payment_link_single : s.payment_link_package;
    if (!tpl || !/^https:\/\//.test(tpl)) throw new UserError('O link de pagamento ainda não foi configurado. Tente novamente mais tarde.', 503);
    url = tpl.replaceAll('{pedido}', encodeURIComponent(refId)).replaceAll('{valor}', (amount / 100).toFixed(2));
  } else if (provider === 'mercadopago') {
    const tokenMp = process.env.MP_ACCESS_TOKEN;
    if (!tokenMp) throw new UserError('Pagamento indisponível: integração não configurada.', 503);
    const body = {
      items: [{ id: refId, title, quantity: 1, unit_price: amount / 100, currency_id: 'BRL' }],
      payer: { name: row.name, email: row.email },
      external_reference: `${refType}:${refId}`,
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      auto_return: 'approved',
      notification_url: `${baseUrl}/webhooks/mercadopago`,
      statement_descriptor: 'FACHADAEMVISTA',
    };
    const r = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMp}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `pref-${refId}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error('Mercado Pago preference error', r.status, await r.text().catch(() => ''));
      throw new UserError('Não foi possível abrir o pagamento agora. Tente novamente em instantes.', 502);
    }
    const j = await r.json();
    url = process.env.MP_SANDBOX === '1' ? j.sandbox_init_point || j.init_point : j.init_point;
  } else {
    throw new UserError('Meio de pagamento não configurado.', 503);
  }

  run(`UPDATE ${table(refType)} SET checkout_url = ?, checkout_provider = ?, updated_at = ? WHERE id = ?`, url, provider, nowIso(), refId);
  logEvent(refId, 'sistema', `Checkout aberto (${providerName(provider)}).`);
  return url;
}

/**
 * Confirma um pagamento de forma idempotente.
 * O mesmo pagamento (provedor + id) só é registrado uma vez; o pedido só muda de status uma vez.
 */
export function confirmPayment({ refType, refId, provider, providerPaymentId, amountCents = null, method = null, note = null, actor = 'sistema' }) {
  return tx(() => {
    const row = refRow(refType, refId);
    if (!row) throw new UserError('Pedido não encontrado.', 404);
    if (amountCents != null && amountCents < row.price_cents) {
      logEvent(refId, actor, `Pagamento ${providerPaymentId} ignorado: valor ${amountCents / 100} menor que o esperado.`);
      return { ok: false, reason: 'valor' };
    }
    const ins = run(
      `INSERT INTO payments (ref_type, ref_id, provider, provider_payment_id, status, amount_cents, method, note, actor, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider, provider_payment_id) DO NOTHING`,
      refType, refId, provider, String(providerPaymentId), 'aprovado', amountCents ?? row.price_cents, method, note, actor, nowIso(),
    );
    if (row.status !== 'aguardando_pagamento') return { ok: true, already: true };
    const next = refType === 'order' ? 'em_producao' : 'pago';
    const upd = run(
      `UPDATE ${table(refType)} SET status = ?, paid_at = ?, payment_method = ?, payment_note = ?, updated_at = ? WHERE id = ? AND status = 'aguardando_pagamento'`,
      next, nowIso(), method || provider, note, nowIso(), refId,
    );
    if (upd.changes === 1) {
      logEvent(refId, actor, provider === 'manual' ? `Pagamento registrado manualmente${method ? ` (${method})` : ''}${note ? `: ${note}` : ''}.` : `Pagamento confirmado pelo provedor (${provider} #${providerPaymentId}).`);
      if (refType === 'package') logEvent(refId, 'sistema', `${row.credits_total} créditos liberados.`);
    }
    return { ok: true, already: ins.changes === 0 && upd.changes === 0 };
  });
}

// ---------- Mercado Pago ----------
export function verifyMpSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo: a segurança vem da consulta ao pagamento na API
  const sig = String(req.get('x-signature') || '');
  const reqId = String(req.get('x-request-id') || '');
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')));
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
  const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
  const h = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return parts.v1 && h.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(parts.v1));
}

function applyMpPayment(p) {
  if (p.status !== 'approved') return { ok: false, reason: p.status };
  const [refType, refId] = String(p.external_reference || '').split(':');
  if (!['order', 'package'].includes(refType) || !refId) return { ok: false, reason: 'referencia' };
  return confirmPayment({
    refType, refId, provider: 'mercadopago', providerPaymentId: p.id,
    amountCents: Math.round(Number(p.transaction_amount) * 100),
    method: p.payment_type_id === 'bank_transfer' ? 'Pix' : p.payment_type_id === 'credit_card' ? 'Cartão de crédito' : p.payment_type_id,
  });
}

export async function handleMpNotification(paymentId) {
  const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
  if (!r.ok) throw new Error(`MP payment fetch ${r.status}`);
  return applyMpPayment(await r.json());
}

const lastCheck = new Map();
/** Consulta ativa ao provedor (caso o webhook demore). Nunca confia nos parâmetros de retorno. */
export async function pollProvider(refType, refId) {
  if (getSettings().payment_provider !== 'mercadopago' || !process.env.MP_ACCESS_TOKEN) return;
  const k = `${refType}:${refId}`;
  if (Date.now() - (lastCheck.get(k) || 0) < 10000) return;
  lastCheck.set(k, Date.now());
  try {
    const r = await fetch(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(k)}&sort=date_created&criteria=desc`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    if (!r.ok) return;
    const j = await r.json();
    for (const p of j.results || []) if (p.status === 'approved') return applyMpPayment(p);
  } catch (e) {
    console.error('MP poll', e.message);
  }
}
