// The radar's brain (src/lib/growth/radarBrain.js; the owner, 2026-11-20: "כן למוח"): it learns only
// from graded calls that recorded their signals the day they were made, only from grades before today,
// says nothing about a signal below 5 grades on each side, gives history (never a forecast), never
// lowers the bar, and its whole state is sealed every day as the book "brain".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAIN, SIGNALS, brainText, freshFeatures, kindFeatures, learn, likeThis } from "../src/lib/growth/radarBrain.js";
import { recordFresh } from "../src/lib/growth/freshRisers.js";
import { recordKinds } from "../src/lib/growth/newKinds.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const call = (i, hit, f, gradedAt = "2026-11-15") => ({ id: `c${i}`, at: "2026-11-01", due: "2026-11-15", gradedAt, result: hit ? "HIT" : "MISS", f });
const F = (weekPct, extra = {}) => ({ weekPct, heldPct: 50, orders: 300, similar: 100, yt: "NONE", price: 10, ...extra });

test("every call keeps the signals it had the day it was made, and the brain's version", () => {
  const riser = { id: "1005000000000001", title: "x", orders: 320, weekPct: 95, heldPct: 44, price: 12.5, category: "kids", known: { similar: 180, yt: { level: "EARLY" } } };
  const [c] = recordFresh([], [riser], "2026-11-20");
  assert.deepEqual(c.f, { weekPct: 95, heldPct: 44, orders: 320, similar: 180, yt: "EARLY", price: 12.5, category: "kids" });
  assert.equal(c.v, BRAIN.version);
  const [k] = recordKinds([], [{ en: "ear cuff", members: ["1", "2", "3"], medianWeekPct: 40, orders: 900, category: "earrings", bases: { 1: 300 } }], "2026-11-20");
  assert.deepEqual(k.f, { members: 3, median: 40, orders: 900, category: "earrings" });
  assert.deepEqual(freshFeatures({}), { weekPct: null, heldPct: null, orders: null, similar: null, yt: null, price: null, category: "" });
  assert.deepEqual(kindFeatures({ members: 4 }), { members: 4, median: null, orders: null, category: "" });
});

test("a signal's lesson needs 5 grades with it and 5 without; until then the brain says it is learning", () => {
  const few = learn({ fresh: [call(1, true, F(100)), call(2, false, F(50))] }, { today: "2026-11-20" });
  assert.equal(few.ready, false);
  assert.equal(few.books.fresh.graded, 2);
  assert.equal(likeThis(F(100), few.books.fresh, [], { book: "fresh" }), null, "no lesson, no answer");
  const calls = [];
  for (let i = 0; i < 6; i++) calls.push(call(i, true, F(100)));
  for (let i = 6; i < 12; i++) calls.push(call(i, i === 6, F(50)));
  const m = learn({ fresh: calls }, { today: "2026-11-20" });
  const fast = m.books.fresh.signals.find((s) => s.key === "fast");
  assert.deepEqual([fast.with.n, fast.with.hits, fast.without.n, fast.without.hits, fast.ready], [6, 6, 6, 1, true]);
  assert.equal(fast.lift, 62.5, "smoothed: (6+1)/(6+2) − (1+1)/(6+2)");
  assert.equal(m.books.fresh.signals[0].key, "fast", "the strongest lesson first");
  const like = likeThis(F(120), m.books.fresh, calls, { book: "fresh", today: "2026-11-20" });
  assert.deepEqual([like.n, like.hits], [6, 6], "history of calls like this, with how many it rests on");
});

test("only what was known then and graded before today: no calls without signals, no peeking at today", () => {
  const old = { id: "o", result: "HIT", gradedAt: "2026-11-10" }; // made before the brain: no signals
  const today = call(99, true, F(100), "2026-11-20");
  const m = learn({ fresh: [old, today, call(1, false, F(50))] }, { today: "2026-11-20" });
  assert.equal(m.books.fresh.graded, 1);
  assert.equal(m.books.fresh.calls, 3);
  assert.equal(m.books.fresh.withSignals, 2);
});

test("the learning curve is graded calls and hits per week", () => {
  const m = learn({ fresh: [call(1, true, F(100), "2026-11-16"), call(2, false, F(50), "2026-11-18"), call(3, true, F(100), "2026-11-25")] }, { today: "2026-12-01" });
  assert.deepEqual(m.books.fresh.curve, [{ week: "2026-11-16", graded: 2, hits: 1 }, { week: "2026-11-23", graded: 1, hits: 1 }]);
});

test("the brain's state is sealed as text and reaches the page clean", () => {
  const calls = [];
  for (let i = 0; i < 12; i++) calls.push(call(i, i < 7, F(i < 6 ? 100 : 50)));
  const m = learn({ fresh: calls, kinds: [] }, { today: "2026-11-20" });
  const text = brainText(m);
  assert.ok(text.includes("v1|fresh|all|12|7"));
  assert.ok(text.includes("v1|fresh|fast|6|6|6|1"));
  const board = sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], brain: { ...m, seal: { d: "2026-11-20", sha256: "b".repeat(64), count: 1, text, ots: [] } } });
  assert.equal(board.brain.seal.text, text);
  assert.equal(board.brain.books.fresh.signals.find((s) => s.key === "fast").lift, 62.5);
  assert.equal(SIGNALS.fresh.every((s) => typeof s.test === "function"), true);
});

test("wiring: the runner learns after grading, seals the brain in the daily root, and leaves the bar alone", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /learn\(\{ fresh: freshCalls, kinds: kindsAll \}, \{ today \}\)/);
  assert.match(run, /brain: board\.brain\?\.seal\?\.sha256/);
  const brain = readFileSync("src/lib/growth/radarBrain.js", "utf8");
  assert.doesNotMatch(brain, /import[^;]*(freshBar|FRESH|KINDS)/, "the brain never touches the bar");
});
