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
