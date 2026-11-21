// 🏭 Sellers against demand (the owner, 2026-11-21: "the biggest factories in the world should depend
// on the radar"). A factory needs to know what to make before the shelves fill: where people's orders
// grow faster than the sellers listing the kind. The radar reads both every morning for every kind it
// watches — the top items' 30-day orders (demand) and the number of matching AliExpress listings
// (supply) — so it can say, from the store's own numbers, which kinds are under-supplied today:
//   UNDERSUPPLIED: demand ≥ +15% a week and at least 15 points faster than the listings (room to make it);
//   OVERSUPPLIED: listings ≥ +10% a week and at least 15 points faster than the orders (sellers rush in);
//   BALANCED otherwise; null with under two readings 2–14 days apart. Measured, never a forecast.
// Pure: the runner sets it on each concept, the page and the public board carry it.

import { factoryOf } from "./worldPulse.js";

export const SUPPLY = Object.freeze({ minDemandWeekPct: 15, gapPoints: 15, overSupplyWeekPct: 10, show: 8 });

export const SUPPLY_STATES = Object.freeze({
  UNDERSUPPLIED: { he: "הביקוש רץ מהר מהמוכרים: מקום לייצר", en: "Demand outruns the sellers: room to make it" },
  OVERSUPPLIED: { he: "המוכרים נכנסים מהר מהביקוש", en: "Sellers rush in faster than demand" },
  BALANCED: { he: "מוכרים וביקוש באותו קצב", en: "Sellers and demand at the same pace" },
});

/** One kind's sellers against its demand, from its two daily series ([day, number] pairs). */
export function supplyGapOf({ series = [], listings = [] } = {}, { rules = SUPPLY } = {}) {
  const demand = factoryOf(series);
  const supply = factoryOf(listings);
  if (!demand || !supply) return null;
  const gap = Math.round((demand.weekPct - supply.weekPct) * 10) / 10;
  const state = demand.weekPct >= rules.minDemandWeekPct && gap >= rules.gapPoints ? "UNDERSUPPLIED"
    : supply.weekPct >= rules.overSupplyWeekPct && -gap >= rules.gapPoints ? "OVERSUPPLIED" : "BALANCED";
  return {
    state,
    demandWeekPct: demand.weekPct,
    supplyWeekPct: supply.weekPct,
    gap,
    orders: demand.to,
    listings: supply.to,
    perListing: supply.to > 0 ? Math.round((demand.to / supply.to) * 100) / 100 : null,
    days: Math.min(demand.days, supply.days),
  };
}

/** The day's under-supplied kinds, the widest gap first (the factories' list). */
export function supplyBoard(concepts = [], { rules = SUPPLY } = {}) {
  const rows = (Array.isArray(concepts) ? concepts : []).filter((c) => c?.supply?.state === "UNDERSUPPLIED");
  return {
    measured: (Array.isArray(concepts) ? concepts : []).filter((c) => c?.supply).length,
    under: rows.length,
    over: (Array.isArray(concepts) ? concepts : []).filter((c) => c?.supply?.state === "OVERSUPPLIED").length,
    top: rows.sort((a, b) => b.supply.gap - a.supply.gap || (a.id < b.id ? -1 : 1)).slice(0, rules.show).map((c) => c.id),
  };
}

const num = (x, lo = -1e6, hi = 1e9) => (Number.isFinite(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Number(x) : null);
/** The browser's copy. */
export function cleanSupply(s) {
  if (!s || typeof s !== "object" || !Object.hasOwn(SUPPLY_STATES, s.state)) return null;
  return { state: s.state, demandWeekPct: num(s.demandWeekPct, -100, 1e5), supplyWeekPct: num(s.supplyWeekPct, -100, 1e5), gap: num(s.gap, -1e5, 1e5), orders: num(s.orders, 0), listings: num(s.listings, 0), perListing: num(s.perListing, 0), days: num(s.days, 0, 60) };
}
export function cleanSupplyBoard(b) {
  if (!b || typeof b !== "object") return null;
  const n = (x) => num(x, 0, 10_000) ?? 0;
  return { measured: n(b.measured), under: n(b.under), over: n(b.over), top: (Array.isArray(b.top) ? b.top : []).filter((id) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(id))).slice(0, SUPPLY.show) };
}

/** One line for a card. */
export function supplyLine(s, lang = "he") {
  if (!s || !Object.hasOwn(SUPPLY_STATES, s.state)) return null;
  const sg = (x) => `${x > 0 ? "+" : ""}${x}%`;
  return lang === "he"
    ? `🏭 ${SUPPLY_STATES[s.state].he} · הזמנות ${sg(s.demandWeekPct)} בשבוע, מודעות ${sg(s.supplyWeekPct)}`
    : `🏭 ${SUPPLY_STATES[s.state].en} · orders ${sg(s.demandWeekPct)} a week, listings ${sg(s.supplyWeekPct)}`;
}
