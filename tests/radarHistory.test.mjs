// 📜 Ten years back (radarHistory.js): the early-alarm rule on public pageviews. Pinned: complete weeks
// only; the usual week never includes the rise itself; an alarm needs two readings and a real crowd; a
// boom is 10× the usual and a 2-year high; no week sees its future; the base rate is a random week's.
import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES, HISTORY, cleanHistory, gradeAlarms, historyStudy, pageviewsUrl, scan, usualAt, weekly } from "../src/lib/growth/radarHistory.js";

const day = (i) => { const d = new Date(Date.UTC(2015, 6, 6) + i * 86_400_000); return `${d.toISOString().slice(0, 10).replace(/-/g, "")}00`; };
const daily = (perWeek) => perWeek.flatMap((v, w) => Array.from({ length: 7 }, (_, k) => ({ timestamp: day(w * 7 + k), views: Math.floor(v / 7) + (k === 0 ? v % 7 : 0) })));

test("weeks: Monday to Sunday, complete weeks only", () => {
  const w = weekly([...daily([700, 1400]), { timestamp: day(14), views: 5 }]);
  assert.equal(w.length, 2);
  assert.equal(w[0].w, "2015-07-06");
  assert.equal(w[0].v, 700);
});

test("an alarm two readings early, then the boom; the usual week leaves out the rise", () => {
  const flat = Array(70).fill(1000);
  const rise = [2500, 3500, 6000, 12_000, 20_000, 30_000, 25_000, 15_000];
  const weeks = weekly(daily([...flat, ...rise, ...Array(40).fill(1000)]));
  const i = 70 + 1;
  assert.equal(usualAt(weeks, i), 1000, "the usual is from weeks ending 4 before");
  const found = scan(weeks);
  assert.equal(found.alarms.length, 1);
  assert.equal(found.alarms[0].i, 71, "≥3× now and ≥2× the week before");
  assert.equal(found.booms.length, 1);
  assert.equal(found.booms[0].i, 73, "≥10× and the highest in 2 years");
  const g = gradeAlarms(found, { weeks });
  assert.equal(g[0].hit, true);
  assert.equal(g[0].leadToBoom, 2);
  assert.equal(g[0].leadToPeak, 4);
});

test("no week sees its future: changing what came after leaves every earlier alarm as it was", () => {
  const base = [...Array(70).fill(1000), 2500, 3500, 6000, 12_000];
  const a = scan(weekly(daily([...base, ...Array(40).fill(30_000)])));
  const b = scan(weekly(daily([...base, ...Array(40).fill(10)])));
  assert.deepEqual(a.alarms.filter((x) => x.i < 74), b.alarms.filter((x) => x.i < 74));
});

test("a small article never alarms (a real crowd), and a one-week spike is no alarm", () => {
  assert.equal(scan(weekly(daily([...Array(70).fill(50), 300, 400, 450]))).alarms.length, 0, "under 500 a week");
  assert.equal(scan(weekly(daily([...Array(70).fill(1000), 1100, 9000, 1000]))).alarms.length, 0, "the week before must be ≥2× too");
});

test("the study: precision against a random week of the same articles, and the public copy", () => {
  const boomer = weekly(daily([...Array(70).fill(1000), 2500, 3500, 6000, 12_000, 20_000, ...Array(40).fill(3000)]));
  const steady = weekly(daily(Array(120).fill(5000)));
  const s = historyStudy({ Fidget_spinner: boomer, Toaster: steady }, "2026-11-27");
  assert.equal(s.articles, 2);
  assert.equal(s.alarms.graded, 1);
  assert.equal(s.alarms.precisionPct, 100);
  assert.ok(s.baseRatePct > 0 && s.baseRatePct < 30);
  assert.ok(s.lift > 1);
  assert.equal(s.booms.ahead, 1);
  const c = cleanHistory(s);
  assert.equal(c.alarms.hits, 1);
  assert.equal(c.list[0].title, "Fidget_spinner");
  assert.equal(cleanHistory({ v: 2 }), null);
  assert.equal(cleanHistory({ ...s, list: [{ title: "<script>", alarm: "2020-01-06" }] }).list.length, 0);
});

test("the articles are fixed in the file and asked only from Wikimedia's own Pageviews API", () => {
  assert.ok(ARTICLES.length >= 60);
  assert.equal(new Set(ARTICLES).size, ARTICLES.length);
  assert.match(pageviewsUrl("Fidget_spinner", "20261126"), /^https:\/\/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews\/per-article\/en\.wikipedia\/all-access\/user\/Fidget_spinner\/daily\/2015070100\/2026112600$/);
  assert.equal(HISTORY.alarm.ratio < HISTORY.boom.ratio, true);
});
