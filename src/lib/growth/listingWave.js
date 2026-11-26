// 🏭 Before the first sale (the owner, 26.11: "the radar must hit every product in the world long before
// everyone, including the factories, before sales, before everything"). The squishy began at factories
// that listed it before anyone bought it. Every other door the radar reads (orders, searches, videos,
// news) moves only after people buy or talk. This one reads the step before: the store's own newest
// listings that nobody has bought yet (AliExpress's affiliate search sorted by the fewest orders, the
// year's new listings per area and per world category), each with its store's public id.
//
// A listing wave is a two-word product phrase that many DIFFERENT stores start listing in the same week,
// well above their pace in the weeks before (one factory listing the same thing ten times counts once;
// Poisson against the old pace, like the new shops' words). A wave whose own phrase still sells little
// (its best sellers together under `maxDemand` orders in 30 days), has few listings (the radar's 2,000
// line) and no buzz abroad (Google's US suggestions) is sealed as a call before any sale, and graded
// after `dueDays` by the store's own orders for that phrase: HIT when they reached `hitOrders` and at
// least `hitTimes` the base, MISS otherwise, UNREAD when not read within `unreadDays` past due (never
// counted). Measured only, never a forecast. Pure: the runner asks.

import { hasBrandName, isNotListedKind } from "./deals.js";
import { FRESH, isSeasonal } from "./freshRisers.js";
import { covered, phrasesOf } from "./radarDiscovery.js";
import { poissonTail } from "./shopSignal.js";

export const PRELAUNCH = Object.freeze({
  maxOrders: 10, // a listing before its first sales: fewer than this many orders in 30 days
  perListing: 6, // the first product phrases of a title (titles lead with the product)
  minStores: 4, // different stores that started listing the phrase this week
  ratio: 3, // this week at least three times the pace of the days before
  p: 0.001,
  minDays: 10, // days read before a week can be compared with the days before
  keepDays: 28,
  maxPhrases: 40_000,
  maxDemand: 1000, // the phrase's best sellers together, at the call: under this it is before the sales
  maxSimilar: FRESH.maxSimilar,
  dueDays: 21,
  hitOrders: 300,
  hitTimes: 3,
  unreadDays: 3,
  perDay: 3, // calls sealed a day
  checkPerRun: 8, // waves checked a run (each: one store search + one suggestion read)
  gradePerRun: 12,
  areasWorld: 20, // world categories read a run, in rotation
  top: 8,
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PHRASE = /^[a-z0-9']{3,20} [a-z0-9']{3,20}$/;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const one = (w) => w.replace(/(?:es|s)$/, "");

/** The product phrases of one listing's title, without its area's own search words. */
export function phrasesFor(title = "", areaWords = "", { rules = PRELAUNCH } = {}) {
  const area = new Set(String(areaWords || "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).map(one));
  return [...phrasesOf(title)].filter((p) => PHRASE.test(p) && !p.split(" ").every((w) => area.has(one(w)))).slice(0, rules.perListing);
}

/** A store answer's product as a before-the-first-sale listing, or null. */
export function prelaunchEntry(p, { rules = PRELAUNCH } = {}) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.product_id || "");
  const orders = Number(p.lastest_volume ?? 0);
  const title = String(p.product_title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const shop = /^\d{3,20}$/.test(String(p.shop_id ?? "")) ? String(p.shop_id) : null;
  if (!/^\d{6,20}$/.test(id) || !title || !Number.isFinite(orders) || orders >= rules.maxOrders) return null;
  if (hasBrandName(title) || isNotListedKind(title) || isSeasonal(title)) return null;
  return { id, title, shop, orders };
}

/**
 * Today's answer for one area into the state. A listing counts once, on the first day the radar saw it;
 * a store counts once per phrase, on the first day it listed that phrase; an area's first reading only
 * seeds (everything looks new on the first day, so it is never counted as new).
 */
export function mergeListings(state = {}, entries = [], { today, area, areaWords = "", rules = PRELAUNCH } = {}) {
  const s = { start: { ...(state.start || {}) }, days: [...(state.days || [])], seen: { ...(state.seen || {}) }, ps: { ...(state.ps || {}) }, calls: state.calls || [], cursor: state.cursor || 0, stats: { ...(state.stats || {}) } };
  if (!DAY.test(String(today || "")) || !area) return { state: s, fresh: 0, stores: 0 };
  const seed = !s.start[area] || s.start[area] === today;
  if (!s.start[area]) s.start[area] = today;
  if (!s.days.includes(today)) s.days = [...s.days, today].sort();
  let fresh = 0;
  const stores = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e?.id || s.seen[e.id]) continue;
    s.seen[e.id] = today;
    if (seed || !e.shop) continue;
    fresh++;
    stores.add(e.shop);
    for (const ph of phrasesFor(e.title, areaWords, { rules })) {
      const per = s.ps[ph] ? { ...s.ps[ph] } : {};
      if (!per[e.shop]) per[e.shop] = today;
      s.ps[ph] = per;
    }
  }
  return { state: s, fresh, stores: stores.size, seed };
}

/** Old listings and store dates leave; a phrase only one store ever listed leaves after a week (its pace floor is the same). */
export function prunePrelaunch(state = {}, today, { rules = PRELAUNCH } = {}) {
  const cut = addDays(today, -rules.keepDays);
  const week = addDays(today, -7);
  const seen = Object.fromEntries(Object.entries(state.seen || {}).filter(([, d]) => d > cut));
  const ps = {};
  for (const [ph, per] of Object.entries(state.ps || {})) {
    const kept = Object.fromEntries(Object.entries(per || {}).filter(([, d]) => d > cut));
    const n = Object.keys(kept).length;
    if (!n || (n === 1 && Object.values(kept)[0] <= week)) continue;
    ps[ph] = kept;
  }
  const order = Object.keys(ps).sort((a, b) => Object.keys(ps[b]).length - Object.keys(ps[a]).length || (a < b ? -1 : 1));
  const capped = Object.fromEntries(order.slice(0, rules.maxPhrases).map((k) => [k, ps[k]]));
  const days = (state.days || []).filter((d) => d > cut);
  const stats = Object.fromEntries(Object.entries(state.stats || {}).filter(([d]) => d > addDays(today, -14)));
  return { ...state, seen, ps: capped, days, stats };
}

/** The phrases many different stores started listing this week, far above their pace before. */
export function listingWaves(state = {}, day, { rules = PRELAUNCH, skip = () => false } = {}) {
  const back7 = addDays(day, -7);
  const days = (state.days || []).filter((d) => d <= day);
  const weekDays = days.filter((d) => d > back7);
  const beforeDays = days.filter((d) => d <= back7);
  if (days.length < rules.minDays || !weekDays.length || !beforeDays.length) return { days: days.length, measuring: true, waves: [] };
  const rows = [];
  for (const [ph, per] of Object.entries(state.ps || {})) {
    if (!PHRASE.test(ph) || skip(ph)) continue;
    const dates = Object.values(per || {});
    const week = dates.filter((d) => d > back7 && d <= day).length;
    if (week < rules.minStores) continue;
    const before = dates.filter((d) => d <= back7).length;
    const expected = Math.max(before, 1) * (weekDays.length / beforeDays.length);
    if (week < rules.ratio * expected) continue;
    const p = poissonTail(week, expected);
    if (p > rules.p) continue;
    rows.push({ phrase: ph, week, before, times: Math.round((week / expected) * 10) / 10 });
  }
  rows.sort((a, b) => b.times - a.times || b.week - a.week || (a.phrase < b.phrase ? -1 : 1));
  return { days: days.length, measuring: false, waves: rows.slice(0, rules.top * 3) };
}

/** What skips a wave: a holiday, a brand, an unlisted kind, a kind the radar already watches. */
export const waveSkip = (concepts = []) => (ph) => isSeasonal(ph) || hasBrandName(ph) || isNotListedKind(ph) || covered(ph, concepts);

/** The store's own orders for a phrase: listings whose title holds both its words, and their 30-day orders together. */
export function phraseDemand(phrase = "", products = []) {
  const want = String(phrase).split(" ").map(one);
  let items = 0;
  let orders = 0;
  for (const p of Array.isArray(products) ? products : []) {
    const words = new Set(String(p?.product_title || p?.title || "").toLowerCase().split(/[^a-z0-9']+/).map(one));
    if (!want.every((w) => words.has(w))) continue;
    const o = Number(p?.lastest_volume ?? p?.orders);
    if (!Number.isFinite(o)) continue;
    items++;
    orders += o;
  }
  return { items, orders };
}

/** Today's calls: checked waves still before their sales, one open call per phrase, `perDay` at most. */
export function recordWaveCalls(calls = [], checked = [], { today, rules = PRELAUNCH } = {}) {
  const out = (Array.isArray(calls) ? calls : []).slice();
  const open = new Set(out.filter((c) => !c.result).map((c) => c.phrase));
  const madeToday = out.filter((c) => c.at === today).length;
  let added = 0;
  for (const w of Array.isArray(checked) ? checked : []) {
    if (madeToday + added >= rules.perDay) break;
    if (!PHRASE.test(String(w?.phrase || "")) || open.has(w.phrase)) continue;
    if (w.check?.unknown !== true || !Number.isFinite(w.demand?.orders) || w.demand.orders >= rules.maxDemand) continue;
    out.push({ phrase: w.phrase, at: today, stores: w.week, before: w.before, base: w.demand.orders, items: w.demand.items, similar: w.check.similar, due: addDays(today, rules.dueDays) });
    open.add(w.phrase);
    added++;
  }
  return out;
}

/** The open calls the run reads today: due, not yet graded, the oldest first. */
export function waveDueQueue(calls = [], today, { rules = PRELAUNCH } = {}) {
  return (Array.isArray(calls) ? calls : []).filter((c) => !c.result && c.due <= today).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, rules.gradePerRun).map((c) => c.phrase);
}

/** Grades the due calls from today's reads ({ phrase: { orders } }); a grade is never edited. */
export function gradeWaveCalls(calls = [], reads = {}, { today, rules = PRELAUNCH } = {}) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c.result || c.due > today) return c;
    const r = reads?.[c.phrase];
    if (r && Number.isFinite(r.orders)) {
      const target = Math.max(rules.hitOrders, rules.hitTimes * (Number(c.base) || 0));
      return { ...c, result: r.orders >= target ? "HIT" : "MISS", orders: r.orders, target, graded: today };
    }
    if (addDays(c.due, rules.unreadDays) < today) return { ...c, result: "UNREAD", graded: today };
    return c;
  });
}

/** The public record: sealed, graded (unread apart, never counted), hits. */
export function waveRecord(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const graded = list.filter((c) => c.result === "HIT" || c.result === "MISS");
  const hits = graded.filter((c) => c.result === "HIT").length;
  const pending = list.filter((c) => !c.result);
  return { calls: list.length, graded: graded.length, hits, accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null, unread: list.filter((c) => c.result === "UNREAD").length, pending: pending.length, nextDue: pending.map((c) => c.due).sort()[0] || null };
}

/** The sealed book's line, for the board's sanitizer: `phrase|day|stores|before|orders|listings|due|grade`. */
export const PRELAUNCH_LINE = "[a-z0-9']{3,20} [a-z0-9']{3,20}\\|\\d{4}-\\d{2}-\\d{2}\\|\\d+\\|\\d+\\|\\d+\\|(?:\\d+|-)\\|\\d{4}-\\d{2}-\\d{2}\\|(?:HIT|MISS|UNREAD|-)";

/** The sealed book: every call ever made, misses included, one line each. */
export function prelaunchSealText(calls = []) {
  const lines = (Array.isArray(calls) ? calls : []).filter((c) => PHRASE.test(String(c?.phrase || "")) && DAY.test(String(c?.at || "")))
    .map((c) => `${c.phrase}|${c.at}|${c.stores}|${c.before}|${c.base}|${c.similar ?? "-"}|${c.due}|${c.result || "-"}`)
    .sort();
  return lines.length ? lines.join("\n") : null;
}

/** The board's copy, built by the run. */
export function prelaunchBoard(state = {}, { day, waves, checked = [], areas = 0, read = 0, answered = 0, listings = 0, fresh = 0, stores = 0, seal = null } = {}) {
  const calls = state.calls || [];
  const byPhrase = new Map((checked || []).map((w) => [w.phrase, w]));
  return {
    day, days: waves?.days ?? (state.days || []).length, measuring: waves?.measuring !== false,
    areas, read, answered, listings, fresh, stores, phrases: Object.keys(state.ps || {}).length, wavesToday: (waves?.waves || []).length,
    waves: (waves?.waves || []).slice(0, PRELAUNCH.top).map((w) => {
      const c = byPhrase.get(w.phrase);
      return { ...w, ...(c ? { state: c.check?.reason || null, similar: c.check?.similar ?? null, demand: c.demand?.orders ?? null } : {}) };
    }),
    record: waveRecord(calls),
    open: calls.filter((c) => !c.result).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12),
    graded: calls.filter((c) => c.result).sort((a, b) => (a.graded < b.graded ? 1 : -1)).slice(0, 20),
    ...(seal ? { seal } : {}),
  };
}

/** The browser's copy (its seal is checked by the board's sanitizer). `full: false` (behind the lock) keeps the counts and the record, never an open phrase. */
export function cleanPrelaunch(b, { full = true } = {}) {
  if (!b || typeof b !== "object") return null;
  const n = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e8 ? Math.round(x * 10) / 10 : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const r = b.record || {};
  const call = (c) => ({ phrase: c.phrase, at: d(c.at), due: d(c.due), stores: n(c.stores), before: n(c.before), base: n(c.base), similar: n(c.similar), ...(c.result ? { result: ["HIT", "MISS", "UNREAD"].includes(c.result) ? c.result : null, orders: n(c.orders), target: n(c.target), graded: d(c.graded) } : {}) });
  const out = {
    day: d(b.day), days: n(b.days) ?? 0, measuring: b.measuring !== false,
    areas: n(b.areas) ?? 0, read: n(b.read) ?? 0, answered: n(b.answered) ?? 0, listings: n(b.listings) ?? 0, fresh: n(b.fresh) ?? 0, stores: n(b.stores) ?? 0, phrases: n(b.phrases) ?? 0,
    record: { calls: n(r.calls) ?? 0, graded: n(r.graded) ?? 0, hits: n(r.hits) ?? 0, accuracy: n(r.accuracy), unread: n(r.unread) ?? 0, pending: n(r.pending) ?? 0, nextDue: d(r.nextDue) },
    waves: full ? (Array.isArray(b.waves) ? b.waves : []).filter((w) => PHRASE.test(String(w?.phrase || ""))).slice(0, PRELAUNCH.top).map((w) => ({ phrase: w.phrase, week: n(w.week) ?? 0, before: n(w.before) ?? 0, times: n(w.times), state: ["UNKNOWN", "SATURATED", "BUZZ", "NOT_CHECKED"].includes(w.state) ? w.state : null, similar: n(w.similar), demand: n(w.demand) })) : [],
    wavesToday: n(b.wavesToday) ?? (Array.isArray(b.waves) ? b.waves.length : 0),
    open: full ? (Array.isArray(b.open) ? b.open : []).filter((c) => PHRASE.test(String(c?.phrase || ""))).slice(0, 12).map(call) : [],
    graded: (Array.isArray(b.graded) ? b.graded : []).filter((c) => PHRASE.test(String(c?.phrase || ""))).slice(0, 20).map(call),
  };
  return out;
}
