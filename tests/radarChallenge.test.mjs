// 🔮 The weekly challenge (the owner, 2026-11-16: "כן לאתגר"): four measured kinds, the radar's choice
// sealed before the post and never visible until grading (salted, so four options cannot be guessed
// from the hash), graded by the real order sums after 14 days, never edited; posts say what IS.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CHALLENGE, challengeBoard, challengePosts, challengeSealText, gradeChallenge, openChallenge, pickOptions, shortLabel, shouldOpen } from "../src/lib/growth/radarChallenge.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";

const rows = [
  { id: "capybara-squishy", he: "סקווישי קפיברה", kind: "kids", stage: "RISING", score: 70, base: 7000 },
  { id: "butter-squishy", he: "סקווישי מקל חמאה", kind: "kids", stage: "EMERGING", score: 60, base: 900 },
  { id: "soap-dispenser", he: "מתקן סבון אוטומטי", kind: "home", stage: "STEADY", score: 80, base: 20000 },
  { id: "cat-perch", he: "ערסל חלון לחתול", kind: "pets", stage: "STEADY", score: 50, base: 3000 },
  { id: "hair-clip", he: "קליפס שיער מעוצב גדול במיוחד לשיער עבה", kind: "hair", stage: "RISING", score: 40, base: 5000 },
  { id: "auto-x", he: "auto words", kind: "gadgets", stage: "EMERGING", score: 99, base: 100, auto: true },
  { id: "peak-y", he: "מוצר בשיא", kind: "fitness", stage: "PEAK", score: 99, base: 100 },
  { id: "zero", he: "בלי מדידה", kind: "beauty", stage: "RISING", score: 99, base: 0 },
];
const T = "2026-11-16";

test("four measured kinds, one per kind; the radar's choice is its strongest; options in a neutral order", () => {
  const p = pickOptions(rows);
  assert.equal(p.options.length, 4);
  assert.equal(new Set(p.options.map((o) => o.concept)).size, 4);
  assert.ok(!p.options.some((o) => ["auto-x", "peak-y", "zero"].includes(o.concept)));
  assert.equal(p.radar, "butter-squishy", "EMERGING first");
  assert.ok(!p.options.some((o) => o.concept === "capybara-squishy"), "one per kind");
  assert.ok(p.options.every((o) => o.label.length <= CHALLENGE.labelMax));
  const labels = p.options.map((o) => o.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "he")));
  assert.equal(pickOptions(rows.slice(0, 2)), null);
  assert.equal(shortLabel("קליפס שיער מעוצב גדול במיוחד לשיער עבה"), "קליפס שיער מעוצב גדול במיוחד");
});

test("sealed and hidden: the open board never carries the choice or the salt", () => {
  const ch = openChallenge(pickOptions(rows), T, "a".repeat(32));
  const sha = createHash("sha256").update(challengeSealText(ch)).digest("hex");
  const b = challengeBoard([ch], {}, T, { [ch.id]: { d: T, sha256: sha, ots: [] } });
  const raw = JSON.stringify(b);
  assert.ok(!raw.includes("a".repeat(32)) && !raw.includes("radar="), "no salt, no choice");
  assert.equal(b.open.seal.sha256, sha);
  const clean = sanitizeBoard({ at: `${T}T06:00:00Z`, concepts: [], record: {}, challenge: b }).challenge;
  assert.equal(clean.open.options.length, 4);
  assert.ok(!JSON.stringify(clean).includes("radar="));
  assert.ok(teaserBoard({ challenge: b }).challenge, "public even while the board is locked");
});

test("graded by the real order sums after 14 days; the reveal recomputes; never edited", () => {
  const ch = openChallenge(pickOptions(rows), T, "b".repeat(32));
  const latest = { "butter-squishy": 1800, "soap-dispenser": 21000, "cat-perch": 3300, "hair-clip": 5100 };
  assert.equal(gradeChallenge(ch, latest, "2026-11-20"), ch, "before the due day nothing changes");
  const g = gradeChallenge(ch, latest, ch.due);
  assert.equal(g.result, "HIT");
  assert.deepEqual(g.winners, ["butter-squishy"]);
  assert.equal(gradeChallenge(g, { "butter-squishy": 1 }, "2026-12-30"), g, "a graded challenge is never edited");
  const waiting = gradeChallenge(ch, { "soap-dispenser": 30000 }, ch.due);
  assert.equal(waiting.result, undefined, "a missing reading waits");
  const late = gradeChallenge(ch, { "soap-dispenser": 30000 }, "2026-12-04");
  assert.equal(late.result, "MISS");
  const b = challengeBoard([g], latest, ch.due, {});
  assert.equal(b.recent[0].radar, "butter-squishy");
  assert.ok(b.recent[0].text.endsWith(`salt=${"b".repeat(32)}`));
  assert.equal(sanitizeBoard({ at: "x", concepts: [], record: {}, challenge: b }).challenge.recent[0].text, b.recent[0].text);
  assert.equal(shouldOpen([g], "2026-11-22"), false, "a week after the last one");
  assert.equal(shouldOpen([g], "2026-11-23"), true);
  assert.equal(shouldOpen([ch], "2026-11-30"), false, "one open at a time");
});

test("posts: the poll fits LinkedIn, say what is, promise nothing", () => {
  const ch = openChallenge(pickOptions(rows), T, "c".repeat(32));
  const posts = challengePosts(challengeBoard([ch], {}, T, { [ch.id]: { d: T, sha256: "f".repeat(64), ots: [] } }));
  assert.ok(posts.open.question.length <= CHALLENGE.questionMax);
  assert.equal(posts.open.options.length, 4);
  assert.ok(posts.open.he.includes("חתומה מראש") && posts.open.he.includes("ffffffffffffffff"));
  assert.ok(!/מבטיח|100%|היחיד בעולם|(?:^|\s)פרס|נגד/.test(posts.open.he));
  assert.ok(!/\bלא\b|\bאין\b/.test(posts.open.he), "what IS, in the owner's words");
  const g = gradeChallenge(ch, { "butter-squishy": 900, "soap-dispenser": 40000, "cat-perch": 3000, "hair-clip": 5000 }, ch.due);
  const r = challengePosts(challengeBoard([g], {}, ch.due, {})).result;
  assert.ok(r.he.includes("מתקן סבון אוטומטי") && r.he.includes("salt="));
});

// 17.11, the owner: "למה אתה בונה אותם ככה ולא על פי הרדאר?" — only the radar's own discoveries.
import { cancelNotFresh, pickFreshOptions } from "../src/lib/growth/radarChallenge.js";
import { FRESH, freshBar } from "../src/lib/growth/freshRisers.js";

const risers = [
  { id: "1005000000000001", title: "Magnetic Cable Organizer Clip Desk", orders: 400, weekPct: 90, known: { similar: 300 }, image: "https://ae01.alicdn.com/kf/a.jpg" },
  { id: "1005000000000002", title: "Silicone Stretch Lid Bowl Cover", orders: 120, weekPct: 70, known: { similar: 900 } },
  { id: "1005000000000003", title: "Magnetic Cable Organizer Holder", orders: 200, weekPct: 65, known: { similar: 300 } },
  { id: "1005000000000004", title: "Foldable Shoe Drying Rack Portable", orders: 800, weekPct: 55, known: { similar: 100 } },
  { id: "1005000000000005", title: "Mini Thermal Label Printer Pocket", orders: 60, weekPct: 45, known: { similar: 1500 } },
  { id: "1005000000000006", title: "Not checked yet", orders: 60, weekPct: 99 },
];

test("only the radar's discoveries: unknown-checked risers, one per phrase, the strongest is the radar's choice", () => {
  const p = pickFreshOptions(risers);
  assert.equal(p.source, "fresh");
  assert.equal(p.radar, "1005000000000001", "the fastest-growing discovery");
  assert.equal(p.options.length, 4);
  assert.ok(!p.options.some((o) => o.concept === "1005000000000006"), "a riser without the unknown check never joins");
  assert.ok(!p.options.some((o) => o.concept === "1005000000000003"), "the same phrase twice is one option");
  assert.ok(p.options.every((o) => o.label.length <= CHALLENGE.labelMax && o.base > 0));
  assert.equal(pickFreshOptions(risers.slice(0, 3)), null, "fewer than four discoveries: no challenge");
  const ch = openChallenge(p, T, "a".repeat(32));
  assert.equal(ch.source, "fresh");
  assert.match(challengeSealText(ch), /^ch-[0-9-]+\|[0-9-]+\|[0-9,]+\|radar=\d+\|salt=a{32}$/);
});

test("the 16.11 challenge of known kinds is closed, kept with its text, never counted; a new one can open", () => {
  const old = openChallenge(pickOptions(rows), T, "b".repeat(32));
  delete old.source;
  const list = cancelNotFresh([old], "2026-11-17");
  assert.equal(list[0].result, "CANCELLED");
  assert.equal(shouldOpen(list, "2026-11-17"), true, "a cancelled challenge never blocks the next");
  const fresh = openChallenge(pickFreshOptions(risers), "2026-11-17", "c".repeat(32));
  assert.equal(cancelNotFresh([fresh], "2026-11-18")[0].result, undefined, "a fresh challenge stays open");
  const board = challengeBoard(list, {}, "2026-11-17", {});
  assert.equal(board.open, null);
  assert.equal(board.record.graded, 0);
  assert.equal(board.recent[0].result, "CANCELLED");
  assert.ok(board.recent[0].text.includes("salt="), "the reveal is public");
  const clean = sanitizeBoard({ at: "2026-11-17T06:00:00Z", concepts: [], record: {}, challenge: board }).challenge;
  assert.equal(clean.recent[0].result, "CANCELLED");
  assert.equal(challengePosts(board).result, null, "no results post for a cancelled challenge");
});

test("graded by each item's own orders", () => {
  const ch = openChallenge(pickFreshOptions(risers), T, "d".repeat(32));
  const latest = Object.fromEntries(ch.options.map((o) => [o.concept, o.base * (o.concept === "1005000000000004" ? 3 : 1.2)]));
  const g = gradeChallenge(ch, latest, ch.due);
  assert.equal(g.result, "MISS");
  assert.deepEqual(g.winners, ["1005000000000004"]);
});

test("the bar only rises: under 80% hits after 10 graded, a riser must grow 1.5× faster", () => {
  assert.equal(freshBar({ graded: 3, accuracy: 0 }).strict, false);
  assert.equal(freshBar({ graded: 12, accuracy: 85 }).minWeekPct, FRESH.minWeekPct);
  const s = freshBar({ graded: 12, accuracy: 60 });
  assert.equal(s.strict, true);
  assert.equal(s.minWeekPct, FRESH.minWeekPct * 1.5);
  assert.equal(s.heldWeekPct, FRESH.heldWeekPct * 2);
});
