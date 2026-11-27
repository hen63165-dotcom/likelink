// 🚀 The takeoff (ההמראה) — the owner, 27.11: "something nobody has heard of anywhere, that is going to
// be the next hit, with live proof, real and solid". Nobody can prove a future hit today; what can be
// done today is to name the candidates before anything happens, seal them, and let the store's own
// numbers grade them in public.
//
// Every morning, from this year's new listings that are still SMALL (10–300 orders in 30 days, where
// nobody has noticed them yet), three contenders each name `k` items, sealed in Bitcoin with the day:
//   • radar  — the radar's pick: ordered by the growth that beats the counting noise (the z of a
//              Poisson test against a +20% week, freshRisers.js growthOverDays), then kept only if
//              nobody has heard of it: few listings for its own most specific name and no
//              tiktok/viral/trending/amazon in Google's US suggestions (freshRisers.js unknownCheck);
//   • rank   — the simple ranking: the fastest last-week growth, no checks at all;
//   • random — the first `k` of the day's public hash order (chosen by nobody).
// After `h` days each pick is graded by the store's own 30-day orders: a TAKEOFF when they at least
// doubled (and at least one more order), a +50% rise counted beside it; an item the radar could not
// read within `unreadDays` of its due day is left out, never counted; a grade is never edited.
//
// Why this rule (the lab, scripts/catalog/radar-lab.mjs, 27.11, on the real history): among small
// listings a doubling in a week is rare (0.4% on the one day that could be graded, 19.11), and the
// growth that beats the noise ranked those few on top better than the simple ranking did. One graded
// day is not a proof: that is why every morning is sealed from now on, and the record decides. Pure.

import { PROMISE, featuresAt, targetAt } from "./radarPromise.js";
import { growthOverDays, isSeasonal } from "./freshRisers.js";
import { hasBrandName, isBulkPack, isNotListedKind } from "./deals.js";

export const TAKEOFF = Object.freeze({ version: 1, h: 7, line: 100, soft: 50, minO: 10, maxO: 300, k: 5, scan: 24, unreadDays: 3, keepDays: 60 });
export const TAKEOFF_SIDES = Object.freeze(["radar", "rank", "random"]);

// The lab's look back that chose the rule (radar-lab.mjs, run 45953493229 on 27.11, the real item
// histories; totals only): the one day a 7-day doubling could be graded among small new listings.
// A look back of one day, never a proof: the sealed mornings from 27.11 on are the test.
export const TAKEOFF_LAB = Object.freeze({ day: "2026-11-19", pool: 1529, doubled: 6, k: 20, caught: 6, ranking: 5, rose50: 21, caught50: 11 });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d{6,20}$/;
const BUY = /^https:\/\/s\.click\.aliexpress\.com\//;
const IMG = /^https:\/\/[a-z0-9.-]*(?:alicdn\.com|aliexpress-media\.com)\//i;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const addDays = (d, n) => new Date((dayNum(d) + n) * 86_400_000).toISOString().slice(0, 10);
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/** Today's small new listings with a measured pace, each with its noise z and simple pace. */
export function takeoffPool(freshPool = {}, items = {}, today, { rules = TAKEOFF, promise = PROMISE } = {}) {
  if (!DAY.test(String(today || ""))) return [];
  const out = [];
  for (const [id, e] of Object.entries(freshPool || {})) {
    if (!ID.test(id) || !e || typeof e !== "object") continue;
    // A holiday listing returns every year; a brand's name on AliExpress is an imitation (27.11: the
    // first sheet sealed a "Reebok" sweatshirt and a "Kindle" screen protector); an unlisted kind or a
    // wholesale lot is never recommended. None of them is a takeoff for any side.
    const title = String(e.title || "");
    if (isSeasonal(title) || hasBrandName(title) || isNotListedKind(title) || isBulkPack(title)) continue;
    const f = featuresAt(items?.[id], today, { rules: promise });
    if (!f || f.o < rules.minO || f.o > rules.maxO) continue;
    const before = Math.max(1, Math.round((f.o + 1) / Math.exp(f.pace * f.span) - 1));
    const g = growthOverDays({ before, after: f.o, days: f.span });
    out.push({ id, o: f.o, pace: f.pace, z: g ? g.z : -1e9, title: String(e.title || "").slice(0, 140), image: IMG.test(e.image || "") ? e.image : null, buy: BUY.test(e.link || "") ? e.link : null, price: Number.isFinite(e.price) ? e.price : null });
  }
  return out;
}

/** The three orders over the pool: the radar's (noise z), the simple ranking's (pace), chance's (hash). */
export function takeoffOrders(pool = [], today) {
  const by = (score) => [...pool].sort((a, b) => score(b) - score(a) || b.pace - a.pace || (a.id < b.id ? -1 : 1));
  return {
    radar: by((x) => x.z),
    rank: by((x) => x.pace),
    random: [...pool].sort((a, b) => fnv(`takeoff|${today}|${a.id}`) - fnv(`takeoff|${today}|${b.id}`) || (a.id < b.id ? -1 : 1)),
  };
}

/**
 * The day's sheet. `checks` maps an item id to its unknownCheck answer (read by the runner for the
 * radar's order, up to `scan` items); the radar keeps only the ones nobody has heard of.
 */
export function takeoffSheet(pool = [], today, checks = {}, { rules = TAKEOFF } = {}) {
  if (!DAY.test(String(today || "")) || pool.length < rules.k * 10) return null;
  const o = takeoffOrders(pool, today);
  const radar = o.radar.filter((x) => checks[x.id]?.unknown === true).slice(0, rules.k);
  if (!radar.length) return null;
  const picks = { radar: radar.map((x) => x.id), rank: o.rank.slice(0, rules.k).map((x) => x.id), random: o.random.slice(0, rules.k).map((x) => x.id) };
  const picked = new Set(Object.values(picks).flat());
  const byId = new Map(pool.map((x) => [x.id, x]));
  const info = Object.fromEntries(picks.radar.map((id) => {
    const x = byId.get(id);
    const c = checks[id] || {};
    return [id, { title: x.title, image: x.image, buy: x.buy, price: x.price, phrase: c.phrase || null, similar: Number.isFinite(c.similar) ? c.similar : null }];
  }));
  return { d: today, v: rules.version, h: rules.h, n: pool.length, base: Object.fromEntries([...picked].map((id) => [id, byId.get(id).o])), picks, info };
}

/** The state after today's sheet: the first sheet of a day stands; old days leave. */
export function recordTakeoff(state = {}, sheet, today, { rules = TAKEOFF } = {}) {
  const days = { ...(state?.days || {}) };
  if (sheet && !days[sheet.d]) days[sheet.d] = { ...sheet, graded: null };
  const cut = addDays(today, -rules.keepDays);
  for (const d of Object.keys(days)) if (d < cut) delete days[d];
  return { ...state, since: state?.since || sheet?.d || null, days };
}

/** Every pick still open (for the run's daily re-read by item id: the live scoreboard and the grade). */
export function takeoffOpenIds(state = {}) {
  const out = new Set();
  for (const s of Object.values(state?.days || {})) if (!s.graded) for (const c of TAKEOFF_SIDES) for (const id of s.picks?.[c] || []) out.add(id);
  return [...out];
}

const grew = (o, y, line) => y + 1e-9 >= o * (1 + line / 100) && y >= o + 1;

/** Grades every sheet whose day has come; waits up to `unreadDays` for a missing reading. */
export function gradeTakeoff(state = {}, items = {}, today, { rules = TAKEOFF, promise = PROMISE } = {}) {
  const days = { ...(state?.days || {}) };
  for (const [d, s] of Object.entries(days)) {
    if (s.graded) continue;
    const due = addDays(d, s.h || rules.h);
    if (due > today) continue;
    const res = {};
    let unread = 0;
    for (const c of TAKEOFF_SIDES) {
      let hits = 0, soft = 0, of = 0;
      for (const id of s.picks?.[c] || []) {
        const y = targetAt(items?.[id], due, { rules: promise });
        const o = s.base?.[id];
        if (!y || !Number.isFinite(o)) { unread++; continue; }
        of++;
        if (grew(o, y.v, rules.line)) hits++;
        if (grew(o, y.v, rules.soft)) soft++;
      }
      res[c] = { hits, soft, of };
    }
    if (unread && addDays(due, rules.unreadDays) > today) continue;
    days[d] = { ...s, graded: { at: today, ...res } };
  }
  return { ...state, days };
}

/** The latest reading of an item up to today: [day, orders] or null. */
function latest(series, today) {
  const rs = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && DAY.test(String(r[0])) && r[0] <= today && Number.isFinite(r[1]));
  return rs.length ? rs.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
}

/** The record: each side's takeoffs, the open sheets' live scoreboard (the radar's picks), the next grade. */
export function takeoffRecord(state = {}, items = {}, today, { rules = TAKEOFF } = {}) {
  const tot = Object.fromEntries(TAKEOFF_SIDES.map((c) => [c, { hits: 0, soft: 0, of: 0 }]));
  let graded = 0;
  let next = null;
  const live = [];
  for (const [d, s] of Object.entries(state?.days || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const due = addDays(d, s.h || rules.h);
    if (s.graded) {
      graded++;
      for (const c of TAKEOFF_SIDES) { tot[c].hits += s.graded[c]?.hits || 0; tot[c].soft += s.graded[c]?.soft || 0; tot[c].of += s.graded[c]?.of || 0; }
    } else if (!next || due < next) next = due;
    // The scoreboard: every radar pick of the last two weeks, open or graded, with its latest reading.
    if (dayNum(today) - dayNum(d) > 14) continue;
    for (const id of s.picks?.radar || []) {
      const base = s.base?.[id];
      const r = latest(items?.[id], today);
      const info = s.info?.[id] || {};
      live.push({ id, called: d, due, dayN: Math.max(0, Math.min(s.h || rules.h, dayNum(today) - dayNum(d))), base, orders: r ? r[1] : null, on: r ? r[0] : null, mult: r && base > 0 ? r2(r[1] / base) : null, open: !s.graded, title: info.title || null, image: info.image || null, buy: info.buy || null, price: info.price ?? null, phrase: info.phrase || null, similar: info.similar ?? null });
    }
  }
  const rate = (x, of) => (of ? Math.round((x / of) * 1000) / 10 : null);
  return {
    since: state?.since || null, sheets: Object.keys(state?.days || {}).length, graded, nextDue: next, h: rules.h,
    ...Object.fromEntries(TAKEOFF_SIDES.map((c) => [c, { ...tot[c], rate: rate(tot[c].hits, tot[c].of), softRate: rate(tot[c].soft, tot[c].of) }])),
    live,
  };
}

/** The day's sealed sheet: the three picks and their base orders, item numbers only. */
export function takeoffSealText(sheet) {
  if (!sheet || !DAY.test(String(sheet.d || ""))) return null;
  const lines = [`takeoff|${sheet.d}|v${sheet.v}|h${sheet.h}|n${sheet.n}`];
  for (const c of TAKEOFF_SIDES) lines.push(`${c}|${(sheet.picks?.[c] || []).map((id) => `${id}:${sheet.base?.[id]}`).join(",")}`);
  return lines.join("\n");
}
export const TAKEOFF_LINE = "(?:takeoff\\|\\d{4}-\\d{2}-\\d{2}\\|v\\d+\\|h\\d+\\|n\\d+|(?:radar|rank|random)\\|(?:\\d{6,20}:\\d{1,7}(?:,\\d{6,20}:\\d{1,7})*)?)";

/** The browser's copy: the record, and the radar's picks with their live scoreboard. */
export function cleanTakeoff(b) {
  if (!b || typeof b !== "object") return null;
  const n = (x, max = 1e7) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const t = (x, max) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) || null : null);
  const side = (x) => ({ hits: n(x?.hits) ?? 0, soft: n(x?.soft) ?? 0, of: n(x?.of) ?? 0, rate: n(x?.rate, 100), softRate: n(x?.softRate, 100) });
  const live = (Array.isArray(b.live) ? b.live : []).filter((x) => ID.test(String(x?.id || "")) && d(x?.called)).slice(0, 40).map((x) => ({
    id: String(x.id), called: d(x.called), due: d(x.due), dayN: n(x.dayN, 60) ?? 0, base: n(x.base), orders: n(x.orders), on: d(x.on), mult: n(x.mult, 1000), open: x.open === true,
    title: t(x.title, 140), image: IMG.test(String(x.image || "")) ? x.image : null, buy: BUY.test(String(x.buy || "")) && !hasBrandName(x.title) ? x.buy : null, price: n(x.price, 1e6), phrase: t(x.phrase, 60), similar: n(x.similar),
    // A pick sealed before the brand rule reached the pool stays in the record (never edited) and is
    // graded like every pick; a brand's name never gets a store button.
    brand: hasBrandName(x.title),
  }));
  return { since: d(b.since), sheets: n(b.sheets) ?? 0, graded: n(b.graded) ?? 0, nextDue: d(b.nextDue), h: n(b.h, 60) ?? TAKEOFF.h, today: d(b.today), ...Object.fromEntries(TAKEOFF_SIDES.map((c) => [c, side(b[c])])), live, openCount: n(b.openCount, 1000) ?? live.filter((x) => x.open).length };
}
