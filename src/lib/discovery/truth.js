// Truth layer — every status LikeLink shows is an Evidence record.
//
// LAW 01 (truth before action), LAW 03 (proof before status) and LAW 15
// (continuous verification) are enforced here: a status is only as strong as
// its evidence. An Evidence record without a source or evidence is rejected;
// when its evidence expires it downgrades to STALE on its own, so a badge can
// never outlive the proof behind it.

export const TRUTH = Object.freeze({
  VERIFIED: "VERIFIED",       // proven by a system/provider observation
  OBSERVED: "OBSERVED",       // seen in our own records, not externally confirmed
  UNVERIFIED: "UNVERIFIED",   // claimed / requested / queued — not proof
  STALE: "STALE",             // was proven, evidence expired
  MISSING: "MISSING",         // no evidence at all
});

export const TRUTH_LABEL = Object.freeze({
  VERIFIED: "מאומת",
  OBSERVED: "נרשם במערכת",
  UNVERIFIED: "לא מאומת",
  STALE: "האימות פג",
  MISSING: "אין עדות",
});

const RANK = { VERIFIED: 4, OBSERVED: 3, UNVERIFIED: 2, STALE: 1, MISSING: 0 };

/**
 * Build an Evidence record. Throws when a positive state has no source or no
 * evidence — a status without proof cannot be constructed (LAW 03).
 */
export function evidence({ state, source, evidence: proof, verifiedAt = null, ttlMs = null, confidence = null, owner = "system" } = {}) {
  const s = TRUTH[state] ? state : TRUTH.MISSING;
  if ((s === TRUTH.VERIFIED || s === TRUTH.OBSERVED) && (!source || !proof)) {
    throw new Error(`truth_without_evidence:${s}`);
  }
  const at = verifiedAt == null ? null : Number(verifiedAt);
  return {
    state: s,
    source: source || null,
    evidence: proof || null,
    verifiedAt: at,
    expiresAt: at && ttlMs ? at + Number(ttlMs) : null,
    confidence: confidence == null ? (s === TRUTH.VERIFIED ? 1 : s === TRUTH.OBSERVED ? 0.7 : 0) : Number(confidence),
    owner,
  };
}

/** Effective state at `now` — expired proof downgrades to STALE (LAW 15). */
export function effectiveState(ev, now = Date.now()) {
  if (!ev || !TRUTH[ev.state]) return TRUTH.MISSING;
  if ((ev.state === TRUTH.VERIFIED || ev.state === TRUTH.OBSERVED) && ev.expiresAt && Number(now) > ev.expiresAt) {
    return TRUTH.STALE;
  }
  return ev.state;
}

/** Only VERIFIED evidence that has not expired may back a positive claim. */
export function isProven(ev, now = Date.now()) {
  return effectiveState(ev, now) === TRUTH.VERIFIED;
}

/** The weaker of several pieces of evidence (a chain is as strong as its weakest link). */
export function weakest(list = [], now = Date.now()) {
  if (!list.length) return TRUTH.MISSING;
  return list.map((e) => effectiveState(e, now)).sort((a, b) => RANK[a] - RANK[b])[0];
}
