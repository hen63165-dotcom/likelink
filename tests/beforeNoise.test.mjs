// 🔇 Before the noise (beforeNoise.js): two independent doors upstream of YouTube and TikTok name the
// same product while the downstream is quiet → a sealed call; a one-door control beside it; the noise's
// first day stamped once; graded after 30 days, never edited.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOISE, candidates, cleanNoise, controlPool, doorSignals, keyOf, mergeSignals, noiseBoard, noiseLines, noiseQueue, noiseRecord, noiseSealText, pruneNoise, quietCheck, readNoise, recordNoiseCalls, singular } from "../src/lib/growth/beforeNoise.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { INSTRUMENTS, SECTION_TABS } from "../src/lib/growth/radarCore.js";
import { LEDGER_BOOKS } from "../src/lib/growth/radarLedger.js";

const T = "2026-12-01";
const back = (n) => new Date(Date.parse(`${T}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

test("one name for every door: two words, singular, lower case", () => {
  assert.equal(singular("squishies"), "squishy");
  assert.equal(singular("boxes"), "box");
  assert.equal(singular("glasses"), "glass");
  assert.equal(singular("dress"), "dress");
  assert.equal(keyOf("Butter Squishies"), "butter squishy");
  assert.equal(keyOf("butter squishy"), "butter squishy");
  assert.equal(keyOf("cloud"), null, "one word is no product name");
  assert.equal(keyOf("big cloud slide"), null, "three words: the doors write two");
});

test("each door at its own bar: different stores, new domains above their old rate, listings that run", () => {
  const prelaunch = { ps: { "jelly ring": { s1: back(1), s2: back(2), s3: back(3) }, "glass cup": { s1: back(1), s2: back(9), s3: back(10) }, "moon lamp": { s1: back(1), s2: back(2) } } };
  const shopWords = { days: [back(12), back(10), back(3), back(1)], w: { "jelly ring": { [back(1)]: 1, [back(3)]: 2 }, "glass cup": { [back(1)]: 1, [back(12)]: 5, [back(10)]: 5 }, jelly: { [back(1)]: 9 } } };
  const listings = [{ phrase: "jelly rings", weekPct: 40, orders: 120 }, { phrase: "moon lamp", weekPct: 12, orders: 500 }, { phrase: "Santa hat", weekPct: 90, orders: 200 }];
  const s = doorSignals({ prelaunch, shopWords, listings }, T, { skip: (k) => /santa/.test(k) });
  assert.deepEqual([...s.prelaunch.keys()], ["jelly ring"], "three stores this week; the cup's stores listed it before, the lamp has two");
  assert.deepEqual([...s.shops.keys()], ["jelly ring"], "a pair above its old rate; a single word and a pair below its old rate are out");
  assert.deepEqual([...s.listings.keys()], ["jelly ring"], "running at +25% a week or more; a holiday is skipped");
});

test("a call needs two doors this week; the control comes from one-door names, seeded by the day", () => {
  let st = mergeSignals({}, { prelaunch: new Map([["jelly ring", 3], ["moon lamp", 4]]), shops: new Map([["jelly ring", 2]]), listings: new Map([["cloud slide", 40], ["fish tank", 30]]) }, T);
  const c = candidates(st, T);
  assert.deepEqual(c.map((x) => x.key), ["jelly ring"]);
  assert.deepEqual(c[0].doors, ["prelaunch", "shops"]);
  const pool = controlPool(st, T).map((x) => x.key);
  assert.deepEqual(pool.slice().sort(), ["cloud slide", "fish tank", "moon lamp"]);
  assert.deepEqual(controlPool(st, T).map((x) => x.key), pool, "the same day, the same order");
  st = mergeSignals(st, {}, "2026-12-30");
  assert.equal(Object.keys(st.sig).length, 0, "a name no door named for three weeks leaves");
});

test("quiet means read and quiet: listings, Google's suggestions, and YouTube when read", () => {
  assert.equal(quietCheck({ similar: 300, suggestions: ["jelly ring for kids"], yt: null }).quiet, true, "YouTube unread is allowed and said");
  assert.equal(quietCheck({ similar: 300, suggestions: null }).reason, "NOT_CHECKED");
  assert.equal(quietCheck({ similar: 5000, suggestions: [] }).reason, "SATURATED");
  assert.equal(quietCheck({ similar: 300, suggestions: ["jelly ring tiktok"] }).reason, "BUZZ");
  assert.equal(quietCheck({ similar: 300, suggestions: [], yt: { videos: 80, views: 10 } }).reason, "YOUTUBE");
  assert.deepEqual(noiseLines({ similar: 2500, suggestions: ["x amazon"], yt: { videos: 1, views: 2_000_000 } }), { buzz: true, listings: true, youtube: true });
});

test("sealed, read every morning, the noise's first day stamped once, graded never edited", () => {
  const checked = [
    { key: "jelly ring", doors: ["prelaunch", "shops"], n: 5, role: "call", similar: 300, yt: null, check: { quiet: true } },
    { key: "glass cup", doors: ["listings", "shops"], n: 5, role: "call", similar: 9000, yt: null, check: { quiet: false } },
    { key: "fish tank", doors: ["listings"], n: 30, role: "control", similar: 200, yt: { videos: 2, views: 100 }, check: { quiet: true } },
    { key: "moon lamp", doors: ["prelaunch"], n: 4, role: "control", similar: 100, yt: null, check: { quiet: true } },
  ];
  let calls = recordNoiseCalls([], checked, T);
  assert.deepEqual(calls.map((c) => `${c.key}:${c.role}`), ["jelly ring:call", "fish tank:control"], "one control for one call; a loud name is never called");
  assert.equal(calls[0].due, "2026-12-31");
  assert.equal(calls[1].yt, 2);
  assert.equal(recordNoiseCalls(calls, checked, T).length, 2, "one open entry per name");
  assert.deepEqual(noiseQueue(calls, T), [], "nothing is read again on its own day");
  calls = readNoise(calls, { "jelly ring": { similar: 600, suggestions: ["jelly ring for women"] }, "fish tank": { similar: 250, suggestions: [] } }, "2026-12-05");
  assert.equal(calls[0].result, undefined);
  calls = readNoise(calls, { "jelly ring": { similar: 900, suggestions: ["jelly ring tiktok"] } }, "2026-12-12");
  assert.equal(calls[0].result, "HIT");
  assert.equal(calls[0].lead, 11);
  assert.deepEqual(calls[0].noise, { d: "2026-12-12", lines: ["buzz"] });
  const again = readNoise(calls, { "jelly ring": { similar: 100, suggestions: [] } }, "2026-12-13");
  assert.deepEqual(again[0], calls[0], "a grade is never edited");
  calls = readNoise(calls, { "fish tank": { similar: 300, suggestions: [] } }, "2026-12-30");
  calls = readNoise(calls, {}, "2026-12-31");
  assert.equal(calls[1].result, "MISS", "read near its end and still quiet");
  const lost = readNoise(recordNoiseCalls([], [checked[3]], T), {}, "2027-01-04");
  assert.equal(lost[0].result, "UNREAD", "never read near its end: never counted");
  const rec = noiseRecord([...calls, ...lost]);
  assert.deepEqual(rec.call, { calls: 1, graded: 1, hits: 1, misses: 0, unread: 0, pending: 0, rate: 100, medianLeadDays: 11, nextDue: null });
  assert.equal(rec.control.unread, 1);
  assert.equal(rec.edge, null, "an edge only once both sides have 3 grades");
  const text = noiseSealText(calls);
  assert.match(text, /^fish tank\|control\|2026-12-01\|listings\|200\|2\|2026-12-31\|MISS\|\|$/m);
  assert.match(text, /^jelly ring\|call\|2026-12-01\|prelaunch\+shops\|300\|\|2026-12-31\|HIT\|2026-12-12\|buzz$/m);
  assert.equal(pruneNoise(calls).length, 2);
});

test("the board names the doors in Hebrew on the page; behind the lock, counts and the record only", () => {
  const st = mergeSignals({}, { prelaunch: new Map([["jelly ring", 3]]), shops: new Map([["jelly ring", 2]]) }, T);
  st.calls = recordNoiseCalls([], [{ key: "jelly ring", doors: ["prelaunch", "shops"], n: 5, role: "call", similar: 300, yt: null, check: { quiet: true } }], T);
  const doc = noiseBoard(st, { day: T, signals: { prelaunch: new Map([["jelly ring", 3]]), shops: new Map([["jelly ring", 2]]), listings: new Map() }, agree: 1, checked: [{ check: { reason: "QUIET" } }], seal: { sha256: "a".repeat(64), count: 1 }, youtube: "UNREAD" });
  assert.deepEqual(doc.doors, { prelaunch: 1, shops: 1, listings: 0 });
  const board = sanitizeBoard({ at: `${T}T05:40:00Z`, concepts: [], record: {}, noise: doc });
  assert.equal(board.noise.open[0].key, "jelly ring");
  assert.equal(board.noise.open[0].dayN, 1);
  assert.equal(board.noise.seal.sha256, "a".repeat(64));
  const t = teaserBoard(board).noise;
  assert.deepEqual(t.open, [], "behind the lock: never an open name");
  assert.equal(t.record.call.pending, 1);
  assert.equal(cleanNoise({ d: T, open: [{ key: "<script>", at: T }] }).open.length, 0);
});

test("one engine in the radar's one core: its book in the root, its tab, the runner, the page", () => {
  assert.ok(INSTRUMENTS.some((i) => i.id === "noise" && i.book === "noise"));
  assert.ok(LEDGER_BOOKS.includes("noise"));
  assert.equal(SECTION_TABS.noise, "today");
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_NOISE !== "0"/);
  assert.match(run, /noise: board\.noise\?\.seal\?\.sha256/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<BeforeNoise noise=\{board\.noise\}/);
  assert.match(page, /id="noise"/);
  assert.ok(NOISE.families.length === 3);
});
