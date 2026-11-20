// ⏳ The window clock (the owner, 2026-11-20: "if there are still gaps, rise above everyone"). The
// tenth worldwide check that day: product-research tools give a saturation SCORE (Sell The Trend's
// lifecycle score, Tradelle's saturation index) and blogs give rules of thumb (a viral trend lasts
// "5–10 days", a single-video item "2–4 weeks", "2–6 months"), and we found no tool that says how
// long the window stays open for a specific product, let alone one that seals it and grades it.
//
// The radar already has its own saturation line: a new product's two-word phrase with more than
// 2,000 matching AliExpress listings is SATURATED (freshRisers.js FRESH.maxSimilar). So for every
// find under that line, every morning, the radar gives a calibrated chance that the listings will be
// at or above the line in 3, 7 and 14 days: the chance the window has closed by then.
//   1. The data: the listing counts the radar reads every day, for every concept on its watch list
//      (readings.json) and for every new product's phrase it checks (kept here, `hist`).
//   2. The model: the promise engine's own (radarPromise.js calibrate: ridge regression of the log
//      growth on the recent pace and size, the older half trains, the newer half's signed errors are
//      the conformal predictive distribution), on listing counts instead of orders.
//   3. The chance comes only from the errors of the same size band (under 2,000 / 2,000–20,000 /
//      above): a small phrase is never judged by the errors of big generic searches.
//   4. Every chance is sealed (the book "window" in the daily root) and graded on its day like a
//      weather forecast: Brier score, base rate, skill and the reliability table, never edited.
// Pure: the runner reads the store and seals; this file only does the arithmetic.
import { bandOf, calibrate, examples, featuresAt, predict, targetAt, xOf } from "./radarPromise.js";

export const WINDOW = Object.freeze({
  version: 1,
  line: 2000, // = FRESH.maxSimilar: above it the radar calls a phrase saturated
  horizons: [3, 7, 14],
  levels: [80, 90], // calibrate() also cuts ranges; the clock uses only its signed errors
  minBaseDays: 3,
  maxBaseDays: 14,
  maxJump: 20,
  windowDays: 45,
  maxPerItem: 3,
  minCalib: 60, // examples per horizon before any chance is given
  minGroup: 20, // signed errors a size band needs before the clock speaks for that band
  trainShare: 0.5,
  ridge: 1,
  bands: [2000, 20000], // listing counts: under the line, up to 10× it, above
  gradeSlackDays: 1,
  waitDays: 3,
  keepRecent: 60,
  chanceBins: 10,
  reads: 40, // phrases re-read a day so their chances can be graded
  trackDays: 16, // a phrase shown is read for 16 days (the longest horizon + slack)
  keepDays: 60, // readings older than this are dropped
  maxPhrases: 800,
});

const DAY = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (d, n) => dayStr(dayNum(d) + n);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

const CONCEPT_KEY = /^c:[a-z0-9][a-z0-9-]{0,79}$/;
const PHRASE_KEY = /^p:[a-z0-9']{1,30}(?:\+[a-z0-9']{1,30}){0,2}$/;
export const isWindowKey = (k) => CONCEPT_KEY.test(String(k || "")) || PHRASE_KEY.test(String(k || ""));

/** The key of a new product's (or a new kind's) phrase: `p:wide+leg`. Null for anything else. */
export function phraseKey(phrase) {
  const words = String(phrase || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return null;
  const k = `p:${words.join("+")}`;
  return PHRASE_KEY.test(k) ? k : null;
}
export const conceptKey = (id) => (CONCEPT_KEY.test(`c:${id}`) ? `c:${id}` : null);
/** The words to search for again: `p:wide+leg` → "wide leg". */
export const phraseOfKey = (k) => (PHRASE_KEY.test(String(k || "")) ? k.slice(2).split("+").join(" ") : null);

/** Adds one day's listing count to a phrase's history (one reading per day; `shown` marks the day it was on the page). */
export function addReading(hist, key, day, n, { shown = false, rules = WINDOW } = {}) {
  if (!PHRASE_KEY.test(String(key || "")) || !isDay(day) || !Number.isFinite(n) || n < 0) return hist || {};
  const out = { ...(hist || {}) };
  const cur = out[key] && typeof out[key] === "object" ? out[key] : { r: [] };
  const from = addDays(day, -rules.keepDays);
  const r = [...(Array.isArray(cur.r) ? cur.r : []).filter((x) => Array.isArray(x) && isDay(x[0]) && x[0] !== day && x[0] >= from), [day, Math.round(n)]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  out[key] = { r, ...(shown ? { shown: day } : cur.shown ? { shown: cur.shown } : {}) };
  const keys = Object.keys(out);
  if (keys.length > rules.maxPhrases) {
    const last = (k) => out[k].shown || out[k].r.at(-1)?.[0] || "";
    for (const k of keys.sort((a, b) => (last(a) < last(b) ? -1 : 1)).slice(0, keys.length - rules.maxPhrases)) delete out[k];
  }
  return out;
}

/** Every listing series the clock learns from: the watch list's concepts and the phrases it tracks. */
export function seriesOf({ readings = {}, hist = {} } = {}) {
  const out = {};
  for (const [id, rs] of Object.entries(readings || {})) {
    const k = conceptKey(id);
    if (!k || !Array.isArray(rs)) continue;
    const s = rs.filter((r) => r && isDay(r.d) && Number.isFinite(r.listings) && r.listings >= 0).map((r) => [r.d, r.listings]);
    if (s.length) out[k] = s;
  }
  for (const [k, v] of Object.entries(hist || {})) if (PHRASE_KEY.test(k) && Array.isArray(v?.r) && v.r.length) out[k] = v.r;
  return out;
}

/** The phrases to read again today: an open chance due soon first, then the most recently shown. */
export function readQueue(hist, state, today, { rules = WINDOW } = {}) {
  const soon = new Map();
  for (const e of state?.open || []) {
    if (!PHRASE_KEY.test(String(e?.i || ""))) continue;
    const due = addDays(e.a, e.h);
    const d = dayNum(due) - dayNum(today);
    if (d <= 0 && d >= -(rules.gradeSlackDays + rules.waitDays)) soon.set(e.i, Math.min(soon.get(e.i) ?? 99, d));
  }
  const from = addDays(today, -rules.trackDays);
  const shown = Object.entries(hist || {}).filter(([k, v]) => PHRASE_KEY.test(k) && isDay(v?.shown) && v.shown >= from && v.shown < today);
  const seen = new Set();
  const out = [];
  for (const [k] of [...soon.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))) if (!seen.has(k)) { seen.add(k); out.push(k); }
  for (const [k] of shown.sort((a, b) => (a[1].shown > b[1].shown ? -1 : a[1].shown < b[1].shown ? 1 : a[0] < b[0] ? -1 : 1))) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out.filter((k) => !(hist?.[k]?.r || []).some((r) => r[0] === today));
}

/** This morning's clock: the promise engine's calibration on the listing series. */
export function calibrateWindow(series, today, { rules = WINDOW } = {}) {
  const calib = calibrate(series, today, { rules });
  // How many held-out errors the small band (under the line) has so far, ready or not: the page
  // shows the clock's progress honestly ("12 of 20"), never a bare 0 while it is learning.
  for (const h of rules.horizons) {
    const ex = examples(series, h, today, { rules });
    const held = ex.slice(Math.floor(ex.length * rules.trainShare));
    calib[h].small = held.filter((e) => e.band === 0).length;
  }
  return calib;
}

/**
 * The calibrated chance that the listings are at or above the line on day h: the share of the same
 * size band's held-out errors that, added to today's prediction, reach the line. Null without a
 * pace (two readings 3+ days apart), without enough errors in its band, or when it is past the line.
 */
export function closeChance(series, today, cal, { rules = WINDOW } = {}) {
  if (!cal || cal.state !== "READY" || !cal.res) return null;
  const f = featuresAt(series, today, { rules });
  if (!f || f.o >= rules.line) return null;
  const rs = cal.res.bands?.[bandOf(f.o, rules)];
  if (!rs?.length) return null;
  const need = Math.log((rules.line + 1) / (f.o + 1)) - predict(cal.beta, xOf(f, cal.h));
  let lo = 0, hi = rs.length; // first index with r >= need (sorted ascending)
  while (lo < hi) { const m = (lo + hi) >> 1; if (rs[m] >= need) hi = m; else lo = m + 1; }
  const p = (rs.length - lo + 0.5) / (rs.length + 1);
  return { h: cal.h, o: f.o, line: rules.line, p: Math.max(1, Math.min(99, Math.round(p * 100))), weekPct: Math.round((Math.exp(f.pace * 7) - 1) * 1000) / 10 };
}

/** Today's chances for the given series: one entry per key and ready horizon. */
export function issueWindows(series, keys, today, calib, { rules = WINDOW } = {}) {
  const out = [];
  for (const k of [...new Set(keys)].filter(isWindowKey).sort()) {
    for (const h of rules.horizons) {
      const c = closeChance(series?.[k], today, calib?.[h], { rules });
      if (c) out.push({ i: k, a: today, h, o: c.o, p: c.p });
    }
  }
  return out;
}

export const newWindowState = () => ({ v: WINDOW.version, chance: {}, open: [], recent: [] });

/** Grades every chance whose day came: 1 when the listings were at or above the line on its day, else 0. */
export function gradeWindows(state, series, today, { rules = WINDOW } = {}) {
  const s = { ...newWindowState(), ...(state || {}) };
  const chance = JSON.parse(JSON.stringify(s.chance || {}));
  const open = [];
  const graded = [];
  let setAside = 0;
  for (const e of Array.isArray(s.open) ? s.open : []) {
    const due = addDays(e.a, e.h);
    if (dayNum(due) > dayNum(today)) { open.push(e); continue; }
    const t = targetAt(series?.[e.i], due, { rules });
    if (!t) {
      if (dayNum(today) - dayNum(due) > rules.gradeSlackDays + rules.waitDays) setAside++;
      else open.push(e);
      continue;
    }
    graded.push({ ...e, v: t.v, on: t.d, hit: t.v >= rules.line ? 1 : 0 });
  }
  graded.sort((a, b) => (a.a < b.a ? -1 : a.a > b.a ? 1 : a.i < b.i ? -1 : a.i > b.i ? 1 : a.h - b.h));
  for (const g of graded) {
    const p = g.p / 100;
    const t = (chance[g.h] ||= { n: 0, hits: 0, brier: 0, bins: Array.from({ length: rules.chanceBins }, () => ({ n: 0, p: 0, hits: 0 })) });
    t.n++; t.hits += g.hit; t.brier = Math.round((t.brier + (p - g.hit) ** 2) * 1e6) / 1e6;
    const bin = t.bins[Math.min(rules.chanceBins - 1, Math.floor(p * rules.chanceBins))];
    bin.n++; bin.p = Math.round((bin.p + p) * 1e4) / 1e4; bin.hits += g.hit;
  }
  return { state: { v: rules.version, chance, open, recent: [...graded.reverse(), ...(s.recent || [])].slice(0, rules.keepRecent) }, graded: graded.length, setAside };
}

/** Adds today's chances to the open book (one per key, day and horizon). */
export function addWindows(state, issued) {
  const seen = new Set((state.open || []).map((e) => `${e.i}|${e.a}|${e.h}`));
  return { ...state, open: [...(state.open || []), ...issued.filter((e) => !seen.has(`${e.i}|${e.a}|${e.h}`))] };
}

/** The public record per horizon: Brier score, how often the window closed, skill against that base rate, said vs happened. */
export function windowRecord(state, { rules = WINDOW } = {}) {
  return rules.horizons.map((h) => {
    const t = state?.chance?.[h];
    if (!t?.n) return { h, n: 0, hits: 0, brier: null, baseRate: null, skill: null, bins: [] };
    const brier = t.brier / t.n;
    const base = t.hits / t.n;
    const ref = base * (1 - base);
    return {
      h, n: t.n, hits: t.hits,
      brier: Math.round(brier * 1000) / 1000,
      baseRate: Math.round(base * 1000) / 10,
      skill: ref > 0 ? Math.round((1 - brier / ref) * 1000) / 10 : null,
      bins: t.bins.map((b, k) => ({ from: (k * 100) / rules.chanceBins, to: ((k + 1) * 100) / rules.chanceBins, n: b.n, said: b.n ? Math.round((b.p / b.n) * 1000) / 10 : null, happened: b.n ? Math.round((b.hits / b.n) * 1000) / 10 : null })).filter((b) => b.n > 0),
    };
  });
}

/** The day's book: every chance given today, `key|day|horizon|listings then|line|chance%`, sorted. */
export function windowSealText(issued = [], { rules = WINDOW } = {}) {
  return (Array.isArray(issued) ? issued : [])
    .filter((e) => isWindowKey(e?.i) && isDay(e?.a) && rules.horizons.includes(e?.h) && Number.isFinite(e?.o) && Number.isInteger(e?.p))
    .map((e) => `${e.i}|${e.a}|${e.h}|${Math.round(e.o)}|${rules.line}|${e.p}%`)
    .sort()
    .join("\n") || null;
}

/** What the board carries: each horizon's state, the record, today's count, the latest graded. */
export function windowBoard(state, calib, issued, today, { rules = WINDOW } = {}) {
  const dues = (state.open || []).map((e) => addDays(e.a, e.h)).sort();
  return {
    v: rules.version,
    at: today,
    line: rules.line,
    horizons: rules.horizons.map((h) => {
      const c = calib?.[h] || { state: "CALIBRATING", n: 0 };
      return { h, state: c.state === "READY" && c.res?.bands?.[0]?.length ? "READY" : "CALIBRATING", n: c.n || 0, need: rules.minCalib, small: c.small ?? c.res?.bands?.[0]?.length ?? 0, smallNeed: rules.minGroup };
    }),
    record: windowRecord(state, { rules }),
    issued: issued.length,
    open: (state.open || []).length,
    nextDue: dues.find((d) => d > today) || dues[0] || null,
    recent: (state.recent || []).slice(0, 12).map((g) => ({ i: g.i, a: g.a, h: g.h, o: g.o, v: g.v, p: g.p, hit: g.hit })),
  };
}

/**
 * The line on a find's card: the listings today and, once the clock can speak for it, the chance for
 * the longest ready horizon. MEASURING until the phrase has two readings 3+ days apart (`since`: its
 * first reading); CLOSED when today's count is already at or above the line.
 */
export function cardWindow(series, key, today, calib, { rules = WINDOW } = {}) {
  const rs = (Array.isArray(series?.[key]) ? series[key] : []).filter((r) => Array.isArray(r) && isDay(r[0]) && Number.isFinite(r[1]));
  const now = rs.find((r) => r[0] === today);
  if (!now) return null;
  if (now[1] >= rules.line) return { state: "CLOSED", o: now[1], line: rules.line };
  for (const h of [...rules.horizons].sort((a, b) => b - a)) {
    const c = closeChance(rs, today, calib?.[h], { rules });
    if (c) return { state: "READY", h, o: c.o, line: rules.line, p: c.p, weekPct: c.weekPct };
  }
  return { state: "MEASURING", o: now[1], line: rules.line, since: rs[0][0] };
}
