// 📐 The proven range (the owner, 2026-11-20: "find what nobody can promise, and make the radar the
// first that does"). The worldwide check that day: trend tools publish an accuracy they measured
// themselves (WGSN 94%, Heuritech 92%, Glimpse 95%), none audited from outside; refunds exist only as
// plain trial policies, never tied to a wrong call; conformal prediction, the statistics that gives a
// range a coverage guarantee, exists in research papers and in forecasting libraries for a company's
// own sales (Nixtla), and no product-trend radar publishes per-item ranges, sealed in advance, with
// their public coverage record.
//
// So the radar commits to the thing that CAN be kept and checked: for an item it measures, a range
// for its 30-day orders in 3, 7 and 14 days, at 80% and 90% coverage. How:
//   1. A small model learns every morning from the radar's own item histories (items.json): ridge
//      regression of the log growth over the horizon on the item's recent pace and size.
//   2. Split conformal prediction: the model's errors on newer, held-out examples set the range's
//      width, per size band (Mondrian), so the range covers the stated share of cases.
//   3. Adaptive conformal inference (Gibbs & Candès, 2021): every graded range nudges the level the
//      next ranges are cut at, so over time the share of ranges that held converges to the stated
//      level even when the market shifts (Black Friday, a season).
//   4. Every range issued is sealed in Bitcoin the day it is made (the book "promise" in the root) and
//      graded on its day: HELD when the real orders fell inside it. Never edited; the coverage record
//      is printed as it is, a shortfall included.
// Pure: the runner reads the store and seals; this file only does the arithmetic.

export const PROMISE = Object.freeze({
  version: 1,
  levels: [80, 90],
  horizons: [3, 7, 14],
  minBaseDays: 3, // the pace is measured against a reading 3–14 days older (closest to a week)
  maxBaseDays: 14,
  maxJump: 20, // a base the item grew from more than 20× is a listing change, never a pace
  windowDays: 45, // calibration examples from the last 45 days only (the market drifts)
  maxPerItem: 3, // the newest anchors per item and horizon, so no item weighs more than others
  minCalib: 60, // examples per horizon before any range is given
  minGroup: 30, // held-out examples a size band needs for its own width; else the shared width
  trainShare: 0.5, // the older half trains the model, the newer half sets the width
  ridge: 1,
  gamma: 0.005, // the adaptive step (ACI)
  sample: 150, // items given ranges each morning besides the new products shown
  gradeSlackDays: 1, // the target reading on the due day, or the day after
  waitDays: 3, // a range whose item was not read within 3 days of its slack is set aside, never counted
  bands: [300, 3000], // size bands of the 30-day orders: under 300, 300–3,000, over 3,000
  keepRecent: 60,
  // 🎯 The calibrated chance (the owner, 20.11, the next round: "find more gaps"; the check that day
  // found calibrated probabilities graded with Brier scores at weather services and prediction
  // markets, and none for product trends): per horizon, the chance the item's 30-day orders grow by
  // at least this much. 14 days uses the new products' own hit line (+50%, freshRisers.gradeFresh).
  chanceLine: { 3: 10, 7: 25, 14: 50 },
  // 26.11, the lab on the real history: an item at 0 orders "reached +10%" whatever happened, so it was
  // a sure hit. The chance is given and graded only from `minOrders` (where +10% is a real order), a hit
  // needs at least one more order, and the record under that rule (`chanceRule`) starts on its own day.
  minOrders: 10,
  chanceRule: 2,
  chanceBins: 10,
});

const DAY = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (d, n) => dayStr(dayNum(d) + n);
export const bandOf = (orders, rules = PROMISE) => (orders < rules.bands[0] ? 0 : orders < rules.bands[1] ? 1 : 2);

const clean = (series) => (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])) && Number.isFinite(r[1]) && r[1] >= 0);

/** The item's state on day t: its 30-day orders and its daily log pace from a reading 3–14 days older. */
export function featuresAt(series, t, { rules = PROMISE } = {}) {
  const rs = clean(series);
  const now = rs.find((r) => r[0] === t);
  if (!now) return null;
  const tn = dayNum(t);
  const base = rs
    .filter((r) => { const g = tn - dayNum(r[0]); return g >= rules.minBaseDays && g <= rules.maxBaseDays; })
    .filter((r) => { const ratio = (now[1] + 1) / (r[1] + 1); return ratio <= rules.maxJump && ratio >= 1 / rules.maxJump; })
    .sort((a, b) => Math.abs(tn - dayNum(a[0]) - 7) - Math.abs(tn - dayNum(b[0]) - 7) || (a[0] < b[0] ? 1 : -1))[0];
  if (!base) return null;
  const span = tn - dayNum(base[0]);
  return { o: now[1], pace: Math.log((now[1] + 1) / (base[1] + 1)) / span, span, size: Math.log(now[1] + 1) };
}

/** The reading a range is graded on: the due day, else up to `gradeSlackDays` after it. */
export function targetAt(series, due, { rules = PROMISE } = {}) {
  const rs = clean(series);
  for (let k = 0; k <= rules.gradeSlackDays; k++) {
    const r = rs.find((x) => x[0] === addDays(due, k));
    if (r) return { d: r[0], v: r[1] };
  }
  return null;
}

export const xOf = (f, h) => [1, f.pace * h, f.size];

/** Every (item, day) the radar can learn from for one horizon: its state then, and what happened h days later. */
export function examples(items, h, today, { rules = PROMISE } = {}) {
  const out = [];
  const from = dayNum(today) - rules.windowDays;
  for (const [id, series] of Object.entries(items || {})) {
    const rs = clean(series);
    const found = [];
    for (let i = rs.length - 1; i >= 0 && found.length < rules.maxPerItem; i--) {
      const t = rs[i][0];
      if (dayNum(t) < from || dayNum(t) + h > dayNum(today)) continue;
      const f = featuresAt(rs, t, { rules });
      if (!f) continue;
      const y = rs.find((r) => r[0] === addDays(t, h));
      if (!y) continue;
      found.push({ id, t, x: xOf(f, h), y: Math.log((y[1] + 1) / (f.o + 1)), band: bandOf(f.o, rules) });
    }
    out.push(...found);
  }
  return out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : 1));
}

/** Ridge regression (the intercept is never shrunk), solved exactly. */
export function fitRidge(rows, { lambda = PROMISE.ridge } = {}) {
  const k = rows[0]?.x.length || 3;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (const { x, y } of rows) for (let i = 0; i < k; i++) { b[i] += x[i] * y; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; }
  for (let i = 1; i < k; i++) A[i][i] += lambda;
  // Gaussian elimination with partial pivoting.
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return new Array(k).fill(0);
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[k] / r[i]);
}

export const predict = (beta, x) => x.reduce((s, v, i) => s + v * (beta[i] || 0), 0);

/** Split conformal: the ⌈(n+1)(1−α)⌉-th smallest error; Infinity when the sample is too small for α. */
export function conformalQuantile(scores, alpha) {
  const s = [...scores].sort((a, b) => a - b);
  const n = s.length;
  if (!(alpha > 0)) return Infinity;
  const k = Math.ceil((n + 1) * (1 - alpha));
  return k <= n ? s[k - 1] : Infinity;
}

const levelAlpha = (alphas, h, level) => {
  const a = alphas?.[h]?.[level];
  return Number.isFinite(a) ? a : 1 - level / 100;
};

/** This morning's model and widths per horizon, from the item histories and the adaptive levels. */
export function calibrate(items, today, { alphas = {}, rules = PROMISE } = {}) {
  const out = {};
  for (const h of rules.horizons) {
    const ex = examples(items, h, today, { rules });
    if (ex.length < rules.minCalib) { out[h] = { h, state: "CALIBRATING", n: ex.length, need: rules.minCalib }; continue; }
    const cut = Math.floor(ex.length * rules.trainShare);
    const train = ex.slice(0, cut);
    const cal = ex.slice(cut);
    const beta = fitRidge(train, { lambda: rules.ridge });
    const signed = cal.map((e) => ({ r: e.y - predict(beta, e.x), band: e.band }));
    const scores = signed.map((x) => ({ s: Math.abs(x.r), band: x.band }));
    // The signed errors, sorted, per size band: the conformal predictive distribution behind the chance.
    const res = { all: signed.map((x) => x.r).sort((a, b) => a - b), bands: {} };
    for (const b of [0, 1, 2]) { const rb = signed.filter((x) => x.band === b).map((x) => x.r).sort((a, b2) => a - b2); if (rb.length >= rules.minGroup) res.bands[b] = rb; }
    const q = {};
    for (const level of rules.levels) {
      const alpha = levelAlpha(alphas, h, level);
      const all = conformalQuantile(scores.map((x) => x.s), alpha);
      const bands = {};
      for (const b of [0, 1, 2]) {
        const sb = scores.filter((x) => x.band === b).map((x) => x.s);
        if (sb.length >= rules.minGroup) bands[b] = conformalQuantile(sb, alpha);
      }
      q[level] = { alpha: Math.round(alpha * 10000) / 10000, all, bands };
    }
    out[h] = { h, state: "READY", n: ex.length, train: train.length, cal: cal.length, beta: beta.map((v) => Math.round(v * 1e6) / 1e6), q, res };
  }
  return out;
}

/** One item's range for one horizon and level, in 30-day orders and as growth. Null when unready. */
export function rangeFor(series, today, cal, level, { rules = PROMISE } = {}) {
  if (!cal || cal.state !== "READY") return null;
  const f = featuresAt(series, today, { rules });
  if (!f) return null;
  const ql = cal.q[level];
  const band = bandOf(f.o, rules);
  const q = Number.isFinite(ql?.bands?.[band]) ? ql.bands[band] : ql?.all;
  if (!Number.isFinite(q)) return null;
  const mid = predict(cal.beta, xOf(f, cal.h));
  const lo = Math.max(0, Math.floor((f.o + 1) * Math.exp(mid - q) - 1));
  const hi = Math.ceil((f.o + 1) * Math.exp(mid + q) - 1);
  return { h: cal.h, level, o: f.o, lo, hi, loPct: Math.round((Math.exp(mid - q) - 1) * 100), hiPct: Math.round((Math.exp(mid + q) - 1) * 100) };
}

/**
 * The calibrated chance (conformal predictive distribution, Vovk): the share of the model's own
 * held-out errors that, added to today's prediction, reach the line. A chance of 30% should come true
 * about 3 times in 10, and the public reliability record shows whether it does.
 */
export function chanceFor(series, today, cal, { rules = PROMISE } = {}) {
  if (!cal || cal.state !== "READY" || !cal.res) return null;
  const f = featuresAt(series, today, { rules });
  if (!f || f.o < rules.minOrders) return null;
  const line = rules.chanceLine[cal.h];
  if (!Number.isFinite(line)) return null;
  const rs = cal.res.bands?.[bandOf(f.o, rules)] || cal.res.all;
  if (!rs?.length) return null;
  const need = Math.log((f.o * (1 + line / 100) + 1) / (f.o + 1)) - predict(cal.beta, xOf(f, cal.h));
  let lo = 0, hi = rs.length; // first index with r >= need (rs sorted ascending)
  while (lo < hi) { const m = (lo + hi) >> 1; if (rs[m] >= need) hi = m; else lo = m + 1; }
  const p = (rs.length - lo + 0.5) / (rs.length + 1);
  return { h: cal.h, line, p: Math.max(1, Math.min(99, Math.round(p * 100))) };
}

// FNV-1a: a fixed, public shuffle of the items for the day's sample (nobody picks them by hand).
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

/** The day's sample: items with a pace today, in a fixed shuffle seeded by the day. */
export function samplePool(items, today, n = PROMISE.sample, exclude = [], { rules = PROMISE } = {}) {
  const skip = new Set(exclude);
  return Object.keys(items || {})
    .filter((id) => !skip.has(id) && featuresAt(items[id], today, { rules }))
    .sort((a, b) => fnv(`${today}|${a}`) - fnv(`${today}|${b}`) || (a < b ? -1 : 1))
    .slice(0, n);
}

/** Today's ranges for the given items: one entry per item and ready horizon, both levels together. */
export function issuePromises(items, ids, today, calib, { rules = PROMISE } = {}) {
  const out = [];
  for (const id of ids) {
    for (const h of rules.horizons) {
      const r = rules.levels.map((L) => rangeFor(items?.[id], today, calib?.[h], L, { rules }));
      if (!r.some(Boolean)) continue;
      const c = chanceFor(items?.[id], today, calib?.[h], { rules });
      out.push({ i: String(id), a: today, h, o: (r.find(Boolean)).o, r: r.flatMap((x) => (x ? [x.lo, x.hi] : [null, null])), ...(c ? { c: c.p } : {}) });
    }
  }
  return out;
}

export const newPromiseState = () => ({ v: PROMISE.version, alphas: {}, totals: {}, chance: {}, chanceRule: PROMISE.chanceRule, chanceSince: null, open: [], recent: [] });

/**
 * Grades every open range whose day came: HELD (1) when the real 30-day orders fell inside, else 0,
 * per level. A range whose item was not read within the slack waits up to `waitDays`, then is set
 * aside (never counted either way). Every graded range moves its level's adaptive alpha (ACI), and
 * the totals keep the whole record after old entries are trimmed.
 */
export function gradePromises(state, items, today, { rules = PROMISE } = {}) {
  const s = { ...newPromiseState(), ...(state || {}) };
  const alphas = JSON.parse(JSON.stringify(s.alphas || {}));
  const totals = JSON.parse(JSON.stringify(s.totals || {}));
  // A chance record kept under an older rule restarts under the current one (dated: `chanceSince`).
  // The stored state's own field decides: a state written before the field existed has none, and the
  // defaults above would fill it with today's rule (26.11's main run kept 348 old grades that way).
  const sameRule = (state || {}).chanceRule === rules.chanceRule;
  const chance = sameRule ? JSON.parse(JSON.stringify(s.chance || {})) : {};
  const chanceSince = sameRule ? s.chanceSince || today : today;
  const open = [];
  const graded = [];
  let setAside = 0;
  for (const e of Array.isArray(s.open) ? s.open : []) {
    const due = addDays(e.a, e.h);
    if (dayNum(due) > dayNum(today)) { open.push(e); continue; }
    const t = targetAt(items?.[e.i], due, { rules });
    if (!t) {
      if (dayNum(today) - dayNum(due) > rules.gradeSlackDays + rules.waitDays) setAside++;
      else open.push(e);
      continue;
    }
    const held = rules.levels.map((L, k) => (e.r[2 * k] === null ? null : (t.v >= e.r[2 * k] && t.v <= e.r[2 * k + 1] ? 1 : 0)));
    graded.push({ ...e, v: t.v, on: t.d, held });
  }
  graded.sort((a, b) => (a.a < b.a ? -1 : a.a > b.a ? 1 : a.i < b.i ? -1 : a.i > b.i ? 1 : a.h - b.h));
  for (const g of graded) {
    // The chance, graded like a weather forecast: did it happen, and how far was the chance from it.
    const line = rules.chanceLine[g.h];
    if (Number.isFinite(g.c) && Number.isFinite(line) && g.o >= rules.minOrders) {
      const hit = g.v >= g.o * (1 + line / 100) && g.v >= g.o + 1 ? 1 : 0;
      const p = g.c / 100;
      const t = (chance[g.h] ||= { n: 0, hits: 0, brier: 0, bins: Array.from({ length: rules.chanceBins }, () => ({ n: 0, p: 0, hits: 0 })) });
      t.n++; t.hits += hit; t.brier = Math.round((t.brier + (p - hit) ** 2) * 1e6) / 1e6;
      const bin = t.bins[Math.min(rules.chanceBins - 1, Math.floor(p * rules.chanceBins))];
      bin.n++; bin.p = Math.round((bin.p + p) * 1e4) / 1e4; bin.hits += hit;
      g.hit = hit;
    }
    rules.levels.forEach((L, k) => {
      if (g.held[k] === null) return;
      const tot = ((totals[g.h] ||= {})[L] ||= { n: 0, held: 0 });
      tot.n++; tot.held += g.held[k];
      const a = levelAlpha(alphas, g.h, L);
      (alphas[g.h] ||= {})[L] = Math.round((a + rules.gamma * ((1 - L / 100) - (1 - g.held[k]))) * 1e6) / 1e6;
    });
  }
  return {
    state: { v: rules.version, alphas, totals, chance, chanceRule: rules.chanceRule, chanceSince, open, recent: [...graded.reverse(), ...(s.recent || [])].slice(0, rules.keepRecent) },
    graded: graded.length,
    setAside,
  };
}

/** Adds today's ranges to the open book (one per item, day and horizon). */
export function addIssued(state, issued) {
  const seen = new Set((state.open || []).map((e) => `${e.i}|${e.a}|${e.h}`));
  return { ...state, open: [...(state.open || []), ...issued.filter((e) => !seen.has(`${e.i}|${e.a}|${e.h}`))] };
}

/** The public coverage record: per horizon and level, how many ranges were graded and how many held. */
export function coverageOf(state, { rules = PROMISE } = {}) {
  const out = [];
  for (const h of rules.horizons) for (const L of rules.levels) {
    const t = state?.totals?.[h]?.[L] || { n: 0, held: 0 };
    out.push({ h, level: L, n: t.n, held: t.held, rate: t.n ? Math.round((t.held / t.n) * 1000) / 10 : null });
  }
  return out;
}

/**
 * The chance's public record per horizon: how many were graded, how often the line was reached, the
 * Brier score (0 is perfect), the skill against always saying the base rate (above 0 = better than
 * the base rate), and the reliability table: per tenth, what the radar said and what happened.
 */
export function chanceRecord(state, { rules = PROMISE } = {}) {
  const out = [];
  for (const h of rules.horizons) {
    const t = state?.chance?.[h];
    if (!t?.n) { out.push({ h, line: rules.chanceLine[h], n: 0, hits: 0, brier: null, baseRate: null, skill: null, bins: [] }); continue; }
    const brier = t.brier / t.n;
    const base = t.hits / t.n;
    const ref = base * (1 - base);
    out.push({
      h, line: rules.chanceLine[h], n: t.n, hits: t.hits,
      brier: Math.round(brier * 1000) / 1000,
      baseRate: Math.round(base * 1000) / 10,
      skill: ref > 0 ? Math.round((1 - brier / ref) * 1000) / 10 : null,
      bins: t.bins.map((b, k) => ({ from: (k * 100) / rules.chanceBins, to: ((k + 1) * 100) / rules.chanceBins, n: b.n, said: b.n ? Math.round((b.p / b.n) * 1000) / 10 : null, happened: b.n ? Math.round((b.hits / b.n) * 1000) / 10 : null })).filter((b) => b.n > 0),
    });
  }
  return out;
}

/** The day's book: every range issued today, `item|day|horizon|orders then|lo80-hi80|lo90-hi90|chance`, sorted. */
export function promiseSealText(issued = []) {
  const rng = (lo, hi) => (lo === null || hi === null ? "-" : `${lo}-${hi}`);
  return (Array.isArray(issued) ? issued : [])
    .filter((e) => /^\d{6,20}$/.test(String(e?.i || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(e?.a || "")) && Number.isInteger(e?.h))
    .map((e) => `${e.i}|${e.a}|${e.h}|${Math.round(e.o)}|${rng(e.r[0], e.r[1])}|${rng(e.r[2], e.r[3])}|${Number.isFinite(e.c) ? `${e.c}%` : "-"}`)
    .sort()
    .join("\n") || null;
}

/** What the board carries: the method, each horizon's state, the coverage record, today's count. */
export function promiseBoard(state, calib, issued, today, { rules = PROMISE } = {}) {
  const dues = (state.open || []).map((e) => addDays(e.a, e.h)).sort();
  return {
    v: rules.version,
    at: today,
    levels: [...rules.levels],
    horizons: rules.horizons.map((h) => {
      const c = calib?.[h] || { state: "CALIBRATING", n: 0 };
      return { h, state: c.state, n: c.n, need: rules.minCalib, alpha: c.state === "READY" ? Object.fromEntries(rules.levels.map((L) => [L, c.q[L].alpha])) : null };
    }),
    coverage: coverageOf(state, { rules }),
    chance: chanceRecord(state, { rules }),
    chanceSince: state.chanceSince || null,
    issued: issued.length,
    open: (state.open || []).length,
    nextDue: dues.find((d) => d > today) || dues[0] || null,
    recent: (state.recent || []).slice(0, 12).map((g) => ({ i: g.i, a: g.a, h: g.h, o: g.o, v: g.v, r: g.r, held: g.held, ...(Number.isFinite(g.c) ? { c: g.c, hit: g.hit } : {}) })),
  };
}

/** The range shown on a new product's card: the longest ready horizon, both levels, and the hit line. */
export function cardRange(items, id, today, calib, { hitPct = 50, rules = PROMISE } = {}) {
  for (const h of [...rules.horizons].sort((a, b) => b - a)) {
    const r90 = rangeFor(items?.[id], today, calib?.[h], 90, { rules });
    const r80 = rangeFor(items?.[id], today, calib?.[h], 80, { rules });
    if (!r90 && !r80) continue;
    const main = r90 || r80;
    // The hit line of a new product is +50% in 14 days (freshRisers.gradeFresh): only a 14-day range
    // can clear it, at the highest level whose whole range is above it.
    const clears = h !== 14 ? null : r90 && r90.loPct >= hitPct ? 90 : r80 && r80.loPct >= hitPct ? 80 : null;
    const chance = chanceFor(items?.[id], today, calib?.[h], { rules });
    return { h, o: main.o, r80: r80 ? [r80.lo, r80.hi] : null, r90: r90 ? [r90.lo, r90.hi] : null, pct90: r90 ? [r90.loPct, r90.hiPct] : null, pct80: r80 ? [r80.loPct, r80.hiPct] : null, clears, ...(chance ? { chance: { line: chance.line, p: chance.p } } : {}) };
  }
  return null;
}
