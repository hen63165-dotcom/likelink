// 📐 The proven range (src/lib/growth/radarPromise.js): a learned model + split conformal + adaptive
// conformal inference over the radar's own item histories. These tests pin the arithmetic, that the
// ranges really cover the stated share on data they never saw, that a miss moves the level, that a
// graded range is never edited, and the sealed book's shape.
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROMISE, addIssued, bandOf, calibrate, cardRange, conformalQuantile, coverageOf, examples, featuresAt, fitRidge,
  gradePromises, issuePromises, newPromiseState, predict, promiseBoard, promiseSealText, rangeFor, samplePool, targetAt,
} from "../src/lib/growth/radarPromise.js";

const day = (n) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString().slice(0, 10);
// A fixed pseudo-random stream (no Math.random: the test must be the same every run).
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const gauss = (r) => { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** Items whose log orders follow their own pace plus noise: a world the model can learn and conformal can cover. */
function world({ items = 300, days = 40, seed = 7 } = {}) {
  const r = rng(seed);
  const out = {};
  for (let k = 0; k < items; k++) {
    const id = String(1005000000000000 + k);
    let lo = Math.log(50 + r() * 5000);
    const pace = (r() - 0.4) * 0.08; // −3%…+5% a day
    const series = [];
    for (let d = 0; d < days; d++) {
      lo += pace + gauss(r) * 0.03;
      series.push([day(d), Math.max(0, Math.round(Math.exp(lo)))]);
    }
    out[id] = series;
  }
  return out;
}
const upTo = (items, d) => Object.fromEntries(Object.entries(items).map(([id, s]) => [id, s.filter((x) => x[0] <= d)]));

test("the pace is measured against a reading 3–14 days older, closest to a week, and a 20× jump is never a pace", () => {
  const s = [[day(0), 100], [day(3), 120], [day(7), 140], [day(10), 200]];
  const f = featuresAt(s, day(10));
  assert.equal(f.span, 7);
  assert.equal(f.o, 200);
  assert.ok(Math.abs(f.pace - Math.log(201 / 121) / 7) < 1e-12, "against day 3, seven days before");
  assert.equal(featuresAt(s, day(2)), null, "no reading that day");
  assert.equal(featuresAt([[day(0), 10], [day(7), 5000]], day(7)), null, "a listing that jumped ×500 has no pace");
  assert.deepEqual(targetAt(s, day(9)), { d: day(10), v: 200 }, "the day after the due day is accepted");
  assert.equal(targetAt(s, day(8)), null, "two days late is never a grade");
});

test("ridge regression finds the line, and the conformal quantile is the textbook one", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ x: [1, i / 50, (i % 7) / 3], y: 0.5 + 2 * (i / 50) - 1 * ((i % 7) / 3) }));
  const b = fitRidge(rows, { lambda: 1e-9 });
  assert.ok(Math.abs(b[0] - 0.5) < 1e-6 && Math.abs(b[1] - 2) < 1e-6 && Math.abs(b[2] + 1) < 1e-6);
  assert.ok(Math.abs(predict(b, [1, 1, 0]) - 2.5) < 1e-6);
  const s = Array.from({ length: 19 }, (_, i) => i + 1); // 1..19
  assert.equal(conformalQuantile(s, 0.1), 18); // ⌈20 × 0.9⌉ = 18
  assert.equal(conformalQuantile(s, 0.2), 16);
  assert.equal(conformalQuantile([1, 2, 3], 0.1), Infinity, "too few examples for 90%: no range");
  assert.equal(bandOf(10), 0); assert.equal(bandOf(300), 1); assert.equal(bandOf(5000), 2);
});

test("until there are enough examples the horizon says it is calibrating, and gives no range", () => {
  const items = world({ items: 5, days: 10 });
  const cal = calibrate(items, day(9));
  for (const h of PROMISE.horizons) assert.equal(cal[h].state, "CALIBRATING");
  assert.equal(rangeFor(items[Object.keys(items)[0]], day(9), cal[3], 90), null);
});

test("on days it never saw, the 90% ranges hold about 90% of the time and the 80% about 80%", () => {
  const all = world({ items: 400, days: 45 });
  const today = day(30);
  const known = upTo(all, today); // the model and widths see nothing after today
  const cal = calibrate(known, today);
  assert.equal(cal[7].state, "READY");
  assert.ok(cal[7].n >= PROMISE.minCalib);
  const ids = Object.keys(known);
  const issued = issuePromises(known, ids, today, cal);
  const seven = issued.filter((e) => e.h === 7);
  assert.ok(seven.length > 300);
  let held80 = 0, held90 = 0;
  for (const e of seven) {
    const v = all[e.i].find((x) => x[0] === day(37))[1];
    if (v >= e.r[0] && v <= e.r[1]) held80++;
    if (v >= e.r[2] && v <= e.r[3]) held90++;
  }
  const r80 = held80 / seven.length, r90 = held90 / seven.length;
  assert.ok(r90 >= 0.84 && r90 <= 0.98, `90% ranges held ${r90}`);
  assert.ok(r80 >= 0.72 && r80 <= 0.9, `80% ranges held ${r80}`);
  assert.ok(r90 >= r80, "the wider level holds at least as often");
  for (const e of seven) assert.ok(e.r[2] <= e.r[0] && e.r[3] >= e.r[1], "the 90% range contains the 80% one");
});

test("grading: HELD inside the range, never edited; a miss moves the level wider (ACI); an unread item is set aside", () => {
  const items = { 1005000000000001: [[day(0), 100], [day(7), 150]], 1005000000000002: [[day(0), 100], [day(7), 400]], 1005000000000003: [[day(0), 100]] };
  let state = addIssued(newPromiseState(), [
    { i: "1005000000000001", a: day(0), h: 7, o: 100, r: [120, 180, 110, 200] },
    { i: "1005000000000002", a: day(0), h: 7, o: 100, r: [120, 180, 110, 200] },
    { i: "1005000000000003", a: day(0), h: 7, o: 100, r: [120, 180, 110, 200] },
  ]);
  const early = gradePromises(state, items, day(6));
  assert.equal(early.graded, 0, "nothing is graded before its day");
  const g = gradePromises(state, items, day(7));
  assert.equal(g.graded, 2);
  assert.deepEqual(g.state.totals[7][90], { n: 2, held: 1 });
  assert.deepEqual(g.state.totals[7][80], { n: 2, held: 1 });
  assert.equal(g.state.open.length, 1, "the unread item waits");
  // α90 starts at 0.10: +0.005·(0.1−0) for the hit, +0.005·(0.1−1) for the miss → 0.096: cut lower, wider ranges.
  assert.ok(g.state.alphas[7][90] < 0.1);
  const later = gradePromises(g.state, items, day(7 + PROMISE.gradeSlackDays + PROMISE.waitDays + 1));
  assert.equal(later.setAside, 1);
  assert.equal(later.state.open.length, 0);
  assert.deepEqual(later.state.totals[7][90], { n: 2, held: 1 }, "a set-aside range is never counted");
  const again = gradePromises(later.state, { ...items, 1005000000000001: [[day(0), 100], [day(7), 999]] }, day(20));
  assert.deepEqual(again.state.totals, later.state.totals, "a graded range is never graded again");
  const cov = coverageOf(again.state);
  assert.deepEqual(cov.find((c) => c.h === 7 && c.level === 90), { h: 7, level: 90, n: 2, held: 1, rate: 50 });
});

test("over many days ACI pulls the share of held ranges toward the stated level", () => {
  // A predictor that is too narrow on purpose: every day half of 100 ranges miss at first.
  let state = newPromiseState();
  const rates = [];
  for (let d = 0; d < 120; d++) {
    const alpha = state.alphas?.[3]?.[90] ?? 0.1;
    const missShare = Math.min(1, Math.max(0, alpha * 5)); // a wider cut (smaller α) misses less
    const items = {};
    const issued = [];
    for (let k = 0; k < 100; k++) {
      const id = String(1005000000100000 + k);
      const miss = k < Math.round(missShare * 100);
      items[id] = [[day(d), 100], [day(d + 3), miss ? 999 : 100]];
      issued.push({ i: id, a: day(d), h: 3, o: 100, r: [0, 0, 90, 110] });
    }
    state = addIssued({ ...state, open: [] }, issued);
    const g = gradePromises(state, items, day(d + 3));
    state = g.state;
    const t = state.totals[3][90];
    rates.push(t.held / t.n);
  }
  // Day 1 held only 50%; ACI cuts wider after misses and narrower after hits, so the whole record
  // converges to the stated 90% (here 89.8% after 120 days), whatever the predictor got wrong.
  assert.ok(rates[0] === 0.5);
  assert.ok(rates.at(-1) > 0.88 && rates.at(-1) < 0.92, `long-run share held ${rates.at(-1)}`);
});

test("the day's sample is a fixed shuffle (same day, same items), never the shown ones twice", () => {
  const items = world({ items: 50, days: 12 });
  const a = samplePool(items, day(11), 10);
  assert.deepEqual(a, samplePool(items, day(11), 10));
  assert.notDeepEqual(a, samplePool(items, day(10), 10));
  assert.equal(samplePool(items, day(11), 10, a).some((id) => a.includes(id)), false);
});

test("the sealed book: one line per range issued, fixed fields, sorted; the board carries the record only", () => {
  const issued = [
    { i: "1005000000000002", a: day(1), h: 7, o: 150.4, r: [160, 240, 140, 300] },
    { i: "1005000000000001", a: day(1), h: 3, o: 90, r: [null, null, 80, 120] },
  ];
  assert.equal(promiseSealText(issued), `1005000000000001|${day(1)}|3|90|-|80-120\n1005000000000002|${day(1)}|7|150|160-240|140-300`);
  assert.equal(promiseSealText([]), null);
  const state = addIssued(newPromiseState(), issued);
  const b = promiseBoard(state, { 3: { state: "CALIBRATING", n: 12 } }, issued, day(1));
  assert.equal(b.issued, 2);
  assert.equal(b.open, 2);
  assert.equal(b.horizons.find((x) => x.h === 3).state, "CALIBRATING");
  assert.equal(b.nextDue, day(4));
  assert.equal(b.coverage.length, PROMISE.horizons.length * PROMISE.levels.length);
});

test("a new product's card: the longest ready horizon, and the hit line only for a 14-day range", () => {
  const all = world({ items: 400, days: 45 });
  const today = day(40);
  const cal = calibrate(all, today);
  assert.equal(cal[14].state, "READY");
  const id = Object.keys(all)[0];
  const c = cardRange(all, id, today, cal);
  assert.equal(c.h, 14);
  assert.ok(c.r90[0] <= c.r80[0] && c.r90[1] >= c.r80[1]);
  assert.ok(c.clears === null || c.clears === 80 || c.clears === 90);
  const short = cardRange(all, id, today, { 3: cal[3] });
  assert.equal(short.h, 3);
  assert.equal(short.clears, null, "a 3-day range never claims the 14-day hit line");
});

test("examples never look past today, and give each item at most a few anchors", () => {
  const items = world({ items: 20, days: 30 });
  const ex = examples(items, 7, day(20));
  assert.ok(ex.every((e) => e.t <= day(13)));
  const per = ex.reduce((m, e) => ((m[e.id] = (m[e.id] || 0) + 1), m), {});
  assert.ok(Object.values(per).every((n) => n <= PROMISE.maxPerItem));
});

test("the board keeps the range's state, record and card lines; the teaser keeps the record and drops the ranges", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const { teaserBoard } = await import("../src/lib/growth/radarGate.js");
  const { createHash } = await import("node:crypto");
  const text = `1005000000000001|2026-11-21|3|90|80-100|70-120`;
  const promise = {
    v: 1, at: "2026-11-21", levels: [80, 90],
    horizons: [{ h: 3, state: "READY", n: 900, need: 60 }, { h: 14, state: "CALIBRATING", n: 0, need: 60 }],
    coverage: [{ h: 3, level: 90, n: 10, held: 9, rate: 90 }, { h: 3, level: 80, n: 10, held: 8, rate: 80 }],
    issued: 1, open: 1, nextDue: "2026-11-24",
    recent: [{ i: "1005000000000002", a: "2026-11-18", h: 3, o: 90, v: 95, r: [80, 100, 70, 120], held: [1, 1] }],
    seal: { d: "2026-11-21", sha256: createHash("sha256").update(text).digest("hex"), count: 1, text, ots: [] },
  };
  const riser = { id: "1005000000000001", title: "x", image: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg", buy: "https://s.click.aliexpress.com/e/_abc", weekPct: 60, orders: 90, known: { similar: 10 }, promise: { h: 14, o: 90, r80: [120, 200], r90: [100, 240], pct80: [33, 122], pct90: [11, 166], clears: 90 } };
  const b = sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [], promise, fresh: { tracking: 1, risers: [riser] } });
  assert.equal(b.promise.horizons[0].state, "READY");
  assert.deepEqual(b.promise.coverage[0], { h: 3, level: 90, n: 10, held: 9, rate: 90 });
  assert.equal(b.promise.seal.text, text);
  assert.deepEqual(b.promise.recent[0].held, [1, 1]);
  assert.deepEqual(b.fresh.risers[0].promise.r90, [100, 240]);
  assert.equal(b.fresh.risers[0].promise.clears, null, "a card that claims the hit line with a range under +50% loses the claim");
  const bad = sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [], promise: { ...promise, seal: { ...promise.seal, text: "<script>" } } });
  assert.equal(bad.promise.seal.text, null);
  const t = teaserBoard({ v: 2, at: "2026-11-21T06:00:00Z", promise });
  assert.deepEqual(t.promise.coverage, promise.coverage);
  assert.deepEqual(t.promise.recent, []);
  assert.equal(t.promise.seal.text, undefined, "behind the lock the book's text (item numbers) stays hidden");
  assert.equal(t.promise.seal.sha256, promise.seal.sha256);
});
