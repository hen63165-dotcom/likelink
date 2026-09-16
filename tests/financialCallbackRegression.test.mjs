import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './financialCheckout.test.mjs';


test('regression: documented nested Charge callback activates the order exactly once', async () => {
  const h = harness();
  const checkout = await h.checkout();
  assert.equal(checkout.code, 200);
  const order = checkout.body.order;
  // PayPlus Transaction Callback Response uses transaction_type + transaction,
  // NOT top-level type/status/transaction_uid. Do not flatten before HMAC validation.
  const callback = {
    transaction_type: 'Charge',
    transaction: {
      uid: 'documented-transaction-123',
      payment_request_uid: 'request-reference-123',
      type: 'internal_page',
      status_code: '000',
      amount: 29,
      currency: 'ILS',
      more_info: order.id,
    },
  };
  const route = `webhook&order=${order.id}`;
  for (let delivery = 0; delivery < 2; delivery++) {
    const response = await h.request(route, callback, '', h.sign(callback));
    assert.equal(response.code, 200, JSON.stringify(response.body));
    assert.equal(response.body.received, true);
  }
  assert.equal((await h.core.get('owner', order.id)).status, 'CAPTURED');
  assert.equal((await h.store.read()).ledger.length, 1);
  assert.equal(h.subscriptions.size, 1);
  assert.equal([...h.subscriptions.values()][0].status, 'active');
  assert.equal(h.calls.length, 1, 'webhook must not issue another payment request');
});
