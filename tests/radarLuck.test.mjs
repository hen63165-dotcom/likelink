// "The radar vs luck" (src/lib/growth/radarLuck.js; the owner, 2026-11-19, "כן"): a timestamp proves
// a call was not changed, never that it was good. Each day one kind is drawn at random — seeded by
// the hash of that day's sealed store prices, so nobody chooses it — graded by the radar's own rule,
// sealed in its own book, and printed beside the radar's record.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LUCK, drawLuck, gradeLuck, luckBoard, luckSealText, luckSeed, luckVersus, recordLuck } from "../src/lib/growth/radarLuck.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { ledgerText } from "../src/lib/growth/radarLedger.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const R = (pts) => pts.map(([d, sum]) => ({ d, sum }));

test("the seed comes from the day's sealed prices only; without them there is no draw", () => {
  const p = sha("1005001|12.5\n1005002|30");
  const seed = luckSeed("2026-11-19", p);
  assert.equal(seed, sha(`luck|2026-11-19|${p}`), "anyone recomputes it from the published price day");
  assert.equal(luckSeed("2026-11-19", null), null);
  assert.equal(luckSeed("2026-11-19", "not-a-hash"), null);
  assert.equal(drawLuck({ a: R([["2026-11-19", 10]]) }, "2026-11-19", null), null);
});

test("the draw is the same for everyone: kinds read today, sorted, seed mod count", () => {
  const readings = {
    "zeta-thing": R([["2026-11-19", 50]]),
    "alpha-thing": R([["2026-11-19", 100]]),
    "old-thing": R([["2026-11-18", 70]]),
    "empty-thing": R([["2026-11-19", 0]]),
    "Bad Id": R([["2026-11-19", 9]]),
  };
  const seed = "0".repeat(11) + "1" + "f".repeat(52); // first 12 hex = 1 → index 1 of [alpha, zeta]
  const d = drawLuck(readings, "2026-11-19", seed);
  assert.deepEqual(d, { concept: "zeta-thing", base: 50, seed, pool: 2 });
  assert.deepEqual(drawLuck({ ...readings }, "2026-11-19", seed), d, "deterministic");
});

test("one draw a day, graded by the radar's own rule, never edited after", () => {
  const seed = "a".repeat(64);
  let list = recordLuck([], { concept: "zeta-thing", base: 100, seed, pool: 2 }, "2026-11-01");
  list = recordLuck(list, { concept: "alpha-thing", base: 5, seed, pool: 2 }, "2026-11-01");
  assert.equal(list.length, 1, "a second draw the same day is ignored");
  assert.equal(list[0].due, "2026-11-15");
  const early = gradeLuck(list, { "zeta-thing": R([["2026-11-10", 200]]) });
  assert.equal(early[0].result, undefined, "not before 14 days");
  const graded = gradeLuck(list, { "zeta-thing": R([["2026-11-15", 116]]) });
  assert.equal(graded[0].result, "HIT");
  assert.equal(graded[0].growth, 16);
  const again = gradeLuck(graded, { "zeta-thing": R([["2026-11-20", 10]]) });
  assert.equal(again[0].result, "HIT", "a grade is never edited");
  assert.equal(gradeLuck(list, { "zeta-thing": R([["2026-11-15", 114]]) })[0].result, "MISS");
  assert.equal(LUCK.hitPct, 15);
});

test("the comparison waits for three grades a side; the book is sealed line by line", () => {
  const seed = "b".repeat(64);
  const draws = [
    { concept: "a-thing", at: "2026-11-01", base: 10, due: "2026-11-15", seed, result: "HIT" },
    { concept: "b-thing", at: "2026-11-02", base: 10, due: "2026-11-16", seed, result: "MISS" },
    { concept: "c-thing", at: "2026-11-03", base: 10, due: "2026-11-17", seed, result: "MISS" },
    { concept: "d-thing", at: "2026-11-19", base: 12.4, due: "2026-12-03", seed },
  ];
  const calls = [{ result: "HIT" }, { result: "HIT" }, { result: "MISS" }, {}];
  const v = luckVersus(calls, draws);
  assert.deepEqual(v, { radar: { graded: 3, hits: 2, rate: 67 }, luck: { graded: 3, hits: 1, rate: 33 }, edge: 34 });
  assert.equal(luckVersus(calls.slice(0, 2), draws).edge, null, "never a claim before both sides have 3");
  const text = luckSealText(draws);
  assert.equal(text.split("\n")[3], `d-thing|2026-11-19|12|2026-12-03|-|${seed}`);
  const b = luckBoard(draws, calls, "2026-11-19");
  assert.equal(b.today.concept, "d-thing");
  assert.equal(b.nextDue, "2026-12-03");
  const board = sanitizeBoard({ v: 2, at: "2026-11-19T06:00:00Z", record: {}, concepts: [], luck: { ...b, seal: { d: "2026-11-19", sha256: sha(text), count: 4, text, ots: [] } } });
  assert.equal(board.luck.today.concept, "d-thing");
  assert.equal(board.luck.versus.edge, 34);
  assert.equal(board.luck.seal.text, text);
  const teaser = teaserBoard({ v: 2, at: "2026-11-19T06:00:00Z", luck: board.luck });
  assert.equal(teaser.luck.today, null, "the day's draw stays behind the lock");
  assert.equal(teaser.luck.versus.edge, 34);
  assert.ok(ledgerText({ luck: sha(text) }).startsWith("luck="));
});

test("the run draws, grades and seals the luck book into the root; the page and the HTML show it", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /drawLuck\(readings, today, luckSeed\(today, priceSha\)\)/);
  assert.match(run, /board\.luck\.seal = await sealBook\(/);
  assert.match(run, /luck: board\.luck\?\.seal\?\.sha256/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<Luck luck=\{board\.luck\}/);
  assert.match(readFileSync("src/lib/growth/radarStatic.js", "utf8"), /הרדאר מול המזל/);
  assert.match(readFileSync("public/llms.txt", "utf8"), /radar vs luck/);
});
