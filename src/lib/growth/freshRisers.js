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
});

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
  return { id, title, image, link, price: Number.isFinite(price) && price > 0 ? price : null, category, first: today, seen: today, orders };
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
  const rows = [];
  for (const e of entries) {
    const m = itemMomentum(items?.[e.id] || [], { rules: HOT });
    if (m.weekPct === null || !(m.orders >= rules.minOrders) || m.orders > rules.maxOrders || m.weekPct < rules.minWeekPct) continue;
    const before = itemMomentum((items?.[e.id] || []).slice(0, -1), { rules: HOT });
    if (before.weekPct === null || before.weekPct < rules.heldWeekPct) continue;
    rows.push({ id: e.id, title: e.title, image: e.image, buy: e.link, price: e.price, category: e.category, first: e.first, orders: m.orders, ordersBefore: m.ordersBefore, from: m.from, to: m.to, weekPct: m.weekPct, heldPct: before.weekPct, check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${e.id}.html`)}` });
  }
  rows.sort((a, b) => b.weekPct - a.weekPct || a.orders - b.orders);
  const since = entries.map((e) => e.first).filter(Boolean).sort()[0] || null;
  return { tracking: entries.length, since, risers: rows.slice(0, rules.show) };
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
  return strict ? { ...rules, minWeekPct: rules.minWeekPct * 1.5, heldWeekPct: rules.heldWeekPct * 2, strict: true } : { ...rules, strict: false };
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
