// 🧠 The radar's learning model (the owner, 26.11: "upgrade it before, and check it at a level that it
// hits everything, not just wait"). The chance model (radarPromise.js) predicts the log growth from two
// numbers (last week's pace and the size). This one learns the event itself — did the item's 30-day
// orders reach the line h days later — from more of what the radar measures every morning:
//   • last week's pace and the last three days' pace, and their difference (acceleration);
//   • the size (and its square: a +10% jump means something else at 30 orders than at 30,000);
//   • the growth at the low end of a one-sided 95% Poisson bound and the noise z (freshRisers.js);
//   • how long the radar has known the listing (a new listing behaves unlike an old one).
// L2-regularized logistic regression on standardized features, fitted by Newton's method, walk-forward:
// on day d it learns only from outcomes known on day d. Pure.

import { PROMISE, featuresAt } from "./radarPromise.js";
import { growthOverDays } from "./freshRisers.js";

export const MODELS = Object.freeze({ version: 1, maxPerItem: 5, windowDays: 45, lambda: 1, iters: 12, minRows: 200 });

const DAY = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clean = (series) => (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])) && Number.isFinite(r[1]) && r[1] >= 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));

/** Everything the radar knows about an item on day t, from its readings up to t only. */
export function richFeatures(series, t, { promise = PROMISE } = {}) {
  const rs = clean(series).filter((r) => r[0] <= t);
  const f = featuresAt(rs, t, { rules: promise });
  if (!f) return null;
  const tn = dayNum(t);
  const b3 = rs.filter((r) => { const g = tn - dayNum(r[0]); return g >= 1 && g <= 4; }).sort((a, b) => Math.abs(tn - dayNum(a[0]) - 3) - Math.abs(tn - dayNum(b[0]) - 3) || (a[0] < b[0] ? 1 : -1))[0];
  const g3 = b3 ? tn - dayNum(b3[0]) : 0;
  const pace3 = b3 ? Math.log((f.o + 1) / (b3[1] + 1)) / g3 : f.pace;
  const before = Math.round((f.o + 1) / Math.exp(f.pace * f.span) - 1);
  const ev = growthOverDays({ before, after: f.o, days: f.span });
  const age = clamp(tn - dayNum(rs[0][0]), 0, 30) / 30;
  return { o: f.o, pace: f.pace, pace3, accel: pace3 - f.pace, size: f.size, low: ev ? clamp(ev.lowWeekPct / 100, -1, 5) : -1, z: ev ? clamp(ev.z, -10, 10) / 10 : 0, age };
}

/** The model's inputs for a horizon of h days. */
export const xRich = (f, h) => [f.pace * h, f.pace3 * h, f.accel * h, f.size, (f.size * f.size) / 10, f.low, f.z, f.age];

/** Every (item, day) the model can learn from on day d: its state then and whether it reached the line h days later. */
export function richExamples(items, h, d, line, { rules = MODELS, promise = PROMISE } = {}) {
  const out = [];
  const from = dayNum(d) - rules.windowDays;
  for (const series of Object.values(items || {})) {
    const rs = clean(series).filter((r) => dayNum(r[0]) <= dayNum(d));
    let found = 0;
    for (let i = rs.length - 1; i >= 0 && found < rules.maxPerItem; i--) {
      const t = rs[i][0];
      if (dayNum(t) < from || dayNum(t) + h > dayNum(d)) continue;
      const y = rs.find((r) => r[0] === dayStr(dayNum(t) + h));
      if (!y) continue;
      const f = richFeatures(rs, t, { promise });
      if (!f) continue;
      out.push({ x: xRich(f, h), y: y[1] + 1e-9 >= f.o * (1 + line / 100) ? 1 : 0 });
      found++;
    }
  }
  return out;
}

function solve(A, b) {
  const k = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const q = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= q * M[c][j];
    }
  }
  return M.map((r, i) => r[k] / r[i]);
}

const sig = (z) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));

/** L2-regularized logistic regression (the intercept never shrunk), standardized inputs, Newton's method. */
export function fitLogistic(rows, { rules = MODELS } = {}) {
  if (!Array.isArray(rows) || rows.length < rules.minRows) return null;
  const pos = rows.filter((r) => r.y).length;
  if (!pos || pos === rows.length) return null;
  const k = rows[0].x.length;
  const mu = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r.x[j], 0) / rows.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(rows.reduce((s, r) => s + (r.x[j] - mu[j]) ** 2, 0) / rows.length) || 1);
  const Z = rows.map((r) => [1, ...r.x.map((v, j) => (v - mu[j]) / sd[j])]);
  const n = k + 1;
  let w = new Array(n).fill(0);
  w[0] = Math.log(pos / (rows.length - pos));
  for (let it = 0; it < rules.iters; it++) {
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      const p = sig(z.reduce((s, v, j) => s + v * w[j], 0));
      const e = p - rows[i].y;
      const v = p * (1 - p);
      for (let a = 0; a < n; a++) { g[a] += e * z[a]; for (let b = a; b < n; b++) H[a][b] += v * z[a] * z[b]; }
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    for (let a = 1; a < n; a++) { H[a][a] += rules.lambda; g[a] += rules.lambda * w[a]; }
    const step = solve(H, g);
    if (!step) break;
    w = w.map((x, j) => x - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return { mu, sd, w: w.map((x) => Math.round(x * 1e6) / 1e6), n: rows.length, rate: Math.round((pos / rows.length) * 1000) / 1000 };
}

/** The chance the model gives one item (0–1). */
export const predictLogistic = (m, x) => sig(m.w[0] + x.reduce((s, v, j) => s + m.w[j + 1] * ((v - m.mu[j]) / m.sd[j]), 0));

/** The model on day d for one horizon: learned only from outcomes known on day d. */
export function learnOn(items, h, d, line, { rules = MODELS, promise = PROMISE } = {}) {
  return fitLogistic(richExamples(items, h, d, line, { rules, promise }), { rules });
}
