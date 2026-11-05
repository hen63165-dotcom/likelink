// Real purchases and commission (src/lib/growth/earnings.js +
// syncAffiliateEarnings in api/_utils/aliexpressAffiliate.mjs). The owner,
// 2026-11-03: never show a click as a purchase, never show an estimated
// commission as income. Paid, confirmed and settled stay apart; a number the
// store did not send is null, never 0.
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOrders, ordersOf, money, storeMoney, pacificTime, earningsLines, ORDER_STATUSES, EARNINGS_KEY } from "../src/lib/growth/earnings.js";
import { syncAffiliateEarnings } from "../api/_utils/aliexpressAffiliate.mjs";

const resp = (orders, extra = {}) => ({ aliexpress_affiliate_order_list_response: { resp_result: { resp_code: 200, result: { orders: { order: orders }, total_page_no: 1, ...extra } } } });
const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "likelink" };

test("paid and confirmed orders stay apart, a confirmed order is not counted again, and an unknown number stays unknown", () => {
  const paid = [
    { sub_order_id: "1", product_id: "100", paid_amount: "10.00", estimated_paid_commission: "0.50", settled_currency: "USD" },
    { sub_order_id: "2", product_id: "100", paid_amount: "4.00" },
    { sub_order_id: "3", product_id: "200", paid_amount: "8.00", estimated_paid_commission: "0.40" },
  ];
  const confirmed = [{ sub_order_id: "3", product_id: "200", paid_amount: "8.00", estimated_finished_commission: "0.40" }];
  const s = summarizeOrders({ paid, confirmed });
  assert.equal(s.confirmed.orders, 1);
  assert.equal(s.paid.orders, 2, "order 3 is confirmed, not paid twice");
  assert.equal(s.paid.estimatedCommission, 0.5, "the order without a commission adds nothing, it is not guessed");
  assert.equal(s.paid.paidAmount, 14);
  assert.equal(s.confirmed.settledCommission, null, "no settled amount was sent: unknown, not 0");
  assert.equal(s.items["100"].orders, 2);
  assert.deepEqual(summarizeOrders({}).paid, { orders: 0, paidAmount: null, estimatedCommission: null, settledCommission: null, currency: null });
  assert.equal(money(""), null);
  assert.equal(money("1.5 USD"), 1.5);
});

test("the store's whole-cent amounts become currency units; a decimal value is kept", () => {
  // The first live sync (2026-11-05): 8 paid toy orders came back as 6100 paid
  // and a single squishy toy's commission as 47, i.e. $61.00 and $0.47.
  assert.equal(storeMoney("6100"), 61);
  assert.equal(storeMoney(47), 0.47);
  assert.equal(storeMoney("10.00"), 10);
  assert.equal(storeMoney("1.5 USD"), 1.5);
  assert.equal(storeMoney(""), null);
  const s = summarizeOrders({ paid: [
    { sub_order_id: "a", product_id: "1", paid_amount: "760", estimated_paid_commission: "47", settled_currency: "USD" },
    { sub_order_id: "b", product_id: "1", paid_amount: "690", estimated_paid_commission: "44" },
  ] });
  assert.equal(s.amounts, "units");
  assert.equal(s.paid.paidAmount, 14.5);
  assert.equal(s.paid.estimatedCommission, 0.91);
  assert.equal(s.items["1"].estimatedCommission, 0.91);
});

test("the report calls an estimate an estimate and never income", () => {
  const lines = earningsLines({ state: "OK", ...summarizeOrders({ paid: [{ sub_order_id: "1", estimated_paid_commission: "0.5", settled_currency: "USD" }] }) });
  assert.match(lines[0], /משוערת/);
  assert.match(lines[2], /ששולמה בפועל: לא ידוע/);
  assert.ok(!lines.join(" ").match(/הכנסה|רווח/));
  assert.match(earningsLines(null)[0], /אין עדיין/);
  assert.match(earningsLines({ state: "PROVIDER_ERROR", error: "x" })[0], /לא נקראו/);
});

test("a refused call is a reason, never an empty success", () => {
  assert.deepEqual(ordersOf({}).error, "no_resp_result");
  assert.match(ordersOf({ aliexpress_affiliate_order_list_response: { resp_result: { resp_code: 405, resp_msg: "no auth" } } }).error, /^resp_405/);
  assert.equal(ordersOf(resp([{ sub_order_id: "1" }])).orders.length, 1);
  assert.match(pacificTime(Date.UTC(2026, 10, 3, 12, 0, 0)), /^2026-11-03 0[45]:00:00$/, "Pacific time, the API's own window");
});

test("the sync reads both statuses over the window, writes one server-only record, and never runs without the owner's keys", async () => {
  const calls = [];
  const store = new Map();
  const kvGet = async (k, d) => (store.has(k) ? store.get(k) : d);
  const kvSet = async (k, v) => { store.set(k, v); };
  const fetchImpl = async (url, init) => {
    const body = new URLSearchParams(init.body);
    calls.push(Object.fromEntries(body));
    const status = body.get("status");
    return { ok: true, status: 200, json: async () => resp(status === ORDER_STATUSES.PAID ? [{ sub_order_id: "9", product_id: "5", estimated_paid_commission: "0.3" }] : []) };
  };
  const none = await syncAffiliateEarnings({ kvGet, kvSet, env: {}, fetchImpl });
  assert.equal(none.outcome, "REQUIRES_CONNECTION");
  assert.equal(calls.length, 0);
  const now = Date.UTC(2026, 10, 3, 21, 0, 0);
  const r = await syncAffiliateEarnings({ kvGet, kvSet, env: ENV, fetchImpl, now });
  assert.equal(r.outcome, "OK");
  assert.deepEqual(calls.map((c) => c.status), [ORDER_STATUSES.PAID, ORDER_STATUSES.CONFIRMED]);
  assert.ok(calls.every((c) => c.method === "aliexpress.affiliate.order.list" && c.start_time && c.end_time && c.fields.includes("estimated_paid_commission")));
  const rec = store.get(EARNINGS_KEY);
  assert.equal(rec.paid.orders, 1);
  assert.equal(rec.paid.estimatedCommission, 0.3);
  assert.equal(rec.state, "OK");
  const again = await syncAffiliateEarnings({ kvGet, kvSet, env: ENV, fetchImpl, now: now + 3_600_000 });
  assert.equal(again.outcome, "NOT_DUE", "at most every 12 hours");
  const { amounts, ...beforeFix } = store.get(EARNINGS_KEY);
  assert.equal(amounts, "units");
  store.set(EARNINGS_KEY, beforeFix);
  const reread = await syncAffiliateEarnings({ kvGet, kvSet, env: ENV, fetchImpl, now: now + 3_600_000 });
  assert.equal(reread.outcome, "OK", "a record from before the cents fix is read again at once");
  const refused = await syncAffiliateEarnings({ kvGet: async () => null, kvSet, env: ENV, now, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ error_response: { code: "InsufficientPermission", msg: "no" } }) }) });
  assert.equal(refused.outcome, "PROVIDER_ERROR");
  assert.equal(store.get(EARNINGS_KEY).state, "PROVIDER_ERROR");
  assert.equal(store.get(EARNINGS_KEY).paid.orders, 0);
});
