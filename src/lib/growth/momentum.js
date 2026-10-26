// Demand momentum: the "next hit" signal (the owner, 2026-10-26: "only items
// that are viral and hot while the market is not yet saturated").
//
// AliExpress's own recent order count (`lastest_volume`), read on different
// days, tells an item whose demand is growing from one that has levelled off.
// One reading says nothing, so an item is UNVERIFIED until a second reading
// at least `minDays` later. The readings live in a server-only key
// (`deals:momentum`); the numbers are used to choose only — never stored on a
// product, never shown, and never described as a sales forecast.
import { orderCount } from "./deals.js";

export const MOMENTUM = Object.freeze({
  minDays: 2, // the earliest a second reading counts
  windowDays: 14, // readings older than this are not compared
  risingPct: 20, // growth of the order count that makes an item RISING
  coolingPct: -15, // and COOLING
  maxReadings: 8, // per item
  forgetDays: 30, // an item not seen for this long is dropped
  maxItems: 600, // the whole store
});

export const MOMENTUM_STATES = Object.freeze(["RISING", "STEADY", "COOLING", "UNVERIFIED"]);

const DAY = 86_400_000;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** An empty or unreadable store → a fresh one (never throws on a bad row). */
export function momentumStore(raw) {
  const items = raw && typeof raw === "object" && raw.items && typeof raw.items === "object" ? raw.items : {};
  return { v: 1, items };
}

/**
 * Adds today's reading of each item's order count (one reading per item per
 * day; a later one the same day replaces it), keeps the newest `maxReadings`,
 * drops items not seen for `forgetDays`, and keeps the store under `maxItems`
 * (the items seen longest ago go first). Returns a new store.
 */
export function recordReadings(raw, items = [], { category = "", now = Date.now(), rules = MOMENTUM } = {}) {
  const store = momentumStore(raw);
  const today = dayOf(now);
  const next = { ...store.items };
  for (const x of Array.isArray(items) ? items : []) {
    const id = String(x?.product_id || "");
    const v = orderCount(x);
    if (!/^\d{6,}$/.test(id) || v === null || v < 0) continue;
    const prev = Array.isArray(next[id]?.r) ? next[id].r.filter((r) => r[0] !== today) : [];
    next[id] = { c: category || next[id]?.c || "", r: [...prev, [today, v]].slice(-rules.maxReadings) };
  }
  const fresh = Object.entries(next)
    .map(([id, e]) => [id, e, e?.r?.at(-1)?.[0] || ""])
    .filter(([, e, last]) => Array.isArray(e?.r) && last && daysBetween(last, today) <= rules.forgetDays)
    .sort((a, b) => (a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : 0))
    .slice(0, rules.maxItems);
  return { v: 1, at: new Date(now).toISOString(), items: Object.fromEntries(fresh.map(([id, e]) => [id, e])) };
}

/**
 * One item's momentum: its newest reading against the oldest one in the
 * window that is at least `minDays` older. Growth is of AliExpress's own
 * number; a newest reading older than a week is UNVERIFIED (not current).
 */
export function momentumOf(entry, { now = Date.now(), rules = MOMENTUM } = {}) {
  const readings = (Array.isArray(entry?.r) ? entry.r : []).filter((r) => Array.isArray(r) && typeof r[0] === "string" && Number.isFinite(r[1]));
  const latest = readings.at(-1);
  if (!latest || daysBetween(latest[0], dayOf(now)) > 7) return { state: "UNVERIFIED", readings: readings.length };
  const base = readings.find((r) => {
    const d = daysBetween(r[0], latest[0]);
    return d >= rules.minDays && d <= rules.windowDays;
  });
  if (!base) return { state: "UNVERIFIED", readings: readings.length };
  const growth = Math.round(((latest[1] - base[1]) / Math.max(base[1], 1)) * 100);
  const state = growth >= rules.risingPct ? "RISING" : growth <= rules.coolingPct ? "COOLING" : "STEADY";
  return { state, growth, days: daysBetween(base[0], latest[0]), readings: readings.length };
}

/** id → momentum for every item in the store. */
export function momentumIndex(raw, { now = Date.now(), rules = MOMENTUM } = {}) {
  const store = momentumStore(raw);
  return new Map(Object.entries(store.items).map(([id, e]) => [id, momentumOf(e, { now, rules })]));
}

/** Counts per state (for the import log and the owner's status; no item numbers). */
export function momentumSummary(index) {
  const out = { tracked: 0, RISING: 0, STEADY: 0, COOLING: 0, UNVERIFIED: 0 };
  for (const m of index?.values?.() || []) {
    out.tracked += 1;
    out[m.state] = (out[m.state] || 0) + 1;
  }
  return out;
}

/** Sort rank: rising first (fastest first), then not yet known or steady, cooling last. */
export function momentumRank(m) {
  if (m?.state === "RISING") return [0, -(m.growth || 0)];
  if (m?.state === "COOLING") return [2, 0];
  return [1, 0];
}

/**
 * Deals already ranked by the deals rules, re-ordered by momentum: rising
 * first (fastest first), cooling items dropped, the rest in their order.
 */
export function byMomentum(list = [], index = new Map()) {
  return (Array.isArray(list) ? list : [])
    .map((x, i) => ({ x, i, m: index.get(String(x?.product_id || "")) }))
    .filter(({ m }) => m?.state !== "COOLING")
    .sort((a, b) => {
      const ra = momentumRank(a.m);
      const rb = momentumRank(b.m);
      return ra[0] - rb[0] || ra[1] - rb[1] || a.i - b.i;
    })
    .map(({ x }) => x);
}
