// 🔁 Check it yourself (the owner, 26.11, over an outside audit: "they publish accuracy nobody can check";
// the same week a forecasting scorecard elsewhere withdrew its numbers after an audit found scoring errors).
// Every visitor's own browser does the checking, with nothing to trust but the public files:
//   1. every sealed book on the board: SHA-256 of its published text = its fingerprint, and that
//      fingerprint = its line in the day's root; SHA-256 of the root's text = the root sealed in Bitcoin;
//   2. every graded call in the open evidence (the radar's new products and the yardsticks' picks):
//      its grade computed again from the store's own daily readings, by the rule printed in the file.
// A book whose text is too long to publish is said so (unchecked), never counted as checked.
// Pure; browser-safe (Web Crypto, which Node has too); tested.

import { parseLedgerText } from "./radarLedger.js";

// Where each book's seal sits on the board (radarCore.js INSTRUMENTS order; prices have no text on it).
export const BOOK_SEALS = Object.freeze({
  early: (b) => b?.early?.seal, stages: (b) => b?.stagesSeal, luck: (b) => b?.luck?.seal, baseline: (b) => b?.baseline?.seal,
  fresh: (b) => b?.fresh?.seal, kinds: (b) => b?.kinds?.seal, supply: (b) => b?.supply?.seal, brain: (b) => b?.brain?.seal,
  promise: (b) => b?.promise?.seal, window: (b) => b?.window?.seal, globe: (b) => b?.globe?.seal, run: (b) => b?.receipt?.seal,
});

const SHA = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** SHA-256 of a text, as hex (Web Crypto: the browser's own, and Node's). */
export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Every book on the board recomputed: `text` true/false (null: the text is too long to be published),
 * `root` true/false (null: the book is in another day's root). The root itself: its text's hash = its seal.
 */
export async function verifyBooks(board, { hash = sha256Hex } = {}) {
  const ledger = board?.ledger;
  const rootText = typeof ledger?.text === "string" ? ledger.text : null;
  const root = rootText && SHA.test(String(ledger.sha256 || "")) ? { d: DAY.test(String(ledger.d || "")) ? ledger.d : null, sha256: ledger.sha256, ok: (await hash(rootText)) === ledger.sha256 } : null;
  const lines = rootText ? parseLedgerText(rootText) : {};
  const rows = [];
  for (const [book, get] of Object.entries(BOOK_SEALS)) {
    const s = get(board);
    if (!s || !SHA.test(String(s.sha256 || ""))) continue;
    const text = typeof s.text === "string" ? (await hash(s.text)) === s.sha256 : null;
    const inRoot = lines[book] ? lines[book] === s.sha256 : null;
    rows.push({ book, sha256: s.sha256, text, root: inRoot, lines: typeof s.text === "string" && s.text ? s.text.split("\n").length : null });
  }
  return {
    root,
    rows,
    checked: rows.filter((r) => r.text !== null).length,
    matched: rows.filter((r) => r.text === true && r.root !== false).length,
    broken: rows.filter((r) => r.text === false || r.root === false).map((r) => r.book),
    unpublished: rows.filter((r) => r.text === null).map((r) => r.book),
  };
}

/** One call graded again from its readings: the first reading on or after its day, against its base. */
export function regradeCall(c, hitPct) {
  if (!c || !(Number(c.base) > 0) || !DAY.test(String(c.due || ""))) return { state: "UNREADABLE" };
  const after = (Array.isArray(c.readings) ? c.readings : []).filter((r) => Array.isArray(r) && DAY.test(String(r[0])) && Number.isFinite(Number(r[1])) && r[0] >= c.due).sort((a, b) => (a[0] < b[0] ? -1 : 1))[0];
  if (!after) return { state: "UNREADABLE" };
  const growth = Math.round(((Number(after[1]) - Number(c.base)) / Number(c.base)) * 1000) / 10;
  return { state: "GRADED", result: growth >= hitPct ? "HIT" : "MISS", growth, on: after[0] };
}

/**
 * Every graded call in the evidence graded again by the file's own rule: the radar's new products and,
 * when present, the yardsticks' picks. Matched / differing (named) / unreadable (its due-day reading
 * is outside the published readings), per book.
 */
export function regradeEvidence(ev) {
  const hitPct = Number(ev?.rule?.hitPct);
  if (!Number.isFinite(hitPct) || !Array.isArray(ev?.calls)) return null;
  const books = { fresh: ev.calls, naive: ev.baseline?.naive || [], random: ev.baseline?.random || [] };
  const out = {};
  for (const [k, list] of Object.entries(books)) {
    const t = { graded: 0, matched: 0, differ: [], unreadable: 0, hits: 0 };
    for (const c of Array.isArray(list) ? list : []) {
      if (c?.result !== "HIT" && c?.result !== "MISS") continue;
      t.graded++;
      if (c.result === "HIT") t.hits++;
      const g = regradeCall(c, hitPct);
      if (g.state !== "GRADED") { t.unreadable++; continue; }
      if (g.result === c.result) t.matched++; else t.differ.push(String(c.id));
    }
    out[k] = t;
  }
  return { at: DAY.test(String(ev.at || "")) ? ev.at : null, hitPct, books: out };
}
