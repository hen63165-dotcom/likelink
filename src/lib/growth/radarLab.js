// 🧪 The lab's variants (the owner, 26.11: "upgrade it and check it at a level that it hits everything").
// Walk-forward, on the same fixed daily samples as the head-to-head: each variant scores the pool of day
// d from what was known on day d only; its top `k` and its AUC are kept per day. A variant is chosen on
// the earlier half of the days and checked on the later half, which the choice never saw. Pure.

import { PROMISE, featuresAt, targetAt } from "./radarPromise.js";
import { MODELS, fitLogistic, predictLogistic, richExamples, richFeatures, xRich } from "./radarModels.js";
import { auc, reached } from "./radarBacktest.js";

const DAYMS = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAYMS);
const dayStr = (n) => new Date(n * DAYMS).toISOString().slice(0, 10);
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

// Feature order in xRich: 0 pace7·h, 1 pace3·h, 2 accel·h, 3 size, 4 size²/10, 5 low, 6 z, 7 age.
export const VARIANTS = Object.freeze([
  { id: "ranking", rule: (f) => f.pace },
  { id: "short", rule: (f) => f.pace3 },
  { id: "both", rule: (f) => f.pace + f.pace3 },
  { id: "confirmed", rule: (f) => Math.min(f.pace, f.pace3) },
  { id: "ranking-small", rule: (f) => f.pace - 0.002 * f.size },
  { id: "learn-all", cols: [0, 1, 2, 3, 4, 5, 6, 7], lambda: 1 },
  { id: "learn-pace", cols: [0, 1, 2], lambda: 1 },
  { id: "learn-pace-size", cols: [0, 1, 2, 3], lambda: 1 },
  { id: "learn-pace-size-low", cols: [0, 1, 2, 3, 5], lambda: 1 },
  { id: "learn-all-l10", cols: [0, 1, 2, 3, 4, 5, 6, 7], lambda: 10 },
]);

/** Every variant, day by day, horizon h: per day the pool size, its base rate and each variant's top-k hits and AUC. */
export function labRun(items, today, { h = 3, k = 20, perDay = 400, maxDays = 30, promise = PROMISE, variants = VARIANTS } = {}) {
  const line = promise.chanceLine[h];
  const days = [...new Set(Object.values(items).flatMap((s) => (Array.isArray(s) ? s.map((r) => r[0]) : [])))].filter((d) => dayNum(d) >= dayNum(today) - maxDays && dayNum(d) + h + 1 <= dayNum(today)).sort();
  const out = [];
  for (const d of days) {
    const ids = Object.keys(items).filter((id) => (featuresAt(items[id], d, { rules: promise })?.o ?? -1) >= promise.minOrders).sort((a, b) => fnv(`${d}|${a}`) - fnv(`${d}|${b}`) || (a < b ? -1 : 1)).slice(0, perDay);
    const pool = [];
    for (const id of ids) {
      const f = richFeatures(items[id], d, { promise });
      const y = targetAt(items[id], dayStr(dayNum(d) + h), { rules: promise });
      if (!f || !y) continue;
      pool.push({ id, f, hit: reached(f.o, y.v, line) });
    }
    if (pool.length < 40) continue;
    const ex = richExamples(items, h, d, line, { promise });
    if (ex.length < MODELS.minRows) continue;
    const row = { d, n: pool.length, rate: pool.filter((x) => x.hit).length / pool.length, v: {} };
    const kk = Math.min(k, Math.floor(pool.length / 5));
    for (const v of variants) {
      let score;
      if (v.rule) score = (x) => v.rule(x.f);
      else {
        const m = fitLogistic(ex.map((e) => ({ x: v.cols.map((c) => e.x[c]), y: e.y })), { rules: { ...MODELS, lambda: v.lambda } });
        if (!m) continue;
        score = (x) => predictLogistic(m, v.cols.map((c) => xRich(x.f, h)[c]));
      }
      const s = pool.map((x) => ({ s: score(x), hit: x.hit, id: x.id, pace: x.f.pace }));
      const top = [...s].sort((a, b) => b.s - a.s || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk);
      row.v[v.id] = { hits: top.filter((x) => x.hit).length, k: kk, auc: auc(s.map((x) => x.s), s.map((x) => (x.hit ? 1 : 0))) };
    }
    out.push(row);
  }
  return out;
}

/** The totals of a stretch of days per variant: top-k hit share and the mean AUC. */
export function labTotals(rows, variants = VARIANTS) {
  return Object.fromEntries(variants.map((v) => {
    const part = rows.filter((r) => r.v[v.id]);
    const of = part.reduce((s, r) => s + r.v[v.id].k, 0);
    const hits = part.reduce((s, r) => s + r.v[v.id].hits, 0);
    const aucs = part.map((r) => r.v[v.id].auc).filter((x) => x !== null);
    return [v.id, { days: part.length, hits, of, rate: of ? Math.round((hits / of) * 1000) / 10 : null, auc: aucs.length ? Math.round((aucs.reduce((a, b) => a + b, 0) / aucs.length) * 1000) / 1000 : null }];
  }));
}
