// The radar's lock (the owner, 2026-11-15: "כן לנעילה" — "each person who enters gets their own
// access"). The full board lives server-side (kv `radar:board`, written by the radar run) and is
// served only while the owner's trial is open, or to a signed-in user with an active radar
// subscription (radarSubs.js, verified with PayPal). The public file keeps only the proof: the
// graded calls, the record and calibration, and the seal's fingerprint and Bitcoin proofs — a
// sealed envelope: an open call's concept stays inside until it is graded. Pure; tested.
import { accessOf } from "./radarPlans.js";
import { radarSubAccess } from "./radarSubs.js";

export const RADAR_BOARD_KEY = "radar:board";
// Each user's own free trial (the owner, 2026-11-15: "a separate access, a free trial, then they
// subscribe — like Claude"): it starts the first time she opens the radar signed in after the launch
// trial has ended, and lasts USER_TRIAL_DAYS (marketplace:settings.radarAccess.userTrialDays, 3–30).
export const RADAR_TRIALS_KEY = "radar:trials";
export const USER_TRIAL_DAYS = 7;
const DAY = 86_400_000;

export function userTrialDays(settings = {}) {
  const n = Number(settings?.radarAccess?.userTrialDays);
  return Number.isFinite(n) && n >= 3 && n <= 30 ? Math.round(n) : USER_TRIAL_DAYS;
}

/** One user's trial from its start: active until startedAt + days. */
export function userTrialOf(record, { days = USER_TRIAL_DAYS, now = Date.now() } = {}) {
  const start = Date.parse(record?.startedAt || "");
  if (!Number.isFinite(start)) return null;
  const endsAt = start + days * DAY;
  return { startedAt: new Date(start).toISOString(), endsAt: new Date(endsAt).toISOString(), active: now < endsAt, daysLeft: Math.max(0, Math.ceil((endsAt - now) / DAY)) };
}

/**
 * Who may read the full board: the open launch trial; this user's active subscription; this user's
 * own trial while it runs. Otherwise: sign in for a trial (anonymous), or subscribe (trial used).
 */
export function boardAccess({ settings = {}, sub = null, trial = null, signedIn = false, now = Date.now() } = {}) {
  const a = accessOf(settings, { now });
  if (!a.locked) return { full: true, reason: "open" };
  if (sub && radarSubAccess(sub, now)) return { full: true, reason: "subscriber" };
  if (trial?.active) return { full: true, reason: "trial", trialEndsAt: trial.endsAt, daysLeft: trial.daysLeft };
  if (!signedIn) return { full: false, reason: "sign_in_for_trial" };
  return { full: false, reason: "subscription_required", trialEndedAt: trial?.endsAt || null };
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
