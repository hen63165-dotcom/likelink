// 📡 The radar's one core (src/lib/growth/radarCore.js; the owner, 2026-11-20: "everything unified into
// one radar, one code, and a page anyone understands, trustworthy and verified"). One list of
// instruments feeds the sealed root's book order, the page's tabs and labels; one record covers every
// book with the same columns; one card shows every find with the same rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOOKS, INSTRUMENTS, SECTION_TABS, findFacts, recordView, resultText } from "../src/lib/growth/radarCore.js";
import { LEDGER_BOOKS } from "../src/lib/growth/radarLedger.js";

const page = readFileSync("src/components/discover/radar.jsx", "utf8");
const LRI = "⁦";
const PDI = "⁩";

test("one list of instruments: the root's books, the page's tabs and labels all come from it", () => {
  assert.deepEqual([...LEDGER_BOOKS], [...BOOKS], "the sealed root's order is the core's");
  assert.deepEqual([...BOOKS], ["early", "stages", "luck", "baseline", "versus", "fresh", "kinds", "prelaunch", "supply", "brain", "promise", "window", "globe", "prices", "run"]);
  assert.equal(new Set(INSTRUMENTS.map((i) => i.id)).size, INSTRUMENTS.length);
  for (const i of INSTRUMENTS) {
    assert.ok(i.he && i.en && i.whatHe && i.whatEn, i.id);
    assert.match(page, new RegExp(`id="${i.section}"`), `the page has the section #${i.section}`);
    assert.ok(["today", "proof", "tools", "plans"].includes(SECTION_TABS[i.section]), `#${i.section} opens a tab`);
  }
  assert.match(page, /const TAB_OF = SECTION_TABS;/);
  assert.match(page, /const BOOK_HE = Object\.fromEntries\(INSTRUMENTS\.map/);
  assert.match(page, /<RecordTable board=\{board\} \/>/);
});

test("one record over every book: the same columns, only what the board measured", () => {
  const board = {
    at: "2026-11-24T06:00:00Z",
    early: { record: { calls: 2, graded: 1, hits: 1, pending: 1 }, ledger: [{ concept: "a", at: "2026-11-10", due: "2026-11-24", result: "HIT" }, { concept: "b", at: "2026-11-20", due: "2026-12-04" }] },
    record: { calls: 5, graded: 3, hits: 1, pending: 2, nextDue: "2026-11-30" },
    fresh: { record: { calls: 4, graded: 0, hits: 0, pending: 4, nextDue: "2026-12-04" } },
    luck: { draws: 6, versus: { luck: { graded: 2, hits: 0 }, edge: null }, nextDue: "2026-11-25" },
    brain: { books: { fresh: { calls: 4, graded: 0, hits: 0 }, kinds: { calls: 0, graded: 0, hits: 0 } } },
    promise: { open: 300, nextDue: "2026-11-25", coverage: [{ h: 3, level: 90, n: 100, held: 91 }, { h: 3, level: 80, n: 100, held: 80 }, { h: 7, level: 90, n: 0, held: 0 }], chance: [{ h: 3, n: 100, brier: 0.1 }] },
    window: { open: 50, nextDue: "2026-11-26", record: [{ h: 3, n: 20, hits: 2, brier: 0.08 }] },
    ledger: { d: "2026-11-24", sha256: "a".repeat(64), text: `early=${"b".repeat(64)}\npromise=${"c".repeat(64)}` },
  };
  const v = recordView(board);
  const row = (id) => v.rows.find((r) => r.id === id);
  assert.deepEqual(v.rows.map((r) => r.id), ["early", "stages", "luck", "fresh", "kinds", "brain", "promise", "window", "prices"], "a book the board does not carry (globe) has no row");
  assert.deepEqual(row("early").result, { kind: "hits", hits: 1, of: 1, rate: 100 });
  assert.equal(row("early").next, "2026-12-04", "the open call's day");
  assert.equal(row("stages").result.rate, 33.3);
  assert.equal(row("fresh").result, null, "before the first check, no result is invented");
  assert.equal(resultText(row("fresh")).he, "הבדיקה הראשונה ב־04.12");
  assert.equal(row("brain").given, null, "the brain says nothing of its own");
  assert.deepEqual(row("promise").result, { kind: "held", held: 91, of: 100, rate: 91, level: 90, brier: 0.1 });
  assert.equal(row("promise").given, 400);
  assert.deepEqual(row("window").result, { kind: "brier", brier: 0.08, of: 20, closed: 2 });
  assert.equal(row("prices").daily, true);
  assert.equal(row("early").sealed, true);
  assert.equal(row("fresh").sealed, false, "sealed only when its book is in today's root");
  assert.equal(v.root, "a".repeat(64));
  assert.equal(v.books, 2);
  assert.deepEqual(recordView({}).rows.map((r) => r.id), ["early", "stages", "luck", "fresh", "kinds", "brain", "prices"]);
});

test("one card for every find: the same rows in the same order, the seal with its own dates", () => {
  const fresh = {
    weekPct: 208.2, orders: 156, ordersBefore: 82, from: "2026-11-16", to: "2026-11-20",
    known: { similar: 1483, yt: { level: "EARLY", videos: 3, days: 7 } },
    promise: { h: 7, o: 156, r90: [151, 176], chance: { line: 25, p: 4 } },
    window: { state: "READY", h: 3, o: 1483, line: 2000, p: 23 },
    learned: { hits: 2, n: 5 }, sure: 90, called: "2026-11-20", due: "2026-12-04",
  };
  const rows = findFacts(fresh, { kind: "fresh", day: "2026-11-20" });
  assert.deepEqual(rows.map((r) => r.key), ["pace", "orders", "sellers", "youtube", "range", "chance", "window", "brain", "sure", "seal"]);
  assert.equal(rows[0].he, `${LRI}+208.2%${PDI} בשבוע`, "a signed number is isolated in Hebrew");
  assert.ok(rows.find((r) => r.key === "range").he.startsWith(`${LRI}151–176${PDI}`), "a range never reads backwards");
  assert.equal(rows.at(-1).he, "ב־20.11 · הציון בפומבי ב־04.12");
  assert.equal(rows.at(-1).tone, "seal");
  const kind = findFacts({ medianWeekPct: 31, measured: 4, members: 5, orders: 900, known: { similar: 640 }, window: { state: "MEASURING", o: 640, line: 2000, since: "2026-11-20" } }, { kind: "kinds" });
  assert.deepEqual(kind.map((r) => r.key), ["pace", "orders", "sellers", "window", "seal"]);
  assert.match(kind.find((r) => r.key === "seal").he, /הציון אחרי 14 יום/);
  assert.deepEqual(findFacts({}, { kind: "fresh" }).map((r) => r.key), ["seal"], "nothing shown that was not measured");
});

test("the core's words say what IS: no promise, no certainty, no 'לא'/'אין' in the Hebrew", () => {
  const src = readFileSync("src/lib/growth/radarCore.js", "utf8");
  const hebrew = (src.match(/["`][^"`\n]*[֐-׿][^"`\n]*["`]/g) || []).join("\n");
  assert.doesNotMatch(hebrew, /(^|[\s"`(])(לא|אין)(?=[\s".,:)`]|$)/m);
  assert.doesNotMatch(hebrew, /יהיה להיט|בטוח|מובטח|הכי נמכר|תחזית|היחיד/);
  assert.doesNotMatch(src, /guarantee|the only one|sure hit/i);
});

test("what the radar read today: the run's own states, mapped once, unknown keys dropped, public behind the lock", async () => {
  const { sourcesView, byCategory, SOURCE_STATES, NEXT_DOORS } = await import("../src/lib/growth/radarCore.js");
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const { teaserBoard } = await import("../src/lib/growth/radarGate.js");
  const board = sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [], sourcesToday: { aliexpress: "OK", pinterest: "REQUIRES_CONNECTION", engine_naver: "ROBOTS_DISALLOW_OR_FAILED", youtubeApi: "NOT_ASKED", kinds: "FAILED", world: { categories: 564, readToday: 120 }, "<script>": "OK", fresh: "<img>" } });
  assert.deepEqual(Object.keys(board.sourcesToday).sort(), ["aliexpress", "engine_naver", "kinds", "pinterest", "world", "youtubeApi"]);
  const v = Object.fromEntries(sourcesView(board.sourcesToday).map((x) => [x.key, x.state]));
  assert.deepEqual(v, { aliexpress: "OK", world: "OK", kinds: "FAILED", youtubeApi: "SKIPPED", pinterest: "REQUIRES_CONNECTION", engine_naver: "CLOSED" });
  // Three groups, never mixed: what the run read, the doors a connection opens, the doors a site's rules close.
  const groups = Object.fromEntries(sourcesView(board.sourcesToday).map((x) => [x.key, x.group]));
  assert.deepEqual(groups, { aliexpress: "read", world: "read", kinds: "read", youtubeApi: "read", pinterest: "connect", engine_naver: "closed" });
  const naver = sourcesView(board.sourcesToday).find((x) => x.key === "engine_naver");
  assert.match(naver.insteadHe, /^במקום זה: /, "a closed door names the open one read instead");
  assert.match(naver.insteadEn, /Korea/);
  for (const s of Object.values(SOURCE_STATES)) assert.doesNotMatch(s.he, /(^|\s)(לא|אין)(\s|$)/);
  assert.ok(NEXT_DOORS.every((d) => d.door && d.he));
  assert.deepEqual(teaserBoard(board).sourcesToday, board.sourcesToday);
  // The record per category, from the category each call carried the day it was made.
  const cats = byCategory([{ f: { category: "rings" }, result: "HIT" }, { f: { category: "rings" }, result: "MISS" }, { f: { category: "pets" } }, { category: "" }]);
  assert.deepEqual(cats, [{ category: "rings", calls: 2, graded: 2, hits: 1 }, { category: "pets", calls: 1, graded: 0, hits: 0 }]);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<SourcesToday sources=\{board\.sourcesToday\} receipt=\{board\.receipt \|\| null\} scan=\{board\.scan \|\| null\} health=\{board\.sourceHealth \|\| null\} \/>/);
});
