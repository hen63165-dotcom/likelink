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
    // The weekly challenge is public on purpose (it is the post people vote on): the open one carries
    // no choice and no salt; graded ones are revealed.
    challenge: board.challenge || null,
    // The complete ledger's root is public on purpose: it names no call (only the books' hashes), and
    // it is what lets anyone see later that nothing was added or removed after the day.
    ledger: board.ledger ? { d: board.ledger.d, sha256: board.ledger.sha256, count: board.ledger.count, text: board.ledger.text, ots: board.ledger.ots || [] } : null,
    // The Bitcoin anchors of past days' roots: public for the same reason (block numbers and roots, no call).
    anchors: board.anchors || null,
    // 📡 What the run read today: states only, never a find, so it stays public.
    sourcesToday: board.sourcesToday || null,
    lastDaily: board.lastDaily || null,
    // 🧾 The run receipt: counts and the run's public log only, never a find; public behind the lock.
    receipt: board.receipt || null,
    scan: board.scan || null,
    // ⏳ The window clock's record is public; the chances name the finds, so they stay behind the lock.
    window: board.window ? { v: board.window.v, at: board.window.at, line: board.window.line, horizons: board.window.horizons || [], record: board.window.record || [], issued: board.window.issued || 0, open: board.window.open || 0, nextDue: board.window.nextDue || null, recent: [], seal: board.window.seal ? { d: board.window.seal.d, sha256: board.window.seal.sha256, count: board.window.seal.count, ots: board.window.seal.ots || [] } : null } : null,
    // 📐 The proven range: the method's state and the coverage record are public; the day's ranges
    // (which name items) and the book's text stay behind the lock, its hash and proofs do not.
    promise: board.promise ? { v: board.promise.v, at: board.promise.at, horizons: board.promise.horizons || [], coverage: board.promise.coverage || [], chance: board.promise.chance || [], issued: board.promise.issued || 0, open: board.promise.open || 0, nextDue: board.promise.nextDue || null, recent: [], seal: board.promise.seal ? { d: board.promise.seal.d, sha256: board.promise.seal.sha256, count: board.promise.seal.count, ots: board.promise.seal.ots || [] } : null } : null,
    // The radar vs luck: the record and the comparison stay public; the day's draw does not.
    luck: board.luck ? { versus: board.luck.versus, draws: board.luck.draws, nextDue: board.luck.nextDue, recent: board.luck.recent || [], today: null, seal: board.luck.seal ? { d: board.luck.seal.d, sha256: board.luck.seal.sha256, count: board.luck.seal.count, ots: board.luck.seal.ots || [] } : null } : null,
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
