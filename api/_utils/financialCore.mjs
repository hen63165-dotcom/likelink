
import { randomUUID } from 'node:crypto';
import { getAllPlans } from '../../src/lib/plans.js';
import { createPaymentGateway } from './paymentGateway.mjs';

export function financialStore({ env = process.env, fetchFn = fetch } = {}) {
  async function rpc(body) {
    if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('PAYMENT_STORAGE_REQUIRED');
    const r = await fetchFn(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/financial_state`, {
      method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw Error(d.message === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'PAYMENT_STORAGE_REQUIRED');
    }
    return r.json();
  }
  return { read: () => rpc({}), write: (version, value, subscription) => rpc({
    p_expected: version, p_value: value, p_subscription: subscription || null,
  }) };
}
export function createFinancialCore({ store = financialStore(), gateway = createPaymentGateway(), now = Date.now } = {}) {
  async function change(update) {
    for (let n = 0; n < 4; n++) {
      const s = await store.read();
      const next = structuredClone(s);
      const subscription = update(next);
      next.version = s.version + 1;
      try { return await store.write(s.version, next, subscription); }
      catch (e) { if (e.message !== 'VERSION_CONFLICT' || n === 3) throw e; }
    }
  }
  const publicOrder = o => ({ id: o.id, planId: o.planId, billingPeriod: o.billingPeriod,
    amountMinor: o.amountMinor, currency: o.currency, status: o.status,
    checkoutUrl: o.status === 'AWAITING_PAYMENT' && o.expiresAt > now() ? o.checkoutUrl : null,
    environment: o.environment, reconciliationRequired: ['CREATING', 'REFUND_PENDING', 'RECONCILIATION_REQUIRED'].includes(o.status) });
  const own = (s, owner, id) => {
    const o = s.orders.find(x => x.id === id && x.owner === owner);
    if (!o) throw Error('ORDER_NOT_FOUND'); return o;
  };
  function subscription(o, status) {
    return { id: `financial_${o.id}`, userId: o.owner, planId: o.planId, billingPeriod: o.billingPeriod,
      status, startedAt: o.capturedAt, expiresAt: o.entitlementExpiresAt,
      createdAt: o.createdAt, autoRenew: false, paymentOrderId: o.id };
  }
  return {
    status: gateway.status,
    async checkout(owner, input, origin) {
      if (!owner || !input || Object.keys(input).some(k => !['planId','billingPeriod','idempotencyKey'].includes(k))) throw Error('INVALID_CHECKOUT');
      const plan = getAllPlans().find(p => p.id === input.planId && p.price > 0);
      if (!plan || !['monthly','yearly'].includes(input.billingPeriod) || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.idempotencyKey || '')) throw Error('INVALID_CHECKOUT');
      if (!gateway.status().configured) throw Error('PAYMENT_PROVIDER_REQUIRED');
      const amountMinor = Math.round((input.billingPeriod === 'yearly' ? plan.priceYearly : plan.price) * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw Error('INVALID_CHECKOUT');
      const id = randomUUID(), stamp = new Date(now()).toISOString();
      let chosen;
      await change(s => {
        const duplicate = s.orders.find(o => o.owner === owner && o.key === input.idempotencyKey);
        if (duplicate) {
          if (duplicate.planId !== input.planId || duplicate.billingPeriod !== input.billingPeriod) throw Error('IDEMPOTENCY_CONFLICT');
          chosen = duplicate; return;
        }
        // One unresolved purchase per owner, even with different client request IDs.
        const pending = s.orders.find(o => o.owner === owner && ['CREATING','AWAITING_PAYMENT','RECONCILIATION_REQUIRED','REFUND_PENDING'].includes(o.status));
        if (pending) { chosen = pending; return; }
        if (s.orders.filter(o => o.owner === owner && Date.parse(o.createdAt) > now()-86400000).length >= 10 || s.orders.length >= 2000) throw Error('PAYMENT_LIMIT');
        chosen = { id, owner, key: input.idempotencyKey, planId: plan.id, billingPeriod: input.billingPeriod,
          amountMinor, currency: 'ILS', status: 'CREATING', createdAt: stamp, updatedAt: stamp,
          environment: gateway.status().environment, expiresAt: now()+1800000, attempt: 1 };
        s.orders.push(chosen);
      });
      if (chosen.id !== id) return publicOrder(chosen);
      // No automatic retry of ambiguous create/refund requests.
      try {
        const intent = await gateway.createPaymentIntent(chosen, origin);
        await change(s => { Object.assign(own(s,owner,id), intent, { status: 'AWAITING_PAYMENT' }); });
      } catch {
        await change(s => { own(s,owner,id).status = 'RECONCILIATION_REQUIRED'; });
        throw Error('PAYMENT_RECONCILIATION_REQUIRED');
      }
      return publicOrder(own(await store.read(),owner,id));
    },
    async get(owner, id) { return publicOrder(own(await store.read(),owner,id)); },
    async list(owner) { return (await store.read()).orders.filter(o => o.owner === owner).slice(-20).reverse().map(publicOrder); },
    async webhook(id, event, headers) {
      gateway.verifySignature(event, headers);
      await change(s => {
        const o = s.orders.find(x => x.id === id);
        if (!o || !o.reference) throw Error('ORDER_NOT_FOUND');
        if (o.environment !== gateway.status().environment) throw Error('FAILED_VERIFICATION');
        const verified = gateway.confirmPayment(o, event);
        if (o.transactionId) {
          if (o.transactionId !== verified.transactionId) throw Error('FAILED_VERIFICATION');
          return; // replay cannot extend access or restore a refunded entitlement
        }
        if (s.orders.some(x => x.transactionId === verified.transactionId)) throw Error('FAILED_VERIFICATION');
        if (o.status !== 'AWAITING_PAYMENT') throw Error('FAILED_VERIFICATION');
        o.transactionId = verified.transactionId;
        o.status = 'CAPTURED'; // never equate capture with bank settlement
        o.capturedAt = new Date(now()).toISOString();
        o.entitlementExpiresAt = new Date(now() + (o.billingPeriod === 'yearly' ? 365 : 30)*86400000).toISOString();
        s.ledger.push({ id: `capture:${verified.transactionId}`, orderId: o.id, type: 'CAPTURED',
          amountMinor: o.amountMinor, currency: o.currency, timestamp: o.capturedAt, environment: o.environment });
        // Sandbox payments exercise the ledger but NEVER grant production access.
        return o.environment === 'live' ? subscription(o, 'active') : undefined;
      });
      return { received: true };
    },
    // Admin authorization is mandatory in handler. Full refund, one durable claim.
    async refund(id) {
      let claimed = false, order;
      await change(s => {
        claimed = false;
        order = s.orders.find(o => o.id === id);
        if (!order) throw Error('ORDER_NOT_FOUND');
        if (['REFUNDED','REFUND_PENDING'].includes(order.status)) return;
        if (order.status !== 'CAPTURED') throw Error('INVALID_REFUND');
        if (order.environment !== gateway.status().environment) throw Error('FAILED_VERIFICATION');
        order.status = 'REFUND_PENDING'; claimed = true;
      });
      if (!claimed) return publicOrder(order);
      let refund;
      try { refund = await gateway.refundPayment(order); }
      catch { throw Error('PAYMENT_RECONCILIATION_REQUIRED'); }
      await change(s => {
        const o = s.orders.find(x => x.id === id);
        if (o.status === 'REFUNDED') return;
        if (o.status !== 'REFUND_PENDING') throw Error('INVALID_REFUND');
        o.status = 'REFUNDED'; o.refundId = refund.refundId;
        s.ledger.push({ id: `refund:${refund.refundId}`, orderId: id, type: 'REFUNDED', amountMinor: -o.amountMinor,
          currency: o.currency, timestamp: new Date(now()).toISOString(), environment: o.environment });
        return o.environment === 'live' ? subscription(o,'cancelled') : undefined;
      });
      return publicOrder((await store.read()).orders.find(o => o.id === id));
    },
  };
}
