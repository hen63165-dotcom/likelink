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
