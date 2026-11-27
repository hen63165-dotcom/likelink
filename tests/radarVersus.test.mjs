// ⚔️ The sealed head-to-head (radarVersus.js): every morning four picks from the same public sample are
// sealed before anything happens, then graded by the store's own orders after 3 and 7 days.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CONTENDERS, VERSUS, cleanVersus, gradeVersus, recordVersus, versusDueIds, versusRecord, versusSealText, versusSheet } from "../src/lib/growth/radarVersus.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { BOOKS, recordView } from "../src/lib/growth/radarCore.js";

const day = (n) => new Date(Date.parse("2026-11-01T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function market(n = 240, days = 30, seed = 5) {
  const r = rng(seed);
  const items = {};
  for (let i = 0; i < n; i++) {
    let o = Math.round(30 + r() * 3000);
    const g = -0.01 + r() * 0.05;
    const s = [];
    for (let d = 0; d < days; d++) { s.push([day(d), o]); o = Math.max(0, Math.round(o * Math.exp(g + (r() - 0.5) * 0.04))); }
    items[String(1_000_000_000 + i)] = s;
  }
  return items;
}

test("the morning sheet: four picks of k from one public sample, sealed as item numbers only", () => {
  const items = market();
  const sheet = versusSheet(items, day(20));
  assert.equal(sheet.d, day(20));
  assert.equal(sheet.pool.length, Math.min(VERSUS.perDay, 240));
  for (const h of VERSUS.horizons) for (const c of CONTENDERS) {
    assert.equal(sheet.picks[h][c].length, VERSUS.k, `${h} ${c}`);
    assert.ok(sheet.picks[h][c].every((id) => sheet.pool.includes(id)), "every pick is from the sample");
  }
  assert.deepEqual(sheet.picks[3].random, sheet.picks[7].random, "the random pick is the hash order, chosen by nobody");
  const text = versusSealText(sheet);
  assert.match(text, new RegExp(`^versus\\|${day(20)}\\|v${VERSUS.version}\\npool\\|`));
  assert.equal(text.split("\n").length, 2 + VERSUS.horizons.length * CONTENDERS.length);
  assert.ok(!/[a-z]{4,}\s/i.test(text.split("\n").slice(1).join(" ").replace(/learn|radar|noise|rank|random|pool/g, "")), "no title, only numbers");
  // The sheet uses readings up to its day only: changing what happened later changes nothing in it.
  const later = Object.fromEntries(Object.entries(items).map(([id, s]) => [id, s.map(([d, v]) => [d, d > day(20) ? v * 5 : v])]));
  assert.deepEqual(versusSheet(later, day(20)), sheet);
});

test("graded after 3 and 7 days by the store's orders; the first sheet of a day stands; a grade is never edited", () => {
  const items = market();
  let st = recordVersus({}, versusSheet(items, day(20)), day(20));
  assert.equal(st.since, day(20));
  st = recordVersus(st, versusSheet(items, day(20)), day(20));
  assert.equal(Object.keys(st.days).length, 1);
  assert.deepEqual(versusDueIds(st, day(22)), [], "nothing due before its day");
  assert.ok(versusDueIds(st, day(23)).length > 0, "the 3-day picks are read again on their day");
  st = gradeVersus(st, items, day(23));
  const g = st.days[day(20)].graded[3];
  assert.ok(g, "graded on the third day");
  assert.equal(st.days[day(20)].graded[7], undefined, "the 7-day grade waits");
  for (const c of CONTENDERS) assert.equal(g[c].of, VERSUS.k);
  const again = gradeVersus(st, Object.fromEntries(Object.keys(items).map((id) => [id, []])), day(24));
  assert.deepEqual(again.days[day(20)].graded[3], g, "a grade is never edited");
  const rec = versusRecord(st, day(23));
  assert.equal(rec.horizons[0].days, 1);
  assert.equal(rec.horizons[1].nextDue, day(27));
  assert.equal(rec.horizons[0].learn.of, VERSUS.k);
});

test("a pick the radar could not read waits up to three days, then is left out, never counted", () => {
  const items = market();
  const st = recordVersus({}, versusSheet(items, day(20)), day(20));
  const missing = st.days[day(20)].picks[3].rank[0];
  const gap = { ...items, [missing]: items[missing].filter(([d]) => d <= day(20)) };
  assert.equal(gradeVersus(st, gap, day(23)).days[day(20)].graded[3], undefined, "waits for the reading");
  const late = gradeVersus(st, gap, day(26)).days[day(20)].graded[3];
  assert.equal(late.rank.of, VERSUS.k - 1, "then graded without it");
});

test("the board keeps the record and the sealed sheet; behind the lock the record and the seal's hash", () => {
  const items = market();
  let st = recordVersus({}, versusSheet(items, day(20)), day(20));
  st = gradeVersus(st, items, day(23));
  const text = versusSealText(st.days[day(20)]);
  const doc = { ...versusRecord(st, day(23)), today: day(20), seal: { d: day(20), sha256: createHash("sha256").update(text).digest("hex"), count: text.split("\n").length, text, ots: [] } };
  const board = sanitizeBoard({ at: `${day(23)}T05:00:00Z`, concepts: [], record: {}, versus: doc });
  assert.equal(board.versus.seal.text, text, "the sheet is published so anyone can recompute its fingerprint");
  assert.equal(board.versus.horizons[0].days, 1);
  const t = teaserBoard(board);
  assert.equal(t.versus.seal.text, undefined);
  assert.equal(t.versus.horizons[0].days, 1);
  assert.ok(BOOKS.includes("versus"));
  const row = recordView(board).rows.find((r) => r.id === "versus");
  assert.equal(row.graded, VERSUS.k);
  assert.ok(!recordView(board).rows.some((r) => r.id === "versus" && r.result?.kind !== "hits"));
  assert.equal(cleanVersus({ horizons: [{ h: 5 }] }).horizons.length, 0);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_VERSUS !== "0"/);
  assert.match(run, /versus: board\.versus\?\.seal\?\.sha256/);
  assert.match(run, /versusDueIds\(/);
});

test("a contender that joined later leaves the earlier sheets' sealed text exactly as it was (v1 has no noise)", () => {
  const items = market();
  const v2 = versusSheet(items, day(20));
  assert.ok(Array.isArray(v2.picks[3].noise) && v2.picks[3].noise.length === VERSUS.k);
  const v1 = { ...v2, v: 1, picks: Object.fromEntries(Object.entries(v2.picks).map(([h, p]) => { const { noise, ...rest } = p; return [h, rest]; })) };
  const text = versusSealText(v1);
  assert.ok(!/\|noise\|/.test(text));
  assert.equal(text.split("\n").length, 2 + VERSUS.horizons.length * (CONTENDERS.length - 1));
  // Graded as before: the missing contender counts nothing, the others as sealed.
  const g = gradeVersus(recordVersus({}, v1, day(20)), items, day(23)).days[day(20)].graded[3];
  assert.equal(g.noise.of, 0);
  assert.equal(g.pick.of, VERSUS.k);
  const rec = versusRecord(gradeVersus(recordVersus({}, v1, day(20)), items, day(23)), day(23));
  assert.equal(rec.horizons[0].noise.rate, null);
  assert.ok(rec.horizons[0].noiseDuel);
});
