// 📦 The radar as data (the owner, 26.11: "check what made Wix — and every giant — buy such code, and
// surpass it, so that anyone, even bigger than Wix, would want to buy the radar"). The research
// (docs/research/radar-acquisition.md) found buyers paying first for what they cannot build later — a
// proprietary data asset (Similarweb buys data companies and signs multi-year AI data deals; Semrush
// bought Exploding Topics' trend data, then Adobe bought Semrush) — and for what plugs straight into
// their own product (Modalyst into the Wix dashboard, Shopify's AI tuck-ins). The radar's one asset that
// nobody can make later is its sealed history: a day is timestamped in Bitcoin only on that day.
// This module counts that asset from the public board and the public price index only, and lists every
// open file with what it holds, so a platform, a researcher or an AI engine can read it and check it.
// The open files and the head's JSON-LD are in radarOpenData.js (light: publicSeo imports it).
// Pure; browser-safe; tested (tests/radarDataset.test.mjs).

export { OPEN_FILES, LEDGER_SINCE, datasetJsonLd } from "./radarOpenData.js";

import { OPEN_FILES } from "./radarOpenData.js";
import { BOOK_SEALS } from "./radarVerify.js";
import { provenRecord } from "./radarCore.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{64}$/;
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/** Every sealed book on the board with its records today (its published text's lines, else its count). */
export function sealedBooks(board = {}) {
  const out = [];
  for (const [book, get] of Object.entries(BOOK_SEALS)) {
    const s = get(board);
    if (!s || !SHA.test(String(s.sha256 || ""))) continue;
    const lines = typeof s.text === "string" && s.text ? s.text.split("\n").length : int(s.count);
    out.push({ book, records: lines ?? 0 });
  }
  return out;
}

/** The price index's own numbers (realDeal / price-ledger.mjs), only when they read as such. */
export function pricesOf(index) {
  if (!index || typeof index !== "object") return null;
  const items = int(index.items);
  const since = DAY.test(String(index.first || "")) ? index.first : null;
  if (!items || !since) return null;
  const seals = index.seals && typeof index.seals === "object" ? Object.keys(index.seals).filter((d) => DAY.test(d) && SHA.test(String(index.seals[d]?.sha256 || ""))) : [];
  const t = index.tally && typeof index.tally === "object" ? index.tally : null;
  const tally = t && int(t.sales) && int(t.real) !== null && int(t.raised) !== null && t.real + t.raised <= t.sales && DAY.test(String(t.d || "")) ? { d: t.d, sales: t.sales, real: t.real, raised: t.raised } : null;
  return { items, since, sealedDays: seals.length, tally };
}

/**
 * The card: the sealed history (days with a root, days verified inside a Bitcoin block, the latest
 * block), today's books and their records, the price ledger, the strongest graded record, the files.
 * Nothing here is estimated: a number the board or the index did not carry is null.
 */
export function datasetCard(board = {}, priceIndex = null) {
  const a = board?.anchors && typeof board.anchors === "object" ? board.anchors : null;
  const list = Array.isArray(a?.list) ? a.list : [];
  const latest = list[0] && Number.isInteger(list[0].height) ? { d: list[0].d, height: list[0].height, block: list[0].block } : null;
  const books = sealedBooks(board);
  const ledger = board?.ledger && SHA.test(String(board.ledger.sha256 || "")) ? board.ledger : null;
  return {
    v: 1,
    at: typeof board?.at === "string" ? board.at : null,
    name: "LikeLink2 trend radar — the sealed ledger",
    sealed: {
      since: DAY.test(String(a?.since || "")) ? a.since : null,
      days: int(a?.days),
      inBitcoin: list.length,
      pending: int(a?.pending),
      latest,
    },
    today: ledger ? { d: DAY.test(String(ledger.d || "")) ? ledger.d : null, root: ledger.sha256, books: books.length, records: books.reduce((s, b) => s + b.records, 0), perBook: books } : null,
    prices: pricesOf(priceIndex),
    proven: provenRecord(board),
    use: { he: "חופשי לקרוא ולבדוק. כל שימוש אחר, כולל חיבור לפלטפורמה, בתיאום עם בעלת האתר.", en: "Free to read and verify. Any other use, including connecting it to a platform, by agreement with the site's owner (see LICENSE)." },
    files: OPEN_FILES.map(({ id, url, format, every, en }) => ({ id, url, format, every, what: en })),
  };
}
