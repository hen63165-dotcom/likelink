// 🌍 The world gap (src/lib/growth/worldGap.js; the owner, 2026-11-21: "not only the gap in Israel,
// the gap against the whole world"): a state only from countries that really answered, Israel from the
// Hebrew consensus, a buzz word in any country is the world's echo, the moving kinds are swept first,
// a sweep is shown only while fresh, the page's wording names what was measured, and the browser keeps
// known countries and regions only.
import test from "node:test";
import assert from "node:assert/strict";
import { GAP, GAP_COUNTRIES, GAP_CORE, GAP_EXTRA, GAP_IDS, cleanWorldGap, cleanWorldGapSummary, freshGap, gapSweepOrder, suggestFacts, worldGapLine, worldGapOf, worldGapSummary } from "../src/lib/growth/worldGap.js";
import { CLOCK_COUNTRIES } from "../src/lib/growth/worldClock.js";
import { WORLD_MARKETS } from "../src/lib/growth/worldPulse.js";
import { COUNTRY_NAMES } from "../src/lib/growth/runReceipt.js";
import { beforeEveryone } from "../src/lib/growth/radarPicks.js";
import { findFacts } from "../src/lib/growth/radarCore.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const all = (v, ids = GAP_IDS.filter((id) => id !== "il")) => Object.fromEntries(ids.map((id) => [id, v]));

test("world gap: every continent, no country twice, the core is what the morning already reads", () => {
  assert.equal(new Set(GAP_IDS).size, GAP_IDS.length);
  assert.ok(GAP_COUNTRIES.length >= 50);
  assert.deepEqual(new Set(GAP_COUNTRIES.map((c) => c.region)).size, 6);
  // The core is exactly the morning reading's Google countries (the world pulse's + the clock's own), no engine.
  const morning = new Set([...WORLD_MARKETS.filter((m) => !m.engine).map((m) => m.id), ...CLOCK_COUNTRIES.filter((c) => c.x).map((c) => c.x)]);
  assert.deepEqual(new Set(GAP_CORE.map((c) => c.id)), morning);
  assert.ok(GAP_EXTRA.every((c) => !morning.has(c.id) && c.id !== "il"));
  for (const c of GAP_COUNTRIES) assert.ok(COUNTRY_NAMES[c.id], `${c.id} is named in the run receipt`);
});

test("world gap: completions counted like everywhere on the radar; any country's buzz word is an echo", () => {
  assert.deepEqual(suggestFacts("cloud slides", ["cloud slides", "cloud slides women", "cloud slides men"]), { n: 2, echo: false });
  assert.deepEqual(suggestFacts("cloud slides", ["cloud slides", "cloud slides tiktok"]), { n: 1, echo: true });
  assert.deepEqual(suggestFacts("cloud slides", ["cloud slides"]), { n: 0, echo: false });
  assert.equal(suggestFacts("cloud slides", null), null, "no answer is no measurement, never a zero");
});

test("world gap: quiet everywhere, first signs, spreading, known, and too few answers", () => {
  const quiet = worldGapOf({ counts: all(0), israel: false, d: "2026-11-21" });
  assert.equal(quiet.state, "WORLD_QUIET");
  assert.equal(quiet.measured, GAP_COUNTRIES.length);
  assert.equal(quiet.regionsMeasured, 6);
  assert.equal(quiet.before, true);
  assert.equal(quiet.confidence, "HIGH");
  const first = worldGapOf({ counts: { ...all(0), jp: 2 }, d: "2026-11-21" });
  assert.equal(first.state, "FIRST_SIGNS");
  assert.deepEqual(first.where, ["jp"]);
  assert.equal(first.regions.asia.searched, 1);
  assert.ok(!first.quietRegions.includes("asia") && first.quietRegions.includes("europe"));
  assert.equal(worldGapOf({ counts: { ...all(0), jp: 2, kr: 1, sg: 3 } }).state, "SPREADING");
  assert.equal(worldGapOf({ counts: all(1) }).state, "KNOWN");
  assert.equal(worldGapOf({ counts: all(0), echo: ["gb"] }).state, "KNOWN", "a buzz word in one country is the world's echo");
  assert.equal(worldGapOf({ counts: all(0), trends: ["DE"] }).state, "KNOWN", "Google's trending searches anywhere");
  assert.equal(worldGapOf({ counts: { us: 0, gb: 0, ca: 0 } }).state, "UNMEASURED", "three countries are not the world");
  // Israel counts from the Hebrew consensus only; null leaves it out.
  assert.equal(worldGapOf({ counts: all(0), israel: true }).where.includes("il"), true);
  assert.equal(worldGapOf({ counts: all(0), israel: null }).measured, GAP_COUNTRIES.length - 1);
  // Unknown country ids never count.
  assert.equal(worldGapOf({ counts: { ...all(0), zz: 5 } }).state, "WORLD_QUIET");
});

test("world gap: the moving kinds are swept first, then the longest unswept", () => {
  const order = gapSweepOrder([
    { id: "a", en: "steady thing", stage: "STEADY" },
    { id: "b", en: "rising thing", stage: "RISING" },
    { id: "c", en: "never swept", stage: "STEADY" },
    { id: "d", en: "emerging thing", stage: "EMERGING" },
    { id: "e", en: "", stage: "EMERGING" },
  ], { a: { d: "2026-11-20" } });
  assert.deepEqual(order.map((c) => c.id), ["d", "b", "c", "a"]);
  assert.ok(gapSweepOrder(Array.from({ length: 80 }, (_, i) => ({ id: `k${i}`, en: `kind ${i}` }))).length <= GAP.maxConcepts);
});

test("world gap: shown only while fresh; the line says what was measured", () => {
  const g = worldGapOf({ counts: { ...all(0), jp: 2 }, d: "2026-11-14" });
  assert.equal(freshGap(g, "2026-11-21"), g);
  assert.equal(freshGap(g, "2026-11-22"), null);
  assert.equal(freshGap({ ...g, d: null }, "2026-11-21"), null);
  assert.match(worldGapLine(g, "he"), /^מחפשים רק ביפן · שקט ב־50 מדינות$/);
  assert.match(worldGapLine(worldGapOf({ counts: all(0) }), "he"), /^שקט בכל 51 המדינות שנמדדו, ב־6 אזורים בעולם$/);
  assert.equal(worldGapLine({ state: "UNMEASURED" }, "he"), null);
  // The day's summary counts only today's gaps, and only what answered.
  const s = worldGapSummary([worldGapOf({ counts: all(0), d: "2026-11-21" }), worldGapOf({ counts: all(1), d: "2026-11-21" }), worldGapOf({ counts: all(0), d: "2026-11-20" })], { today: "2026-11-21" });
  assert.equal(s.measured, 2);
  assert.equal(s.states.WORLD_QUIET, 1);
  assert.equal(s.states.KNOWN, 1);
  assert.equal(s.maxAnswered, 51);
  assert.equal(s.regions, 6);
});

test("world gap: the radar's own pick is never a kind the world already knows", () => {
  const c = { stage: "EMERGING", world: { state: "EARLY" }, gap: { state: "GAP" }, early: {} };
  assert.equal(beforeEveryone(c), true);
  assert.equal(beforeEveryone({ ...c, worldGap: worldGapOf({ counts: all(0) }) }), true);
  assert.equal(beforeEveryone({ ...c, worldGap: worldGapOf({ counts: all(1) }) }), false);
});

test("world gap: the find card's world row; the browser keeps known countries and regions only", () => {
  const g = worldGapOf({ counts: { ...all(0), jp: 2 }, d: "2026-11-21" });
  const rows = findFacts({ known: { similar: 640, world: g } }, { kind: "fresh" });
  assert.deepEqual(rows.map((r) => r.key), ["sellers", "world", "seal"]);
  assert.equal(rows.find((r) => r.key === "sellers").he, "640 באליאקספרס", "the world row speaks for Google");
  assert.equal(rows.find((r) => r.key === "world").tone, "up");
  const dirty = { ...g, where: ["jp", "zz", "<script>"], regions: { ...g.regions, mars: { measured: 9, searched: 9 } }, echo: ["us", "x"], state: "WORLD_QUIET" };
  const clean = cleanWorldGap(dirty);
  assert.deepEqual(clean.where, ["jp"]);
  assert.ok(!clean.regions.mars);
  assert.deepEqual(clean.echo, ["us"]);
  assert.equal(cleanWorldGap({ state: "NOPE" }), null);
  assert.deepEqual(cleanWorldGapSummary({ countries: 52, regions: 6, measured: 3, states: { WORLD_QUIET: 2, BAD: 9 }, maxAnswered: 51 }).states, { WORLD_QUIET: 2, FIRST_SIGNS: 0, SPREADING: 0, KNOWN: 0, UNMEASURED: 0 });
  const board = sanitizeBoard({ at: "2026-11-21T06:00:00.000Z", record: {}, worldGap: { countries: 52, regions: 6, measured: 1, states: { WORLD_QUIET: 1 }, maxAnswered: 51 },
    concepts: [{ id: "lip-oil", he: "שמן שפתיים", en: "lip oil", stage: "STEADY", gap: { state: "ARRIVED" }, worldGap: g }] });
  assert.equal(board.concepts[0].worldGap.state, "FIRST_SIGNS");
  assert.equal(board.worldGap.states.WORLD_QUIET, 1);
});

// 🏭 Sellers against demand (supplyGap.js) and YouTube per country in the world gap.
import { cleanSupply, supplyBoard, supplyGapOf, supplyLine } from "../src/lib/growth/supplyGap.js";

test("supply: demand outrunning the sellers is room to make it; sellers rushing in is over-supply", () => {
  const under = supplyGapOf({ series: [["2026-11-14", 1000], ["2026-11-21", 1500]], listings: [["2026-11-14", 400], ["2026-11-21", 420]] });
  assert.equal(under.state, "UNDERSUPPLIED");
  assert.equal(under.demandWeekPct, 50);
  assert.equal(under.supplyWeekPct, 5);
  assert.equal(under.perListing, 3.57);
  const over = supplyGapOf({ series: [["2026-11-14", 1000], ["2026-11-21", 1020]], listings: [["2026-11-14", 400], ["2026-11-21", 600]] });
  assert.equal(over.state, "OVERSUPPLIED");
  assert.equal(supplyGapOf({ series: [["2026-11-21", 1000]], listings: [["2026-11-21", 400]] }), null, "one reading is no pace");
  assert.match(supplyLine(under, "he"), /מקום לייצר · הזמנות \+50% בשבוע, מודעות \+5%/);
  const b = supplyBoard([{ id: "kind-a", supply: under }, { id: "kind-b", supply: over }, { id: "kind-c" }]);
  assert.deepEqual(b, { measured: 2, under: 1, over: 1, top: ["kind-a"] });
  assert.equal(cleanSupply({ state: "NOPE" }), null);
  const board = sanitizeBoard({ at: "2026-11-21T06:00:00.000Z", record: {}, supply: b, concepts: [{ id: "lip-oil", he: "שמן שפתיים", en: "lip oil", stage: "STEADY", gap: { state: "ARRIVED" }, supply: under }] });
  assert.equal(board.concepts[0].supply.state, "UNDERSUPPLIED");
  assert.deepEqual(board.supply.top, ["kind-a"]);
});

test("world gap: YouTube from the same country counts as searching it there", () => {
  const g = worldGapOf({ counts: all(0), yt: { ...all(0), br: 2 }, d: "2026-11-21" });
  assert.equal(g.state, "FIRST_SIGNS");
  assert.deepEqual(g.where, ["br"]);
  assert.deepEqual(g.yt, { measured: 51, searched: 1 });
  assert.match(worldGapLine(worldGapOf({ counts: all(0), yt: all(0) }), "he"), /\(גוגל ויוטיוב\)/);
  assert.deepEqual(cleanWorldGap(g).yt, { measured: 51, searched: 1 });
});

// 📦 "Room to make it", sealed and checked (the owner, 22.11: "be before the sellers and the factories;
// they list following us"): every UNDERSUPPLIED kind is a call, the BALANCED ones the control; 14 days
// later, did new sellers come in (listings +15%)? Never edited; the edge only once both sides have 3.
import { SUPPLY_CALL, gradeSupplyCalls, recordSupplyCalls, supplyCallRecord, supplySealText } from "../src/lib/growth/supplyGap.js";
import { recordView } from "../src/lib/growth/radarCore.js";

test("supply calls: sealed in advance, graded by whether new sellers followed, against the balanced kinds", () => {
  const k = (id, state, listings) => ({ id, supply: { state, listings, orders: 1000 } });
  let calls = recordSupplyCalls([], [k("cable-knit-scarf", "UNDERSUPPLIED", 400), k("leg-warmers", "BALANCED", 900), k("drawer-organizer", "OVERSUPPLIED", 3000), k("Bad Id", "UNDERSUPPLIED", 10)], "2026-11-22");
  assert.deepEqual(calls.map((c) => [c.id, c.role, c.due]), [["cable-knit-scarf", "call", "2026-12-06"], ["leg-warmers", "control", "2026-12-06"]]);
  // One open entry per kind and role: the next morning adds nothing for them.
  assert.equal(recordSupplyCalls(calls, [k("cable-knit-scarf", "UNDERSUPPLIED", 410)], "2026-11-23").length, 2);
  assert.match(supplySealText(calls), /^cable-knit-scarf\|2026-11-22\|call\|400\|2026-12-06\|-\nleg-warmers\|2026-11-22\|control\|900\|2026-12-06\|-$/);
  assert.equal(gradeSupplyCalls(calls, { "cable-knit-scarf": ["2026-12-05", 600] }, "2026-12-05")[0].result, undefined, "before its day: open");
  calls = gradeSupplyCalls(calls, { "cable-knit-scarf": ["2026-12-06", 480], "leg-warmers": ["2026-12-06", 920] }, "2026-12-06");
  assert.deepEqual(calls.map((c) => [c.result, c.growth]), [["FOLLOWED", 20], ["QUIET", 2.2]]);
  assert.deepEqual(gradeSupplyCalls(calls, { "cable-knit-scarf": ["2026-12-07", 100] }, "2026-12-07")[0].result, "FOLLOWED", "a grade is never edited");
  assert.equal(gradeSupplyCalls([{ id: "x-y", role: "call", at: "2026-11-01", due: "2026-11-15", listings: 10 }], {}, "2026-11-19")[0].result, "UNREAD");
  const r = supplyCallRecord(calls);
  assert.equal(r.followed, 1);
  assert.equal(r.control.graded, 1);
  assert.equal(r.edge, null, "the edge waits for 3 grades on each side");
  assert.equal(SUPPLY_CALL.followPct, 15);
  // The browser keeps the record and the seal; the record table shows the book.
  const board = sanitizeBoard({ at: "2026-12-06T06:00:00.000Z", record: {}, concepts: [], supply: { measured: 2, under: 1, over: 0, top: ["cable-knit-scarf"], record: r, seal: { d: "2026-12-06", sha256: "a".repeat(64), count: 2, text: supplySealText(calls), ots: [] } } });
  assert.equal(board.supply.record.followed, 1);
  assert.equal(board.supply.seal.count, 2);
  assert.ok(board.supply.seal.text.startsWith("cable-knit-scarf|"));
  const row = recordView(board).rows.find((x) => x.id === "supply");
  assert.deepEqual([row.given, row.graded, row.result.hits], [1, 1, 1]);
});
