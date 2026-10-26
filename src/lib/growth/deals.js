// Deals: cheap, hot, well-rated AliExpress items by category (the owner,
// 2026-10-26: "prices the audience loves — cheap, worth it, reliable, high
// rating, deals, the hottest products in every category, that look a million
// dollars").
//
// Pure rules, shared by the trend board (scripts/catalog/trend-finder.mjs),
// the server's daily import (api/_utils/aliexpressAffiliate.mjs) and the
// "Add trend products" step. Truth rules:
//   • Rating and orders come from AliExpress's own answer (evaluate_rate,
//     lastest_volume) and are used only to choose. They are never stored on
//     a product and never shown on the site.
//   • A deal is the store's own price and its own listed original price
//     (target_original_price), in ILS, shipping to Israel, on the day read.
//   • Coupon codes: the affiliate search returns none (probe, 2026-10-26:
//     0 of 150 items carried promo_code_info), so none is shown or invented.
//   • An item named after a luxury or tech brand is never picked: on
//     AliExpress such a name is an imitation, not the brand.
//   • The title is built only from words in the store's own title.

import { TREND_CATEGORIES } from "./trendBoard.js";

/** Choosing rules (AliExpress's own numbers, read the same day). */
export const DEAL_RULES = Object.freeze({ minPositivePct: 95, minOrders: 300, minPrice: 4 });

/** Per category: the most a "cheap" item costs (ILS, the store's "from" price), the site's kind and category. */
const CATEGORY_DEALS = Object.freeze({
  rings: { maxPrice: 30, kind: "rings", category: "Accessories", noun: "טבעת" },
  earrings: { maxPrice: 30, kind: "earrings", category: "Accessories", noun: "עגילים" },
  necklaces: { maxPrice: 40, kind: "necklaces", category: "Accessories", noun: "שרשרת" },
  bracelets: { maxPrice: 40, kind: "bracelets", category: "Accessories", noun: "צמיד" },
  watches: { maxPrice: 70, kind: "watches", category: "Accessories", noun: "שעון" },
  bags: { maxPrice: 90, kind: "bags", category: "Fashion", noun: "תיק" },
  beauty: { maxPrice: 50, kind: "makeup", category: "Beauty", noun: "" },
  hair: { maxPrice: 30, kind: "hair", category: "Beauty", noun: "" },
  home: { maxPrice: 60, kind: "home", category: "Home", noun: "" },
  kitchen: { maxPrice: 50, kind: "kitchen", category: "Home", noun: "" },
  kids: { maxPrice: 60, kind: "kids", category: "Kids", noun: "" },
  tech: { maxPrice: 60, kind: "gadgets", category: "Tech", noun: "" },
  fitness: { maxPrice: 80, kind: "fitness", category: "Fitness", noun: "" },
  pets: { maxPrice: 50, kind: "pets", category: "Pets", noun: "" },
});

export const DEAL_CATEGORIES = Object.freeze(TREND_CATEGORIES.map((c) => Object.freeze({ ...c, ...CATEGORY_DEALS[c.key] })));
export const dealCategory = (key) => DEAL_CATEGORIES.find((c) => c.key === key) || null;

// Names that, on AliExpress, mean an imitation of the brand (never the brand itself).
const BRAND_IMITATION = /\b(pandora|cartier|chanel|dior|gucci|louis\s*vuitton|\blv\b|hermes|herm[eè]s|tiffany|bvlgari|bulgari|van\s*cleef|rolex|omega|cartier|prada|fendi|versace|balenciaga|ysl|saint\s*laurent|swarovski|michael\s*kors|apple|airpods?|iphone|samsung|xiaomi|dyson|disney|marvel|nike|adidas|stanley|lego|pokemon|hello\s*kitty|sanrio)\b|פנדורה|קרטייה|שאנל|דיור|גוצ'י|לואי\s*ויטון|טיפאני|רולקס|סברובסקי|אפל|איירפודס|דיסני|נייקי|אדידס/i;
// Items the site does not list whatever their numbers.
const NOT_LISTED = /\b(vape|e-?cig|cigarette|knife|blade|dagger|gun|pistol|airsoft|taser|stun|pepper\s*spray|sex|adult|lingerie|erotic|weight\s*loss|slimming|pill|supplement|medicine|tattoo\s*gun|replica|copy)\b|סיגרי|סכין|אקדח|טייזר|גז\s*פלפל|ארוטי|הרזיה|כדורי\s*הרזיה|גלולות|תוסף\s*תזונה|רפליקה|העתק\b/i;

/** "97.4%" → 97.4 (null when AliExpress did not answer one). */
export function positivePct(x = {}) {
  const n = parseFloat(String(x.evaluate_rate ?? "").replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

/** AliExpress's recent orders count (null when missing). */
export function orderCount(x = {}) {
  const n = Number(x.lastest_volume);
  return Number.isFinite(n) ? n : null;
}

const priceOf = (x) => (String(x?.target_sale_price_currency || "") === "ILS" ? Number(x.target_sale_price) : NaN);

/**
 * Whether one API item is a deal for this category, and why not. Every
 * number is AliExpress's own; a missing number never passes.
 */
export function dealCheck(x = {}, category, rules = DEAL_RULES) {
  const title = String(x.product_title || "");
  const price = priceOf(x);
  const pos = positivePct(x);
  const orders = orderCount(x);
  if (!(price > 0)) return { ok: false, reason: "no_ils_price" };
  if (price < rules.minPrice) return { ok: false, reason: "price_too_low" };
  if (category?.maxPrice && price > category.maxPrice) return { ok: false, reason: "price_above_cap" };
  if (pos === null || pos < rules.minPositivePct) return { ok: false, reason: "rating_below_rule" };
  if (orders === null || orders < rules.minOrders) return { ok: false, reason: "orders_below_rule" };
  if (BRAND_IMITATION.test(title)) return { ok: false, reason: "brand_name" };
  if (NOT_LISTED.test(title)) return { ok: false, reason: "not_listed_kind" };
  return { ok: true };
}

/** The deals of one category: passing items, discounted first, then by orders (AliExpress's own order otherwise). */
export function rankDeals(list = [], category, { exclude = new Set(), rules = DEAL_RULES } = {}) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => {
      const id = String(x?.product_id || "");
      if (!id || seen.has(id) || exclude.has(id)) return false;
      seen.add(id);
      return dealCheck(x, category, rules).ok;
    })
    .sort((a, b) => {
      const da = Number(a.x.target_original_price) > priceOf(a.x) ? 1 : 0;
      const db = Number(b.x.target_original_price) > priceOf(b.x) ? 1 : 0;
      return db - da || (orderCount(b.x) || 0) - (orderCount(a.x) || 0) || a.i - b.i;
    })
    .map(({ x }) => x);
}

// Words of the store's own title that describe the item (never a claim).
const FEATURES = [
  [/מואסניט|moissanite/i, "מואסניט"],
  [/זרקון|zircon|\bcz\b/i, "זרקון"],
  [/פנינ|pearl/i, "פנינים"],
  [/קריסטל|crystal|rhinestone/i, "קריסטלים"],
  [/\b925\b|s925|כסף\s*סטרלינג|sterling/i, "כסף 925"],
  [/נירוסטה|פלדת\s*אל[- ]?חלד|stainless/i, "נירוסטה"],
  [/מצופה\s*זהב|ציפוי\s*זהב|gold[\s-]*plated|\b1[48]k\b/i, "ציפוי זהב"],
  [/טניס|tennis/i, "טניס"],
  [/\bלב\b|heart/i, "לב"],
  [/פרפר|butterfly/i, "פרפר"],
  [/פרח|flower/i, "פרח"],
  [/מתכוונ|adjustable/i, "מתכוונן"],
  [/מינימליסט|minimalist/i, "מינימליסטי"],
  [/וינטג|vintage|רטרו|retro/i, "וינטג'"],
];

const NOISE = /\b(20[12]\d|new|hot|sale|free\s*shipping|high\s*quality|original|fashion|trendy|luxury|women'?s?|girls?|gift)\b|חדש(?:ה|ים|ות)?|חם|מכירה\s*חמה|משלוח\s*חינם|איכות\s*גבוהה|באיכות\s*גבוהה|מקורי|100%|יוקרה|אופנה(?:תי|תית)?/gi;
const KEEP_CAPS = new Set(["LED", "USB", "RGB", "UV", "3D", "PU"]);

/** The store's title without years, sale words, brand codes in capitals and repeats, cut at a word. */
export function cleanStoreTitle(title = "", max = 56) {
  const words = String(title)
    .replace(NOISE, " ")
    .replace(/[|/\\,;:()[\]{}"!?*+_~^]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !(/^[A-Z]{3,}$/.test(w) && !KEEP_CAPS.has(w)));
  const out = [];
  for (const w of words) {
    if (out.some((o) => o.toLowerCase() === w.toLowerCase())) continue;
    if ((out.join(" ") + " " + w).trim().length > max) break;
    out.push(w);
  }
  return out.join(" ").trim();
}

/**
 * A short Hebrew name from the store's own title. Jewellery and accessories:
 * the kind of item + the materials/details the title names ("צמיד טניס ·
 * מואסניט · כסף 925"). Other categories: the cleaned store title.
 */
export function dealTitle(x = {}, category) {
  const raw = String(x.product_title || "").replace(/\s+/g, " ").trim();
  if (category?.noun) {
    const feats = [];
    for (const [re, label] of FEATURES) if (re.test(raw) && !feats.includes(label)) feats.push(label);
    const head = feats.includes("טניס") && category.noun === "צמיד" ? "צמיד טניס" : category.noun;
    const rest = feats.filter((f) => !(f === "טניס" && head === "צמיד טניס")).slice(0, 3);
    return [head, ...rest].join(" · ");
  }
  return cleanStoreTitle(raw) || raw.slice(0, 56);
}

const https = (u) => String(u || "").trim().replace(/^http:\/\//, "https://").replace(/^\/\//, "https://");

/** The store's own facts for a product (null when the price is not a real ILS price). */
export function storeFacts(x = {}, now = Date.now()) {
  const price = Number(x.target_sale_price);
  const currency = String(x.target_sale_price_currency || "");
  if (!(price > 0) || currency !== "ILS") return null;
  const original = Number(x.target_original_price);
  const gallery = [x.product_main_image_url, ...(Array.isArray(x.product_small_image_urls?.string) ? x.product_small_image_urls.string : [])]
    .map(https).filter((u, i, a) => /^https:\/\/\S+$/.test(u) && a.indexOf(u) === i).slice(0, 8);
  const video = https(x.product_video_url);
  return {
    price: Math.round(price * 100) / 100,
    currency: "ILS",
    originalPrice: original > price ? Math.round(original * 100) / 100 : undefined,
    priceFrom: true,
    priceSource: "aliexpress_api",
    priceCheckedAt: new Date(now).toISOString(),
    images: gallery,
    sellerVideo: /^https:\/\/\S+\.mp4(\?|$)/i.test(video) ? video : "",
  };
}

const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;

/**
 * One API item → a catalog product for the owner's studio, or null when a real
 * field is missing. No rating, orders or commission is kept on it.
 */
export function toDealProduct(x = {}, { category, marketerId, now = Date.now(), link = "" } = {}) {
  const id = String(x.product_id || "");
  const buy = String(link || x.promotion_link || "").trim();
  const image = https(x.product_main_image_url);
  const facts = storeFacts(x, now);
  if (!/^\d{6,20}$/.test(id) || !OWN_LINK.test(buy) || !/^https:\/\/\S+$/.test(image) || !facts || !marketerId || !category) return null;
  const p = {
    id: `ae-${id}`,
    marketerId,
    status: "approved",
    title: dealTitle(x, category),
    storeTitle: String(x.product_title || "").replace(/\s+/g, " ").trim().slice(0, 200),
    category: category.category,
    kind: category.kind,
    image,
    affiliateUrl: buy,
    aliexpressId: id,
    price: facts.price,
    currency: facts.currency,
    priceFrom: facts.priceFrom,
    priceSource: facts.priceSource,
    priceCheckedAt: facts.priceCheckedAt,
    images: facts.images,
    createdAt: now,
    updatedAt: now,
    clicks: 0,
    imageSource: { via: "aliexpress_affiliate_api", itemId: id, itemUrl: https(x.product_detail_url) || null, provenance: "merchant_photo", resolvedAt: new Date(now).toISOString() },
    importSource: link ? "aliexpress-owner-link" : "aliexpress-deals",
  };
  if (facts.originalPrice) p.originalPrice = facts.originalPrice;
  if (facts.sellerVideo) p.sellerVideo = { url: facts.sellerVideo, source: "aliexpress_api", checkedAt: facts.priceCheckedAt };
  return p;
}

/** The next categories in rotation (the server imports a few each day, every category in turn). */
export function nextCategories(cursor = 0, count = 3) {
  const n = DEAL_CATEGORIES.length;
  const start = ((Number(cursor) || 0) % n + n) % n;
  return { categories: Array.from({ length: Math.min(count, n) }, (_, i) => DEAL_CATEGORIES[(start + i) % n]), cursor: (start + count) % n };
}

// Extra words for a category, beyond the trend board's Hebrew words (the store's own category names).
const EXTRA_WORDS = Object.freeze({
  rings: ["ring", "טבעת"], earrings: ["earring", "עגיל"], necklaces: ["necklace", "pendant", "תליון"], bracelets: ["bracelet", "bangle", "צמיד"],
  watches: ["watch", "שעון"], bags: ["bag", "wallet", "תיק", "ארנק"], beauty: ["makeup", "cosmetic", "איפור", "יופי"],
  hair: ["hair", "שיער"], home: ["home decor", "תפאורה", "קישוט"], kitchen: ["kitchen", "מטבח"], kids: ["toy", "baby", "צעצוע", "תינוק", "ילד"],
  tech: ["phone", "earphone", "charger", "טלפון", "אוזני", "מטען"], fitness: ["fitness", "sport", "yoga", "כושר", "ספורט", "יוגה"], pets: ["pet", "dog", "cat", "כלב", "חתול", "חיות"],
});

/**
 * The category of an item the owner chose without naming one: the first
 * category whose words appear in the store's own title or category names.
 * Jewellery kinds are checked before the rest ("שרשרת יד" is a bracelet).
 */
export function guessCategory(x = {}) {
  const text = ` ${[x.product_title, x.second_level_category_name, x.first_level_category_name].map((v) => String(v || "")).join(" ")} `.toLowerCase();
  if (/שרשרת\s*יד|hand\s*chain/.test(text)) return dealCategory("bracelets");
  for (const c of DEAL_CATEGORIES) {
    const words = [...(c.words || []), ...(EXTRA_WORDS[c.key] || [])].map((w) => String(w).toLowerCase());
    if (words.some((w) => text.includes(w))) return c;
  }
  return null;
}
