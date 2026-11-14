// The trend radar's discovery (גילוי אוטומטי): the watch list (scripts/catalog/radar-concepts.json)
// is a person's guess, so every day the radar also reads AliExpress's own hot-products list per
// category (in English) and looks for a two-word phrase that several DIFFERENT hot items share and
// that no concept on the list covers yet ("cloud slides", "pearl claw"…). Up to `perDay` such
// phrases join the radar as trial concepts: they are measured exactly like the hand-picked ones,
// labelled "התגלה אוטומטית" with the store's own words (never translated by guess), and dropped
// after `trialDays` unless the data shows them EMERGING or RISING. A phrase with a brand, a
// character, a car/phone/console name or a kind the site does not list never joins. Pure: no I/O.
import { hasBrandName, isNotListedKind, orderCount } from "./deals.js";

export const DISCOVERY = Object.freeze({
  minItems: 3, // distinct hot items that must share the phrase
  minOrders: 300, // their recent orders together
  perDay: 3, // new trial concepts a day
  maxAuto: 24, // trial concepts on the radar at once
  trialDays: 14, // a trial concept stays this long unless it is rising
  keepStages: Object.freeze(["EMERGING", "RISING"]),
});

// The board's shop kinds for the trend board's categories (src/lib/growth/trendBoard.js).
export const CATEGORY_KIND = Object.freeze({
  rings: "rings", earrings: "earrings", necklaces: "necklaces", bracelets: "bracelets", watches: "watches", bags: "bags",
  beauty: "makeup", hair: "hair", home: "home", kitchen: "kitchen", kids: "kids", tech: "gadgets", fitness: "fitness",
  pets: "pets", clothing: "clothing", car: "car", squishy: "kids", smartwatch: "watches", earbuds: "gadgets",
});

// Store-title filler: words that say nothing about WHAT the item is.
const STOP = new Set(`a an and or the of for to in on with by from at as is new hot sale best top quality high fashion
trendy trend cute luxury free shipping style styles design creative simple elegant classic vintage retro korean
women woman womens men man mens girls girl boys boy kids kid child children baby lady ladies female male unisex adult
gift gifts present party daily wear accessories accessory jewelry jewellery decoration decor item items product
pcs pc piece pieces set sets lot pack 1pc 2pcs 3pcs size sizes large small big mini color colors colour colours
gold silver plated stainless steel metal alloy copper titanium plastic silicone cotton leather pu
black white red blue green pink purple yellow orange brown grey gray beige
2023 2024 2025 2026 2027 summer winter spring autumn fall christmas halloween new year valentine valentines
cm mm inch inches ml kg g mah usb type c led
stress relief anti funny novelty toy toys tool tools gadget gadgets supplies holder home household kitchen
soft fluffy cute lovely pretty beautiful fashionable sweet charming adorable kawaii plush warm`.split(/\s+/));

// Compatibility names in store titles ("for Tesla Model Y", "for iPhone 16"): a brand all the same,
// so a phrase with one never joins (deals.js hasBrandName covers the fashion and toy brands).
const DEVICE_WORDS = new Set(`tesla model toyota bmw mercedes benz audi honda hyundai kia ford volkswagen vw nissan mazda
skoda seat chevrolet jeep lexus volvo peugeot renault byd iphone ipad airpods macbook apple samsung galaxy xiaomi redmi
huawei pixel oppo vivo realme oneplus nintendo switch playstation ps5 xbox dyson gopro`.split(/\s+/));
const deviceWord = (phrase) => phrase.split(" ").some((w) => DEVICE_WORDS.has(w));

const wordsOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w));

/** The two-word phrases of one store title (adjacent meaningful words), each once. */
export function phrasesOf(title = "") {
  const w = wordsOf(title);
  const out = new Set();
  for (let i = 0; i + 1 < w.length; i++) if (w[i] !== w[i + 1]) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
}

/** True when the watch list already covers the phrase (every word in one concept's store words). */
export function covered(phrase, concepts = []) {
  const p = phrase.split(" ");
  return concepts.some((c) => {
    const one = (x) => x.replace(/(?:es|s)$/, "");
    const cw = new Set(String(c?.en || "").toLowerCase().split(/[^a-z0-9']+/).map(one));
    return p.every((x) => cw.has(one(x)));
  });
}

/**
 * Candidates from today's hot lists: { [categoryKey]: [store items…] } → phrases shared by at least
 * `minItems` distinct items, strongest first (items, then orders). Brands and unlisted kinds out.
 */
export function discover(lists = {}, concepts = [], { rules = DISCOVERY } = {}) {
  const found = new Map();
  for (const [category, list] of Object.entries(lists || {})) {
    const seen = new Set();
    for (const x of Array.isArray(list) ? list : []) {
      const id = String(x?.product_id || "");
      const title = String(x?.product_title || "");
      const v = orderCount(x);
      if (!/^\d{6,20}$/.test(id) || seen.has(id) || !title || v === null) continue;
      seen.add(id);
      if (hasBrandName(title) || isNotListedKind(title)) continue;
      for (const p of phrasesOf(title)) {
        const f = found.get(p) || { en: p, ids: new Set(), orders: 0, kinds: new Map() };
        if (f.ids.has(id)) continue;
        f.ids.add(id);
        f.orders += v;
        f.kinds.set(category, (f.kinds.get(category) || 0) + 1);
        found.set(p, f);
      }
    }
  }
  return [...found.values()]
    .filter((f) => f.ids.size >= rules.minItems && f.orders >= rules.minOrders && !covered(f.en, concepts) && !hasBrandName(f.en) && !deviceWord(f.en) && !isNotListedKind(f.en))
    .map((f) => {
      const category = [...f.kinds.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { en: f.en, items: f.ids.size, orders: f.orders, category, kind: CATEGORY_KIND[category] || "" };
    })
    .sort((a, b) => b.items - a.items || b.orders - a.orders || (a.en < b.en ? -1 : 1));
}

export const autoId = (en) => `auto-${String(en).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34)}`;

/**
 * Today's trial concepts: yesterday's, minus those past their trial that are not rising, plus up to
 * `perDay` new candidates (never one already tracked or covered). Each keeps when and why it joined.
 */
export function admitDiscovered(current = [], candidates = [], { concepts = [], stages = {}, now = Date.now(), rules = DISCOVERY } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const age = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
  const kept = (Array.isArray(current) ? current : []).filter((c) => c?.id && c.en && (age(c.found) < rules.trialDays || rules.keepStages.includes(stages[c.id])));
  const ids = new Set([...kept.map((c) => c.id), ...concepts.map((c) => c.id)]);
  let added = 0;
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    if (kept.length >= rules.maxAuto || added >= rules.perDay) break;
    const id = autoId(cand.en);
    if (ids.has(id) || covered(cand.en, [...concepts, ...kept])) continue;
    kept.push({ id, he: cand.en, en: cand.en, kind: cand.kind || "", hq: [], auto: true, found: today, why: { items: cand.items, orders: cand.orders, category: cand.category } });
    ids.add(id);
    added++;
  }
  return kept;
}
