// Per-product telemetry (Master Execution Order, item 4): real events only, kept apart from the
// clicks feed (whose readers count every non-view event as an exit), one per session per type in
// the browser, known fields only on the server, null where nothing was measured, orders only from
// the store's own report, and every network metric we cannot read named BLOCKED with what is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyStoreWritePolicy } from "../api/_utils/storeWritePolicy.mjs";
import { productTelemetry, itemIdOf, BLOCKED_METRICS } from "../src/lib/growth/productTelemetry.js";
import { growthMetrics } from "../src/lib/growth/metrics.js";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const ctx = { now: NOW };

test("engagement write policy: known types and fields only, recent only, at most 3 new per write", () => {
  const ev = (i, type, extra = {}) => ({ id: `g${i}`, productId: "ae-1", type, ts: NOW - 1000, ...extra });
  const r = applyStoreWritePolicy("marketplace:engagement", [], [ev(1, "play"), ev(2, "share", { net: "whatsapp", evil: "<x>", src: "instagram" }), ev(3, "like"), ev(4, "save", { ts: NOW - 3 * 86_400_000 })], ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.map((x) => x.type), ["play", "share"], "a 'like' is not ours to record; an old event is refused");
  assert.equal(r.value[1].net, "whatsapp");
  assert.equal(r.value[1].src, "instagram");
  assert.equal(r.value[1].evil, undefined);
  const flood = applyStoreWritePolicy("marketplace:engagement", [], Array.from({ length: 10 }, (_, i) => ev(i, "play")), ctx);
  assert.equal(flood.value.length, 3);
  const bad = applyStoreWritePolicy("marketplace:engagement", [], [{ id: "x", productId: "../etc", type: "play", ts: NOW }], ctx);
  assert.equal(bad.value.length, 0);
});

test("telemetry: real counts per product, null when unmeasured, orders only from the store's report", () => {
  const products = [
    { id: "ae-1005011942976222", title: "עגילים", status: "approved" },
    { id: "p2", title: "צמיד", status: "approved", sourceUrl: "https://www.aliexpress.com/item/1005012588687878.html" },
    { id: "p3", title: "בארכיון", status: "archived" },
  ];
  const clicks = [
    { id: "c1", productId: "ae-1005011942976222", type: "view", ts: NOW - 1000 },
    { id: "c1", productId: "ae-1005011942976222", type: "view", ts: NOW - 1000 },
    { id: "c2", productId: "ae-1005011942976222", ts: NOW - 2000 },
    { id: "c3", productId: "p2", type: "outbound_click", ts: NOW - 40 * 86_400_000 },
    { id: "c4", productId: "p3", type: "view", ts: NOW - 1000 },
  ];
  const engagement = [
    { id: "g1", productId: "ae-1005011942976222", type: "play", ts: NOW - 500 },
    { id: "g2", productId: "ae-1005011942976222", type: "play", ts: NOW - 400 },
    { id: "g3", productId: "ae-1005011942976222", type: "complete", ts: NOW - 300 },
    { id: "g4", productId: "ae-1005011942976222", type: "share", net: "whatsapp", ts: NOW - 200 },
    { id: "g5", productId: "p2", type: "save", ts: NOW - 100 },
  ];
  const funnel = [{ id: "f1", type: "landing", place: "/p/p2", ts: NOW - 100 }, { id: "f2", type: "landing", place: "/", ts: NOW - 100 }];
  const earnings = { state: "OK", amounts: "units", checkedAt: "2026-11-14", items: { "1005011942976222": { orders: 2, estimatedCommission: 1.4 } } };
  const t = productTelemetry({ clicks, engagement, funnel, earnings, products, now: NOW });
  const a = t.products.find((x) => x.id === "ae-1005011942976222");
  assert.deepEqual([a.views, a.exits, a.plays, a.completes, a.completionRate, a.shares, a.orders, a.estimatedCommission], [1, 1, 2, 1, 50, 1, 2, 1.4], "a duplicate event counts once");
  assert.deepEqual(a.shareNets, { whatsapp: 1 });
  const b = t.products.find((x) => x.id === "p2");
  assert.deepEqual([b.exits, b.landings, b.saves, b.completionRate, b.orders], [0, 1, 1, null, 0], "an event older than the window does not count; no plays → no completion rate");
  assert.equal(t.products.some((x) => x.id === "p3"), false, "an archived product is not listed");
  assert.equal(t.totals.orders, 2);
  const noReport = productTelemetry({ clicks, products, now: NOW });
  assert.equal(noReport.products[0].orders, null, "no store report: unknown, never zero");
  assert.equal(noReport.orders.state, "NOT_READ_YET");
  assert.ok(noReport.blocked.some((m) => m.id === "ig_likes" && m.missing.includes("IG_ACCESS_TOKEN")));
  assert.ok(!productTelemetry({ products, igConfigured: true, now: NOW }).blocked.some((m) => m.id.startsWith("ig_")));
  assert.equal(itemIdOf({ id: "x", sourceUrl: "https://www.aliexpress.us/item/3256812058731398.html" }), String(3256812058731398n - 2n ** 51n));
  assert.ok(BLOCKED_METRICS.length >= 3);
});

test("engagement never reaches the clicks feed, so no exit count is inflated", () => {
  const src = readFileSync("src/lib/engagement.js", "utf8");
  assert.match(src, /ENGAGEMENT_KEY = "marketplace:engagement"/);
  assert.doesNotMatch(src, /marketplace:clicks"/);
  const kit = readFileSync("src/components/discover/kit.jsx", "utf8");
  assert.match(kit, /trackEngagement\(engageId, "play"\)/);
  assert.match(kit, /trackEngagement\(productId, "save"\)/);
  assert.match(kit, /trackEngagement\(meta\.productId, "share"/);
  const m = growthMetrics({ clicks: [{ id: "a", productId: "x", ts: NOW - 1000 }], now: NOW });
  assert.equal(m.outbound.d30, 1);
});
