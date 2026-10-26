// The trend board: what is hot on AliExpress today, by category, for the owner
// to choose from (scripts/catalog/trend-finder.mjs builds it every morning).
//
// Truth rules:
//   • "Hot" means AliExpress's own hot-products list (aliexpress.affiliate.
//     hotproduct.query, ship to Israel, prices in ILS) on the day it was read,
//     never a number we made up. Sales counts, ratings and reviews from the
//     API are dropped: the site never shows them.
//   • A category is "searched in Israel today" only when a Google Trends Israel
//     term really matches its words (a shared 4-letter stem), with the term.
//   • An item needs the owner's own tracked link (s.click.aliexpress.com), a
//     real store photo and a store price in ILS; otherwise it is left out.
//   • Nothing reaches the site from here by itself: the owner picks items and
//     the "Add trend products" workflow adds exactly those, re-read from the API.

export const TREND_SOURCE = "aliexpress.affiliate.hotproduct.query";
export const PER_CATEGORY = 8;

/** Categories: AliExpress search words (English works best there) and the Hebrew words trends are matched on. */
export const TREND_CATEGORIES = Object.freeze([
  { key: "rings", he: "טבעות", keywords: "women ring zircon", words: ["טבעת", "טבעות", "ring", "rings"] },
  { key: "earrings", he: "עגילים", keywords: "women earrings", words: ["עגיל", "עגילים", "earrings"] },
  { key: "necklaces", he: "שרשראות", keywords: "women necklace pendant", words: ["שרשרת", "שרשראות", "תליון", "necklace"] },
  { key: "bracelets", he: "צמידים", keywords: "women bracelet", words: ["צמיד", "צמידים", "bracelet"] },
  { key: "watches", he: "שעונים", keywords: "women watch", words: ["שעון", "שעונים", "watch"] },
  { key: "bags", he: "תיקים", keywords: "women handbag", words: ["תיק", "תיקים", "ארנק", "bag"] },
  { key: "beauty", he: "איפור וטיפוח", keywords: "makeup beauty tools", words: ["איפור", "טיפוח", "שפתון", "makeup"] },
  { key: "hair", he: "שיער", keywords: "hair accessories women", words: ["שיער", "קליפס", "hair"] },
  { key: "home", he: "בית ועיצוב", keywords: "aesthetic room decor", words: ["עיצוב", "בית", "דקור", "decor"] },
  { key: "kitchen", he: "מטבח", keywords: "kitchen gadgets", words: ["מטבח", "kitchen"] },
  { key: "kids", he: "ילדים ותינוקות", keywords: "kids toys", words: ["ילדים", "תינוק", "צעצוע", "toys"] },
  { key: "tech", he: "גאדג'טים", keywords: "aesthetic phone case", words: ["טלפון", "אוזניות", "גאדג", "phone"] },
  { key: "fitness", he: "ספורט וכושר", keywords: "women yoga gym set", words: ["כושר", "ספורט", "fitness"] },
  { key: "pets", he: "חיות מחמד", keywords: "pet supplies", words: ["כלב", "חתול", "חיות", "pet"] },
]);

const https = (u) => String(u || "").trim().replace(/^http:\/\//, "https://").replace(/^\/\//, "https://");
const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;
const words = (s) => String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));

/** One API product → a board item, or null when a real field is missing. No sales, rating or review numbers. */
export function toTrendItem(x = {}, { category, now = Date.now() } = {}) {
  const id = String(x.product_id || "");
  const link = String(x.promotion_link || "").trim();
  const image = https(x.product_main_image_url);
  const price = Number(x.target_sale_price);
  if (!/^\d{6,20}$/.test(id) || !OWN_LINK.test(link) || !/^https:\/\/\S+$/.test(image) || !(price > 0) || String(x.target_sale_price_currency || "") !== "ILS") return null;
  const original = Number(x.target_original_price);
  const video = https(x.product_video_url);
  return {
    id,
    category,
    title: String(x.product_title || "").replace(/\s+/g, " ").trim().slice(0, 140),
    image,
    price: Math.round(price * 100) / 100,
    originalPrice: original > price ? Math.round(original * 100) / 100 : null,
    currency: "ILS",
    link,
    itemUrl: https(x.product_detail_url) || `https://www.aliexpress.com/item/${id}.html`,
    video: /^https:\/\/\S+\.mp4(\?|$)/i.test(video) ? video : "",
    checkedAt: new Date(now).toISOString(),
  };
}

/** Google Trends Israel terms that really match a category's words (with the term). */
export function trendHits(trends = [], category) {
  const cw = (category?.words || []).flatMap(words);
  return (Array.isArray(trends) ? trends : [])
    .filter((t) => words(t?.term).some((w) => cw.some((c) => sameWord(w, c))))
    .map((t) => ({ term: String(t.term), source: t.source || "google_trends_il", observedAt: t.observedAt || null }));
}

/**
 * The board: per category up to PER_CATEGORY items in AliExpress's own order,
 * an item only once, and categories that match today's Google Trends first.
 * `listed` marks items already on the site.
 */
export function buildBoard({ results = {}, trends = [], listed = [], now = Date.now() } = {}) {
  const seen = new Set();
  const onSite = new Set((listed || []).map(String));
  const categories = TREND_CATEGORIES.map((c, order) => {
    const items = [];
    for (const x of Array.isArray(results[c.key]) ? results[c.key] : []) {
      const item = toTrendItem(x, { category: c.key, now });
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push({ ...item, onSite: onSite.has(item.id) });
      if (items.length >= PER_CATEGORY) break;
    }
    return { key: c.key, he: c.he, order, searchedToday: trendHits(trends, c), items };
  });
  categories.sort((a, b) => (b.searchedToday.length > 0) - (a.searchedToday.length > 0) || a.order - b.order);
  return {
    generatedAt: new Date(now).toISOString(),
    source: TREND_SOURCE,
    note: "AliExpress's hot-products list for delivery to Israel, prices in ILS on the day read. Nothing here is on the site until the owner adds it.",
    categories: categories.map(({ order, ...c }) => c),
  };
}

const AE_HOST = (h) => h === "aliexpress.com" || h.endsWith(".aliexpress.com") || h === "aliexpress.us" || h.endsWith(".aliexpress.us");

/**
 * What the owner pasted into the "Add trend products" form, at most 10:
 *   an item number                                   → { id }
 *   a store product page (…aliexpress.com/item/<n>.html) → { id }
 *   her own tracked link (https://s.click.aliexpress.com/e/…) → { link }
 * Anything else is refused (never guessed).
 */
export function parseItems(input = "") {
  const out = new Map();
  for (const raw of String(input).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    if (/^\d{6,20}$/.test(raw)) { out.set(`id:${raw}`, { id: raw }); continue; }
    let u = null;
    try { u = new URL(raw); } catch { /* not a link */ }
    const page = u && u.protocol === "https:" && AE_HOST(u.hostname) ? u.pathname.match(/^\/item\/(\d{6,20})\.html$/) : null;
    if (page) { out.set(`id:${page[1]}`, { id: page[1] }); continue; }
    if (u && u.protocol === "https:" && u.hostname === "s.click.aliexpress.com" && /^\/e\/[\w-]+\/?$/.test(u.pathname)) {
      out.set(`link:${u.href}`, { link: u.href });
      continue;
    }
    throw new Error(`not an AliExpress item number or link: ${raw.slice(0, 60)}`);
  }
  return [...out.values()].slice(0, 10);
}

/** Item ids the owner typed into the "Add trend products" form: numbers only, at most 10. */
export function parseIds(input = "") {
  const ids = String(input).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const bad = ids.filter((s) => !/^\d{6,20}$/.test(s));
  if (bad.length) throw new Error(`not an AliExpress item id: ${bad.slice(0, 3).join(", ")}`);
  return [...new Set(ids)].slice(0, 10);
}
