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

// 🔤 The names the new shops pick, with no list (the owner, 22.11: "don't rely only on the list"): the
// same daily list read for every product in the world. The words people put in new shop names are cut
// out of each domain with a dictionary of product words: the English words sellers use in the titles of
// this year's new listings (the radar's fresh pool, ≥ 3 titles each), never a generic shop word. A word,
// or two product words side by side ("butter" + "squishy" in buttersquishy), that many more new shops
// were named after this week than in the weeks before is a kind sellers are betting on. Counts only.
export const SHOP_WORDS = Object.freeze({ min: 5, max: 14, minTitles: 3, weekMin: 6, ratio: 3, minDays: 10, p: 0.001, keepDays: 21, top: 10, admit: 3 });

// Words every shop name uses, whatever it sells.
const GENERIC = new Set(("store shops online official world global market trade trading group sales deals cheap brand brands best "
  + "company center centre direct express outlet supply supplies service services solutions studio boutique collection collections "
  + "design designs digital media network international enterprise enterprises premium quality style styles goods things items product "
  + "products wholesale retail factory china china's lucky happy smart super ultra mega daily today first prime royal golden silver "
  + "women woman ladies girls girl baby kids children family house homes life living lifestyle fashion beauty health new year years "
  + "summer winter spring autumn black white color colors colour multi set sets piece pieces portable mini large small size sizes "
  + "plus pro max free fast quick easy high best") .split(/\s+/).filter(Boolean));

/** The dictionary: product words (letters only, 5–14 long) in ≥ minTitles of the new listings' titles. */
export function productVocab(titles = [], { rules = SHOP_WORDS } = {}) {
  const seen = new Map();
  for (const t of Array.isArray(titles) ? titles : []) {
    const words = new Set(String(t || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= rules.min && w.length <= rules.max && !GENERIC.has(w)));
    for (const w of words) seen.set(w, (seen.get(w) || 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n >= rules.minTitles).map(([w]) => w));
}

/** The product words inside one domain name, longest first from the left ("buttersquishy" → butter, squishy). */
export function domainWords(domain = "", vocab = new Set(), { rules = SHOP_WORDS } = {}) {
  const label = String(domain || "").toLowerCase().split(".")[0].replace(/[^a-z-]/g, "");
  const out = [];
  let i = 0;
  while (i < label.length) {
    if (label[i] === "-") { i++; continue; }
    let hit = null;
    for (let L = Math.min(rules.max, label.length - i); L >= rules.min; L--) if (vocab.has(label.slice(i, i + L))) { hit = label.slice(i, i + L); break; }
    if (hit) { out.push({ w: hit, at: i, end: i + hit.length }); i += hit.length; } else i++;
  }
  const words = [...new Set(out.map((x) => x.w))];
  const pairs = [];
  for (let k = 1; k < out.length; k++) {
    const gap = label.slice(out[k - 1].end, out[k].at);
    if ((gap === "" || gap === "-") && out[k - 1].w !== out[k].w) pairs.push(`${out[k - 1].w} ${out[k].w}`);
  }
  return { words, pairs: [...new Set(pairs)] };
}

/** One day's counts: new domains per product word and per pair of words. */
export function wordsToday(domains = [], vocab = new Set(), { rules = SHOP_WORDS } = {}) {
  const counts = {};
  for (const d of Array.isArray(domains) ? domains : []) {
    const { words, pairs } = domainWords(d, vocab, { rules });
    for (const k of [...words, ...pairs]) counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

/** The kept state { days: [read days], w: { key: { day: n } } }: a read day adds its counts, old days leave. */
export function mergeShopWords(state = {}, counts = {}, day, { rules = SHOP_WORDS } = {}) {
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  const days = [...new Set([...(Array.isArray(state?.days) ? state.days : []), day])].filter((d) => d >= oldest).sort();
  const w = {};
  for (const [k, per] of Object.entries(state?.w || {})) {
    const kept = Object.fromEntries(Object.entries(per || {}).filter(([d]) => d >= oldest && d !== day));
    if (Object.keys(kept).length) w[k] = kept;
  }
  for (const [k, n] of Object.entries(counts || {})) if (n > 0) (w[k] ||= {})[day] = n;
  return { days, w };
}

/** P(X ≥ k) for a Poisson count with mean lambda (the noise check). */
export function poissonTail(k, lambda) {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda); let cdf = term;
  for (let i = 1; i < k; i++) { term *= lambda / i; cdf += term; }
  return Math.max(0, 1 - cdf);
}

/** The words and pairs many more new shops took this week than before (a measured jump, never a guess). */
export function risingShopWords(state = {}, day, { rules = SHOP_WORDS, skip = () => false } = {}) {
  const back = (n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const days = (Array.isArray(state?.days) ? state.days : []).filter((d) => d <= day);
  const weekDays = days.filter((d) => d > back(7));
  const beforeDays = days.filter((d) => d <= back(7));
  if (days.length < rules.minDays || !weekDays.length || !beforeDays.length) return { days: days.length, measuring: true, rising: [] };
  const rows = [];
  for (const [k, per] of Object.entries(state?.w || {})) {
    if (skip(k)) continue;
    const week = weekDays.reduce((s, d) => s + (per[d] || 0), 0);
    if (week < rules.weekMin) continue;
    const before = beforeDays.reduce((s, d) => s + (per[d] || 0), 0);
    const expected = Math.max(before, 1) * (weekDays.length / beforeDays.length); // the same days, at the old rate
    if (week < rules.ratio * expected) continue;
    const p = poissonTail(week, expected);
    if (p > rules.p) continue;
    rows.push({ key: k, pair: k.includes(" "), week, before, weekDays: weekDays.length, beforeDays: beforeDays.length, times: Math.round((week / expected) * 10) / 10 });
  }
  // A pair says more than its words: a word whose pair rose too is shown through the pair.
  const pairWords = new Set(rows.filter((r) => r.pair).flatMap((r) => r.key.split(" ")));
  const kept = rows.filter((r) => r.pair || !pairWords.has(r.key));
  kept.sort((a, b) => b.times - a.times || b.week - a.week);
  return { days: days.length, measuring: false, rising: kept.slice(0, rules.top) };
}

/** The browser's copy. */
export function cleanShopWords(s) {
  if (!s || typeof s !== "object") return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e7 ? Number(x) : null);
  return {
    day: /^\d{4}-\d{2}-\d{2}$/.test(String(s.day || "")) ? s.day : null,
    days: n(s.days) ?? 0, vocab: n(s.vocab) ?? 0, measuring: s.measuring === true,
    rising: (Array.isArray(s.rising) ? s.rising : []).filter((r) => /^[a-z]{5,14}( [a-z]{5,14})?$/.test(String(r?.key || ""))).slice(0, SHOP_WORDS.top).map((r) => ({ key: r.key, week: n(r.week) ?? 0, before: n(r.before) ?? 0, times: n(r.times), added: r.added === true })),
  };
}
