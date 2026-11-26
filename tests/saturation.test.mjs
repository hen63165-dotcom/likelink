// 🚫 Saturated is never a find (saturation.js; the owner, 26.11: "I saw the radar found products the market
// is already saturated with — fix it, obviously"). One market check for every product shown or posted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SATURATION, cleanMarket, freshCheck, isMass, marketOf, pruneChecks, saturationQueue } from "../src/lib/growth/saturation.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

test("a mass seller is saturated with no question asked; else the listings and the buzz decide; unread is never open", () => {
  assert.equal(SATURATION.massOrders, 5000);
  assert.equal(SATURATION.maxSimilar, 2000);
  assert.deepEqual(marketOf({ orders: 49602 }), { state: "SATURATED", why: "mass", orders: 49602 }, "the mochi squishy of 25.11");
  assert.equal(marketOf({ orders: 900, check: { reason: "SATURATED", phrase: "fur slippers", similar: 31000 } }).state, "SATURATED");
  assert.equal(marketOf({ orders: 900, check: { reason: "BUZZ", phrase: "scalp brush", similar: 800, buzz: ["tiktok"] } }).state, "BUZZ");
  assert.deepEqual(marketOf({ orders: 900, check: { reason: "UNKNOWN", phrase: "cloud lamp", similar: 340 } }), { state: "OPEN", similar: 340, phrase: "cloud lamp" });
  assert.equal(marketOf({ orders: 900, check: null }).state, "UNMEASURED");
  assert.equal(marketOf({ orders: 900, check: { reason: "NOT_CHECKED" } }).state, "UNMEASURED");
  assert.equal(isMass("5000"), true);
  assert.equal(isMass(null), false);
});

test("the run asks only what it must: no mass seller, no fresh check, each id once, at most perRun", () => {
  const targets = [
    { id: "1000000001", orders: 49602 },
    { id: "1000000002", orders: 900 },
    { id: "1000000002", orders: 900 },
    { id: "1000000003", orders: 700 },
    { id: "bad", orders: 10 },
  ];
  const state = { 1000000003: { d: "2026-11-25", reason: "UNKNOWN" } };
  assert.deepEqual(saturationQueue(targets, state, "2026-11-26"), ["1000000002"]);
  assert.deepEqual(saturationQueue(targets, state, "2026-11-28"), ["1000000002", "1000000003"], "a check is reused for 3 days");
  assert.equal(freshCheck({ d: "2026-11-24" }, "2026-11-26"), true);
  assert.equal(freshCheck({ d: "2026-11-23" }, "2026-11-26"), false);
  assert.deepEqual(Object.keys(pruneChecks({ a: { d: "2026-11-01" }, b: { d: "2026-11-20" } }, "2026-11-26")), ["b"]);
  const many = Array.from({ length: 50 }, (_, i) => ({ id: String(2000000000 + i), orders: 600 }));
  assert.equal(saturationQueue(many, {}, "2026-11-26").length, SATURATION.perRun);
});

test("the market state reaches the page, and the page shows only open products as hot on the site", () => {
  assert.deepEqual(cleanMarket({ state: "OPEN", similar: 340, phrase: "x" }), { state: "OPEN", why: null, orders: null, similar: 340 });
  assert.equal(cleanMarket({ state: "MAYBE" }), null);
  const board = sanitizeBoard({ v: 2, at: "2026-11-26T16:00:00Z", record: {}, concepts: [], site: { checked: 2, counts: { HOT: 2 }, hot: [
    { id: "ae-1", title: "x", state: "HOT", weekPct: 20, orders: 900, market: { state: "OPEN", similar: 300 } },
    { id: "ae-2", title: "y", state: "HOT", weekPct: 33, orders: 49602, market: { state: "SATURATED", why: "mass", orders: 49602 } },
  ] } });
  assert.deepEqual(board.site.hot.map((r) => r.market.state), ["OPEN", "SATURATED"]);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /site\.hot\.filter\(\(r\) => r\.market\?\.state === "OPEN"\)/, "the page lists only open products");
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /t\.ref\.market = marketOf\(/, "every product shown or posted gets its market state in the run");
  const rules = readFileSync("docs/marketing/product-rules.md", "utf8");
  assert.match(rules, /saturation\.js/, "the product rules name the gate");
});
