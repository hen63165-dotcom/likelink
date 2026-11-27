// 🚪 The gate every call passes before it is sealed (the owner, 26.11, over ChatGPT's audit of the
// sealed calls: "platform slippers were already marked as arrived in Israel and saturated, home
// slippers arrived and their life cycle fading, the cable-knit scarf arriving with inconsistent orders
// — make sure the radar never calls a saturated product again, in any way; only what I said").
// Before 26.11 a stage call (EMERGING / RISING) was opened the moment demand rose, before the run had
// measured anything else. Now a kind is called only when every one of these holds on the same morning:
//   • its demand is starting to rise or rising (EMERGING / RISING);
//   • before everyone (radarPicks.beforeEveryone): the world still quiet, no TikTok / Amazon / Douyin /
//     Korea echo, Israel not arrived, the world gap never KNOWN;
//   • before the world, measured: the world gap read and WORLD_QUIET or FIRST_SIGNS (27.11; SPREADING
//     — searched in three or more countries — is kept out, and an unread world waits);
//   • not fading: its acceleration shield is never DECELERATING or DECLINING;
//   • not saturated: the store's own count of its matching listings at or under the radar's line
//     (2,000, saturation.js), and that count read today (an unread count is never "open");
//   • not noise: its orders grew more than a +10% week at p ≤ 0.01 (freshRisers.growthOverDays).
// A kind that fails is named with its reason in the run's log; nothing already sealed is edited. Pure.

import { beforeEveryone } from "./radarPicks.js";
import { growthOverDays } from "./freshRisers.js";
import { SATURATION } from "./saturation.js";

export const CALL_GATE = Object.freeze({ maxListings: SATURATION.maxSimilar, nullWeekPct: 10, p: 0.01 });
export const GATE_REASONS = Object.freeze(["stage", "world_known", "world_spreading", "world_unmeasured", "buzz", "israel_arrived", "fading", "unmeasured", "saturated", "noise"]);
// Before everyone in the world, measured (the owner, 27.11: "did you make sure it focuses only on the
// goal?"): the world gap must have been read and show the kind in no more than two of its countries.
// Searched in three or more is already spreading; a kind the sweep did not read waits for a reading.
const BEFORE_THE_WORLD = new Set(["WORLD_QUIET", "FIRST_SIGNS"]);

const QUIET_WORLD = new Set(["NONE", "EARLY", "SPREADING"]);
const ISRAEL_NOT_YET = new Set(["GAP", "QUIET", "UNCERTAIN", "ARRIVING"]);

/** The reason a kind is kept out, or ok. `s` is the kind's signals today (trendRadar.signals). */
export function callGate(c, s, { rules = CALL_GATE } = {}) {
  if (!c || (c.stage !== "EMERGING" && c.stage !== "RISING")) return { ok: false, why: "stage" };
  if (!beforeEveryone(c)) {
    if (Array.isArray(c.early?.buzz) && c.early.buzz.length) return { ok: false, why: "buzz" };
    if (!ISRAEL_NOT_YET.has(c.gap?.state)) return { ok: false, why: "israel_arrived" };
    if (!QUIET_WORLD.has(c.world?.state) || c.worldGap?.state === "KNOWN") return { ok: false, why: "world_known" };
    return { ok: false, why: "world_known" };
  }
  if (c.worldGap?.state === "SPREADING") return { ok: false, why: "world_spreading" };
  if (!BEFORE_THE_WORLD.has(c.worldGap?.state)) return { ok: false, why: "world_unmeasured" };
  if (c.accel?.cls === "DECELERATING" || c.accel?.cls === "DECLINING") return { ok: false, why: "fading" };
  if (!s?.ok || !Number.isFinite(s.listings)) return { ok: false, why: "unmeasured" };
  if (s.listings > rules.maxListings) return { ok: false, why: "saturated" };
  const g = growthOverDays({ before: s.ordersBefore, after: s.orders, days: s.span }, { nullWeekPct: rules.nullWeekPct });
  if (!g || g.p > rules.p) return { ok: false, why: "noise" };
  return { ok: true, why: null };
}

// What keeps a kind off every list the radar shows as rising, on the brink or born (the gate's own
// reasons that mean "known, arrived, saturated or fading"; noise and an unread count only wait).
export const KEPT_OUT = Object.freeze(["world_known", "world_spreading", "buzz", "israel_arrived", "fading", "saturated"]);
export const keptOut = (c) => KEPT_OUT.includes(c?.gateWhy);

/** The browser's copy of the morning's tally. */
export function cleanGate(g) {
  if (!g || typeof g !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(String(g.d || ""))) return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e5 ? Math.round(Number(x)) : 0);
  return { d: g.d, rising: n(g.rising), called: n(g.called), ...Object.fromEntries(GATE_REASONS.filter((r) => r !== "stage").map((r) => [r, n(g[r])])) };
}

/** The morning's tally: how many kinds were rising, how many were called, and why the others were kept out. */
export function gateTally(results = []) {
  const out = { rising: 0, called: 0, ...Object.fromEntries(GATE_REASONS.filter((r) => r !== "stage").map((r) => [r, 0])) };
  for (const r of results) {
    if (!r || r.why === "stage") continue;
    out.rising++;
    if (r.ok) out.called++; else if (Object.hasOwn(out, r.why)) out[r.why]++;
  }
  return out;
}
