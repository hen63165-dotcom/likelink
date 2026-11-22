// 🏭 The factories that jump (the owner, 22.11: "see the orders and the jumps of the big factories, as
// the squishy really started in the factories abroad, without registering anywhere"). Many AliExpress
// stores are the factories themselves, and the store's own answer names the store each listing belongs
// to (shop_id). So the radar follows the factories, not only the products: for every store with three
// or more of this year's new listings in its pool, the MEDIAN weekly growth of their 30-day orders (one
// viral listing cannot fake a factory), and their orders together now and a week before. A factory whose
// new listings run together is betting on something before anyone hears of it; its fastest listing is
// named. The store's own numbers through the official affiliate API, with the keys the radar already
// has: no new registration. Measured, never a forecast. Pure: the runner reads.

import { HOT, itemMomentum } from "./radarOpportunity.js";
import { isSeasonal } from "./freshRisers.js";

export const FACTORY = Object.freeze({ minListings: 3, minMedianWeekPct: 25, minOrders: 300, show: 8 });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The factories whose new listings run together, the strongest first. */
export function factoryJumps(pool = {}, items = {}, { rules = FACTORY } = {}) {
  const byShop = new Map();
  let withShop = 0;
  for (const e of Object.values(pool || {})) {
    if (!e?.shop || isSeasonal(e.title)) continue;
    withShop++;
    const m = itemMomentum(items?.[e.id] || [], { rules: HOT });
    if (m.weekPct === null || !Number.isFinite(m.orders) || !Number.isFinite(m.ordersBefore)) continue;
    const list = byShop.get(e.shop) || [];
    list.push({ e, m });
    byShop.set(e.shop, list);
  }
  const rows = [];
  for (const [shop, list] of byShop) {
    if (list.length < rules.minListings) continue;
    const med = Math.round(median(list.map((x) => x.m.weekPct)) * 10) / 10;
    const orders = list.reduce((s, x) => s + x.m.orders, 0);
    const before = list.reduce((s, x) => s + x.m.ordersBefore, 0);
    if (med < rules.minMedianWeekPct || orders < rules.minOrders) continue;
    const lead = [...list].sort((a, b) => b.m.weekPct - a.m.weekPct)[0];
    rows.push({ shop, listings: list.length, medianWeekPct: med, orders, ordersBefore: before, lead: { id: lead.e.id, title: lead.e.title, image: lead.e.image, buy: lead.e.link, weekPct: lead.m.weekPct } });
  }
  rows.sort((a, b) => b.medianWeekPct - a.medianWeekPct || b.orders - a.orders || (a.shop < b.shop ? -1 : 1));
  return { withShop, factories: byShop.size, jumping: rows.length, top: rows.slice(0, rules.show) };
}
