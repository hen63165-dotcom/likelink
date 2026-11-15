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
  const held = { count: 3 };
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "RISING", listings, gap: { state: "GAP" }, before: held }).level, "CALL");
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "RISING", listings, gap: { state: "GAP" }, before: { count: 2 } }).level, "WATCH", "sniper mode: three of them must have held");
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "RISING", listings, gap: { state: "ARRIVED" }, before: held }).level, "WATCH", "sniper mode: all four signals, not three");
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "RISING", listings, gap: { state: "GAP" } }).level, "WATCH", "a first flash is not a call: it must hold");
  assert.equal(earlyCall({ world: { state: "SPREADING" }, stage: "STEADY", listings, gap: { state: "GAP" } }).level, "WATCH", "no call without demand");
  assert.equal(earlyCall({ world: { state: "WIDE" }, stage: "RISING" }).level, "NONE");
  assert.equal(earlyCall({ stage: "RISING", listings: [["2026-11-15", 100], ["2026-11-16", 200]] }).signals.supply, false, "one day apart is not a rush");
});

test("sniper mode by default; misses under 80% after ten graded calls raise it further", async () => {
  const { signalsNeeded, earlyCall, sealOf } = await import("../src/lib/growth/worldPulse.js");
  assert.equal(signalsNeeded({ graded: 4, accuracy: 25 }), 4, "too few graded to judge: the sniper bar");
  assert.equal(signalsNeeded({ graded: 12, accuracy: 70 }), 5);
  assert.equal(signalsNeeded({ graded: 12, accuracy: 85 }), 4, "the bar never drops under all four");
  const three = { world: { state: "SPREADING" }, stage: "RISING", gap: { state: "GAP" } };
  assert.equal(earlyCall({ ...three, need: 4, before: { count: 3 } }).level, "WATCH", "three signals are not a call when four are needed");
  const four = { ...three, listings: [["2026-11-15", 100], ["2026-11-18", 125]] };
  assert.equal(earlyCall({ ...four, need: 5, before: { count: 3 } }).level, "WATCH", "after misses the previous reading must show all four");
  assert.equal(earlyCall({ ...four, need: 5, before: { count: 4 } }).level, "CALL");
  assert.equal(sealOf([{ kind: "early", concept: "a", at: "2026-11-17", signals: ["world", "demand", "israel"] }, { concept: "b", at: "2026-11-17" }]), "a|2026-11-17|world,demand,israel", "only early calls are sealed");
});

test("China and Korea through their own engines: answers parsed, the echo never counted", async () => {
  const { parseEngine, cjkExtensions } = await import("../src/lib/growth/worldPulse.js");
  const baidu = parseEngine("baidu", JSON.stringify(["黄油捏捏乐", ["黄油捏捏乐", "黄油捏捏乐 慢回弹", "黄油捏捏乐 大号"]]));
  assert.equal(cjkExtensions("黄油捏捏乐", baidu), 2);
  const naver = parseEngine("naver", JSON.stringify({ items: [[["버터 말랑이"], ["버터 말랑이 만들기"]]] }));
  assert.equal(cjkExtensions("버터 말랑이", naver), 1);
  assert.equal(parseEngine("baidu", "<html>blocked</html>"), null, "a page that is not an answer is no reading");
});

test("the finish lines are late: they never count toward a call, they time it ('before everyone')", async () => {
  const { earlyCall, echoOf, stampFirsts, leadOf, worldReading, finishLinesOf } = await import("../src/lib/growth/worldPulse.js");
  assert.deepEqual(echoOf({ en: ["pudding squishy tiktok", "pudding squishy"], zh: ["布丁捏捏乐抖音同款"], ko: ["푸딩 말랑이"] }), ["tiktok", "douyin"]);
  assert.deepEqual(echoOf({}), []);
  assert.deepEqual(worldReading({ echo: ["tiktok", "made-up"] }).echo, ["tiktok"], "only known networks are kept");
  const listings = [["2026-11-10", 100], ["2026-11-15", 120]];
  const quiet = earlyCall({ world: { state: "SPREADING", echo: [], trends: [] }, stage: "RISING", listings, gap: { state: "GAP" }, before: { count: 3 } });
  assert.equal(quiet.level, "CALL");
  assert.equal(quiet.beforeAll, true, "a call before every finish line is 'before everyone'");
  assert.deepEqual(quiet.aheadOf, ["buzz", "israel", "trends", "wide"]);
  assert.equal(Object.hasOwn(quiet.signals, "social"), false, "buzz is not one of the agreeing signals");
  const loud = earlyCall({ world: { state: "SPREADING", echo: ["tiktok"], trends: [] }, stage: "RISING", listings, gap: { state: "GAP" }, before: { count: 3 } });
  assert.equal(loud.count, quiet.count, "buzz adds nothing to the count");
  assert.equal(loud.beforeAll, false);
  assert.deepEqual(loud.aheadOf, ["israel", "trends", "wide"]);
  assert.deepEqual(earlyCall({ world: { state: "WIDE", echo: ["tiktok", "douyin"] }, stage: "STEADY" }).level, "NONE", "buzz alone is not even watched");
  assert.deepEqual(earlyCall({ world: { state: "WIDE" }, stage: "RISING" }).aheadOf, [], "no call, no claim of being ahead");
  assert.deepEqual(finishLinesOf({ world: { state: "VIRAL_NOW", echo: [] }, gap: { state: "ARRIVING" } }), { buzz: false, israel: true, trends: true, wide: false });

  const calls = [
    { concept: "a", kind: "early", at: "2026-11-01" },
    { concept: "b", kind: "early", at: "2026-11-10" },
    { concept: "c", kind: "early", at: "2026-11-05", firsts: { buzz: "2026-11-09" } },
    { concept: "d", kind: "stage", at: "2026-11-01" },
  ];
  const stamped = stampFirsts(calls, { a: { buzz: true, israel: true }, b: { wide: true }, c: { buzz: true }, d: { buzz: true } }, "2026-11-15");
  assert.deepEqual(stamped[0].firsts, { buzz: "2026-11-15", israel: "2026-11-15" });
  assert.deepEqual(stamped[1].firsts, { wide: "2026-11-15" });
  assert.equal(stamped[2].firsts.buzz, "2026-11-09", "the first day is kept, never moved");
  assert.equal(stamped[3].firsts, undefined, "only early calls are timed");
  const lead = leadOf(stamped);
  assert.deepEqual(lead.buzz, { met: 2, ahead: 2, medianDays: 14, waiting: 1 });
  assert.deepEqual(lead.israel, { met: 1, ahead: 1, medianDays: 14, waiting: 2 });
  assert.deepEqual(lead.wide, { met: 1, ahead: 1, medianDays: 5, waiting: 2 });
  assert.deepEqual(lead.trends, { met: 0, ahead: 0, medianDays: null, waiting: 3 });
  const sameDay = leadOf(stampFirsts([{ concept: "x", kind: "early", at: "2026-11-15" }], { x: { buzz: true } }, "2026-11-15"));
  assert.deepEqual(sameDay.buzz, { met: 1, ahead: 0, medianDays: null, waiting: 0 }, "a line crossed on the call's day is never 'ahead'");
});

test("the board keeps only known finish lines on its way to the page", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const b = sanitizeBoard({ at: "2026-11-15T05:37:00Z", record: {}, concepts: [{ id: "pudding-squishy", en: "pudding squishy", stage: "RISING", early: { level: "CALL", count: 3, signals: { demand: true }, aheadOf: ["buzz", "evil"], beforeAll: true, buzz: ["tiktok", "x"] } }], early: { need: 4, record: {}, lead: { buzz: { met: 1, ahead: 1, medianDays: 6, waiting: 0 }, junk: {} } } });
  const c = (b?.concepts || [])[0];
  {
    assert.deepEqual(c.early.aheadOf, ["buzz"]);
    assert.deepEqual(c.early.buzz, ["tiktok"]);
  }
  assert.deepEqual(Object.keys(b.early.lead), ["buzz", "israel", "trends", "wide"]);
  assert.equal(b.early.lead.buzz.medianDays, 6);
});

test("the ledger and today's verdict: sealed calls only, graded honestly, and a plain 'no call today'", async () => {
  const { ledgerOf, verdictOf } = await import("../src/lib/growth/worldPulse.js");
  const calls = [
    { concept: "pudding-squishy", kind: "early", at: "2026-11-01", due: "2026-11-15", result: "HIT", growth: 31, firsts: { buzz: "2026-11-09", junk: "x" } },
    { concept: "cloud-slides", kind: "early", at: "2026-11-15", due: "2026-11-29" },
    { concept: "tofu-squishy", kind: "early", at: "2026-11-15", due: "2026-11-29" },
    { concept: "old-stage", kind: "stage", at: "2026-11-15" },
    { concept: "cat-perch", kind: "early", at: "2026-11-10", due: "2026-11-24", result: "EDITED" },
  ];
  const ledger = ledgerOf(calls);
  assert.deepEqual(ledger.map((e) => e.concept), ["cloud-slides", "tofu-squishy", "cat-perch", "pudding-squishy"], "newest first, early calls only");
  assert.equal(ledger.find((e) => e.concept === "cat-perch").result, null, "only HIT/MISS are grades");
  assert.deepEqual(ledger.find((e) => e.concept === "pudding-squishy").firsts, { buzz: "2026-11-09" });
  const concepts = [{ id: "cloud-slides", he: "כפכפי ענן", early: { count: 3 } }, { id: "tofu-squishy", he: "סקווישי טופו", early: { count: 4 } }, { id: "cat-perch", he: "ערסל לחתול" }];
  const today = verdictOf({ ledger, concepts, day: "2026-11-15" });
  assert.deepEqual(today.calls.map((e) => e.concept.id), ["tofu-squishy", "cloud-slides"], "strongest first");
  const quiet = verdictOf({ ledger, concepts, day: "2026-11-16" });
  assert.equal(quiet.calls.length, 0, "a day without a sealed call says so");
  assert.equal(quiet.latestOpen.concept.id, "cloud-slides");
  assert.deepEqual(verdictOf({}), { day: null, calls: [], latestOpen: null });
});

test("calibration grades the sniper calls apart from the ordinary signals", async () => {
  const { calibrationOf } = await import("../src/lib/growth/worldPulse.js");
  const { trackRecord } = await import("../src/lib/growth/trendRadar.js");
  const calls = [
    { concept: "a", at: "2026-10-01", result: "MISS" }, { concept: "b", at: "2026-10-01", result: "HIT" }, { concept: "c", at: "2026-10-01", result: "MISS" }, { concept: "d", at: "2026-11-10" },
    { concept: "a", kind: "early", at: "2026-10-02", result: "HIT" }, { concept: "e", kind: "early", at: "2026-11-15" },
  ];
  const cal = calibrationOf(calls, trackRecord);
  assert.deepEqual(cal.signal, { graded: 3, hits: 1, accuracy: 33, pending: 1 });
  assert.deepEqual(cal.sniper, { graded: 1, hits: 1, accuracy: 100, pending: 1 });
});

test("an open call is measured every day against its sealed base (the live scoreboard)", async () => {
  const { ledgerOf } = await import("../src/lib/growth/worldPulse.js");
  const calls = [
    { concept: "tofu-squishy", kind: "early", at: "2026-11-10", due: "2026-11-24", base: 1000 },
    { concept: "cat-perch", kind: "early", at: "2026-11-01", due: "2026-11-15", base: 500, result: "HIT", growth: 22 },
  ];
  const [open, graded] = ledgerOf(calls, { latest: { "tofu-squishy": 1090, "cat-perch": 700 }, today: "2026-11-15" });
  assert.deepEqual([open.progress, open.dayN], [9, 5], "day 5 of 14, +9% since the seal");
  assert.deepEqual([graded.progress, graded.growth], [null, 22], "a graded call keeps its final grade only");
  assert.equal(ledgerOf(calls)[0].progress, null, "no reading, no number");
});

test("the countdown points at the next 05:37 UTC reading", async () => {
  const { nextReadingAt } = await import("../src/lib/growth/worldPulse.js");
  assert.equal(new Date(nextReadingAt(Date.parse("2026-11-15T18:00:00Z"))).toISOString(), "2026-11-16T05:37:00.000Z");
  assert.equal(new Date(nextReadingAt(Date.parse("2026-11-16T05:00:00Z"))).toISOString(), "2026-11-16T05:37:00.000Z");
});
