// 📣 The radar says it first (src/lib/growth/radarFeed.js; the owner, 22.11: "everyone learns it because of
// the radar"): every sealed call of the public board in an Atom feed, with its day, the day's ledger root
// and its grading day; behind the lock, only what the teaser carries; nothing unescaped.
import test from "node:test";
import assert from "node:assert/strict";
import { feedEntries, radarFeed } from "../src/lib/growth/radarFeed.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";

const SHA = "b".repeat(64);
const board = {
  at: "2026-11-22T06:00:00.000Z", record: {},
  concepts: [{ id: "cable-knit-scarf", he: "צעיף סריג", en: "cable knit scarf <b>", stage: "RISING", gap: { state: "GAP" }, supply: { state: "UNDERSUPPLIED", demandWeekPct: 229.9, supplyWeekPct: 3.6, gap: 226.3, orders: 900, listings: 400, perListing: 2.25, days: 7 } }],
  early: { need: 4, record: {}, ledger: [{ concept: "cable-knit-scarf", at: "2026-11-22", due: "2026-12-06" }] },
  supply: { measured: 125, under: 14, over: 2, top: ["cable-knit-scarf"] },
  ledger: { d: "2026-11-22", sha256: SHA, count: 1, text: `early=${"c".repeat(64)}`, ots: [] },
};

test("feed: every sealed call, newest first, with the day's root and the grading day", () => {
  const e = feedEntries(board);
  assert.deepEqual(e.map((x) => x.id), ["early/cable-knit-scarf/2026-11-22", "supply/cable-knit-scarf/2026-11-22", "ledger/2026-11-22"]);
  assert.match(e[0].text, /graded in public on 2026-12-06/);
  assert.equal(e[0].root, SHA);
  const xml = radarFeed(board);
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.ok(!xml.includes("<b>"), "store or board text is escaped");
  assert.match(xml, /<updated>2026-11-22T05:37:00Z<\/updated>/);
  assert.ok(!/promise|guarantee|the only/i.test(xml), "what IS only");
});

test("feed: behind the lock, never an open call's name", () => {
  const locked = feedEntries(teaserBoard(board));
  assert.ok(!JSON.stringify(locked).includes("cable"), "the teaser names no open call");
  assert.deepEqual(locked.map((x) => x.id), ["ledger/2026-11-22"]);
  assert.deepEqual(feedEntries(null), []);
});
