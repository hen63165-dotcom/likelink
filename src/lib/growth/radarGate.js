// The radar's lock (the owner, 2026-11-15: "כן לנעילה" — "each person who enters gets their own
// access"). The full board lives server-side (kv `radar:board`, written by the radar run) and is
// served only while the owner's trial is open, or to a signed-in user with an active radar
// subscription (radarSubs.js, verified with PayPal). The public file keeps only the proof: the
// graded calls, the record and calibration, and the seal's fingerprint and Bitcoin proofs — a
// sealed envelope: an open call's concept stays inside until it is graded. Pure; tested.
import { accessOf } from "./radarPlans.js";
import { radarSubAccess } from "./radarSubs.js";

export const RADAR_BOARD_KEY = "radar:board";

/** Who may read the full board: the open trial, or this user's active radar subscription. */
export function boardAccess({ settings = {}, sub = null, now = Date.now() } = {}) {
  const a = accessOf(settings, { now });
  if (!a.locked) return { full: true, reason: "open" };
  if (sub && radarSubAccess(sub, now)) return { full: true, reason: "subscriber" };
  return { full: false, reason: "subscription_required" };
}

/** The public teaser: the proof without the live calls (no concept, no seal text, open calls counted only). */
export function teaserBoard(board) {
  if (!board || typeof board !== "object") return null;
  const e = board.early && typeof board.early === "object" ? board.early : null;
  const ledger = Array.isArray(e?.ledger) ? e.ledger : [];
  return {
    v: board.v,
    at: board.at,
    teaser: true,
    record: board.record,
    clock: board.clock,
    concepts: [],
    early: e ? {
      need: e.need,
      record: e.record,
      calibration: e.calibration || null,
      lead: e.lead || null,
      ledger: ledger.filter((x) => x?.result === "HIT" || x?.result === "MISS"),
      open: ledger.filter((x) => !x?.result).length,
      seal: e.seal ? { d: e.seal.d, sha256: e.seal.sha256, count: e.seal.count, ots: e.seal.ots || [] } : null,
    } : null,
  };
}
