// 🥊 The head-to-head (radarBacktest.js): the radar's chance model against the simple ranking by order
// growth and against chance, every day, on the same items. Each day sees only that day's data; the
// published cases recompute the same numbers in any browser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BACKTEST, auc, backtest, backtestBoard, backtestPublic, cleanBacktest, recomputeCases, reached, signTest } from "../src/lib/growth/radarBacktest.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { SECTION_TABS } from "../src/lib/growth/radarCore.js";

const day = (n) => new Date(Date.parse("2026-10-20T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

// A fixed pseudo-random sequence (mulberry32): the same items every run.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function market(n = 260, days = 36, seed = 7) {
  const r = rng(seed);
  const items = {};
  for (let i = 0; i < n; i++) {
    let o = Math.round(40 + r() * 4000);
    const g = -0.01 + r() * 0.05; // each item's own daily pace, kept with noise
    const series = [];
    for (let d = 0; d < days; d++) {
      series.push([day(d), o]);
      o = Math.max(0, Math.round(o * Math.exp(g + (r() - 0.5) * 0.04)));
    }
    items[String(1_000_000_000 + i)] = series;
  }
  return items;
}

test("the pieces: reached, AUC, the sign test", () => {
  assert.equal(reached(100, 110, 10), true);
  assert.equal(reached(0, 0, 10), false, "at 0 orders nothing grew (26.11: the lab counted every 0-order item as a hit)");
  assert.equal(reached(5, 5, 10), false, "the same orders: no growth");
  assert.equal(reached(100, 109, 10), false);
  assert.equal(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(auc([1, 1], [1, 1]), null, "one outcome only: no AUC");
  assert.equal(signTest(0, 0), null);
  assert.equal(signTest(5, 5), 1);
  assert.ok(Math.abs(signTest(9, 1) - 0.0215) < 0.001, "9 days won of 10");
});

test("every day the model, the simple ranking and chance meet on the same items", () => {
  const items = market();
  const today = day(35);
  const bt = backtest(items, today);
  assert.equal(bt.horizons.length, 2);
  for (const h of bt.horizons) {
    assert.ok(h.days > 0, `${h.h} days: graded days`);
    assert.equal(h.model.of, h.rank.of, "the same number of picks for both");
    assert.ok(h.to <= day(35 - h.h - 1), "a day is tested only once its outcome (with the day of slack) is known");
    assert.ok(h.random.rate >= 0 && h.random.rate <= 100);
    assert.ok(h.brier.model !== null && h.brier.rank !== null && h.brier.base !== null);
    assert.equal(h.dayDuel.wins + h.dayDuel.losses + h.dayDuel.ties, h.days);
  }
  assert.ok(bt.cases.length > 0 && bt.cases.length <= BACKTEST.maxCases);
  assert.equal(bt.cases[0].length, 11);
  assert.ok(bt.horizons.every((h) => h.learn.of === h.rank.of), "the learning model meets them on the same picks count");
  assert.equal(bt.daily.length, bt.horizons.reduce((s, h) => s + h.days, 0), "one daily row per tested day");
  assert.ok(bt.horizons.every((h) => h.radar.of === h.rank.of), "the radar's noise-checked order meets them on the same picks count");
  // The published cases give back the same head-to-head in any browser.
  const again = recomputeCases(backtestPublic(bt));
  for (const h of bt.horizons) {
    assert.equal(again[h.h].days, h.days);
    assert.equal(again[h.h].model, h.model.rate);
    assert.equal(again[h.h].rank, h.rank.rate);
    assert.equal(again[h.h].radar, h.radar.rate);
    assert.equal(again[h.h].learn, h.learn.rate);
  }
});

test("no day sees its future: changing what happened later leaves every earlier forecast as it was", () => {
  const a = market(220, 34, 11);
  const cut = day(25);
  const b = Object.fromEntries(Object.entries(a).map(([id, s]) => [id, s.map(([d, v]) => [d, d > cut ? v * 3 + 17 : v])]));
  const today = day(33);
  const ca = backtest(a, today).cases.filter((r) => r[1] <= cut);
  const cb = backtest(b, today).cases.filter((r) => r[1] <= cut);
  const key = (r) => `${r[0]}|${r[1]}|${r[2]}`;
  const mb = new Map(cb.map((r) => [key(r), r]));
  let compared = 0;
  for (const r of ca) {
    const s = mb.get(key(r));
    if (!s) continue;
    compared++;
    assert.equal(s[5], r[5], "the model's chance on that day");
    assert.equal(s[6], r[6], "the simple ranking's chance on that day");
    assert.equal(s[4], r[4], "the item's pace on that day");
    assert.equal(s[9], r[9], "the radar's low-end growth on that day");
    assert.equal(s[10], r[10], "the learning model's chance on that day");
  }
  assert.ok(compared > 100, `compared ${compared} forecasts`);
});

test("the board keeps the record (behind the lock too), never the cases; the page shows it in the proof tab", () => {
  const bt = backtest(market(), day(35));
  const doc = backtestBoard(bt);
  assert.equal(doc.cases, bt.cases.length);
  const board = sanitizeBoard({ at: `${day(35)}T05:00:00Z`, concepts: [], record: {}, backtest: doc });
  assert.equal(board.backtest.horizons.length, 2);
  assert.equal(board.backtest.horizons[0].h, 3);
  assert.equal(teaserBoard(board).backtest.horizons.length, 2, "a backtest names no open call: public behind the lock");
  assert.equal(cleanBacktest({ horizons: [{ h: 5 }] }).horizons.length, 0);
  assert.equal(SECTION_TABS.backtest, "proof");
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<HeadToHead bt=\{board\.backtest\} versus=\{board\.versus\} \/>/);
  assert.match(page, /id="backtest"/);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_BACKTEST !== "0"/);
  assert.match(run, /backtest-public\.json/);
  const deploy = readFileSync(".github/workflows/deploy-frontend.yml", "utf8");
  assert.match(deploy, /backtest-public\.json dist\/radar\/backtest\.json/);
});
