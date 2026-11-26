// New products that start to run (the owner, 2026-11-16: "what the radar lists, the market already
// knows and is saturated with"). The watch list measures kinds people already name, so it can only
// say they are steady or at their peak. New things appear first as new listings: every day the
// radar asks AliExpress, per category, for the listings its sellers title as this year's new items
// ("<category words> 2026 new", sorted by recent orders, ship to IL) and keeps each one's 30-day
// orders. A fresh riser is a new listing still small (≤ 5,000 orders in 30 days) whose orders grow
// at least 40% a week against a reading 3–14 days older. Measured only: AliExpress's own numbers,
// dated; never a forecast. The acceleration must hold: the reading before today must already show
// ≥ 20% a week, so one lucky day is not enough. Every riser the radar shows is saved the day it is
// shown and graded after 14 days, in public: HIT when its orders grew ≥ 50% since, else MISS.
// Pure: the runner (scripts/catalog/trend-radar.mjs) does the reading.
import { hasBrandName, isNotListedKind } from "./deals.js";
import { HOT, itemMomentum } from "./radarOpportunity.js";
import { phrasesOf } from "./radarDiscovery.js";
import { echoOf } from "./worldPulse.js";
import { BRAIN, freshFeatures } from "./radarBrain.js";

export const FRESH = Object.freeze({
  minOrders: 30, // under that a week's growth is noise
  maxOrders: 3000, // over that it is no longer new
  minWeekPct: 40,
  heldWeekPct: 20, // the reading before today already rising: the acceleration held
  gradeDays: 14,
  hitPct: 50,
  keepDays: 21, // a listing not seen again for three weeks leaves the pool
  maxPool: 6000, // 17.11: the world is read 120 categories a day (~6,000 listings): one day's reading fits
  show: 12,
  maxSimilar: 2000, // more matching listings than this = many sellers already copy it: saturated
  checkUpTo: 24, // candidates checked a day (two reads each)
  // The noise check (21.11, the owner: "hit almost absolutely, no room for errors"). Picking the
  // fastest of ~6,000 small listings picks luck too: 20 → 30 orders reads "+103% a week" and is ten
  // orders. A riser is shown only when its growth beats a modest rise (nullWeekPct) beyond what
  // counting noise explains, with the false discoveries among all the listings tested that day held
  // at fdr (Benjamini–Hochberg).
  nullWeekPct: 20,
  fdr: 0.1,
  minSat: 90, // the store's own satisfaction share, when it sent one (used to choose only, never shown)
  // A new product, an older one that grows, and a misclassified one are three different things (the
  // owner, 22.11, after an outside check found a 2026-New smartwatch among the risers that was already
  // selling 502 orders in 30 days the first time the radar read it). The store's API sends no listing
  // date and a seller's "2026 New" proves nothing, so the radar says only what it saw itself.
  newBase: 100, // orders in 30 days at the radar's first reading: under it, the radar saw it from the start
});

/**
 * Holidays (the owner, 22.11: "so it never makes mistakes again"): demand that comes back every year on
 * the calendar is no trend. In late November Christmas ornaments and Santa costumes grow every week, and
 * 20.11's first kinds run found "balls tree" (Christmas ornaments). A seasonal listing is never shown as
 * a new product starting to run, and a kind whose name or half its listings are seasonal is never a
 * new kind; both are counted apart.
 */
const SEASONAL = /\b(christmas|xmas|x-mas|santa|reindeer|snowman|advent|nativity|halloween|valentine'?s?|easter|ramadan|eid|hanukkah|chanukah|menorah|diwali|thanksgiving|black friday|new year'?s?|lunar new year|st\.? patrick'?s?|mother'?s day|father'?s day)\b/i;
export const isSeasonal = (title = "") => SEASONAL.test(String(title || ""));

/**
 * How new a listing is, from the radar's own first reading of it (pure): NEW when that first reading
 * held under `newBase` orders in 30 days (the radar watched it from the start), ESTABLISHED when it was
 * already selling more than that (it grows, but it is no new product), null without a reading.
 */
export function listingAge(series = [], { rules = FRESH } = {}) {
  const rs = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])) && Number.isFinite(Number(r[1])));
  if (!rs.length) return null;
  const first = [...rs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
  const orders = Number(first[1]);
  return { state: orders < (rules.newBase ?? FRESH.newBase) ? "NEW" : "ESTABLISHED", firstDay: first[0], firstOrders: orders };
}

const dayGap = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
// The standard normal's upper tail (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7).
function upperTail(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return z >= 0 ? erfc / 2 : 1 - erfc / 2;
}

/**
 * How sure the growth is beyond counting noise (pure): the orders then and now treated as counts
 * (Poisson), the log of their ratio against a weekly rise of nullWeekPct over the same span.
 * `p`: the chance noise alone shows this much growth on an item that rose only nullWeekPct a week;
 * `lowWeekPct`: the weekly growth at the low end (one-sided 95%). An approximation: 30-day counts
 * read days apart overlap, so it is a noise check, never a forecast. null without two readings.
 */
export function growthEvidence(m, { nullWeekPct = FRESH.nullWeekPct } = {}) {
  if (!m || !m.from || !m.to) return null;
  return growthOverDays({ before: m.ordersBefore, after: m.orders, days: dayGap(m.from, m.to) }, { nullWeekPct });
}

/** The same noise check for counts read `days` apart (a kind's members together, newKinds.js). */
export function growthOverDays({ before, after, days } = {}, { nullWeekPct = FRESH.nullWeekPct } = {}) {
  if (!(after > 0) || !(before > 0) || !(days > 0)) return null;
  const m = { orders: after, ordersBefore: before };
  const span = days;
  const lr = Math.log(m.orders / m.ordersBefore);
  const se = Math.sqrt(1 / m.orders + 1 / m.ordersBefore);
  const z = (lr - Math.log(1 + nullWeekPct / 100) * (span / 7)) / se;
  const lowWeekPct = Math.round((Math.exp(((lr - 1.6449 * se) * 7) / span) - 1) * 1000) / 10;
  return { p: upperTail(z), z: Math.round(z * 100) / 100, lowWeekPct };
}

/** Benjamini–Hochberg (pure): the indices kept among the p-values at false-discovery rate q. */
export function fdrKeep(ps = [], q = FRESH.fdr) {
  const order = ps.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  let k = 0;
  order.forEach(([p], r) => { if (p <= ((r + 1) / order.length) * q) k = r + 1; });
  return new Set(order.slice(0, k).map(([, i]) => i));
}

const satOf = (v) => { const n = Number.parseFloat(String(v ?? "").replace("%", "")); return Number.isFinite(n) && n > 0 && n <= 100 ? n : null; };

/**
 * "Nobody has heard of it yet" (the owner, 2026-11-16: "only things nobody in Israel or the world
 * thought would be a hit; never what the market is saturated with"), measured twice before a riser
 * is shown: (1) few sellers — AliExpress's own count of listings matching the item's first
 * two-word phrase is under maxSimilar; (2) no buzz — Google's public suggestions in the US for that
 * phrase do not add "tiktok", "viral", "trending" or "amazon". A check that could not be read
 * hides the riser: unknown is never assumed.
 */
export function freshPhrase(title = "") {
  return [...phrasesOf(title)][0] || null;
}

/** How many of the pool's titles hold each two-word phrase (the sellers' own names for a kind). */
export function phraseCounts(titles = []) {
  const df = new Map();
  for (const t of Array.isArray(titles) ? titles : []) for (const p of new Set(phrasesOf(t))) df.set(p, (df.get(p) || 0) + 1);
  return df;
}

/**
 * The kind's most specific name (the owner, 26.11: "the radar only says the market is saturated"):
 * the first two words of a title are often the generic part ("led lamp" for a cloud-shaped humidifier
 * lamp), and a generic phrase counts every seller of the whole category, so a new thing read as
 * saturated. The name used is the title's phrase the fewest pool titles share, among those at least
 * `minShared` titles share (one seller's quirk is no name for a kind); else the first phrase.
 */
export function distinctPhrase(title = "", df = new Map(), { minShared = 2 } = {}) {
  const ps = [...new Set(phrasesOf(title))];
  const named = ps.filter((p) => (df.get(p) || 0) >= minShared).sort((a, b) => (df.get(a) - df.get(b)) || ps.indexOf(a) - ps.indexOf(b));
  return named[0] || ps[0] || null;
}
export function unknownCheck({ phrase = null, similar = null, suggestions = null } = {}, { rules = FRESH } = {}) {
  if (!phrase || !Number.isFinite(similar) || !Array.isArray(suggestions)) return { unknown: false, reason: "NOT_CHECKED", phrase, similar: Number.isFinite(similar) ? similar : null, buzz: [] };
  const buzz = echoOf({ en: suggestions });
  if (similar > rules.maxSimilar) return { unknown: false, reason: "SATURATED", phrase, similar, buzz };
  if (buzz.length) return { unknown: false, reason: "BUZZ", phrase, similar, buzz };
  return { unknown: true, reason: "UNKNOWN", phrase, similar, buzz: [] };
}

// Fashion pieces the shop's categories leave out (the owner, 2026-11-17: "the radar also spots the
// fashion items about to be the next trend: accessories, clothes, everything"): read every day with
// the categories, so a new shoe, pair of sunglasses, hat, scarf or belt can become a fresh riser.
export const FASHION_AREAS = Object.freeze([
  Object.freeze({ key: "shoes", he: "נעליים", keywords: "women shoes" }),
  Object.freeze({ key: "sunglasses", he: "משקפי שמש", keywords: "women sunglasses" }),
  Object.freeze({ key: "hats", he: "כובעים", keywords: "women hat" }),
  Object.freeze({ key: "scarves", he: "צעיפים", keywords: "women scarf" }),
  Object.freeze({ key: "belts", he: "חגורות", keywords: "women belt" }),
]);

const BUY = /^https:\/\/s\.click\.aliexpress\.com\//;
const IMG = /^https:\/\/[^/]*(aliexpress-media\.com|alicdn\.com|aliexpress\.com)\//i;

/** The search words for a category's new listings this year. */
export const freshKeywords = (category, now = Date.now()) => `${category.keywords} ${new Date(now).getUTCFullYear()} new`;
/**
 * The searches tried in order for one area (the audit of 21.11: tech, gadgets and handheld answered
 * resp 405, no result, on every run since 17.11, because their long words plus "<year> new" match
 * nothing): the full words, then their first two words with the year, then the first two words alone.
 */
export function freshQueries(category, now = Date.now()) {
  const year = new Date(now).getUTCFullYear();
  const two = String(category?.keywords || "").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  return [...new Set([freshKeywords(category, now), `${two} ${year} new`, `${two} new`].filter((q) => q.trim().length > 4))];
}

/** A store answer's product as a pool entry, or null (no own link, no photo, a brand, an unlisted kind). */
export function freshEntry(p, { category = "", today = "" } = {}) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.product_id || "");
  const link = String(p.promotion_link || "");
  const image = String(p.product_main_image_url || "");
  const title = String(p.product_title || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const orders = Number(p.lastest_volume);
  if (!/^\d{6,20}$/.test(id) || !BUY.test(link) || !IMG.test(image) || !title || !Number.isFinite(orders)) return null;
  if (hasBrandName(title) || isNotListedKind(title)) return null;
  const price = Number(p.target_sale_price ?? p.sale_price);
  const sat = satOf(p.evaluate_rate);
  // The factory's own store on AliExpress (its public id), when the store sends it (factorySignal.js).
  const shop = /^\d{3,20}$/.test(String(p.shop_id ?? "")) ? String(p.shop_id) : null;
  return { id, title, image, link, price: Number.isFinite(price) && price > 0 ? price : null, category, first: today, seen: today, orders, ...(sat !== null ? { sat } : {}), ...(shop ? { shop } : {}) };
}

/** The pool after today's answers: new ids join, known ones refresh, unseen ones leave after keepDays. */
export function mergeFreshPool(pool = {}, entries = [], { today, rules = FRESH } = {}) {
  const out = { ...(pool && typeof pool === "object" ? pool : {}) };
  for (const e of entries) {
    if (!e) continue;
    const prev = out[e.id];
    out[e.id] = prev ? { ...prev, ...e, first: prev.first || e.first } : e;
  }
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const [id, e] of Object.entries(out)) if (!e?.seen || e.seen < cutoff) delete out[id];
  const ids = Object.keys(out).sort((a, b) => (out[b].seen > out[a].seen ? 1 : out[b].seen < out[a].seen ? -1 : 0));
  return Object.fromEntries(ids.slice(0, rules.maxPool).map((id) => [id, out[id]]));
}

/** Today's fresh risers from the pool and the item histories (items.json), fastest first. */
export function freshRisers(pool = {}, items = {}, { rules = FRESH } = {}) {
  const entries = Object.values(pool || {});
  // Every small listing with two readings is one test, whether or not it looks fast: the noise check
  // counts all of them, so taking the fastest of thousands cannot pass luck as a trend.
  const tested = [];
  for (const e of entries) {
    const m = itemMomentum(items?.[e.id] || [], { rules: HOT });
    if (m.weekPct === null || !(m.orders >= rules.minOrders) || m.orders > rules.maxOrders) continue;
    tested.push({ e, m, ev: growthEvidence(m, { nullWeekPct: rules.nullWeekPct ?? FRESH.nullWeekPct }) });
  }
  const real = fdrKeep(tested.map((x) => x.ev?.p), rules.fdr ?? FRESH.fdr);
  const rows = [];
  const established = [];
  const seasonal = [];
  tested.forEach(({ e, m, ev }, i) => {
    if (m.weekPct < rules.minWeekPct || !real.has(i)) return;
    if (Number.isFinite(e.sat) && e.sat < (rules.minSat ?? FRESH.minSat)) return;
    const before = itemMomentum((items?.[e.id] || []).slice(0, -1), { rules: HOT });
    if (before.weekPct === null || before.weekPct < rules.heldWeekPct) return;
    // Only a listing the radar watched from the start is a new product; one already selling at its
    // first reading grows, and is counted apart, never shown as new.
    if (isSeasonal(e.title)) { seasonal.push(e.id); return; }
    const age = listingAge(items?.[e.id], { rules });
    if (age?.state !== "NEW") { established.push({ id: e.id, weekPct: m.weekPct, firstOrders: age?.firstOrders ?? null, firstDay: age?.firstDay ?? null }); return; }
    rows.push({ age, id: e.id, title: e.title, image: e.image, buy: e.link, price: e.price, category: e.category, first: e.first, orders: m.orders, ordersBefore: m.ordersBefore, from: m.from, to: m.to, weekPct: m.weekPct, heldPct: before.weekPct, lowPct: ev.lowWeekPct, check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${e.id}.html`)}` });
  });
  rows.sort((a, b) => b.lowPct - a.lowPct || b.weekPct - a.weekPct || a.orders - b.orders);
  const since = entries.map((e) => e.first).filter(Boolean).sort()[0] || null;
  const fastRaw = tested.filter(({ m }) => m.weekPct >= rules.minWeekPct).length;
  established.sort((a, b) => b.weekPct - a.weekPct || (a.id < b.id ? -1 : 1));
  return { tracking: entries.length, since, risers: rows.slice(0, rules.show), established: { n: established.length, top: established.slice(0, 6) }, seasonal: { n: seasonal.length, top: seasonal.slice(0, 6) }, noise: { tested: tested.length, fast: fastRaw, real: real.size, fdr: rules.fdr ?? FRESH.fdr } };
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The bar never drops, it only rises with the record (pure; tested; the owner, 2026-11-17: "חייב להיות
 * בטוחים שהוא פוגע בול"): once 10 risers are graded under 80% hits, a riser must grow 1.5× faster
 * (≥ 60% a week) and the reading before must already show ≥ 40%. Precision comes from the bar, never
 * from hiding or regrading a call.
 */
export function freshBar(record, { rules = FRESH } = {}) {
  const strict = Number(record?.graded) >= 10 && Number.isFinite(record?.accuracy) && record.accuracy < 80;
  return strict ? { ...rules, minWeekPct: rules.minWeekPct * 1.5, heldWeekPct: rules.heldWeekPct * 2, fdr: (rules.fdr ?? FRESH.fdr) / 2, strict: true } : { ...rules, strict: false };
}

/** Today's risers saved as calls (one open call per item), each due 14 days later. */
export function recordFresh(calls = [], risers = [], today, { rules = FRESH } = {}) {
  const list = Array.isArray(calls) ? [...calls] : [];
  for (const r of risers) {
    if (list.some((c) => c.id === r.id && !c.result)) continue;
    // The brain (radarBrain.js) learns from what the call knew the day it was made, under its version.
    list.push({ id: r.id, title: r.title, at: today, base: r.orders, due: addDays(today, rules.gradeDays), f: freshFeatures(r), v: BRAIN.version });
  }
  return list.slice(-2000);
}

/** Calls whose day came: HIT when the item's orders grew ≥ hitPct since the call, else MISS. Never edited after. */
export function gradeFresh(calls = [], items = {}, today, { rules = FRESH } = {}) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c.result || !(c.due <= today)) return c;
    const latest = (items?.[c.id] || []).filter((r) => r[0] >= c.due).at(0) || (items?.[c.id] || []).at(-1);
    if (!latest || latest[0] < c.due || !(c.base > 0)) return c; // not read on or after its day yet: wait
    const growth = Math.round(((latest[1] - c.base) / c.base) * 1000) / 10;
    return { ...c, result: growth >= rules.hitPct ? "HIT" : "MISS", growth, gradedAt: today };
  });
}

/** The public record of the fresh calls. */
export function freshRecord(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const graded = list.filter((c) => c.result);
  const hits = graded.filter((c) => c.result === "HIT").length;
  const pending = list.filter((c) => !c.result);
  return { calls: list.length, graded: graded.length, hits, accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null, pending: pending.length, nextDue: pending.map((c) => c.due).sort()[0] || null };
}
