// The radar's world pulse (src/lib/growth/worldPulse.js): the owner, 2026-11-15, "spot trends before
// they become a hit anywhere in the world, then find them on AliExpress". Levels only, dated evidence,
// and a trending term becomes a concept only when AliExpress really sells it.
import test from "node:test";
import assert from "node:assert/strict";
import { addWorld, productTrend, trendingAbroad, worldPulseOf, worldReading } from "../src/lib/growth/worldPulse.js";

const day = (d) => Date.parse(`${d}T06:00:00Z`);

test("no reading is unverified, never 'not searched'", () => {
  assert.equal(worldPulseOf([]).state, "UNVERIFIED");
});

test("more markets searching than days ago is SPREADING (the early world signal)", () => {
  let h = addWorld([], worldReading({ by: { us: 1, gb: 0, ca: 0, au: 0 }, yt: 0 }, { now: day("2026-11-15") }));
  h = addWorld(h, worldReading({ by: { us: 2, gb: 1, ca: 1, au: 0 }, yt: 1 }, { now: day("2026-11-18") }));
  const p = worldPulseOf(h);
  assert.equal(p.state, "SPREADING");
  assert.equal(p.searched, 4);
  assert.ok(p.evidence.some((e) => /לפני \(15\.11\)/.test(e)));
});

test("a reading only one day older is not compared (no direction from noise)", () => {
  let h = addWorld([], worldReading({ by: { us: 0 }, yt: 0 }, { now: day("2026-11-15") }));
  h = addWorld(h, worldReading({ by: { us: 2 }, yt: 0 }, { now: day("2026-11-16") }));
  assert.equal(worldPulseOf(h).state, "EARLY");
});

test("in today's trends abroad is VIRAL_NOW; searched everywhere is WIDE; nothing is NONE", () => {
  assert.equal(worldPulseOf([worldReading({ by: { us: 5 }, trends: ["US"] }, { now: day("2026-11-15") })]).state, "VIRAL_NOW");
  assert.equal(worldPulseOf([worldReading({ by: { us: 5, gb: 4, ca: 3, au: 3 } }, { now: day("2026-11-15") })]).state, "WIDE");
  assert.equal(worldPulseOf([worldReading({ by: { us: 0, gb: 0, ca: 0, au: 0 }, yt: 0 }, { now: day("2026-11-15") })]).state, "NONE");
});

test("trending terms match a concept's English phrase, per country", () => {
  const out = trendingAbroad([{ id: "butter", en: "butter stick squishy" }, { id: "ring", en: "magnetic fidget ring" }], { US: ["Butter Stick Squishy viral"], GB: ["election results"] });
  assert.deepEqual(out, { butter: ["US"] });
});

test("a trending term is a product only when AliExpress sells it (items holding every word, orders)", () => {
  const items = [{ title: "Slow rising butter squishy toy", orders: 200 }, { title: "Butter stick squishy", orders: 150 }, { title: "Giant butter squishy", orders: 90 }, { title: "Election poster", orders: 900 }];
  assert.equal(productTrend("butter squishy", items).ok, true);
  assert.equal(productTrend("election results", items).ok, false, "news is not a product");
  assert.equal(productTrend("butter squishy", items.slice(0, 2)).reason, "few_items");
});

test("people, games and plain words are never a product trend, even when AliExpress sells their merch", () => {
  const merch = (w) => Array.from({ length: 5 }, (_, i) => ({ title: `${w} poster t-shirt ${i}`, orders: 500 }));
  for (const term of ["ronaldinho", "gta vi", "actor"]) assert.equal(productTrend(term, merch(term)).reason, "not_a_product_word", term);
  assert.equal(productTrend("cat window perch", Array.from({ length: 4 }, () => ({ title: "Cat window perch hammock", orders: 120 }))).ok, true);
});


test("a trend is called only when independent signals agree, demand among them", async () => {
  const { earlyCall } = await import("../src/lib/growth/worldPulse.js");
  const listings = [["2026-11-15", 100], ["2026-11-18", 125]];
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "RISING", listings, gap: { state: "GAP" } }).level, "CALL");
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "STEADY", listings, gap: { state: "GAP" } }).level, "WATCH", "no call without demand");
  assert.equal(earlyCall({ world: { state: "WIDE" }, stage: "RISING" }).level, "NONE");
  assert.equal(earlyCall({ stage: "RISING", listings: [["2026-11-15", 100], ["2026-11-16", 200]] }).signals.supply, false, "one day apart is not a rush");
});

test("misses raise the bar: under 70% after ten graded early calls needs all four signals", async () => {
  const { signalsNeeded, earlyCall, sealOf } = await import("../src/lib/growth/worldPulse.js");
  assert.equal(signalsNeeded({ graded: 4, accuracy: 25 }), 3, "too few graded to judge");
  assert.equal(signalsNeeded({ graded: 12, accuracy: 60 }), 4);
  assert.equal(signalsNeeded({ graded: 12, accuracy: 80 }), 3);
  const three = { world: { state: "SPREADING" }, stage: "RISING", gap: { state: "GAP" } };
  assert.equal(earlyCall({ ...three, need: 4 }).level, "WATCH", "three signals are not a call when four are needed");
  assert.equal(sealOf([{ kind: "early", concept: "a", at: "2026-11-17", signals: ["world", "demand", "israel"] }, { concept: "b", at: "2026-11-17" }]), "a|2026-11-17|world,demand,israel", "only early calls are sealed");
});
