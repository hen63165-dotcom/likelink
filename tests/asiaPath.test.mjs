// 🇰🇷🇯🇵 Korea and Japan in their own language (asiaSignal.js) and 🧭 the path every trend walks
// (trendPath.js): pure cores, not yet wired into the run. A translation the radar asks with must be in
// the target script; a region with no readable answer is UNMEASURED, never quiet; an arrival is only a
// sign after a quiet day; a path step lit at the first reading is never an observed start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asiaArrival, asiaHaulUrl, cleanAsia, localExtensions, regionReading, usableTerm } from "../src/lib/growth/asiaSignal.js";
import { learnPath, mergePath, pathStepsOf, positionOf } from "../src/lib/growth/trendPath.js";

test("asia: the term must be in Korean or Japanese script; unread is unmeasured, never quiet", () => {
  assert.equal(usableTerm("스퀴시", "KR"), "스퀴시");
  assert.equal(usableTerm("squishy", "KR"), null);
  assert.equal(usableTerm("スクイーズ", "JP"), "スクイーズ");
  assert.equal(localExtensions("스퀴시", ["스퀴시", "스퀴시 만들기", "버터 스퀴시"]), 2);
  assert.equal(regionReading({ term: "스퀴시", google: null, youtube: null }).state, "UNMEASURED");
  assert.equal(regionReading({ term: "스퀴시", google: 0, youtube: 4 }).state, "SEARCHED");
  assert.equal(regionReading({ term: "스퀴시", google: 1, youtube: 0 }).state, "FIRST_SIGNS");
  assert.equal(asiaArrival({ "2026-11-20": "QUIET", "2026-11-21": "FIRST_SIGNS" }), "2026-11-21");
  assert.equal(asiaArrival({ "2026-11-20": "SEARCHED" }), null);
  assert.match(asiaHaulUrl("다이소 신상", "KR", { key: "k", now: Date.parse("2026-11-26T00:00:00Z") }), /regionCode=KR&relevanceLanguage=ko/);
  assert.equal(cleanAsia({ regions: { KR: { term: "<b>", state: "SEARCHED" }, XX: { state: "QUIET" } } }).regions.KR.term, null);
});

test("path: steps from the radar's own measurements; before everyone only before the rush and the mass", () => {
  const early = pathStepsOf({ stage: "EMERGING", worldGap: { state: "WORLD_QUIET" }, world: { state: "NONE" }, factory: { weekPct: 5 } });
  assert.equal(early.origin, true);
  assert.equal(early.mass, false);
  assert.equal(positionOf(early).before, true);
  const mass = pathStepsOf({ stage: "PEAK", worldGap: { state: "KNOWN" } });
  assert.equal(mass.mass, true);
  assert.equal(positionOf(mass).before, false);
});

test("path: learns only from observed transitions, never from a step already lit at the first reading", () => {
  let st = mergePath({}, [{ id: "a", stage: "EMERGING", worldGap: { state: "WORLD_QUIET" } }], "2026-11-01");
  st = mergePath(st, [{ id: "a", stage: "EMERGING", worldGap: { state: "KNOWN" } }], "2026-11-11");
  assert.equal(st.a.steps.origin, "2026-11-01");
  assert.equal(st.a.steps.mass, "2026-11-11");
  const l = learnPath(st);
  assert.equal(l.steps.origin.started, 0, "origin was lit at the first reading: no observed start");
  assert.equal(l.observedMass, 1);
});

test("the path reaches the page: each card's steps and the board's counts are sanitized, counts public behind the lock", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const { teaserBoard } = await import("../src/lib/growth/radarGate.js");
  const { pathBoard, pathCard, mergePath } = await import("../src/lib/growth/trendPath.js");
  const { readFileSync } = await import("node:fs");
  const c = { id: "cloud-slides", stage: "RISING", worldGap: { state: "QUIET" }, world: { state: "NONE" }, factory: { weekPct: 5 }, shops: { rising: false }, social: { talk: { rising: true } }, gap: { state: "GAP" } };
  const st = mergePath({}, [c], "2026-11-26");
  const card = pathCard(c, st[c.id]);
  assert.equal(card.at, "community");
  assert.equal(card.before, true);
  const board = sanitizeBoard({ v: 2, at: "2026-11-26T16:00:00Z", record: {}, concepts: [{ id: "cloud-slides", he: "x", stage: "RISING", series: [], evidence: [], path: { ...card, steps: { ...card.steps, mass: "<b>" } } }], path: pathBoard([{ path: card }], st) });
  assert.equal(board.concepts[0].path.at, "community");
  assert.equal(board.concepts[0].path.steps.mass, null, "only a day or false passes");
  assert.equal(board.path.before, 1);
  const locked = teaserBoard({ ...board, record: { calls: 0 } });
  assert.deepEqual(locked.path.at, board.path.at, "the counts stay public");
  assert.equal(JSON.stringify(locked.path).includes("cloud-slides"), false, "never a kind's name behind the lock");
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<TrendPath path=\{board\.path\} \/>/);
  assert.match(page, /<PathLine p=\{c\.path\} \/>/);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /mergePath\(readJson\(join\(dir, "path\.json"\), \{\}\), withVia, today\)/, "the run keeps the history in its encrypted state");
});

test("Korea and Japan reach the card in their own words, the word asked printed, behind the lock never a kind", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const { regionReading, asiaCard, mergeAsia } = await import("../src/lib/growth/asiaSignal.js");
  const { sourcesView } = await import("../src/lib/growth/radarCore.js");
  const { readFileSync } = await import("node:fs");
  let hist = mergeAsia({}, "cloud-slides", "KR", "2026-11-25", { term: "구름 슬리퍼", state: "QUIET" });
  const kr = regionReading({ term: "구름 슬리퍼", google: 2, youtube: 0 });
  hist = mergeAsia(hist, "cloud-slides", "KR", "2026-11-26", kr);
  const card = asiaCard({ KR: kr, JP: { term: null, state: "UNMEASURED" } }, hist["cloud-slides"], "2026-11-26");
  assert.equal(card.regions.KR.state, "FIRST_SIGNS");
  assert.equal(card.regions.KR.arrived, "2026-11-26", "a sign after a quiet day is an arrival, dated");
  const board = sanitizeBoard({ v: 2, at: "2026-11-26T16:00:00Z", record: {}, concepts: [{ id: "cloud-slides", he: "x", stage: "RISING", series: [], evidence: [], asia: card }], sourcesToday: { asia: "OK" } });
  assert.equal(board.concepts[0].asia.regions.KR.term, "구름 슬리퍼");
  assert.equal(board.concepts[0].asia.regions.JP.state, "UNMEASURED");
  assert.equal(sourcesView(board.sourcesToday).find((x) => x.key === "asia").group, "read");
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<AsiaLine a=\{c\.asia\} \/>/);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_ASIA !== "0" && sources\.suggest === "OK"/, "asked only when this run read Google's robots.txt as open");
  assert.match(run, /!late\("asia", 240_000\)/, "skipped by name past the run's deadline");
});

test("the round trip: a Korean or Japanese word is used only when every word of the kind comes back (26.11's first run)", async () => {
  const { roundTripOk } = await import("../src/lib/growth/asiaSignal.js");
  assert.equal(roundTripOk("ribbed crew socks women", "the crew's pocket woman"), false, "a lost word measures another thing");
  assert.equal(roundTripOk("garlic chopper grater", "garlic saw"), false);
  assert.equal(roundTripOk("capybara squishy", "capybara"), false, "the animal alone is another search");
  assert.equal(roundTripOk("magnetic car phone mount", "Magnetic car phone mounts"), true);
  assert.equal(roundTripOk("hair claw clip", "hair claw clips"), true);
  assert.equal(roundTripOk("cable knit scarf women", "Cable scarf woman"), true, "the head noun and two of three words: the same search (26.11's run kept 3 of 40 when every word was asked)");
  assert.equal(roundTripOk("platform mini snow boots women", "I'm not sure what the platform is."), false, "the head noun lost");
  assert.equal(roundTripOk("", "x"), false);
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("scripts/catalog/trend-radar.mjs", "utf8"), /if \(!roundTripOk\(c\.en, back\)\)/);
});
