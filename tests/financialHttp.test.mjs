import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFinancialHandler } from '../api/_utils/financialHandler.mjs';
import { harness } from './financialCheckout.test.mjs';

test('HTTP checkout and signed callback commit once; forged callback cannot change financial state', async () => {
  // Real gateway/core/handler. Only external rail and database are isolated doubles.
  const h = harness();
  const handler = createFinancialHandler({ core: h.core,
    verify: async token => token === 'http-user' ? { id: 'owner' } : null,
    env: { PAYMENT_PUBLIC_ORIGIN: 'https://example.com' },
  });
  const server = http.createServer((req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    handler(req, res).catch(() => { res.statusCode = 500; res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/store?mode=finance&action=`;
  const post = async (action, body, headers = { authorization: 'Bearer http-user' }) => {
    const response = await fetch(url + action, { method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { code: response.status, data: await response.json() };
  };
  try {
    const input = { planId: 'starter', billingPeriod: 'monthly', idempotencyKey: 'http-checkout-request-123' };
    assert.equal((await post('checkout', input, {})).code, 401);
    assert.equal((await post('checkout', { ...input, amount: 1 })).code, 400);
    const checkout = await post('checkout', input);
    assert.equal(checkout.code, 200);
    const order = checkout.data.order;
    assert.equal(order.amountMinor, 2900);
    assert.equal(order.status, 'AWAITING_PAYMENT');
    assert.equal(h.calls[0].body.amount, 29);
    assert.equal(h.calls[0].body.currency_code, 'ILS');
    assert.equal((await post('checkout', input)).data.order.id, order.id);
    assert.equal(h.calls.length, 1);
    const event = h.event(order), action = `webhook&order=${order.id}`;
    assert.equal((await post(action, event, { 'user-agent': 'PayPlus', hash: 'forged' })).code, 401);
    assert.equal(h.subscriptions.size, 0);
    assert.equal((await post(action, event, h.sign(event))).code, 200);
    const before = await h.store.read();
    assert.equal(before.orders[0].status, 'CAPTURED');
    assert.equal(before.ledger.length, 1);
    assert.equal(before.ledger[0].type, 'CAPTURED');
    assert.equal(h.subscriptions.size, 1);
    const entitlement = structuredClone([...h.subscriptions.values()][0]);
    assert.equal(entitlement.status, 'active');
    // Duplicate delivery is acknowledged; duplicate financial effects are rejected.
    assert.equal((await post(action, event, h.sign(event))).code, 200);
    const after = await h.store.read();
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.ledger, before.ledger);
    assert.deepEqual([...h.subscriptions.values()], [entitlement]);
    assert.equal(h.calls.length, 1);
    assert.equal((await post('get', { orderId: order.id })).data.order.status, 'CAPTURED');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
