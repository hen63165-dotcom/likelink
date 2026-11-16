// New products that start to run (the owner, 2026-11-16: "what the radar lists, the market already
// knows and is saturated with"). The watch list measures kinds people already name, so it can only
// say they are steady or at their peak. New things appear first as new listings: every day the
// radar asks AliExpress, per category, for the listings its sellers title as this year's new items
// ("<category words> 2026 new", sorted by recent orders, ship to IL) and keeps each one's 30-day
// orders. A fresh riser is a new listing still small (≤ 5,000 orders in 30 days) whose orders grow
// at least 40% a week against a reading 3–14 days older. Measured only: AliExpress's own numbers,
// dated; never a forecast. Pure: the runner (scripts/catalog/trend-radar.mjs) does the reading.
import { hasBrandName, isNotListedKind } from "./deals.js";
import { HOT, itemMomentum } from "./radarOpportunity.js";

export const FRESH = Object.freeze({
  minOrders: 30, // under that a week's growth is noise
  maxOrders: 5000, // over that it is no longer new
  minWeekPct: 40,
  keepDays: 21, // a listing not seen again for three weeks leaves the pool
  maxPool: 1500,
  show: 12,
});

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
    rows.push({ id: e.id, title: e.title, image: e.image, buy: e.link, price: e.price, category: e.category, first: e.first, orders: m.orders, ordersBefore: m.ordersBefore, from: m.from, to: m.to, weekPct: m.weekPct, check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${e.id}.html`)}` });
  }
  rows.sort((a, b) => b.weekPct - a.weekPct || a.orders - b.orders);
  const since = entries.map((e) => e.first).filter(Boolean).sort()[0] || null;
  return { tracking: entries.length, since, risers: rows.slice(0, rules.show) };
}
