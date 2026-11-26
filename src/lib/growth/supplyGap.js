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
  return { measured: n(b.measured), under: n(b.under), over: n(b.over), top: (Array.isArray(b.top) ? b.top : []).filter((id) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(id))).slice(0, SUPPLY.show), record: cleanSupplyRecord(b.record) };
}

/** One line for a card. */
export function supplyLine(s, lang = "he") {
  if (!s || !Object.hasOwn(SUPPLY_STATES, s.state)) return null;
  const sg = (x) => `${x > 0 ? "+" : ""}${x}%`;
  return lang === "he"
    ? `🏭 ${SUPPLY_STATES[s.state].he} · הזמנות ${sg(s.demandWeekPct)} בשבוע, מודעות ${sg(s.supplyWeekPct)}`
    : `🏭 ${SUPPLY_STATES[s.state].en} · orders ${sg(s.demandWeekPct)} a week, listings ${sg(s.supplyWeekPct)}`;
}

// 📦 "Room to make it", sealed and checked (the owner, 22.11: "we must be before the sellers and the
// biggest factories; they should list following us — that is the dependency"). Every kind the radar
// reads as UNDERSUPPLIED on a morning is a call: sellers should follow. Fourteen days later it is
// graded by the same store's numbers: FOLLOWED when its matching AliExpress listings grew ≥ followPct
// since the call (new sellers came in), QUIET otherwise, UNREAD when the kind was not read again within
// lateDays past due (never counted). The kinds read as BALANCED that morning are graded the same way as
// the control group, so the record says whether sellers follow the radar's call more than they would
// anyway (edge, in points, only once both sides have 3 grades). Every entry, the control group too, is
// sealed in the day's ledger (book "supply"), so nothing is picked after the fact. The worldwide check
// on 22.11 found supply-gap tools (eBay's product research, Amazon's Product Opportunity Explorer,
// ShelfTrend, Closo, SellerApp) and no published track record for any of them. Pure; the runner reads.
export const SUPPLY_CALL = Object.freeze({ gradeDays: 14, followPct: 15, lateDays: 3, keep: 3000, minEdge: 3 });

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Today's entries: a call for every UNDERSUPPLIED kind, a control for every BALANCED one; one open entry per kind and role. */
export function recordSupplyCalls(calls = [], concepts = [], today, { rules = SUPPLY_CALL } = {}) {
  const list = Array.isArray(calls) ? [...calls] : [];
  for (const c of Array.isArray(concepts) ? concepts : []) {
    const s = c?.supply;
    if (!ID.test(String(c?.id || "")) || !s || !(Number(s.listings) > 0)) continue;
    const role = s.state === "UNDERSUPPLIED" ? "call" : s.state === "BALANCED" ? "control" : null;
    if (!role || list.some((x) => x.id === c.id && x.role === role && !x.result)) continue;
    list.push({ id: c.id, role, at: today, due: addDays(today, rules.gradeDays), listings: Number(s.listings), orders: Number.isFinite(Number(s.orders)) ? Number(s.orders) : null });
  }
  return list.slice(-rules.keep);
}

/** Grades the entries whose day came, from each kind's latest [day, listings] reading. Never edits a graded one. */
export function gradeSupplyCalls(calls = [], latest = {}, today, { rules = SUPPLY_CALL } = {}) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c.result || !(c.due <= today)) return c;
    const r = latest?.[c.id];
    if (Array.isArray(r) && r[0] >= c.due && Number(r[1]) > 0 && c.listings > 0) {
      const growth = Math.round(((Number(r[1]) - c.listings) / c.listings) * 1000) / 10;
      return { ...c, result: growth >= rules.followPct ? "FOLLOWED" : "QUIET", growth, gradedAt: today };
    }
    return today > addDays(c.due, rules.lateDays) ? { ...c, result: "UNREAD", gradedAt: today } : c;
  });
}

/** The public record: calls and controls apart, and the edge once both sides have enough grades. */
export function supplyCallRecord(calls = [], { rules = SUPPLY_CALL } = {}) {
  const side = (role) => {
    const all = (Array.isArray(calls) ? calls : []).filter((c) => c.role === role);
    const graded = all.filter((c) => c.result === "FOLLOWED" || c.result === "QUIET");
    const followed = graded.filter((c) => c.result === "FOLLOWED").length;
    return { calls: all.length, graded: graded.length, followed, rate: graded.length ? Math.round((followed / graded.length) * 1000) / 10 : null, pending: all.filter((c) => !c.result).length, nextDue: all.filter((c) => !c.result).map((c) => c.due).sort()[0] || null };
  };
  const call = side("call");
  const control = side("control");
  const edge = call.graded >= rules.minEdge && control.graded >= rules.minEdge ? Math.round((call.rate - control.rate) * 10) / 10 : null;
  return { ...call, control: { graded: control.graded, followed: control.followed, rate: control.rate }, edge, followPct: rules.followPct, gradeDays: rules.gradeDays };
}

/** The book sealed every day: every entry, calls and controls, `id|day|role|listings|due|grade`. */
export function supplySealText(calls = []) {
  const lines = (Array.isArray(calls) ? calls : [])
    .filter((c) => ID.test(String(c?.id || "")) && (c.role === "call" || c.role === "control"))
    .map((c) => `${c.id}|${c.at}|${c.role}|${Math.round(Number(c.listings) || 0)}|${c.due}|${c.result || "-"}`)
    .sort();
  return lines.length ? lines.join("\n") : null;
}

/** The browser's copy of the record. */
export function cleanSupplyRecord(r) {
  if (!r || typeof r !== "object") return null;
  const n = (x) => num(x, 0, 1e6);
  return { calls: n(r.calls) ?? 0, graded: n(r.graded) ?? 0, followed: n(r.followed) ?? 0, rate: num(r.rate, 0, 100), pending: n(r.pending) ?? 0, nextDue: /^\d{4}-\d{2}-\d{2}$/.test(String(r.nextDue || "")) ? r.nextDue : null, control: { graded: n(r.control?.graded) ?? 0, followed: n(r.control?.followed) ?? 0, rate: num(r.control?.rate, 0, 100) }, edge: num(r.edge, -100, 100), followPct: SUPPLY_CALL.followPct, gradeDays: SUPPLY_CALL.gradeDays };
}
