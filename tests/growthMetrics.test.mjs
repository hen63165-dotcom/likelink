// The owner's five numbers (src/lib/growth/metrics.js, GET
// /api/store?mode=growth-engine&op=metrics). The owner, 2026-11-03: "measure
// exposure, visits, clicks, purchases, commission — real data only; never a
// click as a purchase, never an estimate as income". Nothing here is invented:
// no visits → no rate, no order read → no purchases, impressions named as the
// networks' and Search Console's, never a number LikeLink does not have.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { growthMetrics, nextActions } from "../src/lib/growth/metrics.js";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const H = 3_600_000;

test("visits, views and store exits come from the recorded rows only, each in its own window", () => {
  const funnel = [
    { type: "landing", ts: NOW - H, src: "instagram" },
    { type: "landing", ts: NOW - 3 * 24 * H, src: "instagram" },
    { type: "landing", ts: NOW - 20 * 24 * H },
    { type: "landing", ts: NOW - 40 * 24 * H, src: "old" },
    { type: "checkout", ts: NOW - H },
  ];
  const clicks = [
    { type: "view", productId: "a", ts: NOW - H },
    { type: "view", productId: "a", ts: NOW - 2 * H },
    { productId: "a", ts: NOW - H, src: "instagram" },
    { type: "click", productId: "b", ts: NOW - H },
    { productId: "c", ts: NOW - 31 * 24 * H },
  ];
  const m = growthMetrics({ funnel, clicks, products: [{ id: "a", title: "עגילים" }], now: NOW });
  assert.deepEqual(m.visits, { d1: 1, d7: 2, d30: 3 });
  assert.deepEqual(m.sources[0], { key: "instagram", count: 2 });
  assert.ok(m.sources.some((s) => s.key === "direct"), "no source is 'direct', not dropped");
  assert.equal(m.views.d30, 2);
  assert.equal(m.views.top[0].title, "עגילים");
  assert.equal(m.outbound.d30, 2, "a 31-day-old exit is outside the window");
  assert.equal(m.outboundRate, 66.7);
});

test("no visits is no rate, and no order read is no purchase and no commission", () => {
  const m = growthMetrics({ clicks: [{ productId: "a", ts: NOW - H }], now: NOW });
  assert.equal(m.outboundRate, null, "never 0% or a rate of nothing");
  assert.deepEqual(m.purchases, { state: "NOT_READ_YET" });
  assert.deepEqual(m.commission, { state: "NOT_READ_YET" });
  const refused = growthMetrics({ earnings: { state: "PROVIDER_ERROR", paid: { orders: 3 } }, now: NOW });
  assert.deepEqual(refused.purchases, { state: "PROVIDER_ERROR" }, "a refused read never shows orders");
  assert.ok(typeof m.exposure.search === "string" && !/\d/.test(m.exposure.search), "exposure is named, never a number");
});

test("purchases and commission keep paid, confirmed and settled apart; an estimate is never the settled amount", () => {
  const earnings = { state: "OK", checkedAt: NOW, amounts: "units", paid: { orders: 2, estimatedCommission: 0.8, currency: "USD", settledCommission: null }, confirmed: { orders: 1, estimatedCommission: 0.4, settledCommission: null } };
  const m = growthMetrics({ earnings, now: NOW });
  assert.deepEqual(m.purchases, { paid: 2, confirmed: 1, checkedAt: NOW });
  assert.equal(m.commission.estimatedOnPaid, 0.8);
  assert.equal(m.commission.settled, null, "nothing settled is unknown, not the estimate");
  assert.equal(m.commission.currency, "USD");
});

test("a record stored before the cents fix shows its order counts but no amount", () => {
  const earnings = { state: "OK", checkedAt: NOW, paid: { orders: 8, estimatedCommission: 347, currency: "USD", settledCommission: null }, confirmed: { orders: 0, estimatedCommission: null, settledCommission: null } };
  const m = growthMetrics({ earnings, now: NOW });
  assert.deepEqual(m.purchases, { paid: 8, confirmed: 0, checkedAt: NOW });
  assert.deepEqual(m.commission, { state: "RECHECK_PENDING" }, "347 was cents: never shown as 347 dollars");
});

test("the next steps follow the numbers and promise nothing", () => {
  const none = nextActions({ visits: { d7: 0 }, outbound: 0, sources: [], purchases: { state: "NOT_READ_YET" } });
  assert.match(none[0], /אין כניסות/);
  const exits = nextActions({ visits: { d7: 5 }, outbound: 0, sources: [{ key: "instagram", count: 5 }], purchases: { state: "NOT_READ_YET" } });
  assert.ok(exits.some((l) => /instagram/.test(l)) && exits.some((l) => /לחנות/.test(l)));
  for (const l of [...none, ...exits]) assert.ok(!/מובטח|ויראלי|הכנסה|רווח/.test(l), l);
});

test("the metrics route is the owner's only", () => {
  const src = readFileSync(new URL("../api/_utils/marketingEngineHandler.mjs", import.meta.url), "utf8");
  const at = src.indexOf('op === "metrics"');
  assert.ok(at > 0);
  const block = src.slice(at, at + 400);
  assert.match(block, /who\.admin \|\| who\.platformOwner/);
  assert.match(block, /owner_only/);
});
