// 🔎 The radar's evidence, open to anyone (the owner, 22.11: every deep research she runs says the radar
// is behind and unproven; an outside check that day could not get an independent daily order history for
// the items the radar showed, so it would not take the growth numbers as facts). For every new-product
// call the radar made, this file holds the store's own 30-day order count as the radar read it each day,
// from 14 days before the call to today, next to the call's day, its base (sealed in the day's ledger,
// radarLedger.js), its due day and its grade (HIT at +50% in 14 days, never edited). Anyone can check a
// grade against the readings, and the readings against AliExpress's own page on the day.
// Graded calls are always in it; an open call only while the board itself is open (the trial), the same
// rule as the public board (radar-state.mjs). Pure: the packer writes it.

import { FRESH } from "./freshRisers.js";

export const EVIDENCE = Object.freeze({ v: 1, before: 14, maxCalls: 400 });

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The public evidence of every new-product call: the call, its grade, and the daily readings behind it.
 * The yardsticks' picks (radarBaseline.js: the simple ranking and chance) come with their readings too,
 * under the same rule, so the comparison can be re-graded by anyone as well.
 */
export function evidenceOf({ freshCalls = [], items = {}, open = false, today = null, baseline = null } = {}) {
  const shown = (list) => (Array.isArray(list) ? list : [])
    .filter((c) => /^\d{6,20}$/.test(String(c?.id || "")) && DAY.test(String(c?.at || "")) && (c.result || open))
    .slice(-EVIDENCE.maxCalls);
  const withReadings = (list) => shown(list)
    .map((c) => {
      const from = addDays(c.at, -EVIDENCE.before);
      const readings = (Array.isArray(items?.[c.id]) ? items[c.id] : [])
        .filter((r) => Array.isArray(r) && DAY.test(String(r[0])) && Number.isFinite(Number(r[1])) && r[0] >= from)
        .map((r) => [r[0], Number(r[1])]);
      return {
        id: String(c.id), title: String(c.title || "").slice(0, 160), at: c.at, due: c.due || null, base: Number.isFinite(c.base) ? c.base : null,
        result: c.result === "HIT" || c.result === "MISS" ? c.result : null, growth: Number.isFinite(c.growth) ? c.growth : null, gradedAt: c.gradedAt || null,
        page: `https://www.aliexpress.com/item/${c.id}.html`, readings,
        ...(DAY.test(String(c.rebuilt || "")) ? { rebuilt: c.rebuilt } : {}),
      };
    });
  const calls = withReadings(freshCalls);
  const graded = calls.filter((c) => c.result);
  const out = {
    v: EVIDENCE.v, at: today,
    rule: { book: "fresh", hitPct: FRESH.hitPct, gradeDays: FRESH.gradeDays, newBase: FRESH.newBase, unit: "the store's own count of orders in the last 30 days, read once a day" },
    record: { calls: calls.length, graded: graded.length, hits: graded.filter((c) => c.result === "HIT").length, open: calls.length - graded.length },
    calls,
  };
  if (baseline && typeof baseline === "object") out.baseline = { naive: withReadings(baseline.naive), random: withReadings(baseline.random) };
  return out;
}
