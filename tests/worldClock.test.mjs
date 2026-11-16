// The global trend clock (worldClock.js; the owner, 2026-11-16: "כן לשעון העולמי"): an arrival is
// only an OBSERVED change from quiet to searched; a country searched from the first reading has no
// arrival day; a national lag shows only from measured pairs; a "next country" call only with data.
import test from "node:test";
import assert from "node:assert/strict";
import { CLOCK_EXTRA, CLOCK_IDS, clockOf, globeBoard, gradeNextCalls, lagTable, nextCallsSealText, nextCountryOf, recordNextCalls } from "../src/lib/growth/worldClock.js";
import { spreadOf, worldReading } from "../src/lib/growth/worldPulse.js";
import { awarenessReading } from "../src/lib/growth/israelGap.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const W = (d, by = {}, x = null) => ({ ...worldReading({ by, x }, { now: Date.parse(`${d}T06:00:00Z`) }) });
const IL = (d, n) => awarenessReading({ he: [n], yt: [n], hq: ["ש"] }, { now: Date.parse(`${d}T06:00:00Z`) });

test("arrival = the first day searched after a quiet day; searched from the start = PRESENT, never an arrival", () => {
  const cl = clockOf([W("2026-11-15", { us: 2, gb: 0 }, { es: 0 }), W("2026-11-16", { us: 3, gb: 1 }, { es: 0 })], []);
  const at = (id) => cl.countries.find((c) => c.id === id);
  assert.equal(at("us").status, "PRESENT");
  assert.equal(at("us").on, null);
  assert.equal(at("gb").status, "ARRIVED");
  assert.equal(at("gb").on, "2026-11-16");
  assert.equal(at("es").status, "QUIET");
  assert.equal(at("il").status, "UNMEASURED");
  assert.deepEqual(cl.order, ["gb"]);
});

test("Israel comes from the Hebrew consensus; one quiet answer alone never counts as quiet", () => {
  const cl = clockOf([], [IL("2026-11-14", 0), IL("2026-11-16", 5)]);
  const il = cl.countries.find((c) => c.id === "il");
  assert.equal(il.status, "ARRIVED");
  assert.equal(il.on, "2026-11-16");
  const one = awarenessReading({ he: [0], yt: [null], hq: ["ש"] }, { now: Date.parse("2026-11-14T06:00:00Z") });
  assert.equal(clockOf([], [one]).countries.find((c) => c.id === "il").status, "UNMEASURED");
});

test("the clock-only countries stay out of the world pulse (the early-call signal is unchanged)", () => {
  const r = W("2026-11-16", { us: 0 }, { es: 9, it: 9, br: 9, mx: 9, in: 9 });
  assert.equal(spreadOf(r).searched, 0);
  assert.deepEqual(Object.keys(r.x).sort(), CLOCK_EXTRA.map((m) => m.id).sort());
});

const arrivedBoth = (us, il) => clockOf([W("2026-11-01", { us: 0 }), W(us, { us: 2 })], [IL("2026-11-01", 0), IL(il, 4)]);

test("Israel's lag shows only from 3 measured pairs, as a median of observed arrivals", () => {
  const two = { a: arrivedBoth("2026-11-02", "2026-11-12"), b: arrivedBoth("2026-11-03", "2026-11-23") };
  assert.equal(lagTable(two).find((r) => r.id === "il").medianDays, null);
  const three = { ...two, c: arrivedBoth("2026-11-02", "2026-11-17") };
  const il = lagTable(three).find((r) => r.id === "il");
  assert.equal(il.n, 3);
  assert.equal(il.medianDays, 15);
  assert.ok(CLOCK_IDS.includes("il") && CLOCK_IDS.includes("us"));
});

test("a next-country call needs a measured lag and the trend in the base country; graded HIT/MISS, never edited", () => {
  const quietIl = clockOf([W("2026-11-01", { us: 0 }), W("2026-11-02", { us: 2 })], [IL("2026-11-01", 0), IL("2026-11-02", 0)]);
  assert.equal(nextCountryOf(quietIl, []), null, "no data: no call");
  const table = [{ id: "il", n: 3, medianDays: 15 }];
  assert.deepEqual(nextCountryOf(quietIl, table), { country: "il", medianDays: 15, n: 3 });
  let calls = recordNextCalls([], { x: quietIl }, table, "2026-11-02");
  assert.equal(calls.length, 1);
  assert.equal(recordNextCalls(calls, { x: quietIl }, table, "2026-11-03").length, 1, "one open call per concept");
  const later = clockOf([W("2026-11-01", { us: 0 }), W("2026-11-02", { us: 2 })], [IL("2026-11-01", 0), IL("2026-11-10", 4)]);
  calls = gradeNextCalls(calls, { x: later }, "2026-11-10");
  assert.equal(calls[0].result, "HIT");
  assert.equal(gradeNextCalls(calls, { x: quietIl }, "2026-12-30")[0].result, "HIT", "a graded call is never edited");
  assert.equal(gradeNextCalls(recordNextCalls([], { x: quietIl }, table, "2026-11-02"), { x: quietIl }, "2026-11-17")[0].result, "MISS");
  assert.equal(nextCallsSealText(calls), "x|2026-11-02|il");
});

test("the board's globe passes the sanitizer; junk is dropped", () => {
  const clocks = { sq: arrivedBoth("2026-11-02", "2026-11-12") };
  const globe = globeBoard({ clocks, concepts: [{ id: "sq", he: "סקווישי", en: "squishy" }], calls: [], today: "2026-11-16" });
  assert.equal(globe.waves[0].israelAfterUs, 10);
  const doc = { at: "2026-11-16T06:00:00Z", concepts: [], record: {}, globe: { ...globe, waves: [...globe.waves, { id: "<b>", countries: [] }], calls: { open: [{ concept: "sq", country: "zz", at: "2026-11-16" }] } } };
  const clean = sanitizeBoard(doc).globe;
  assert.equal(clean.waves.length, 1);
  assert.equal(clean.waves[0].countries.find((c) => c.id === "il").on, "2026-11-12");
  assert.equal(clean.calls.open.length, 0);
  assert.equal(sanitizeBoard({ ...doc, globe: "x" }).globe, null);
});
