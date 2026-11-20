// The complete sealed ledger (the owner, 2026-11-17: "make the radar a million levels above everyone,
// so everyone depends only on what it says"). The worldwide check that day: every trend company
// publishes an accuracy it measured itself — Pinterest Predicts 80%, WGSN 94%, Heuritech 92%,
// Glimpse 95% — and none of them is audited from outside. A timestamp alone proves little: whoever
// seals every possible outcome and later shows only the one that came true has a "record" too
// (the scam described on the OpenZeppelin forum). A record means something only when EVERY call,
// misses included, is sealed before it is graded.
//
// So every day the radar seals each of its books — the early calls, every new product it showed
// (the fresh risers, which were not sealed before 17.11), the "next country" calls and the day's
// store prices — and then ONE root over all of them: a line per book, `name=<sha256 of its text>`,
// sorted by name. The root is sent to the OpenTimestamps calendars like every seal; each book's
// text is published, so anyone can recompute every hash and the root, and see that nothing was
// added, removed or changed after the day. Pure: the runner hashes and stamps.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ITEM = /^\d{6,20}$/;
const SHA = /^[0-9a-f]{64}$/;
const CONCEPT = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const LEDGER_BOOKS = Object.freeze(["early", "stages", "luck", "fresh", "kinds", "globe", "prices"]);

/**
 * Every ordinary stage call (a concept that turned EMERGING or RISING), one line each:
 * `concept|called on|stage|orders then|graded on|grade`. Before 18.11 these were kept and graded but
 * never sealed (the owner, 17.11: "how will people know there is nothing like it?" — the answer has
 * to be true for every call, not only the early ones). Early calls have their own book.
 */
export function stagesSealText(calls = []) {
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => c && c.kind !== "early" && CONCEPT.test(String(c.concept || "")) && (c.stage === "EMERGING" || c.stage === "RISING") && DAY.test(String(c.at || "")) && DAY.test(String(c.due || "")) && Number(c.base) > 0)
    .map((c) => `${c.concept}|${c.at}|${c.stage}|${Math.round(Number(c.base))}|${c.due}|${c.result === "HIT" || c.result === "MISS" ? c.result : "-"}`)
    .sort()
    .join("\n");
}

/**
 * Every new product the radar has shown, one line each: `item|shown on|orders then|graded on|grade`.
 * The grade is "-" while open, then HIT or MISS (never edited, so a sealed line only ever gains
 * its grade once). Sorted, so the same book always gives the same text.
 */
export function freshSealText(calls = []) {
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => c && ITEM.test(String(c.id || "")) && DAY.test(String(c.at || "")) && DAY.test(String(c.due || "")) && Number(c.base) > 0)
    .map((c) => `${c.id}|${c.at}|${Math.round(Number(c.base))}|${c.due}|${c.result === "HIT" || c.result === "MISS" ? c.result : "-"}`)
    .sort()
    .join("\n");
}

/** The root's text: `name=<sha256>` per sealed book, in a fixed order; null when no book is sealed. */
export function ledgerText(parts = {}) {
  const lines = LEDGER_BOOKS.filter((k) => SHA.test(String(parts?.[k] || ""))).map((k) => `${k}=${parts[k]}`);
  return lines.length ? lines.join("\n") : null;
}

/** Reads a root text back into its books (for the page and for anyone checking). */
export function parseLedgerText(text = "") {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const m = /^([a-z]+)=([0-9a-f]{64})$/.exec(line.trim());
    if (m && LEDGER_BOOKS.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}
