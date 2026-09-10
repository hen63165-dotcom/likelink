/**
 * LikeLink VERITAS 🔏 — self-verifying integrity ledger (pure, no I/O).
 * ===================================================================
 * A cryptographic hash-chain ("garland" ledger) of every autonomous cloud
 * action. Each entry is chained to the previous one:
 *
 *   entry[i] = { ..., prev: hash[i-1], hash: sha256(canonical({ prev, ...body })) }
 *
 * Tamper-proof property: changing ANY past entry invalidates every
 * subsequent hash — so the ledger proves, in public, that the autonomous
 * kernel (cron runs, attribution repairs, campaign creations) has NOT been
 * silently altered. Anyone can verify it with a single call. This is the
 * "only ours" integrity seal: the cloud both acts AND proves itself.
 *
 * Design rules:
 *   • PURE module — no network, no secrets, no side effects.
 *   • Entry bodies are small, serializable, never contain secrets.
 *   • append is O(1); verify is O(n); ledger is internally capped.
 */

import crypto from "crypto";

export const VERITAS_GENESIS = "likelink-veritas-genesis";

/** Internal cap — the ledger keeps the most recent entries only. */
export const VERITAS_MAX_ENTRIES = 500;

/** Canonical JSON of an object, keys sorted — stable hashing across runtimes. */
function canonical(obj) {
  const keys = Object.keys(obj || {}).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

/** sha256 of `{ prev, ...entry }` with a domain prefix (veritas-scoped). */
export function hashEntry(prevHash, entry) {
  const data = canonical({ prev: prevHash || null, ...(entry || {}) });
  return crypto.createHash("sha256").update(`likelink-veritas:${data}`).digest("hex");
}

/** Strip the stored-linkage fields before re-hashing an existing record. */
function stripLinkage(record) {
  const { prev, hash, seq, ...body } = record || {};
  return body;
}

/**
 * Append one entry — returns a NEW ledger array (pure). Cap keeps memory sane.
 * @param {Array} ledger — existing ledger (or []).
 * @param {object} entry — { type, ...data } (ts, seq, prev, hash auto-added).
 */
export function appendVeritas(ledger, entry) {
  const list = (Array.isArray(ledger) ? ledger : []).filter(Boolean).slice(-VERITAS_MAX_ENTRIES);
  const prev = list.length ? list[list.length - 1].hash : VERITAS_GENESIS;
  const seq = list.length ? list[list.length - 1].seq + 1 : 1;
  const body = { ...(entry || {}), ts: new Date().toISOString(), seq };
  const hash = hashEntry(prev, body);
  return [...list, { ...body, prev, hash }].slice(-VERITAS_MAX_ENTRIES);
}

/**
 * Verify the full chain.
 * Returns { valid, count, root, brokenAt, reason }.
 */
export function verifyVeritas(ledger) {
  const list = (Array.isArray(ledger) ? ledger : []).filter(Boolean);
  let prev = VERITAS_GENESIS;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.prev !== prev) {
      return { valid: false, count: list.length, root: null, brokenAt: i, reason: "link_break" };
    }
    const expected = hashEntry(prev, stripLinkage(e));
    if (expected !== e.hash) {
      return { valid: false, count: list.length, root: null, brokenAt: i, reason: "hash_mismatch" };
    }
    prev = e.hash;
  }
  const last = list.length ? list[list.length - 1] : null;
  return { valid: true, count: list.length, root: last ? last.hash : VERITAS_GENESIS, brokenAt: null, reason: "ok" };
}

/**
 * Compact summary for dashboards/reports: validity + tail event types.
 * @param {Array} ledger
 * @param {number} tail — how many recent events to include.
 */
export function veritasSummary(ledger, tail = 8) {
  const list = (Array.isArray(ledger) ? ledger : []).filter(Boolean);
  const check = verifyVeritas(list);
  const recent = list.slice(-tail).map((e) => ({
    seq: e.seq,
    type: e.type,
    ts: e.ts,
    ok: e.ok,
    summary: e.summary || null,
  }));
  return {
    ...check,
    first: list.length ? list[0].ts : null,
    last: list.length ? list[list.length - 1].ts : null,
    recent,
  };
}