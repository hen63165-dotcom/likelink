// ⚔️ The sealed head-to-head, every morning (the owner, 26.11: "make it start now, so we can know, and
// not always wait"). The backtest (radarBacktest.js) shows the past; this seals the future. Each run
// takes a fixed sample of up to `perDay` measured items (a public hash of the day and the item id) and
// seals four picks of `k` items each, before anything happens:
//   • pick  — the radar's pick: confirmed momentum, fast both over the last week and the last three days
//            (min of the two paces), chosen in the lab (radarLab.js) on 17–19.11 and checked on 20–22.11;
//   • learn — the radar's learning model (radarModels.js), one pick per horizon;
//   • radar — the radar's noise-checked order (the growth at the low end of a 95% Poisson bound);
//   • noise — from v2 (27.11): the order by the growth that beats the counting noise (the z of a Poisson
//            test against a +20% week, freshRisers.js growthOverDays), the takeoff's own order; the lab
//            on the real history (run 45983480740, 27.11, the later half of the tested days) had it at or
//            above the simple ranking at 3 days (30% vs 29.2%), at 7 days (18.7% vs 17.3%) and in all 5
//            takeoff settings, small margins: it joins the duel so the sealed mornings decide;
//   • rank  — the simple ranking by last week's order growth;
//   • random — the first `k` of the day's public hash order (chosen by nobody).
// The day's sheet (the sample and every pick, item numbers only) is the book `versus` under the daily
// root. After 3 and 7 days each pick is graded by the store's own 30-day orders: it grew when they
// reached the chance line (+10% in 3 days, +25% in 7) and at least one more order, from 10 orders
// up (at 0 orders every item "grows"), the same rule as the backtest; an item the
// radar could not read within `unreadDays` of its due day is left out, never counted. A grade is never
// edited. The first 3-day grades arrive three days after the first sheet, then every morning. Pure.

import { PROMISE, featuresAt, targetAt } from "./radarPromise.js";
import { growthOverDays } from "./freshRisers.js";
import { learnOn, predictLogistic, richFeatures, xRich } from "./radarModels.js";
import { signTest } from "./radarBacktest.js";

export const VERSUS = Object.freeze({ version: 2, horizons: [3, 7], k: 20, perDay: 400, unreadDays: 3, keepDays: 60 });
export const CONTENDERS = Object.freeze(["pick", "learn", "radar", "noise", "rank", "random"]);
/** The contenders measured against the simple ranking, day by day. */
export const DUELLISTS = Object.freeze(["pick", "learn", "radar", "noise"]);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d{6,20}$/;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const addDays = (d, n) => new Date((dayNum(d) + n) * 86_400_000).toISOString().slice(0, 10);
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** Today's sheet: the sample and every contender's pick, from readings up to today only. */
export function versusSheet(items = {}, today, { rules = VERSUS, promise = PROMISE } = {}) {
  if (!DAY.test(String(today || ""))) return null;
  const ids = Object.keys(items || {}).filter((id) => ID.test(id) && (featuresAt(items[id], today, { rules: promise })?.o ?? -1) >= promise.minOrders).sort((a, b) => fnv(`${today}|${a}`) - fnv(`${today}|${b}`) || (a < b ? -1 : 1)).slice(0, rules.perDay);
  if (ids.length < rules.k * 5) return null;
  const rows = ids.map((id) => {
    const f = featuresAt(items[id], today, { rules: promise });
    const before = Math.round((f.o + 1) / Math.exp(f.pace * f.span) - 1);
    const g = growthOverDays({ before, after: f.o, days: f.span });
    const rf = richFeatures(items[id], today, { promise });
    return { id, o: f.o, pace: f.pace, low: g ? g.lowWeekPct : -1e9, z: g && Number.isFinite(g.z) ? g.z : -1e9, confirmed: rf ? Math.min(rf.pace, rf.pace3) : f.pace };
  });
  const top = (score) => [...rows].sort((a, b) => score(b) - score(a) || b.pace - a.pace || (a.id < b.id ? -1 : 1)).slice(0, rules.k).map((r) => r.id);
  const picks = {};
  for (const h of rules.horizons) {
    const lm = learnOn(items, h, today, promise.chanceLine[h], { promise });
    const pl = lm ? new Map(rows.map((r) => { const rf = richFeatures(items[r.id], today, { promise }); return [r.id, rf ? predictLogistic(lm, xRich(rf, h)) : 0]; })) : null;
    picks[h] = { pick: top((r) => r.confirmed), learn: pl ? top((r) => pl.get(r.id)) : [], radar: top((r) => r.low), noise: top((r) => r.z), rank: top((r) => r.pace), random: ids.slice(0, rules.k) };
  }
  const picked = new Set(Object.values(picks).flatMap((p) => Object.values(p).flat()));
  return { d: today, v: rules.version, pool: [...ids].sort(), base: Object.fromEntries(rows.filter((r) => picked.has(r.id)).map((r) => [r.id, r.o])), picks };
}

/** The state after today's sheet: the first sheet of a day stands; old days leave. */
export function recordVersus(state = {}, sheet, today, { rules = VERSUS } = {}) {
  const days = { ...(state?.days || {}) };
  if (sheet && !days[sheet.d]) days[sheet.d] = { ...sheet, graded: {} };
  const cut = addDays(today, -rules.keepDays);
  for (const d of Object.keys(days)) if (d < cut) delete days[d];
  return { ...state, since: state?.since || sheet?.d || null, days };
}

/** The item numbers due for a reading today (picks whose grade is still open), for the run's re-read. */
export function versusDueIds(state = {}, today, { rules = VERSUS } = {}) {
  const out = new Set();
  for (const [d, s] of Object.entries(state?.days || {})) for (const h of rules.horizons) {
    if (s.graded?.[h] || addDays(d, h) > today) continue;
    for (const c of CONTENDERS) for (const id of s.picks?.[h]?.[c] || []) out.add(id);
  }
  return [...out];
}

/** Grades every pick whose day has come; waits up to `unreadDays` for a missing reading. */
export function gradeVersus(state = {}, items = {}, today, { rules = VERSUS, promise = PROMISE } = {}) {
  const days = { ...(state?.days || {}) };
  for (const [d, s] of Object.entries(days)) {
    const graded = { ...(s.graded || {}) };
    for (const h of rules.horizons) {
      const due = addDays(d, h);
      if (graded[h] || due > today) continue;
      const line = promise.chanceLine[h];
      const res = {};
      let unread = 0;
      for (const c of CONTENDERS) {
        let hits = 0, of = 0;
        for (const id of s.picks?.[h]?.[c] || []) {
          const y = targetAt(items[id], due, { rules: promise });
          const o = s.base?.[id];
          if (!y || !Number.isFinite(o)) { unread++; continue; }
          of++;
          if (y.v + 1e-9 >= o * (1 + line / 100) && y.v >= o + 1) hits++;
        }
        res[c] = { hits, of };
      }
      if (unread && addDays(due, rules.unreadDays) > today) continue;
      graded[h] = { at: today, ...res };
    }
    days[d] = { ...s, graded };
  }
  return { ...state, days };
}

/** The record per horizon: every contender's hit share, days won against the simple ranking, the next grade. */
export function versusRecord(state = {}, today, { rules = VERSUS } = {}) {
  const out = { since: state?.since || null, sheets: Object.keys(state?.days || {}).length, horizons: [] };
  for (const h of rules.horizons) {
    const tot = Object.fromEntries(CONTENDERS.map((c) => [c, { hits: 0, of: 0 }]));
    const duel = Object.fromEntries(DUELLISTS.map((c) => [c, { wins: 0, losses: 0, ties: 0 }]));
    let days = 0;
    let next = null;
    for (const [d, s] of Object.entries(state?.days || {}).sort()) {
      const g = s.graded?.[h];
      if (!g) { const due = addDays(d, h); if (!next || due < next) next = due; continue; }
      days++;
      for (const c of CONTENDERS) { tot[c].hits += g[c]?.hits || 0; tot[c].of += g[c]?.of || 0; }
      const rate = (c) => (g[c]?.of ? g[c].hits / g[c].of : null);
      for (const c of DUELLISTS) {
        if (rate(c) === null || rate("rank") === null) continue;
        if (rate(c) > rate("rank")) duel[c].wins++; else if (rate(c) < rate("rank")) duel[c].losses++; else duel[c].ties++;
      }
    }
    out.horizons.push({
      h, days, nextDue: next,
      ...Object.fromEntries(CONTENDERS.map((c) => [c, { ...tot[c], rate: tot[c].of ? r1((tot[c].hits / tot[c].of) * 100) : null }])),
      pickDuel: { ...duel.pick, p: signTest(duel.pick.wins, duel.pick.losses) },
      learnDuel: { ...duel.learn, p: signTest(duel.learn.wins, duel.learn.losses) },
      radarDuel: { ...duel.radar, p: signTest(duel.radar.wins, duel.radar.losses) },
      noiseDuel: { ...duel.noise, p: signTest(duel.noise.wins, duel.noise.losses) },
    });
  }
  return out;
}

/** The day's sealed sheet: the sample and every pick, item numbers only. */
export function versusSealText(sheet) {
  if (!sheet || !DAY.test(String(sheet.d || ""))) return null;
  const lines = [`versus|${sheet.d}|v${sheet.v}`, `pool|${(sheet.pool || []).join(",")}`];
  // A sheet sealed before a contender joined (v1 has no "noise") keeps exactly the lines it was sealed with.
  for (const h of Object.keys(sheet.picks || {}).sort()) for (const c of CONTENDERS) if (c in (sheet.picks[h] || {})) lines.push(`${h}|${c}|${(sheet.picks[h][c] || []).join(",")}`);
  return lines.join("\n");
}
export const VERSUS_LINE = "(?:versus\\|\\d{4}-\\d{2}-\\d{2}\\|v\\d+|pool\\|(?:\\d{6,20}(?:,\\d{6,20})*)?|(?:3|7)\\|(?:pick|learn|radar|noise|rank|random)\\|(?:\\d{6,20}(?:,\\d{6,20})*)?)";

/** The browser's copy: the record only (the sheet is in the sealed book). */
export function cleanVersus(b) {
  if (!b || typeof b !== "object" || !Array.isArray(b.horizons)) return null;
  const n = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e7 ? x : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const side = (x) => ({ hits: n(x?.hits) ?? 0, of: n(x?.of) ?? 0, rate: n(x?.rate) });
  const duel = (x) => ({ wins: n(x?.wins) ?? 0, losses: n(x?.losses) ?? 0, ties: n(x?.ties) ?? 0, p: n(x?.p) });
  return {
    since: d(b.since), sheets: n(b.sheets) ?? 0, today: d(b.today),
    horizons: b.horizons.filter((x) => [3, 7].includes(x?.h)).map((x) => ({ h: x.h, days: n(x.days) ?? 0, nextDue: d(x.nextDue), ...Object.fromEntries(CONTENDERS.map((c) => [c, side(x[c])])), pickDuel: duel(x.pickDuel), learnDuel: duel(x.learnDuel), radarDuel: duel(x.radarDuel), noiseDuel: duel(x.noiseDuel) })),
  };
}
