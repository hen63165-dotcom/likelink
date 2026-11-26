// 🚫 Saturated is never a find (the owner, 26.11: "I saw the radar found products the market is already
// saturated with — fix it, obviously it should not"). Rising orders alone say nothing about being early:
// a squishy with 49,602 orders a month that grows 33% a week is a hit everyone already sells, not a find.
// So every product the radar shows or posts outside its own discoveries (the channel's listings per kind,
// the site's HOT products, the legal brand looks) passes one market check first, the same one the new
// products pass (freshRisers.js unknownCheck):
//   • a mass seller (≥ `massOrders` orders in 30 days) is SATURATED, no question asked;
//   • else the AliExpress listings matching its own most specific name (distinctPhrase) — over
//     `maxSimilar` (the radar's 2,000 line) it is SATURATED — and Google's US suggestions for that name:
//     tiktok / viral / trending / amazon there is BUZZ;
//   • under both lines it is OPEN; a check that could not be read is UNMEASURED, never assumed open.
// Only OPEN is shown as a find or posted. Measured only, never a forecast. Pure: the runner asks.

import { FRESH } from "./freshRisers.js";

export const SATURATION = Object.freeze({ massOrders: 5000, maxSimilar: FRESH.maxSimilar, perRun: 30, keepDays: 3 });
export const MARKET_STATES = Object.freeze(["OPEN", "SATURATED", "BUZZ", "UNMEASURED"]);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Already sold in the thousands every month: no check needed. */
export const isMass = (orders, { rules = SATURATION } = {}) => Number.isFinite(Number(orders)) && Number(orders) >= rules.massOrders;

/** A kept check is reused for `keepDays` (listing counts move slowly; the run asks the rest). */
export const freshCheck = (rec, today, { rules = SATURATION } = {}) => Boolean(rec && DAY.test(String(rec.d || "")) && DAY.test(String(today || "")) && daysBetween(rec.d, today) < rules.keepDays);

/** One product's market state, from its orders and its unknown check (freshRisers.js unknownCheck). */
export function marketOf({ orders = null, check = null } = {}, { rules = SATURATION } = {}) {
  if (isMass(orders, { rules })) return { state: "SATURATED", why: "mass", orders: Number(orders) };
  const similar = Number.isFinite(check?.similar) ? check.similar : null;
  const phrase = typeof check?.phrase === "string" ? check.phrase.slice(0, 80) : null;
  if (check?.reason === "SATURATED") return { state: "SATURATED", why: "sellers", similar, phrase };
  if (check?.reason === "BUZZ") return { state: "BUZZ", why: "buzz", similar, phrase, buzz: (check.buzz || []).slice(0, 4) };
  if (check?.reason === "UNKNOWN") return { state: "OPEN", similar, phrase };
  return { state: "UNMEASURED" };
}

/** The ids the run asks today: not mass, not checked within `keepDays`, unique, at most `perRun`. */
export function saturationQueue(targets = [], state = {}, today, { rules = SATURATION } = {}) {
  const out = [];
  for (const t of Array.isArray(targets) ? targets : []) {
    const id = String(t?.id || "");
    if (!/^\d{6,20}$/.test(id) || out.includes(id) || isMass(t.orders, { rules }) || freshCheck(state?.[id], today, { rules })) continue;
    out.push(id);
    if (out.length >= rules.perRun) break;
  }
  return out;
}

/** Old checks leave the state after three times their life. */
export function pruneChecks(state = {}, today, { rules = SATURATION } = {}) {
  return Object.fromEntries(Object.entries(state || {}).filter(([, v]) => DAY.test(String(v?.d || "")) && daysBetween(v.d, today) < rules.keepDays * 3));
}

/** The browser's copy of a product's market state. */
export function cleanMarket(m) {
  if (!m || !MARKET_STATES.includes(m.state)) return null;
  const n = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e8 ? Math.round(x) : null);
  return { state: m.state, why: ["mass", "sellers", "buzz"].includes(m.why) ? m.why : null, orders: n(m.orders), similar: n(m.similar) };
}
