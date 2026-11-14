// The trend radar (src/lib/growth/trendRadar.js, page /radar): stages come only from AliExpress's own
// numbers read on different days, every claim carries its evidence, nothing is claimed from one
// reading, and the radar grades its own calls in public (HIT/MISS after 14 days, never edited).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RADAR, addReading, buildBoard, evidence, perWeek, pickFrom, readingFrom, scoreOf, signals, stageOf, trackRecord, updateCalls, validConcept } from "../src/lib/growth/trendRadar.js";
import { hasBrandName, isNotListedKind } from "../src/lib/growth/deals.js";

const DAY = 86_400_000;
const at = (d) => Date.parse(`${d}T06:00:00Z`);
const answer = (items, listings = 1000) => ({
  total_record_count: listings,
  products: { product: items.map(([id, v, p = 9, extra = {}]) => ({ product_id: id, lastest_volume: v, target_sale_price: p, target_sale_price_currency: "ILS", ...extra })) },
});
const series = (days) => days.reduce((rs, [d, items, listings]) => addReading(rs, readingFrom(answer(items, listings), { now: at(d) })), []);

test("one reading claims nothing", () => {
  const rs = series([["2026-11-14", [["1000001", 500], ["1000002", 400], ["1000003", 300]]]]);
  const s = signals(rs);
  assert.equal(s.ok, false);
  assert.equal(stageOf(s), "UNVERIFIED");
  assert.equal(scoreOf(s, "UNVERIFIED"), 0);
  assert.match(evidence(s, "UNVERIFIED")[0].text, /צריך עוד מדידה/);
});

test("two readings a day apart are still too close", () => {
  const rs = series([
    ["2026-11-13", [["1000001", 500], ["1000002", 400], ["1000003", 300]]],
    ["2026-11-14", [["1000001", 900], ["1000002", 800], ["1000003", 700]]],
  ]);
  assert.equal(stageOf(signals(rs)), "UNVERIFIED");
});

test("a small concept whose items all speed up is EMERGING, with dated evidence", () => {
  const rs = series([
    ["2026-11-07", [["1000001", 500], ["1000002", 400], ["1000003", 300], ["1000004", 200]], 1000],
    ["2026-11-14", [["1000001", 800], ["1000002", 600], ["1000003", 420], ["1000004", 250]], 1300],
  ]);
  const s = signals(rs);
  assert.equal(s.span, 7);
  assert.equal(stageOf(s), "EMERGING");
  const lines = evidence(s, "EMERGING").map((e) => e.text).join("\n");
  assert.match(lines, /7\.11/);
  assert.match(lines, /14\.11/);
  assert.match(lines, /מודעות חדשות/);
});

test("one viral item cannot fake a trend: the median item decides", () => {
  const rs = series([
    ["2026-11-07", [["1000001", 500], ["1000002", 400], ["1000003", 300], ["1000004", 200]]],
    ["2026-11-14", [["1000001", 5000], ["1000002", 400], ["1000003", 300], ["1000004", 200]]],
  ]);
  const s = signals(rs);
  assert.ok(s.demandWeek < RADAR.risingPct, `median growth ${s.demandWeek}`);
  assert.notEqual(stageOf(s), "EMERGING");
  assert.notEqual(stageOf(s), "RISING");
});

test("big and flat is PEAK; falling is COOLING", () => {
  const big = [["1000001", 30000], ["1000002", 20000], ["1000003", 15000]];
  const flat = series([["2026-11-07", big], ["2026-11-14", big.map(([id, v]) => [id, v * 1.02])]]);
  assert.equal(stageOf(signals(flat)), "PEAK");
  const down = series([["2026-11-07", big], ["2026-11-14", big.map(([id, v]) => [id, v * 0.8])]]);
  assert.equal(stageOf(signals(down)), "COOLING");
});

test("growth over a short span is scaled to a week", () => {
  assert.equal(Math.round(perWeek(0.1, 7)), 10);
  assert.ok(perWeek(0.1, 3) > 20);
  assert.equal(perWeek(0.1, 0), null);
});

test("readings: one per day, a missing order count is never zero", () => {
  const r = readingFrom({ total_record_count: 10, products: { product: [{ product_id: "1000001", lastest_volume: null }, { product_id: "1000002", lastest_volume: "" }, { product_id: "1000003", lastest_volume: 50 }] } }, { now: at("2026-11-14") });
  assert.deepEqual(r.top.map((x) => x[0]), ["1000003"]);
  let rs = addReading([], r);
  rs = addReading(rs, { ...r, sum: 99 });
  assert.equal(rs.length, 1);
  assert.equal(rs[0].sum, 99);
});

test("the buy pick follows the site's rules: 95%, 300 orders, the owner's own link, no brand", () => {
  const ok = { product_title: "butter stick squishy", evaluate_rate: "98.0%", promotion_link: "https://s.click.aliexpress.com/e/_abc", product_main_image_url: "https://ae-pic-a1.aliexpress-media.com/kf/x.jpg" };
  assert.ok(pickFrom(answer([["1000001", 5000, 8, ok]])));
  assert.equal(pickFrom(answer([["1000001", 5000, 8, { ...ok, evaluate_rate: "93.0%" }]])), null);
  assert.equal(pickFrom(answer([["1000001", 100, 8, ok]])), null);
  assert.equal(pickFrom(answer([["1000001", 5000, 8, { ...ok, product_title: "Labubu squishy" }]])), null);
});

test("self-grading: a call opens on EMERGING/RISING, is graded after 14 days, and is never edited", () => {
  const rs1 = [{ d: "2026-11-01", sum: 1000, top: [] }];
  let calls = updateCalls([], "x", "EMERGING", rs1, { now: at("2026-11-01") });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].due, "2026-11-15");
  calls = updateCalls(calls, "x", "RISING", [...rs1, { d: "2026-11-08", sum: 1500, top: [] }], { now: at("2026-11-08") });
  assert.equal(calls.length, 1, "no second open call");
  assert.equal(calls[0].result, undefined, "not graded before 14 days");
  calls = updateCalls(calls, "x", "STEADY", [...rs1, { d: "2026-11-15", sum: 1200, top: [] }], { now: at("2026-11-15") });
  assert.equal(calls[0].result, "HIT");
  const again = updateCalls(calls, "x", "STEADY", [...rs1, { d: "2026-11-20", sum: 100, top: [] }], { now: at("2026-11-20") });
  assert.equal(again[0].result, "HIT", "a graded call keeps its grade");
  const miss = updateCalls(updateCalls([], "y", "RISING", rs1, { now: at("2026-11-01") }), "y", "STEADY", [...rs1, { d: "2026-11-15", sum: 1050, top: [] }], { now: at("2026-11-15") });
  assert.equal(miss[0].result, "MISS");
  const rec = trackRecord([...again, ...miss]);
  assert.deepEqual([rec.graded, rec.hits, rec.accuracy], [2, 1, 50]);
});

test("the board: strongest early stages first, nothing private, the record attached", () => {
  const concepts = [{ id: "a-one", he: "אחד", en: "one thing" }, { id: "b-two", he: "שתיים", en: "two things" }];
  const readings = {
    "a-one": series([["2026-11-07", [["1000001", 300], ["1000002", 200], ["1000003", 100]]], ["2026-11-14", [["1000001", 600], ["1000002", 400], ["1000003", 200]]]]),
    "b-two": series([["2026-11-14", [["1000004", 300]]]]),
  };
  const board = buildBoard({ concepts, readings, now: at("2026-11-14") });
  assert.deepEqual(board.concepts.map((c) => c.stage), ["EMERGING", "UNVERIFIED"]);
  const fresh = board.concepts[1];
  assert.deepEqual([fresh.today.orders, fresh.size], [300, "SMALL"], "one reading shows today's size, never a direction");
  const json = JSON.stringify(board);
  assert.doesNotMatch(json, /evaluate_rate|rating|seller_id|store_id/);
  assert.ok(board.record && board.record.calls === 0);
});

test("the watch list: valid, unique, generic words only (no brand, no unlisted kind)", () => {
  const { concepts } = JSON.parse(readFileSync("scripts/catalog/radar-concepts.json", "utf8"));
  const ids = new Set();
  for (const c of concepts) {
    assert.ok(validConcept(c), `invalid concept ${JSON.stringify(c)}`);
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
    assert.ok(!hasBrandName(c.en), `brand in ${c.id}`);
    assert.ok(!isNotListedKind(c.en), `unlisted kind in ${c.id}`);
  }
  assert.ok(concepts.length >= 40);
});

test("the radar never promises a hit", () => {
  const src = readFileSync("src/lib/growth/trendRadar.js", "utf8");
  const shown = [...src.matchAll(/"([^"]*[֐-׿][^"]*)"/g)].map((m) => m[1]).join("\n");
  assert.doesNotMatch(shown, /יהיה להיט|בטוח|מובטח|הכי נמכר|תחזית/);
});
