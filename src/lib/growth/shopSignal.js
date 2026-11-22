// 🏪 The shops opening (the owner, 22.11: "for every door that closes, ten open; see the orders another
// way, with no connection at all"). Before a product is a hit, sellers bet on it: they open a store for
// it (the squishy had buttersquishy.com and tabasquishy.com). Every domain registered in the world on a
// day is published the next morning in a free public list (WhoisDS, "may be reused, including for
// commercial purposes, without a license and without any payment"; robots.txt closes only /login/), so
// the radar counts, every morning, the new domains named for each kind it watches: this week against the
// week before. No key, no account, one download a day. Counts only on the board; never a link to the new
// sites (a new domain can be anything). Evidence beside the orders, never a call by itself. Pure: the
// runner downloads.

export const SHOPS = Object.freeze({ minCompact: 8, weekDays: 7, keepDays: 21, rising: 3, top: 8 });

/** The free list of the domains registered on `day` (a zip with one domain per line). */
export function nrdUrl(day) {
  return `https://www.whoisds.com//whois-database/newly-registered-domains/${Buffer.from(`${day}.zip`).toString("base64")}/nrd`;
}

/** A kind's names as they appear in a domain: the words joined, or with hyphens ("butter squishy" → buttersquishy, butter-squishy). */
export function shopNames(en = "", { rules = SHOPS } = {}) {
  const w = String(en || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  const addBoth = (ws) => { const j = ws.join(""); if (j.length >= rules.minCompact) { out.add(j); out.add(ws.join("-")); } };
  if (w.length >= 2) addBoth(w);
  if (w.length >= 3) addBoth(w.slice(-2));
  return [...out];
}

/** Today's count per kind: the new domains whose name holds one of the kind's names. */
export function shopsToday(domains = [], kinds = [], { rules = SHOPS } = {}) {
  const names = (Array.isArray(kinds) ? kinds : []).map((k) => [k.id, shopNames(k.en, { rules })]).filter(([, n]) => n.length);
  const counts = {};
  for (const d of Array.isArray(domains) ? domains : []) {
    const label = String(d || "").toLowerCase().split(".")[0];
    if (!label) continue;
    for (const [id, ns] of names) if (ns.some((n) => label.includes(n))) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/** Kept days merged (state: kind → day → count), and each kind's week against the week before. */
export function mergeShops(state = {}, counts = {}, day, kindIds = [], { rules = SHOPS } = {}) {
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  const out = {};
  for (const [id, days] of Object.entries(state || {})) {
    const kept = Object.fromEntries(Object.entries(days || {}).filter(([d]) => d >= oldest));
    if (Object.keys(kept).length) out[id] = kept;
  }
  for (const id of kindIds) (out[id] ||= {})[day] = counts[id] || 0; // a read day with none is a measured zero
  return out;
}

export function shopsOf(days = {}, day, { rules = SHOPS } = {}) {
  const back = (n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const sum = (from, to) => Object.entries(days || {}).filter(([d]) => d > from && d <= to).reduce((s, [, n]) => s + (Number(n) || 0), 0);
  const read = Object.keys(days || {}).filter((d) => d > back(rules.weekDays)).length;
  if (!read) return null;
  const week = sum(back(rules.weekDays), day);
  const prev = sum(back(2 * rules.weekDays), back(rules.weekDays));
  return { week, prev, days: read, rising: week >= rules.rising && week > prev };
}

/** The browser's copy. */
export function cleanShops(s) {
  if (!s || typeof s !== "object") return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e6 ? Math.round(Number(x)) : null);
  if (n(s.week) === null || n(s.prev) === null) return null;
  return { week: n(s.week), prev: n(s.prev), days: n(s.days) ?? 0, rising: s.rising === true };
}
