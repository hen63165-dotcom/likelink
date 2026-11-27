// 🥊 The head-to-head, every day, on the same products (the owner, 26.11, over an outside check: "proof
// the forecasts beat a random choice or a simple ranking by order growth", then "do a wider research
// than ChatGPT found and upgrade it so nobody has an edge"; the check that day found no trend company
// that publishes its forecasts against a naive baseline, and forecasting practice requires one).
//
// A walk-forward test of the radar's chance model (radarPromise.js, the 🎯 calibrated chance) against
// the two yardsticks an outside reviewer asks for, on every measured item and every day of the radar's
// own readings:
//   • the simple ranking by order growth: the items that grew fastest over the last week;
//   • chance: a random pick, whose expected result is the day's own share of items that grew.
// Two of the radar's own orderings meet them: its chance model, and its noise-aware ordering (the growth
// at the low end of a one-sided 95% Poisson bound, freshRisers.growthOverDays — how it orders the new
// products it shows), so a jump from 2 to 6 orders never outranks a steady climb from 200 to 400; and its
// learning model (radarModels.js: the event itself, from eight measured signals, walk-forward); and the
// radar's pick (confirmed momentum: the smaller of last week's and the last three days' pace, chosen in
// the lab on the earlier days of the real history and checked on the later ones, radarLab.js).
// Each day: a fixed sample of up to `perDay` measured items (a public hash of the day and the item id).
// For each day d, the model is trained ONLY on outcomes known on day d (calibrate(items, d)); each item's
// state is read on day d (its orders and its pace from a reading 3–14 days older); the outcome is its
// 30-day orders on day d + h (the due day or the day after). "Grew" = the chance line of that horizon
// (+10% in 3 days, +25% in 7). Measured per horizon:
//   • the hit share of the top `k` each forecaster ranks first that day (model by chance, the simple
//     ranking by pace) against the day's base rate (what a random pick gets on average);
//   • Brier scores: the model, the simple ranking turned into a probability (its pace decile's past hit
//     share), and a constant (the past base rate); the skill of the model against each;
//   • AUC: how often each one ranks a grower above an item that did not grow;
//   • days won, lost and tied in the top-k head-to-head, with a two-sided sign test.
// A backtest, never a sealed call: it shows how the same model would have done each day with that
// day's data only. The cases are published so anyone can recompute every number. Pure.

import { PROMISE, bandOf, calibrate, chanceFor, examples, featuresAt, targetAt } from "./radarPromise.js";
import { growthOverDays } from "./freshRisers.js";
import { learnOn, predictLogistic, richFeatures, xRich } from "./radarModels.js";

export const BACKTEST = Object.freeze({ horizons: [3, 7], k: 20, minOrders: PROMISE.minOrders, perDay: 400, minPool: 40, maxDays: 30, paceBins: 10, maxCases: 30_000 });

// FNV-1a: the day's sample of items is a fixed, public shuffle (nobody picks them), so every case can be published.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

const DAY = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** True when an item at `o` orders reached the line: `y` ≥ o × (1 + line). */
// From `minOrders` only, and at least one more order (26.11: at 0 orders every item "reached +10%").
export const reached = (o, y, line) => y + 1e-9 >= o * (1 + line / 100) && y >= o + 1;

/** The simple ranking as a probability: its pace decile's hit share among the examples known on day d. */
export function paceForecaster(train, line, bins = BACKTEST.paceBins) {
  const rows = train.map((e) => {
    const o = Math.exp(e.x[2]) - 1;
    const pace = e.x[1];
    return { pace, o, hit: e.y >= Math.log((o * (1 + line / 100) + 1) / (o + 1)) && e.y >= Math.log((o + 2) / (o + 1)) - 1e-12 };
  }).filter((r) => r.o >= PROMISE.minOrders).sort((a, b) => a.pace - b.pace);
  const n = rows.length;
  if (!n) return null;
  const edges = Array.from({ length: bins - 1 }, (_, i) => rows[Math.floor(((i + 1) * n) / bins)].pace);
  const stats = Array.from({ length: bins }, () => ({ n: 0, hits: 0 }));
  const binOf = (pace) => { let b = 0; while (b < edges.length && pace >= edges[b]) b++; return b; };
  for (const r of rows) { const b = binOf(r.pace); stats[b].n++; if (r.hit) stats[b].hits++; }
  const base = (rows.filter((r) => r.hit).length + 0.5) / (n + 1);
  return { base, p: (pacePerH) => { const s = stats[binOf(pacePerH)]; return (s.hits + 0.5) / (s.n + 1); } };
}

/** AUC by rank sum (ties share their rank); null without both outcomes. */
export function auc(scores = [], labels = []) {
  const rows = scores.map((s, i) => [s, labels[i] ? 1 : 0]).sort((a, b) => a[0] - b[0]);
  const pos = rows.filter((r) => r[1]).length;
  const neg = rows.length - pos;
  if (!pos || !neg) return null;
  let rankSum = 0;
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j][0] === rows[i][0]) j++;
    const rank = (i + 1 + j) / 2;
    for (let t = i; t < j; t++) if (rows[t][1]) rankSum += rank;
    i = j;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Two-sided sign test over the days won and lost (ties left out). */
export function signTest(wins, losses) {
  const n = wins + losses;
  if (!n) return null;
  const k = Math.min(wins, losses);
  let lc = 0;
  let tail = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) lc += Math.log(n - i + 1) - Math.log(i);
    if (i <= k) tail += Math.exp(lc - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

/** The test day by day, per horizon; `cases` are the published rows. */
export function backtest(items = {}, today, { rules = BACKTEST, promise = PROMISE } = {}) {
  const days = new Set();
  for (const series of Object.values(items || {})) for (const r of Array.isArray(series) ? series : []) if (Array.isArray(r)) days.add(r[0]);
  const all = [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && dayNum(d) >= dayNum(today) - rules.maxDays).sort();
  const out = { at: today, horizons: [], cases: [], daily: [] };
  for (const h of rules.horizons) {
    const line = promise.chanceLine[h];
    const one = { ...promise, horizons: [h] };
    const acc = { days: 0, cases: 0, model: { hits: 0, of: 0 }, radar: { hits: 0, of: 0 }, rank: { hits: 0, of: 0 }, radarDuel: { wins: 0, losses: 0, ties: 0 }, learn: { hits: 0, of: 0 }, learnDuel: { wins: 0, losses: 0, ties: 0 }, pick: { hits: 0, of: 0 }, pickDuel: { wins: 0, losses: 0, ties: 0 }, random: { exp: 0, of: 0 }, brier: { model: 0, rank: 0, base: 0, learn: 0 }, scores: { model: [], radar: [], rank: [], learn: [], pick: [], y: [] }, wins: 0, losses: 0, ties: 0, from: null, to: null, skipped: 0 };
    for (const d of all) {
      if (dayNum(d) + h + promise.gradeSlackDays > dayNum(today)) continue;
      const cal = calibrate(items, d, { rules: one })[h];
      if (cal?.state !== "READY") { acc.skipped++; continue; }
      const pf = paceForecaster(examples(items, h, d, { rules: one }), line, rules.paceBins);
      if (!pf) { acc.skipped++; continue; }
      const lm = learnOn(items, h, d, line, { promise });
      if (!lm) { acc.skipped++; continue; }
      const pool = [];
      const ids = Object.keys(items).filter((id) => (featuresAt(items[id], d, { rules: promise })?.o ?? -1) >= rules.minOrders).sort((a, b) => fnv(`${d}|${a}`) - fnv(`${d}|${b}`) || (a < b ? -1 : 1)).slice(0, rules.perDay);
      for (const id of ids) {
        const series = items[id];
        const f = featuresAt(series, d, { rules: promise });
        if (!f) continue;
        const y = targetAt(series, dayStr(dayNum(d) + h), { rules: promise });
        if (!y) continue;
        const c = chanceFor(series, d, cal, { rules: promise });
        if (!c) continue;
        const before = (f.o + 1) / Math.exp(f.pace * f.span) - 1;
        const g = growthOverDays({ before: Math.round(before), after: f.o, days: f.span });
        const rf = richFeatures(series, d, { promise });
        const pl = rf ? predictLogistic(lm, xRich(rf, h)) : 0;
        pool.push({ id, o: f.o, pace: f.pace, cp: rf ? Math.min(rf.pace, rf.pace3) : f.pace, low: g ? g.lowWeekPct : -1e9, pm: c.p / 100, pr: pf.p(f.pace * h), pl, hit: reached(f.o, y.v, line), y: y.v, band: bandOf(f.o, promise) });
      }
      if (pool.length < rules.minPool) { acc.skipped++; continue; }
      const k = Math.min(rules.k, Math.floor(pool.length / 5));
      const byModel = [...pool].sort((a, b) => b.pm - a.pm || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, k);
      const byRank = [...pool].sort((a, b) => b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, k);
      const byRadar = [...pool].sort((a, b) => b.low - a.low || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, k);
      const dh = byRadar.filter((x) => x.hit).length;
      const lh = [...pool].sort((a, b) => b.pl - a.pl || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, k).filter((x) => x.hit).length;
      const ph = [...pool].sort((a, b) => b.cp - a.cp || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, k).filter((x) => x.hit).length;
      const mh = byModel.filter((x) => x.hit).length;
      const rh = byRank.filter((x) => x.hit).length;
      const rate = pool.filter((x) => x.hit).length / pool.length;
      acc.days++;
      acc.cases += pool.length;
      acc.model.hits += mh; acc.model.of += k;
      acc.rank.hits += rh; acc.rank.of += k;
      acc.radar.hits += dh; acc.radar.of += k;
      acc.learn.hits += lh; acc.learn.of += k;
      acc.pick.hits += ph; acc.pick.of += k;
      if (ph > rh) acc.pickDuel.wins++; else if (ph < rh) acc.pickDuel.losses++; else acc.pickDuel.ties++;
      if (lh > rh) acc.learnDuel.wins++; else if (lh < rh) acc.learnDuel.losses++; else acc.learnDuel.ties++;
      // Per day, the chance model's mean chance and Brier beside the constant's (the lab prints them, to
      // see whether a bad Brier comes from the first days, when the model had little history to learn from).
      const dayBrier = (key) => Math.round((pool.reduce((s, x) => s + (key(x) - (x.hit ? 1 : 0)) ** 2, 0) / pool.length) * 1000) / 1000;
      out.daily.push({ h, d, n: pool.length, k, rate: Math.round(rate * 1000) / 1000, model: mh, radar: dh, learn: lh, pick: ph, rank: rh, meanChance: Math.round((pool.reduce((s, x) => s + x.pm, 0) / pool.length) * 1000) / 1000, brierModel: dayBrier((x) => x.pm), brierBase: dayBrier(() => pf.base), trainN: cal.n });
      if (dh > rh) acc.radarDuel.wins++; else if (dh < rh) acc.radarDuel.losses++; else acc.radarDuel.ties++;
      acc.random.exp += rate * k; acc.random.of += k;
      if (mh > rh) acc.wins++; else if (mh < rh) acc.losses++; else acc.ties++;
      for (const x of pool) {
        const yv = x.hit ? 1 : 0;
        acc.brier.model += (x.pm - yv) ** 2;
        acc.brier.rank += (x.pr - yv) ** 2;
        acc.brier.base += (pf.base - yv) ** 2;
        acc.brier.learn += (x.pl - yv) ** 2;
        acc.scores.model.push(x.pm); acc.scores.radar.push(x.low); acc.scores.rank.push(x.pace); acc.scores.learn.push(x.pl); acc.scores.pick.push(x.cp); acc.scores.y.push(yv);
        if (out.cases.length < rules.maxCases) out.cases.push([h, d, x.id, x.o, Math.round(x.pace * 1e5) / 1e5, Math.round(x.pm * 100), Math.round(x.pr * 100), x.y, yv, x.low > -1e8 ? x.low : null, Math.round(x.pl * 1000) / 10, Math.round(x.cp * 1e5) / 1e5]);
      }
      acc.from = acc.from || d;
      acc.to = d;
    }
    const n = acc.cases;
    const bm = n ? acc.brier.model / n : null;
    const br = n ? acc.brier.rank / n : null;
    const bb = n ? acc.brier.base / n : null;
    const bl = n ? acc.brier.learn / n : null;
    out.horizons.push({
      h, line, k: rules.k, days: acc.days, skipped: acc.skipped, cases: n, from: acc.from, to: acc.to,
      model: { hits: acc.model.hits, of: acc.model.of, rate: acc.model.of ? r1((acc.model.hits / acc.model.of) * 100) : null },
      radar: { hits: acc.radar.hits, of: acc.radar.of, rate: acc.radar.of ? r1((acc.radar.hits / acc.radar.of) * 100) : null },
      rank: { hits: acc.rank.hits, of: acc.rank.of, rate: acc.rank.of ? r1((acc.rank.hits / acc.rank.of) * 100) : null },
      learn: { hits: acc.learn.hits, of: acc.learn.of, rate: acc.learn.of ? r1((acc.learn.hits / acc.learn.of) * 100) : null },
      pick: { hits: acc.pick.hits, of: acc.pick.of, rate: acc.pick.of ? r1((acc.pick.hits / acc.pick.of) * 100) : null },
      random: { rate: acc.random.of ? r1((acc.random.exp / acc.random.of) * 100) : null },
      brier: { model: r3(bm), rank: r3(br), base: r3(bb), learn: r3(bl) },
      skill: { vsRank: bm !== null && br ? r1((1 - bm / br) * 100) : null, vsBase: bm !== null && bb ? r1((1 - bm / bb) * 100) : null, learnVsRank: bl !== null && br ? r1((1 - bl / br) * 100) : null, learnVsBase: bl !== null && bb ? r1((1 - bl / bb) * 100) : null },
      auc: { model: r3(auc(acc.scores.model, acc.scores.y)), radar: r3(auc(acc.scores.radar, acc.scores.y)), learn: r3(auc(acc.scores.learn, acc.scores.y)), pick: r3(auc(acc.scores.pick, acc.scores.y)), rank: r3(auc(acc.scores.rank, acc.scores.y)) },
      dayDuel: { wins: acc.wins, losses: acc.losses, ties: acc.ties, p: r3(signTest(acc.wins, acc.losses)) },
      radarDuel: { ...acc.radarDuel, p: r3(signTest(acc.radarDuel.wins, acc.radarDuel.losses)) },
      learnDuel: { ...acc.learnDuel, p: r3(signTest(acc.learnDuel.wins, acc.learnDuel.losses)) },
      pickDuel: { ...acc.pickDuel, p: r3(signTest(acc.pickDuel.wins, acc.pickDuel.losses)) },
    });
  }
  return out;
}

/** The board's copy (no cases: they are published apart). */
export function backtestBoard(bt) {
  return bt ? { at: bt.at, horizons: bt.horizons, cases: bt.cases.length } : null;
}

/** The published cases: one row per item, day and horizon, so anyone can recompute every number. */
export const CASE_COLUMNS = Object.freeze(["horizon", "day", "item", "orders", "pacePerDay", "modelChancePct", "rankingChancePct", "ordersAfter", "grew", "radarLowWeekPct", "learnChancePct", "confirmedPacePerDay"]);
export function backtestPublic(bt) {
  return bt ? { at: bt.at, rule: "items with at least 10 orders; grew = ordersAfter >= orders × (1 + line/100) and ordersAfter >= orders + 1; line: 3 days +10%, 7 days +25%; top k = 20 a day (or a fifth of a small pool)", columns: CASE_COLUMNS, cases: bt.cases } : null;
}

/** Recomputes the top-k head-to-head from the published cases (the page runs it in the visitor's browser). */
export function recomputeCases(pub, { k = BACKTEST.k } = {}) {
  const rows = Array.isArray(pub?.cases) ? pub.cases : [];
  const groups = new Map();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 9) continue;
    const key = `${r[0]}|${r[1]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ h: r[0], id: String(r[2]), pace: r[4], pm: r[5], hit: r[8] === 1, low: Number.isFinite(r[9]) ? r[9] : -1e9, pl: Number.isFinite(r[10]) ? r[10] : -1, cp: Number.isFinite(r[11]) ? r[11] : r[4] });
  }
  const per = {};
  for (const [key, pool] of groups) {
    const h = Number(key.split("|")[0]);
    const kk = Math.min(k, Math.floor(pool.length / 5));
    if (pool.length < BACKTEST.minPool || kk < 1) continue;
    const m = [...pool].sort((a, b) => b.pm - a.pm || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk).filter((x) => x.hit).length;
    const r = [...pool].sort((a, b) => b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk).filter((x) => x.hit).length;
    const dr = [...pool].sort((a, b) => b.low - a.low || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk).filter((x) => x.hit).length;
    const lr = [...pool].sort((a, b) => b.pl - a.pl || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk).filter((x) => x.hit).length;
    const pk = [...pool].sort((a, b) => b.cp - a.cp || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, kk).filter((x) => x.hit).length;
    const p = per[h] || (per[h] = { days: 0, model: 0, radar: 0, learn: 0, pick: 0, rank: 0, of: 0 });
    p.days++; p.model += m; p.radar += dr; p.learn += lr; p.pick += pk; p.rank += r; p.of += kk;
  }
  return Object.fromEntries(Object.entries(per).map(([h, p]) => [h, { days: p.days, model: p.of ? r1((p.model / p.of) * 100) : null, radar: p.of ? r1((p.radar / p.of) * 100) : null, learn: p.of ? r1((p.learn / p.of) * 100) : null, pick: p.of ? r1((p.pick / p.of) * 100) : null, rank: p.of ? r1((p.rank / p.of) * 100) : null }]));
}

/** The browser's copy. */
export function cleanBacktest(b) {
  if (!b || typeof b !== "object" || !Array.isArray(b.horizons)) return null;
  const n = (x, max = 1e9) => (typeof x === "number" && Number.isFinite(x) && x >= -1e6 && x <= max ? x : null);
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) ? x : null);
  return {
    at: d(b.at), cases: n(b.cases) ?? 0,
    horizons: b.horizons.filter((x) => [3, 7, 14].includes(x?.h)).slice(0, 3).map((x) => ({
      h: x.h, line: n(x.line), k: n(x.k), days: n(x.days) ?? 0, skipped: n(x.skipped) ?? 0, cases: n(x.cases) ?? 0, from: d(x.from), to: d(x.to),
      model: { hits: n(x.model?.hits) ?? 0, of: n(x.model?.of) ?? 0, rate: n(x.model?.rate, 100) },
      radar: { hits: n(x.radar?.hits) ?? 0, of: n(x.radar?.of) ?? 0, rate: n(x.radar?.rate, 100) },
      rank: { hits: n(x.rank?.hits) ?? 0, of: n(x.rank?.of) ?? 0, rate: n(x.rank?.rate, 100) },
      learn: { hits: n(x.learn?.hits) ?? 0, of: n(x.learn?.of) ?? 0, rate: n(x.learn?.rate, 100) },
      pick: { hits: n(x.pick?.hits) ?? 0, of: n(x.pick?.of) ?? 0, rate: n(x.pick?.rate, 100) },
      random: { rate: n(x.random?.rate, 100) },
      brier: { model: n(x.brier?.model, 1), rank: n(x.brier?.rank, 1), base: n(x.brier?.base, 1), learn: n(x.brier?.learn, 1) },
      skill: { vsRank: n(x.skill?.vsRank, 100), vsBase: n(x.skill?.vsBase, 100), learnVsRank: n(x.skill?.learnVsRank, 100), learnVsBase: n(x.skill?.learnVsBase, 100) },
      auc: { model: n(x.auc?.model, 1), radar: n(x.auc?.radar, 1), learn: n(x.auc?.learn, 1), pick: n(x.auc?.pick, 1), rank: n(x.auc?.rank, 1) },
      dayDuel: { wins: n(x.dayDuel?.wins) ?? 0, losses: n(x.dayDuel?.losses) ?? 0, ties: n(x.dayDuel?.ties) ?? 0, p: n(x.dayDuel?.p, 1) },
      radarDuel: { wins: n(x.radarDuel?.wins) ?? 0, losses: n(x.radarDuel?.losses) ?? 0, ties: n(x.radarDuel?.ties) ?? 0, p: n(x.radarDuel?.p, 1) },
      learnDuel: { wins: n(x.learnDuel?.wins) ?? 0, losses: n(x.learnDuel?.losses) ?? 0, ties: n(x.learnDuel?.ties) ?? 0, p: n(x.learnDuel?.p, 1) },
      pickDuel: { wins: n(x.pickDuel?.wins) ?? 0, losses: n(x.pickDuel?.losses) ?? 0, ties: n(x.pickDuel?.ties) ?? 0, p: n(x.pickDuel?.p, 1) },
    })),
  };
}
