// 🚪 The call gate (callGate.js; the owner, 26.11, over ChatGPT's audit of the sealed calls: platform
// slippers already arrived in Israel and saturated, home slippers fading, a cable-knit scarf with
// inconsistent orders). A kind is called only before everyone, not fading, not saturated, not noise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALL_GATE, callGate, cleanGate, gateTally, keptOut } from "../src/lib/growth/callGate.js";
import { updateCalls } from "../src/lib/growth/trendRadar.js";
import { radarCandidates } from "../src/lib/growth/radarPicks.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const early = { stage: "RISING", world: { state: "EARLY" }, gap: { state: "GAP" }, worldGap: { state: "FIRST_SIGNS" }, early: { buzz: [] }, accel: { cls: "ACCELERATING" } };
const sig = (over = {}) => ({ ok: true, orders: 900, ordersBefore: 500, span: 7, listings: 800, ...over });

test("a kind before everyone, not fading, not saturated and beating the noise is called", () => {
  assert.deepEqual(callGate(early, sig()), { ok: true, why: null });
});

test("the audit's three kinds are kept out, each with its reason", () => {
  assert.equal(callGate({ ...early, gap: { state: "ARRIVED" } }, sig({ listings: 40_000 })).why, "israel_arrived", "platform slippers: arrived in Israel");
  assert.equal(callGate({ ...early, accel: { cls: "DECLINING" } }, sig()).why, "fading", "home slippers: fading");
  assert.equal(callGate(early, sig({ orders: 520, ordersBefore: 500 })).why, "noise", "the scarf: a rise the counting noise explains");
});

test("saturated, known, buzzing or unread is never a call", () => {
  assert.equal(callGate(early, sig({ listings: CALL_GATE.maxListings + 1 })).why, "saturated");
  assert.equal(callGate(early, sig({ listings: null })).why, "unmeasured", "an unread count is never open");
  assert.equal(callGate({ ...early, world: { state: "WIDE" } }, sig()).why, "world_known");
  assert.equal(callGate({ ...early, worldGap: { state: "KNOWN" } }, sig()).why, "world_known");
  assert.equal(callGate({ ...early, early: { buzz: ["tiktok"] } }, sig()).why, "buzz");
  assert.equal(callGate({ ...early, stage: "STEADY" }, sig()).why, "stage");
  assert.equal(callGate({ ...early, accel: { cls: "DECELERATING" } }, sig()).why, "fading");
});

test("the run grades without opening; a call opens only after the gate, and the radar's pick and the brink follow it", () => {
  const readings = [{ d: "2026-11-20", sum: 500, top: [] }, { d: "2026-11-26", sum: 900, top: [] }];
  assert.equal(updateCalls([], "x", "RISING", readings, { now: Date.parse("2026-11-26T06:00:00Z"), open: false }).length, 0);
  assert.equal(updateCalls([], "x", "RISING", readings, { now: Date.parse("2026-11-26T06:00:00Z") }).length, 1);
  const board = { concepts: [{ id: "slippers", today: { orders: 10 }, ...early, gateWhy: "saturated" }, { id: "jelly-ring", today: { orders: 10 }, ...early, gateWhy: "ok" }] };
  assert.deepEqual(radarCandidates(board).map((c) => c.id), ["jelly-ring"]);
  assert.equal(keptOut({ gateWhy: "israel_arrived" }), true);
  assert.equal(keptOut({ gateWhy: "noise" }), false, "noise only waits for tomorrow");
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /updateCalls\(calls, c\.id, stage, readings\[c\.id\], \{ now, open: false \}\)/);
  assert.match(run, /if \(gate\.ok\) calls = updateCalls/);
  assert.match(run, /c\.early\.level === "CALL" && gate\.ok/, "an early call passes the same gate");
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /c\.early\.count === 3 && !keptOut\(c\)/);
});

test("the morning's tally reaches the board, the reasons as counts", () => {
  const t = gateTally([{ ok: true }, { ok: false, why: "saturated" }, { ok: false, why: "israel_arrived" }, { ok: false, why: "stage" }]);
  assert.equal(t.rising, 3);
  assert.equal(t.called, 1);
  assert.equal(t.saturated, 1);
  const board = sanitizeBoard({ at: "2026-11-26T06:00:00Z", concepts: [{ id: "slippers", he: "x", stage: "RISING", series: [], evidence: [], gateWhy: "saturated" }], record: {}, callGate: { d: "2026-11-26", ...t } });
  assert.equal(board.callGate.saturated, 1);
  assert.equal(board.concepts[0].gateWhy, "saturated");
  assert.equal(cleanGate({ d: "x" }), null);
});

test("before the world, measured (27.11): spreading in 3+ countries is kept out, an unread world waits", () => {
  assert.equal(callGate({ ...early, worldGap: { state: "SPREADING" } }, sig()).why, "world_spreading");
  assert.equal(callGate({ ...early, worldGap: { state: "UNMEASURED" } }, sig()).why, "world_unmeasured");
  assert.equal(callGate({ ...early, worldGap: undefined }, sig()).why, "world_unmeasured", "a kind the sweep did not read is never called");
  assert.deepEqual(callGate({ ...early, worldGap: { state: "WORLD_QUIET" } }, sig()), { ok: true, why: null });
  assert.equal(keptOut({ gateWhy: "world_spreading" }), true, "kept off the brink and the radar's pick");
  assert.equal(keptOut({ gateWhy: "world_unmeasured" }), false, "an unread world only waits");
  const t = gateTally([{ ok: false, why: "world_spreading" }, { ok: false, why: "world_unmeasured" }]);
  assert.equal(t.world_spreading, 1);
  assert.equal(t.world_unmeasured, 1);
});
