// The radar's world pulse (the owner, 2026-11-15: "the radar must spot trends before they become a
// hit anywhere in the world, not only on AliExpress, and then find them on AliExpress"). Free and
// public sources only, each read once a day and only where its robots.txt allows:
//   - Google's autocomplete in four English-speaking markets (US, UK, Canada, Australia) and
//     YouTube's in the US: is the product's English phrase searched there? (levels, never counts);
//   - Google Trends' daily trending searches in the same four countries: a product phrase in today's
//     trends there is already a hype, and a trending term that sells on AliExpress becomes a new
//     concept on the radar (found in the world first, then on AliExpress).
// SPREADING (more markets search it than two to fourteen days ago) is the early worldwide signal.
// Pure: the radar runner (scripts/catalog/trend-radar.mjs) does the reading.

export const WORLD_MARKETS = Object.freeze([
  Object.freeze({ id: "us", gl: "us", he: "ארה״ב" }),
  Object.freeze({ id: "gb", gl: "gb", he: "בריטניה" }),
  Object.freeze({ id: "ca", gl: "ca", he: "קנדה" }),
  Object.freeze({ id: "au", gl: "au", he: "אוסטרליה" }),
]);
export const TRENDS_GEOS = Object.freeze(["US", "GB", "CA", "AU"]);
export const trendsRssUrl = (geo) => `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
const GEO_HE = { US: "ארה״ב", GB: "בריטניה", CA: "קנדה", AU: "אוסטרליה" };

export const WORLD = Object.freeze({
  keep: 60, // daily readings per concept
  faint: 1, // completions from which a phrase is searched at all
  aware: 3, // …and from which it is common
  spreadFrom: 2, // a reading at least this many days older is compared…
  spreadTo: 14, // …and at most this many
  minItems: 3, // a trending term is a product when this many matching items sell on AliExpress…
  minOrders: 300, // …with at least this many orders between them in 30 days
});

export const WORLD_STATES = Object.freeze({
  VIRAL_NOW: { he: "בטרנדים של גוגל היום", hint: "כבר הייפ בעולם: מופיע היום בחיפושים החמים של גוגל" },
  SPREADING: { he: "מתפשט בעולם", hint: "מתחילים לחפש את זה ביותר מדינות מאשר לפני כמה ימים: סימן מוקדם" },
  EARLY: { he: "מתחילים לחפש בעולם", hint: "מחפשים את זה רק במדינה אחת או שתיים: מוקדם" },
  WIDE: { he: "מחפשים בהרבה מדינות", hint: "כבר מוכר בעולם" },
  NONE: { he: "עוד לא מחפשים בעולם", hint: "אין עדיין השלמות לחיפוש באנגלית" },
  UNVERIFIED: { he: "עוד לא נמדד בעולם", hint: "אין עדיין מדידה" },
});

const level = (n, rules = WORLD) => (Number.isFinite(n) ? (n >= rules.aware ? "AWARE" : n >= rules.faint ? "FAINT" : "NONE") : null);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** One day's world reading: completions per market (null = no answer), YouTube US, today's trends geos. */
export function worldReading({ by = {}, yt = null, trends = [] } = {}, { now = Date.now() } = {}) {
  const out = {};
  for (const m of WORLD_MARKETS) out[m.id] = Number.isFinite(by[m.id]) ? by[m.id] : null;
  return { d: new Date(now).toISOString().slice(0, 10), by: out, yt: Number.isFinite(yt) ? yt : null, trends: (Array.isArray(trends) ? trends : []).filter((g) => TRENDS_GEOS.includes(g)) };
}

/** Adds today's reading (one per day; a later one the same day replaces it). */
export function addWorld(history = [], reading, { rules = WORLD } = {}) {
  const prev = (Array.isArray(history) ? history : []).filter((r) => r && r.d && r.d !== reading.d);
  return [...prev, reading].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-rules.keep);
}

/** How many sources show the phrase searched (FAINT or more) in one reading: the four markets + YouTube. */
export function spreadOf(r, { rules = WORLD } = {}) {
  if (!r) return null;
  const levels = [...WORLD_MARKETS.map((m) => level(r.by?.[m.id], rules)), level(r.yt, rules)].filter((l) => l !== null);
  if (!levels.length) return null;
  return { searched: levels.filter((l) => l !== "NONE").length, aware: levels.filter((l) => l === "AWARE").length, answered: levels.length };
}

/** The world state of one concept from its history (pure; tested). */
export function worldPulseOf(history = [], { rules = WORLD } = {}) {
  const rs = (Array.isArray(history) ? history : []).filter((r) => r?.d);
  const now = rs[rs.length - 1];
  const today = spreadOf(now, { rules });
  if (!now || !today) return { state: "UNVERIFIED", he: WORLD_STATES.UNVERIFIED.he, searched: null, of: null, trends: [], evidence: [] };
  const dayMs = 86_400_000;
  const older = [...rs].reverse().find((r) => {
    const gap = (Date.parse(now.d) - Date.parse(r.d)) / dayMs;
    return gap >= rules.spreadFrom && gap <= rules.spreadTo && spreadOf(r, { rules });
  });
  const before = older ? spreadOf(older, { rules }) : null;
  const trends = Array.isArray(now.trends) ? now.trends : [];
  let state;
  if (trends.length) state = "VIRAL_NOW";
  else if (before && today.searched > before.searched) state = "SPREADING";
  else if (today.aware >= 3) state = "WIDE";
  else if (today.searched >= 1) state = "EARLY";
  else state = "NONE";
  const where = WORLD_MARKETS.filter((m) => level(now.by?.[m.id], rules) && level(now.by?.[m.id], rules) !== "NONE").map((m) => m.he);
  if (level(now.yt, rules) && level(now.yt, rules) !== "NONE") where.push("יוטיוב");
  const dm = (d) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;
  const evidence = [];
  if (trends.length) evidence.push(`בחיפושים החמים של גוגל היום ב${trends.map((g) => GEO_HE[g] || g).join(", ")} (${dm(now.d)}).`);
  evidence.push(where.length ? `מחפשים את זה באנגלית ב: ${where.join(", ")} (${dm(now.d)}).` : `באנגלית עוד אין השלמות לחיפוש בארה״ב, בריטניה, קנדה, אוסטרליה ויוטיוב (${dm(now.d)}).`);
  if (before && older) evidence.push(`לפני (${dm(older.d)}): ב־${before.searched} מקורות; היום: ב־${today.searched}.`);
  return { state, he: WORLD_STATES[state].he, searched: today.searched, of: today.answered, trends, evidence };
}

/** The concepts whose English phrase appears in a country's trending searches today (geo → ids). */
export function trendingAbroad(concepts = [], termsByGeo = {}) {
  const out = {};
  for (const [geo, terms] of Object.entries(termsByGeo || {})) {
    const ts = (Array.isArray(terms) ? terms : []).map(norm).filter((t) => t.length >= 4);
    for (const c of Array.isArray(concepts) ? concepts : []) {
      const phrase = norm(c?.en);
      const short = phrase.split(" ").slice(0, 2).join(" ");
      if (!phrase) continue;
      if (ts.some((t) => t.includes(phrase) || (short.length >= 6 && t.includes(short)) || (t.length >= 6 && phrase.includes(t)))) (out[c.id] ||= []).push(geo);
    }
  }
  return out;
}

/**
 * The kinds of things a shopper buys, as words: a trending term must name one to be a product trend
 * (2026-11-15, the first run admitted "ronaldinho", "gta vi" and "actor": people and games sell
 * merch on AliExpress, but they are not a product trend, and a celebrity or game is never ours).
 */
export const PRODUCT_NOUNS = new Set(("squishy toy toys plush doll fidget ring rings earring earrings necklace bracelet anklet watch charm " +
  "bag bags wallet purse backpack tote case cover holder stand mount charger cable lamp light lights led projector speaker earbuds " +
  "headphones mic microphone camera printer fan heater humidifier diffuser bottle cup mug tumbler glass jar box organizer rack shelf " +
  "hanger hook basket bin dispenser brush comb clip clips scrunchie wig mirror towel blanket pillow cushion sheet slippers socks shoes " +
  "sneakers boots dress skirt jacket hoodie pajamas swimsuit leggings hat cap scarf gloves sunglasses glasses mat rug curtain sticker " +
  "stickers puzzle blocks game kit tool tools knife peeler grater chopper blender mixer pan pot spatula sponge cleaner mop broom vacuum " +
  "trimmer shaver massager roller curler straightener dryer iron collar leash feeder litter scratcher perch bed toyset nail lashes " +
  "lipstick gloss serum mask patch tape planner pen pencil notebook keychain figure figurine sticker magnet magnets tiles slime putty")
  .split(/\s+/));

/**
 * Is a trending search term a product people buy? AliExpress's answer for it: at least `minItems`
 * items whose own title holds every word of the term, with `minOrders` orders between them in 30
 * days (pure; tested). Items: [{ title, orders }].
 */
export function productTrend(term, items = [], { rules = WORLD } = {}) {
  const words = norm(term).split(" ").filter((w) => w.length >= 3);
  if (!words.length || words.length > 5) return { ok: false, reason: "words" };
  if (!words.some((w) => PRODUCT_NOUNS.has(w) || PRODUCT_NOUNS.has(w.replace(/e?s$/, "")))) return { ok: false, reason: "not_a_product_word" };
  const match = (Array.isArray(items) ? items : []).filter((x) => { const t = norm(x?.title); return words.every((w) => t.includes(w)); });
  const orders = match.reduce((s, x) => s + (Number(x?.orders) || 0), 0);
  if (match.length < rules.minItems) return { ok: false, reason: "few_items", items: match.length, orders };
  if (orders < rules.minOrders) return { ok: false, reason: "few_orders", items: match.length, orders };
  return { ok: true, items: match.length, orders };
}
