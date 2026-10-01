// Opportunity engine — whole-catalog ranking from evidence only.
//   • trend lifecycle from LikeLink's own events (no event → UNVERIFIED)
//   • a product that cannot be promoted honestly scores 0 opportunity
//   • no conversion data → conversion 0 with confidence "none" (never guessed)
//   • batches + fingerprints: unchanged products are reused, not re-processed
import test from "node:test";
import assert from "node:assert/strict";
import { rankCatalog, trendLifecycle, eventWindows, productFingerprint, TREND_STATE } from "../src/lib/growth/opportunity.js";
import { catalogTruth } from "../src/lib/growth/likeloop.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const H = 3_600_000, D = 24 * H;
const M = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle" }];
const real = (i) => ({ id: `r${i}`, title: `מוצר ${i}`, price: 40 + i, category: "Accessories", status: "approved", marketerId: "m1", affiliateUrl: `https://s.click.aliexpress.com/e/_own${i}`, image: `https://ae01.alicdn.com/kf/${i}.jpg`, createdAt: NOW - 3 * D });
const demo = (i) => ({ ...real(100 + i), id: `d${i}`, affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED", image: "https://images.unsplash.com/x" });
const ev = (pid, ageMs, n, type = "view") => Array.from({ length: n }, (_, k) => ({ id: `${pid}-${ageMs}-${k}-${type}`, productId: pid, type, ts: NOW - ageMs - k }));

test("trend lifecycle comes only from recorded events, with evidence", () => {
  const st = (events) => trendLifecycle(eventWindows("x", events, NOW), { now: NOW }).state;
  assert.equal(st([]), "UNVERIFIED");
  assert.equal(st(ev("x", H, 12)), "HOT_NOW");
  assert.equal(st([...ev("x", 2 * D, 9), ...ev("x", 9 * D, 3)]), "RISING");
  assert.equal(st([...ev("x", 2 * D, 6), ...ev("x", 9 * D, 6)]), "STABLE");
  assert.equal(st([...ev("x", 2 * D, 2), ...ev("x", 9 * D, 10)]), "COOLING");
  assert.equal(st(ev("x", 20 * D, 4)), "EXPIRED");
  const t = trendLifecycle(eventWindows("x", ev("x", H, 12), NOW), { now: NOW });
  assert.equal(t.evidence.last24h, 12);
  assert.match(t.source, /marketplace:clicks/);
  assert.deepEqual(TREND_STATE, ["HOT_NOW", "RISING", "STABLE", "COOLING", "EXPIRED", "UNVERIFIED"]);
});

test("a 12-product batch: ranked from evidence; demo products score 0; nothing guessed", () => {
  const products = [...Array.from({ length: 8 }, (_, i) => real(i)), ...Array.from({ length: 4 }, (_, i) => demo(i))];
  const truth = catalogTruth({ products, marketers: M });
  const videos = [{ id: "v1", source: "likelink_native_render", audio: "aac", public: true, productTags: [{ productId: "r3" }] }];
  const events = [...ev("r3", H, 12), ...ev("r3", H, 4, "outbound_click")];
  const r = rankCatalog({ products, truthRows: truth.rows, events, videos, marketers: M, batchSize: 5, now: NOW });
  assert.equal(r.stats.total, 12);
  assert.equal(r.stats.batches, 3);
  assert.equal(r.stats.eligible, 8);
  assert.equal(r.ranked[0].productId, "r3", "the product with real events + a reel ranks first");
  assert.equal(r.ranked[0].trend.state, "HOT_NOW");
  for (const x of r.ranked.filter((x) => x.productId.startsWith("d"))) {
    assert.equal(x.opportunity, 0);
    assert.equal(x.next.action, "REPAIR_DATA");
  }
  for (const x of r.ranked) {
    assert.equal(x.scores.conversion.score, 0);
    assert.equal(x.scores.conversion.confidence, "none");
    assert.equal(x.scores.creatorFit.confidence, "none", "creator without tags → insufficient data");
  }
  assert.equal(r.ranked.find((x) => x.productId === "r0").next.action, "CREATE_REEL");
  assert.equal(r.ranked.find((x) => x.productId === "r3").next.action, "CREATE_VARIANT");
});

test("unchanged products are reused; a changed product is re-scored", () => {
  const products = [real(1), real(2)];
  const truth = catalogTruth({ products, marketers: M });
  const first = rankCatalog({ products, truthRows: truth.rows, marketers: M, now: NOW });
  const previous = Object.fromEntries(first.ranked.map((x) => [x.productId, x]));
  const again = rankCatalog({ products, truthRows: truth.rows, marketers: M, previous, now: NOW + H });
  assert.equal(again.stats.reused, 2);
  const changed = [{ ...real(1), price: 99 }, real(2)];
  const third = rankCatalog({ products: changed, truthRows: catalogTruth({ products: changed, marketers: M }).rows, marketers: M, previous, now: NOW + H });
  assert.equal(third.stats.processed, 1);
  assert.notEqual(productFingerprint(changed[0]), productFingerprint(real(1)));
});
