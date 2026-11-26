// 📏 The radar against the simple ranking and against chance (radarBaseline.js; the owner, 26.11):
// the same pool, the same rule, both sealed; the comparison only from enough grades, negative too.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  BASELINE, baselineBoard, baselineOpenIds, baselinePool, baselineSealText, baselineSeedText, baselineVersus,
  cleanBaseline, gradeBaseline, naivePicks, randomPicks, rebuildDays, recordBaseline,
} from "../src/lib/growth/radarBaseline.js";
import { FRESH } from "../src/lib/growth/freshRisers.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { BOOKS, recordView } from "../src/lib/growth/radarCore.js";
import { ledgerText } from "../src/lib/growth/radarLedger.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Five listings read on 2026-11-20 and a week before: their weekly paces are 100%, 50%, 20%, 300% and 10%.
function fixture() {
  const pool = {};
  const items = {};
  const rows = [["1000000001", 50, 100], ["1000000002", 100, 150], ["1000000003", 500, 600], ["1000000004", 40, 160], ["1000000005", 2000, 2200], ["1000000006", 5, 9], ["1000000007", 4000, 5000]];
  for (const [id, a, b] of rows) {
    pool[id] = { id, title: `Listing ${id}` };
    items[id] = [["2026-11-13", a], ["2026-11-20", b]];
  }
  pool["1000000008"] = { id: "1000000008", title: "Read only before" };
  items["1000000008"] = [["2026-11-13", 60]];
  return { pool, items };
}

test("the pool is the radar's own: read that day, a measured pace, 30–3,000 orders, by id", () => {
  const { pool, items } = fixture();
  const p = baselinePool(pool, items, "2026-11-20");
  assert.deepEqual(p.map((x) => x.id), ["1000000001", "1000000002", "1000000003", "1000000004", "1000000005"], "too small (9), too big (5,000) and unread that day are out");
  assert.equal(p.find((x) => x.id === "1000000004").weekPct, 300);
  assert.deepEqual(baselinePool(pool, items, "2026-11-13"), [], "no pace from a single reading");
  // Readings after the day never count: the day is judged by what was known on it.
  const later = { ...items, "1000000001": [...items["1000000001"], ["2026-11-25", 9999]] };
  assert.equal(baselinePool(pool, later, "2026-11-20").find((x) => x.id === "1000000001").orders, 100);
});

test("the simple ranking takes the fastest; chance draws from the seed, the same for anyone", () => {
  const { pool, items } = fixture();
  const p = baselinePool(pool, items, "2026-11-20");
  assert.deepEqual(naivePicks(p).map((x) => x.id), ["1000000004", "1000000001", "1000000002"]);
  const text = baselineSeedText("2026-11-20", sha("prices of the day"));
  assert.equal(text, `baseline|2026-11-20|${sha("prices of the day")}`);
  assert.equal(baselineSeedText("2026-11-20", "nope"), null, "no sealed prices, no draw");
  const seed = sha(text);
  const a = randomPicks(p, seed);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((x) => x.id)).size, 3, "without replacement");
  assert.deepEqual(randomPicks(p, seed), a, "deterministic");
  const expect = [...p];
  const want = [0, 1, 2].map((i) => expect.splice(parseInt(seed.slice(i * 12, i * 12 + 12), 16) % expect.length, 1)[0].id);
  assert.deepEqual(a.map((x) => x.id), want, "each pick from the next 12 hex of the seed");
  assert.deepEqual(randomPicks(p, "bad"), []);
});

test("one day's picks are recorded once, graded by the new products' own rule, never edited", () => {
  const { pool, items } = fixture();
  const p = baselinePool(pool, items, "2026-11-20");
  const seed = sha(baselineSeedText("2026-11-20", sha("p")));
  let st = recordBaseline({}, { day: "2026-11-20", pool: p, seed });
  assert.equal(st.naive.length, 3);
  assert.equal(st.random.length, 3);
  assert.ok(st.random.every((x) => x.seed === seed));
  assert.equal(st.naive[0].due, add("2026-11-20", FRESH.gradeDays));
  assert.equal(st.naive[0].base, 160);
  const again = recordBaseline(st, { day: "2026-11-20", pool: p.slice(0, 1), seed });
  assert.deepEqual(again, st, "a day is never replaced");
  assert.deepEqual(recordBaseline(st, { day: "2026-11-21", pool: p, seed: null }).random.length, 3, "a day without sealed prices draws nothing");

  // Day 14: 1000000004 grew 160 → 320 (+100%, HIT), 1000000001 100 → 120 (MISS); 1000000002 unread.
  const later = { ...items, "1000000004": [...items["1000000004"], ["2026-12-04", 320]], "1000000001": [...items["1000000001"], ["2026-12-04", 120]] };
  st = gradeBaseline(st, later, "2026-12-04");
  const g = Object.fromEntries(st.naive.map((x) => [x.id, x]));
  assert.equal(g["1000000004"].result, "HIT");
  assert.equal(g["1000000004"].growth, 100);
  assert.equal(g["1000000001"].result, "MISS");
  assert.equal(g["1000000002"].result, undefined, "waits for a reading on or after its day");
  // Unread three days past its day: set aside, never counted as a miss.
  st = gradeBaseline(st, later, "2026-12-07");
  assert.equal(st.naive.find((x) => x.id === "1000000002").unread, "2026-12-07");
  assert.equal(st.naive.find((x) => x.id === "1000000002").result, undefined);
  const frozen = gradeBaseline(st, { ...later, "1000000004": [...later["1000000004"], ["2026-12-08", 10]] }, "2026-12-08");
  assert.equal(frozen.naive.find((x) => x.id === "1000000004").result, "HIT", "a grade is never edited");
  assert.ok(!baselineOpenIds(st).includes("1000000004"), "graded picks are not read again");
  assert.ok(!baselineOpenIds(st).includes("1000000002"), "set-aside picks are not read again");
});

test("past days are rebuilt only while none of their picks could be graded, and say so", () => {
  const calls = [{ id: "9", at: "2026-11-20", due: "2026-12-04" }];
  assert.deepEqual(rebuildDays({}, calls, "2026-11-26"), ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"]);
  assert.deepEqual(rebuildDays({}, [], "2026-11-26"), [], "nothing before the radar's first new-product call");
  assert.deepEqual(rebuildDays({ naive: [{ at: "2026-11-24" }] }, calls, "2026-11-26").includes("2026-11-24"), false, "a day with picks is kept as it is");
  assert.deepEqual(rebuildDays({}, [{ at: "2026-11-01" }], "2026-11-26"), ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"], "at most backDays back");
  assert.ok(!rebuildDays({}, [{ at: "2026-11-01" }], "2026-11-26").some((d) => d <= "2026-11-12"), "a day already gradable is never rebuilt");
  const { pool, items } = fixture();
  const st = recordBaseline({}, { day: "2026-11-20", pool: baselinePool(pool, items, "2026-11-20"), seed: sha("s"), rebuilt: "2026-11-26" });
  assert.ok(st.naive.every((x) => x.rebuilt === "2026-11-26"));
  assert.match(baselineSealText(st), /\|2026-11-26\|/, "the seal names the day it was rebuilt");
  assert.deepEqual(baselineBoard(st, [], "2026-11-26").rebuilt, ["2026-11-20"]);
});

test("the comparison: the same days, edges only from enough grades, negative too, and the overlap", () => {
  const g = (id, at, result) => ({ id, at, result, growth: result === "HIT" ? 80 : 5 });
  const st = {
    naive: [g("1", "2026-11-20", "HIT"), g("2", "2026-11-20", "MISS"), g("3", "2026-11-21", "MISS"), g("4", "2026-11-21", "MISS")],
    random: [g("5", "2026-11-20", "MISS"), g("6", "2026-11-20", "MISS"), g("7", "2026-11-21", "MISS")],
  };
  const radar = [g("0", "2026-11-19", "HIT"), g("1", "2026-11-20", "HIT"), g("8", "2026-11-20", "HIT"), g("9", "2026-11-21", "MISS")];
  const v = baselineVersus(radar, st);
  assert.equal(v.since, "2026-11-20");
  assert.equal(v.radar.graded, 3, "the radar's calls from the yardsticks' first day only");
  assert.equal(v.radar.rate, 67);
  assert.equal(v.naive.rate, 25);
  assert.equal(v.random.rate, 0);
  assert.equal(v.edgeNaive, 42);
  assert.equal(v.edgeRandom, 67);
  assert.equal(v.overlap, 1, "one radar call was also the simple ranking's pick that day");
  const thin = baselineVersus(radar.slice(0, 3), st);
  assert.equal(thin.edgeNaive, null, "under minGraded on a side: no edge");
  const worse = baselineVersus([g("1", "2026-11-20", "MISS"), g("2", "2026-11-20", "MISS"), g("3", "2026-11-21", "MISS")], st);
  assert.equal(worse.edgeNaive, -25, "a negative edge is printed too");
  assert.equal(BASELINE.minGraded, 3);
});

test("sealed under the root, sanitized for the page, the record public behind the lock, never a pick", () => {
  assert.ok(BOOKS.includes("baseline"));
  const { pool, items } = fixture();
  const st = recordBaseline({}, { day: "2026-11-20", pool: baselinePool(pool, items, "2026-11-20"), seed: sha("s") });
  const text = baselineSealText(st);
  assert.equal(text.split("\n").length, 6);
  for (const line of text.split("\n")) assert.match(line, /^(naive|random)\|\d{6,20}\|2026-11-20\|\d+\|2026-12-04\|-\|-\|([0-9a-f]{64}|-)$/);
  const board = baselineBoard(st, [], "2026-11-20");
  board.seal = { d: "2026-11-20", sha256: sha(text), count: 6, text, ots: [] };
  const root = ledgerText({ baseline: board.seal.sha256 });
  const doc = sanitizeBoard({ v: 2, at: "2026-11-20T16:00:00Z", record: {}, concepts: [], baseline: board, ledger: { d: "2026-11-20", sha256: sha(root), count: 1, text: root, ots: [] } });
  assert.equal(doc.baseline.today.naive.length, 3);
  assert.equal(doc.baseline.seal.text, text, "the page can recompute the hash");
  assert.equal(doc.ledger.text, root, "baseline= is a book of the root");
  const locked = teaserBoard({ ...doc, record: { calls: 0 }, concepts: [] });
  assert.ok(locked.baseline, "the record stays public");
  assert.deepEqual(locked.baseline.today, { naive: [], random: [] }, "the day's picks stay behind the lock");
  assert.equal(locked.baseline.seal.sha256, sha(text));
  assert.equal(JSON.stringify(locked).includes("Listing 1000000004"), false);
  assert.equal(cleanBaseline({ versus: {}, today: { naive: [{ id: "<script>", title: "x" }] } }).today.naive.length, 0);
  const before = cleanBaseline({ versus: { radar: { graded: 0 }, naive: { graded: 0 }, edgeNaive: null, edgeRandom: undefined } });
  assert.equal(before.versus.edgeNaive, null, "no edge before grades: never read as 0 points");
  assert.equal(before.versus.edgeRandom, null);
  assert.equal(before.versus.radar.rate, null);
  const row = recordView({ baseline: { versus: baselineVersus([], { naive: [{ id: "1", at: "2026-11-20", result: "HIT" }], random: [{ id: "2", at: "2026-11-20", result: "MISS" }] }), nextDue: "2026-12-04" } }).rows.find((r) => r.id === "baseline");
  assert.equal(row.graded, 2);
  assert.equal(row.result.hits, 1);
  assert.equal(recordView({ baseline: { versus: {} } }).total.callsGraded, 0, "a yardstick's hits never join the radar's own total");
});
