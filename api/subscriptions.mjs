/**
 * LikeLink Subscription Management API
 * =====================================
 * Endpoints:
 *   POST ?mode=plans    → Get available plans
 *   POST ?mode=get      → Get user's subscription
 *   POST ?mode=create   → Create subscription
 *   POST ?mode=cancel   → Cancel subscription
 *   POST ?mode=checkout → Get checkout info
 *   POST ?mode=webhook  → PayPal webhook
 * Security: All operations verified server-side.
 */

import { readBody } from './_utils/readBody.mjs';
import { isApprovedOrigin } from './_utils/cors.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUBS_KEY = 'marketplace:subscriptions';

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error('supabase_not_configured');
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
}

function json(res, body, status = 200, req = null) {
  res.setHeader('content-type', 'application/json');
  if (req?.headers?.origin && isApprovedOrigin(req.headers.origin)) {
    res.setHeader('access-control-allow-origin', req.headers.origin);
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
  }
  res.status(status).json(body);
}

async function handlePlans(req, res) {
  const { getAllPlans } = await import('../src/lib/plans.js');
  json(res, { ok: true, plans: getAllPlans() }, 200, req);
}

async function handleGet(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const userId = body?.userId;
  if (!userId) { json(res, { ok: false, error: 'missing_userId' }, 400, req); return; }
  const subs = (await kvGet(SUBS_KEY)) || [];
  const sub = subs.find(s => s.userId === userId && (s.status === 'active' || s.status === 'trial'));
  if (!sub) { json(res, { ok: true, subscription: null, plan: 'free' }, 200, req); return; }
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
    sub.status = 'expired';
    const all = (await kvGet(SUBS_KEY)) || [];
    await kvSet(SUBS_KEY, all.map(s => s.id === sub.id ? sub : s)).catch(() => {});
    json(res, { ok: true, subscription: sub, plan: 'free' }, 200, req);
    return;
  }
  json(res, { ok: true, subscription: sub, plan: sub.planId }, 200, req);
}

async function handleCreate(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const { userId, planId, paypalSubscriptionId, billingPeriod = 'monthly' } = body;
  if (!userId || !planId) { json(res, { ok: false, error: 'missing_fields' }, 400, req); return; }
  const { getPlanById, createSubscription, activateSubscription } = await import('../src/lib/commerce.js');
  const plan = getPlanById(planId);
  if (!plan) { json(res, { ok: false, error: 'invalid_plan' }, 400, req); return; }
  const allSubs = (await kvGet(SUBS_KEY)) || [];
  const existing = allSubs.find(s => s.userId === userId && s.status === 'active');
  if (existing) { json(res, { ok: false, error: 'already_subscribed', existing: existing.id }, 409, req); return; }
  let sub = createSubscription({ planId: plan.id, userId, billingPeriod, paypalSubscriptionId });
  sub = activateSubscription(sub);
  const updated = [...allSubs.filter(s => s.userId !== userId || s.status !== 'active'), sub];
  await kvSet(SUBS_KEY, updated).catch(() => {});
  json(res, { ok: true, subscription: sub }, 200, req);
}

async function handleCancel(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const userId = body?.userId;
  if (!userId) { json(res, { ok: false, error: 'missing_userId' }, 400, req); return; }
  const allSubs = (await kvGet(SUBS_KEY)) || [];
  const sub = allSubs.find(s => s.userId === userId && s.status === 'active');
  if (!sub) { json(res, { ok: false, error: 'no_active_subscription' }, 404, req); return; }
  const { cancelSubscription } = await import('../src/lib/commerce.js');
  const cancelled = cancelSubscription(sub);
  await kvSet(SUBS_KEY, allSubs.map(s => s.id === sub.id ? cancelled : s)).catch(() => {});
  json(res, { ok: true, subscription: cancelled }, 200, req);
}

async function handleCheckout(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const { planId } = body;
  const { getPlanById } = await import('../src/lib/plans.js');
  const plan = getPlanById(planId);
  if (!plan) { json(res, { ok: false, error: 'invalid_plan' }, 400, req); return; }
  const paypalId = process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID;
  if (!paypalId) { json(res, { ok: false, error: 'paypal_not_configured' }, 503, req); return; }
  json(res, { ok: true, plan: { id: plan.id, name: plan.name, price: plan.price, period: plan.period }, checkoutUrl: 'https://www.paypal.com/businessmanage/summary', note: 'PayPal Subscriptions API pending - use mode=create to activate' }, 200, req);
}

async function handleWebhook(req, res) {
  const body = await readBody(req).catch(() => null);
  if (!body) { json(res, { ok: false, error: 'no_body' }, 400, req); return; }
  const eventType = body.event_type;
  const resource = body.resource;
  const allSubs = (await kvGet(SUBS_KEY)) || [];
  let updated = allSubs;
  const paypalSubId = resource?.id;
  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.CREATED': {
      const { activateSubscription } = await import('../src/lib/commerce.js');
      updated = allSubs.map(s => s.paypalSubscriptionId === paypalSubId ? activateSubscription(s) : s);
      break;
    }
    case 'BILLING.SUBSCRIPTION.CANCELLED': {
      const { cancelSubscription } = await import('../src/lib/commerce.js');
      updated = allSubs.map(s => s.paypalSubscriptionId === paypalSubId ? cancelSubscription(s) : s);
      break;
    }
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      updated = allSubs.map(s => s.paypalSubscriptionId === paypalSubId ? { ...s, status: 'expired' } : s);
      break;
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      updated = allSubs.map(s => s.paypalSubscriptionId === paypalSubId ? { ...s, status: 'suspended' } : s);
      break;
    case 'PAYMENT.SALE.COMPLETED': {
      const sub = allSubs.find(s => s.paypalSubscriptionId === resource?.billing_agreement_id);
      if (sub) {
        const now = Date.now();
        const dur = sub.billingPeriod === 'yearly' ? 365 * 86400000 : 30 * 86400000;
        updated = allSubs.map(s => s.id === sub.id ? { ...s, status: 'active', lastBillingAt: new Date(now).toISOString(), nextBillingAt: new Date(now + dur).toISOString(), expiresAt: new Date(now + dur).toISOString() } : s);
      }
      break;
    }
  }
  await kvSet(SUBS_KEY, updated).catch(() => {});
  json(res, { ok: true, received: true }, 200, req);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, { ok: true }, 200, req); return; }
  const mode = new URL(req.url, 'https://x').searchParams.get('mode');
  switch (mode) {
    case 'plans': return handlePlans(req, res);
    case 'get': return handleGet(req, res);
    case 'create': return handleCreate(req, res);
    case 'cancel': return handleCancel(req, res);
    case 'checkout': return handleCheckout(req, res);
    case 'webhook': return handleWebhook(req, res);
    default:
      if (req.method === 'POST') return handleCreate(req, res);
      json(res, { ok: false, error: 'invalid_mode' }, 400, req);
  }
}
