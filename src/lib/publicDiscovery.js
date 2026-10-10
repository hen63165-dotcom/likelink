// Public discovery graph — the single view model behind every public LikeLink2
// surface (home, discover, search, reels, trends, collections, deals, product
// and creator pages).
//
// Truth rules (pinned by tests/publicDiscovery.test.mjs):
//   • Only approved products attributed to a real creator are public
//     (isPublicCatalogProduct). Nothing else ever reaches a public card.
//   • A trend exists only when recorded click/view events back it.
//   • A deal exists only when a real previous price is higher than the price;
//     the discount is computed from those two numbers, never typed in.
//   • A collection is either a creator's saved collection or an editorial board
//     whose rule ("every approved Beauty product") is stated in its description.
//   • Video is whatever mediaTruth says it is: a product photo is never a video
//     and a rendered animation is never a filmed video or human UGC.
//   • "Verified" appears only when the creator record carries verified === true.
//   • A reel promotes its product, so it is listed only for a product whose
//     link opens THAT product (not shared by other products) and whose image
//     is not a stock photo (catalogIntegrity.js).
//   • "Picked for you" needs a real signal (saved / viewed / followed);
//     without one there are no picks.
//
// Pure and isomorphic: no browser globals, so it runs in node:test as-is.

import { isPublicCatalogProduct } from "./cloud/catalog.js";
import { productMediaTruth, classifyMediaRecord, MEDIA_TRUTH } from "./discovery/mediaTruth.js";
import { IMAGE_PROVENANCE, imageProvenance, isPromotable, isRealProductPhoto, sharedAffiliateLinks } from "./discovery/catalogIntegrity.js";
import { creativeClass } from "./media/videoCapability.js";

// Render styles of the native reel pipeline (src/lib/media/reelPipeline.js) —
// duplicated as labels only, so the public bundle does not pull the pipeline.
export const REEL_STYLE_LABELS = Object.freeze({
  cinematic3d: { he: "אנימציה תלת־ממדית מסוגננת", en: "Stylized 3D-look animation" },
  ugc_style: { he: "UGC סינתטי · ממוחשב, לא צילום של אדם", en: "UGC-style · computer-made, not filmed by a person" },
  animated_story: { he: "סיפור מוצר מונפש", en: "Animated product story" },
  animated_unbox: { he: "אנבוקסינג מונפש · אנימציה ממוחשבת", en: "Animated unboxing · computer animation" },
  likeloop_cinematic: { he: "LikeLoop Cinematic · סרט אנימציה קצר, ממוחשב", en: "LikeLoop Cinematic · short computer-animated film" },
  street_story: { he: "סיפור רחוב מונפש · דמות מקורית, ממוחשב", en: "Animated street story · original character, computer-made" },
  ai_story: { he: "סיפור עם דמות AI · המוצר בתמונה אמיתית", en: "AI-generated original character · real product photo" },
  ai_ugc: { he: "יוצרת וירטואלית (AI) · לא אדם אמיתי · המוצר בתמונה אמיתית", en: "Virtual AI creator · not a real person · real product photo" },
  text_hook: { he: "הוק טקסט על תמונת המוצר · ממוחשב", en: "Text hook over the product photo · computer-made" },
  studio: { he: "קליפ מהסטודיו · אנימציה ממוחשבת", en: "Studio clip · computer animation" },
  luna_talking: { he: "לונה מסבירה · דמות וקול AI מונפשים · המוצר בתמונה אמיתית", en: "Luna explains · animated AI character and voice · real product photo" },
  luna_tip: { he: "לונה מסבירה · דמות וקול AI · המוצר בתמונה אמיתית", en: "Luna explains · AI character and voice · real product photo" },
  seller_video: { he: "סרטון של המוכר · מעמוד המוצר", en: "The seller's own video · from the product page" },
  real_ugc: { he: "צילום אמיתי · UGC", en: "Real footage · UGC" },
});

export const TREND_WINDOW_DAYS = 14;
export const TREND_MIN_EVENTS = 3;
const DAY = 86_400_000;

// Counted nouns, written the way people write them: "מוצר אחד" / "5 מוצרים",
// "צפייה אחת" / "3 צפיות" (never "1 צפיות"), "1 view" / "2 views".
const COUNT_WORDS = Object.freeze({
  products: { one: "מוצר אחד", many: "מוצרים", en: ["product", "products"] },
  creators: { one: "יוצר/ת אחד/ת", many: "יוצרים", en: ["creator", "creators"] },
  categories: { one: "קטגוריה אחת", many: "קטגוריות", en: ["category", "categories"] },
  collections: { one: "אוסף אחד", many: "אוספים", en: ["collection", "collections"] },
  views: { one: "צפייה אחת", many: "צפיות", en: ["view", "views"] },
  clicks: { one: "קליק אחד", many: "קליקים", en: ["click", "clicks"] },
  picks: { one: "בחירה אחת", many: "בחירות", en: ["pick", "picks"] },
  results: { one: "תוצאה אחת", many: "תוצאות", en: ["result", "results"] },
  reels: { one: "סרטון אחד", many: "סרטונים", en: ["video", "videos"] },
});

export function heCount(n, word) {
  const k = Number(n) || 0;
  const w = COUNT_WORDS[word];
  if (!w) return String(k);
  return k === 1 ? w.one : `${k} ${w.many}`;
}

export function enCount(n, word) {
  const k = Number(n) || 0;
  const w = COUNT_WORDS[word];
  if (!w) return String(k);
  return `${k} ${k === 1 ? w.en[0] : w.en[1]}`;
}

/** "A ו־3 B" / "A וקליק אחד": the hyphen joins "ו" to a number only. */
export function heAnd(a, b) {
  return `${a} ו${/^\d/.test(String(b)) ? "־" : ""}${b}`;
}

export const CATEGORY_META = Object.freeze({
  Fashion: { he: "אופנה", en: "Fashion", board: { he: "עריכת הסטייל", en: "The Style Edit" } },
  Beauty: { he: "יופי וטיפוח", en: "Beauty", board: { he: "בחירות טיפוח", en: "Beauty Picks" } },
  Home: { he: "בית ומטבח", en: "Home", board: { he: "מציאות לבית", en: "Home Finds" } },
  Tech: { he: "טכנולוגיה", en: "Tech", board: { he: "גאדג'טים שעובדים", en: "Tech Essentials" } },
  Fitness: { he: "ספורט וכושר", en: "Fitness", board: { he: "זזים יותר", en: "Move More" } },
  Kids: { he: "ילדים", en: "Kids", board: { he: "לקטנים", en: "Little Ones" } },
  Accessories: { he: "אקססוריז ותכשיטים", en: "Accessories", board: { he: "הפרטים הקטנים", en: "Small Details" } },
  Pets: { he: "חיות מחמד", en: "Pets", board: { he: "לחברים על ארבע", en: "Pet Finds" } },
  Gifts: { he: "מתנות", en: "Gifts", board: { he: "רעיונות למתנה", en: "Gift Ideas" } },
  Travel: { he: "נסיעות", en: "Travel", board: { he: "מוכנים לטיסה", en: "Travel Ready" } },
  Marketing: { he: "כלים ליוצרים", en: "Creator tools", board: { he: "ארגז הכלים ליוצרים", en: "Creator Toolkit" } },
  Other: { he: "עוד", en: "More", board: { he: "עוד מציאות", en: "More Finds" } },
});

export function categoryName(category, lang = "he") {
  const meta = CATEGORY_META[category];
  if (meta) return lang === "he" ? meta.he : meta.en;
  return String(category || (lang === "he" ? "עוד" : "More"));
}

const MERCHANTS = { aliexpress: "AliExpress", amazon: "Amazon", shein: "SHEIN", temu: "Temu", etsy: "Etsy", ebay: "eBay", shopify: "Shopify" };

/** Merchant name from the product's own source or link host. Never guessed beyond that. */
export function merchantOf(product = {}) {
  const src = String(product.source || "").toLowerCase().trim();
  if (MERCHANTS[src]) return MERCHANTS[src];
  const url = String(product.affiliateUrl || product.link || product.sourceUrl || "");
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  if (!m) return "";
  const host = m[1].toLowerCase();
  for (const [key, name] of Object.entries(MERCHANTS)) if (host.includes(key)) return name;
  if (host.includes("likelink")) return "LikeLink";
  return host.replace(/^www\./, "").replace(/^s\.click\./, "");
}

/** Real previous price → real discount. Returns null unless both prices are real and differ. */
export function dealOf(product = {}) {
  const price = Number(product.price);
  const was = Number(product.originalPrice ?? product.compareAtPrice ?? product.oldPrice);
  if (!(price > 0) || !(was > price)) return null;
  return { price, was, discountPct: Math.round(((was - price) / was) * 100), saved: Math.round((was - price) * 100) / 100 };
}

export function formatPrice(value, lang = "he") {
  const n = Number(value);
  if (!(n > 0)) return "";
  const rounded = Number.isInteger(n) ? n.toLocaleString(lang === "he" ? "he-IL" : "en-US") : n.toFixed(2);
  return `₪${rounded}`;
}

function textOf(v) {
  return typeof v === "string" ? v : "";
}

function cleanTitle(title) {
  // Catalog titles sometimes carry the price ("… — ₪189"); the card shows the
  // real price field, so the duplicate is trimmed for display only.
  return textOf(title).replace(/\s+[—-]\s*(עד\s*)?₪\s?[\d,.]+\s*$/u, "").trim();
}

function mediaFor(product) {
  const truth = productMediaTruth(product, []);
  const image = /^https?:\/\//i.test(textOf(product.image)) ? product.image : "";
  const playable = truth.state === MEDIA_TRUTH.REAL_VIDEO || truth.state === MEDIA_TRUTH.SYNTHETIC_ANIMATION;
  return {
    state: truth.state,
    video: playable ? truth.url : "",
    poster: playable && /^https?:\/\//i.test(textOf(product.videoPoster)) ? product.videoPoster : image,
    style: playable && REEL_STYLE_LABELS[product.videoStyle] ? product.videoStyle : "",
    synthetic: truth.state === MEDIA_TRUTH.SYNTHETIC_ANIMATION || Boolean(truth.synthetic),
    image,
  };
}

function recentEvents(clicks = [], now = Date.now()) {
  const since = now - TREND_WINDOW_DAYS * DAY;
  return (Array.isArray(clicks) ? clicks : []).filter((c) => c && c.productId && Number(c.ts) >= since && Number(c.ts) <= now + DAY);
}

/**
 * Build the public graph from the marketplace context's real data.
 * @returns {{products, byId, creators, creatorById, categories, collections, trends, attention, deals, reels}}
 */
/** Remove sentences that claim ratings, review counts, sales or rankings (unverified store copy). */
const UNVERIFIED_CLAIM = /(כוכבים|כוכב|ביקורות|ביקורת|דירוג|מדורג|נמכר(?:ו)?\s+\d|יחידות נמכרו|רב[\s-]?מכר|הכי נמכר|מספר\s*1|#1|best[\s-]?seller|\d[\d,.]*\+?\s*(?:reviews?|ratings?|sold)|\bstars?\b)/i;
export function stripUnverifiedClaims(text) {
  if (typeof text !== "string" || !text) return text;
  // A sentence ends at . ! ? followed by whitespace (so "4.8" stays whole), or at a newline.
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  return parts.filter((s) => !UNVERIFIED_CLAIM.test(s)).join(" ").trim();
}

export function buildPublicGraph({ products = [], marketers = [], collections = [], clicks = [], videos = [], now = Date.now() } = {}) {
  const creatorsList = Array.isArray(marketers) ? marketers.filter((m) => m && m.id) : [];
  const all = Array.isArray(products) ? products : [];
  const sharedLinks = sharedAffiliateLinks(all);
  const pub = all
    .filter((p) => isPublicCatalogProduct(p, creatorsList))
    // A product whose affiliate link is shared by other products does not lead
    // to THIS product (it opens the store's home page): it is not shown to
    // buyers at all — a listing must lead where it says (catalogIntegrity.js).
    .filter((p) => isPromotable(p, all, sharedLinks))
    .map((p) => ({
      ...p,
      // A store's own rating/review/sales line is not verified by LikeLink and
      // is never shown as a fact (no invented trust signals).
      description: stripUnverifiedClaims(p.description),
      displayTitle: cleanTitle(p.title) || textOf(p.title),
      merchant: merchantOf(p),
      deal: dealOf(p),
      media: mediaFor(p),
    }))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  const byId = new Map(pub.map((p) => [p.id, p]));

  // Attention = recorded click + view events in the window (real first-party events only).
  const events = recentEvents(clicks, now);
  const attentionById = new Map();
  for (const e of events) {
    if (!byId.has(e.productId)) continue;
    const row = attentionById.get(e.productId) || { clicks: 0, views: 0 };
    if (e.type === "view") row.views += 1;
    else row.clicks += 1;
    attentionById.set(e.productId, row);
  }
  for (const p of pub) p.attention = attentionById.get(p.id) || { clicks: 0, views: 0 };

  const creators = creatorsList
    .map((m) => {
      const own = pub.filter((p) => p.marketerId === m.id);
      return {
        id: m.id,
        name: textOf(m.name) || textOf(m.slug) || "",
        slug: textOf(m.slug) || m.id,
        bio: textOf(m.bio),
        avatar: /^https?:\/\//i.test(textOf(m.avatar || m.photo || m.image)) ? m.avatar || m.photo || m.image : "",
        color: /^#[0-9a-f]{3,8}$/i.test(textOf(m.color)) ? m.color : "",
        verified: m.verified === true,
        tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string") : [],
        productIds: own.map((p) => p.id),
        categories: [...new Set(own.map((p) => p.category).filter(Boolean))],
        covers: own.filter((p) => p.media.image).slice(0, 4).map((p) => p.media.image),
      };
    })
    .filter((c) => c.productIds.length > 0 && c.name);
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  const catMap = new Map();
  for (const p of pub) {
    const cat = p.category || "Other";
    const row = catMap.get(cat) || { id: cat, productIds: [], creatorIds: new Set(), cover: "" };
    row.productIds.push(p.id);
    row.creatorIds.add(p.marketerId);
    if (!row.cover && p.media.image) row.cover = p.media.image;
    catMap.set(cat, row);
  }
  const categories = [...catMap.values()]
    .map((c) => ({ ...c, creatorIds: [...c.creatorIds], count: c.productIds.length }))
    .sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)));

  const boards = [];
  // 1) Creator-saved collections (real records, only public products kept).
  for (const c of Array.isArray(collections) ? collections : []) {
    const ids = (Array.isArray(c?.productIds) ? c.productIds : []).filter((id) => byId.has(id));
    if (!c?.id || !ids.length || !creatorById.has(c.marketerId)) continue;
    boards.push({
      id: `c-${c.id}`,
      kind: "curated",
      title: { he: textOf(c.title) || "אוסף", en: textOf(c.title) || "Collection" },
      description: { he: `אוסף שנבחר על ידי ${creatorById.get(c.marketerId).name}`, en: `Curated by ${creatorById.get(c.marketerId).name}` },
      productIds: ids,
      creatorIds: [c.marketerId],
    });
  }
  // 2) Editorial boards by category (rule stated in the description).
  for (const cat of categories) {
    if (cat.count < 3) continue;
    const meta = CATEGORY_META[cat.id] || CATEGORY_META.Other;
    boards.push({
      id: `cat-${encodeURIComponent(cat.id)}`,
      kind: "category",
      category: cat.id,
      title: meta.board,
      description: {
        he: `כל ${cat.count} המוצרים המאושרים בקטגוריית ${categoryName(cat.id, "he")}`,
        en: `All ${cat.count} approved ${categoryName(cat.id, "en")} products`,
      },
      productIds: cat.productIds,
      creatorIds: cat.creatorIds,
    });
  }
  // 3) Price board — real prices only.
  const under100 = pub.filter((p) => Number(p.price) > 0 && Number(p.price) < 100);
  if (under100.length >= 3) {
    boards.push({
      id: "under-100",
      kind: "price",
      title: { he: "עד ₪100", en: "Under ₪100" },
      description: { he: `${heCount(under100.length, "products")} במחיר רשום של פחות מ־₪100`, en: `${enCount(under100.length, "products")} listed under ₪100` },
      productIds: under100.map((p) => p.id),
      creatorIds: [...new Set(under100.map((p) => p.marketerId))],
    });
  }
  // 4) Creator favorites — the creator's own latest picks.
  for (const c of creators) {
    if (c.productIds.length < 3) continue;
    boards.push({
      id: `creator-${encodeURIComponent(c.slug)}`,
      kind: "creator",
      title: { he: `הבחירות של ${c.name}`, en: `${c.name}'s Favorites` },
      description: { he: `המוצרים האחרונים ש־${c.name} הוסיפ/ה`, en: `The latest products ${c.name} added` },
      productIds: c.productIds.slice(0, 12),
      creatorIds: [c.id],
    });
  }
  for (const b of boards) b.covers = b.productIds.map((id) => byId.get(id)?.media.image).filter(Boolean).slice(0, 4);

  // Trends: categories whose recorded events in the window reach the threshold.
  const trends = categories
    .map((cat) => {
      const ev = cat.productIds.reduce(
        (acc, id) => {
          const a = byId.get(id).attention;
          return { clicks: acc.clicks + a.clicks, views: acc.views + a.views };
        },
        { clicks: 0, views: 0 }
      );
      return { category: cat.id, ...ev, total: ev.clicks + ev.views, productIds: [...cat.productIds].sort((a, b) => score(byId.get(b)) - score(byId.get(a))), creatorIds: cat.creatorIds, cover: cat.cover, windowDays: TREND_WINDOW_DAYS };
    })
    .filter((t) => t.total >= TREND_MIN_EVENTS)
    .sort((a, b) => b.total - a.total);

  const attention = pub.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a));
  const deals = pub.filter((p) => p.deal).sort((a, b) => b.deal.discountPct - a.deal.discountPct);
  // Reels: playable media only, classified by mediaTruth. A product photo is
  // never turned into a "reel"; a LikeLink render is labelled as animation.
  const reels = [];
  const seenUrls = new Set();
  const shared = sharedAffiliateLinks(products);
  const reelWorthy = (id) => {
    const p = byId.get(id);
    return Boolean(p) && isPromotable(p, products, shared) && imageProvenance(p.image) !== IMAGE_PROVENANCE.STOCK;
  };
  for (const v of Array.isArray(videos) ? videos : []) {
    if (!v?.id || !/^https?:\/\//i.test(textOf(v.videoUrl))) continue;
    const truth = classifyMediaRecord(v);
    if (truth.state !== MEDIA_TRUTH.REAL_VIDEO && truth.state !== MEDIA_TRUTH.SYNTHETIC_ANIMATION) continue;
    if (v.public === false) continue; // unregistered (e.g. its file is no longer public)
    const allTags = (Array.isArray(v.productTags) ? v.productTags : []).map((t) => t?.productId).filter(Boolean);
    const publicTags = allTags.filter((id) => byId.has(id));
    // A reel made for a product must show a public, promotable product. One whose
    // products are all non-public (archived, unapproved) is not a creator reel.
    if (allTags.length && !publicTags.some(reelWorthy)) continue;
    const tagged = publicTags.filter(reelWorthy);
    const creatorId = creatorById.has(v.marketerId) ? v.marketerId : tagged.length ? byId.get(tagged[0]).marketerId : "";
    if (!creatorId || seenUrls.has(truth.url)) continue;
    seenUrls.add(truth.url);
    const poster = /^https?:\/\//i.test(textOf(v.poster)) ? v.poster : tagged.length ? byId.get(tagged[0]).media.image : "";
    reels.push({ id: `v-${v.id}`, url: truth.url, state: truth.state, creativeClass: creativeClass(v), poster, style: REEL_STYLE_LABELS[v.style] ? v.style : "", productIds: tagged, creatorId, title: textOf(v.title), createdAt: Number(v.createdAt) || 0 });
  }
  for (const p of pub) {
    if (p.media.video && !seenUrls.has(p.media.video) && reelWorthy(p.id)) {
      seenUrls.add(p.media.video);
      reels.push({ id: `p-${p.id}`, url: p.media.video, state: p.media.state, creativeClass: creativeClass({ videoUrl: p.videoUrl, videoStatus: p.videoStatus, videoProvider: p.videoProvider, synthetic: p.videoSynthetic === true, style: p.videoStyle, marketerId: p.marketerId }), poster: p.media.poster, style: p.media.style, productIds: [p.id], creatorId: p.marketerId, title: p.displayTitle, createdAt: Number(p.createdAt) || 0 });
    }
  }
  reels.sort((a, b) => b.createdAt - a.createdAt);

  return { products: pub, byId, creators, creatorById, categories, collections: boards, trends, attention, deals, reels, sharedLinks };
}

function score(p) {
  return p ? p.attention.clicks * 2 + p.attention.views : 0;
}

export function findCollection(graph, id) {
  return graph.collections.find((c) => c.id === id) || null;
}

export function findCreator(graph, slug) {
  const s = String(slug || "").toLowerCase();
  return graph.creators.find((c) => c.slug.toLowerCase() === s || c.id === slug) || null;
}

/** Products related to `product`: same category first, then same creator. */
export function relatedProducts(graph, product, limit = 8) {
  if (!product) return [];
  const same = graph.products.filter((p) => p.id !== product.id && p.category === product.category);
  const creator = graph.products.filter((p) => p.id !== product.id && p.marketerId === product.marketerId && p.category !== product.category);
  return [...same, ...creator].slice(0, limit);
}

export function collectionsFor(graph, productId) {
  return graph.collections.filter((c) => c.productIds.includes(productId));
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evidence behind a product's place in results — real signals only, each one
 * explainable to the buyer ("why is this here?"). Nothing is invented: no
 * stars, no reviews, no sales. A signal that is not in the data is absent.
 *   real_photo    the store's own product photo (not a stock image)
 *   own_link      its own affiliate link to the product page (not a shared one)
 *   price         a catalog price is listed
 *   reel          a playable video exists
 *   verified      the creator record is verified
 *   attention     recorded views/clicks on LikeLink in the trend window
 */
export const EVIDENCE_LABELS = Object.freeze({
  real_photo: { he: "תמונה אמיתית מהחנות", en: "Real store photo", w: 3 },
  own_link: { he: "קישור ישיר למוצר", en: "Direct product link", w: 3 },
  price: { he: "מחיר מהקטלוג", en: "Catalog price", w: 1 },
  reel: { he: "יש סרטון", en: "Has a video", w: 1 },
  verified: { he: "יוצר/ת מאומת/ת", en: "Verified creator", w: 2 },
  attention: { he: "מתעניינים בו ב-LikeLink", en: "Getting attention on LikeLink", w: 2 },
});
export function evidenceOf(p, graph, shared = null) {
  if (!p) return { signals: [], score: 0 };
  const sh = shared || graph?.sharedLinks || new Set();
  const creator = graph?.creatorById?.get(p.marketerId);
  const link = String(p.affiliateUrl || p.affiliateLink || p.link || "").trim();
  const signals = [];
  if (p.media?.image && isRealProductPhoto(p.media.image)) signals.push("real_photo");
  if (link && !sh.has(link)) signals.push("own_link");
  if (Number(p.price) > 0) signals.push("price");
  if (p.media?.video) signals.push("reel");
  if (creator?.verified) signals.push("verified");
  const att = (p.attention?.clicks || 0) + (p.attention?.views || 0);
  if (att > 0) signals.push("attention");
  const score = signals.reduce((s, k) => s + EVIDENCE_LABELS[k].w, 0) + Math.min(att, 50) / 25;
  return { signals, score, attention: p.attention || { clicks: 0, views: 0 } };
}

/**
 * The store item a product points to, when it is known for sure (the resolver
 * stored the item id, or the item page URL is on record). Several creators'
 * products with the same identity are OFFERS of one product. No fuzzy title
 * matching: a wrong merge would mislead the buyer.
 */
export function identityOf(p) {
  const id = p?.imageSource?.itemId || p?.itemId;
  if (id && /^\d{6,20}$/.test(String(id))) return `ae:${id}`;
  for (const u of [p?.itemUrl, p?.sourceUrl, p?.imageSource?.itemUrl]) {
    const m = /aliexpress\.[a-z.]+\/item\/(\d{6,20})\.html/i.exec(String(u || ""));
    if (m) return `ae:${m[1]}`;
  }
  return null;
}

/** Other public offers (other creators / links) of the same store item, strongest evidence first. */
export function offersOf(p, graph) {
  const key = identityOf(p);
  if (!key || !graph?.products) return [];
  return graph.products.filter((x) => x.id !== p.id && identityOf(x) === key)
    .map((x) => ({ product: x, evidence: evidenceOf(x, graph) }))
    .sort((a, b) => b.evidence.score - a.evidence.score);
}

/**
 * What the buyer asked for, beyond the words: a price ceiling/floor
 * ("עד 150 שקל", "מתחת ל-100", "מעל 50", "under 150"). Deterministic, no AI call.
 */
export function parseIntent(query) {
  let q = ` ${String(query || "")} `;
  const num = "(\\d{1,6}(?:[.,]\\d{1,2})?)";
  const cur = "\\s*(?:₪|ש\"ח|שח|שקל(?:ים)?|nis|ils)?";
  let maxPrice = null, minPrice = null;
  const take = (re, set) => { q = q.replace(re, (_, n) => { set(Number(String(n).replace(",", "."))); return " "; }); };
  take(new RegExp(`(?:עד|מתחת\\s*ל-?|פחות\\s*מ-?|under|below|up to)\\s*₪?\\s*${num}${cur}`, "giu"), (n) => { maxPrice = n; });
  take(new RegExp(`(?:מעל|יותר\\s*מ-?|from|over|above)\\s*₪?\\s*${num}${cur}`, "giu"), (n) => { minPrice = n; });
  return { text: q.replace(/\s+/g, " ").trim(), maxPrice, minPrice };
}

/**
 * Search everything: products, creators, collections and categories.
 * Every token must match somewhere in the item's real fields.
 */
/**
 * A pasted link → the catalog item it points to, only when it is certain:
 * a LikeLink product page, an AliExpress item page (same store item id), or
 * the exact affiliate link a creator listed. Anything else is not guessed.
 */
export function resolveLink(graph, raw) {
  const m = /https?:\/\/\S+/i.exec(String(raw || ""));
  if (!m) return null;
  const url = m[0].replace(/[),.]+$/, "");
  const page = /\/p\/([A-Za-z0-9_-]{1,80})/.exec(url);
  if (page && graph.byId.get(page[1])) return { url, kind: "likelink_page", products: [graph.byId.get(page[1])] };
  const item = /aliexpress\.[a-z.]+\/item\/(\d{6,20})\.html/i.exec(url);
  if (item) {
    const key = `ae:${item[1]}`;
    return { url, kind: "store_item", products: graph.products.filter((p) => identityOf(p) === key) };
  }
  const exact = graph.products.filter((p) => String(p.affiliateUrl || "").trim() === url);
  return { url, kind: exact.length ? "affiliate_link" : "unknown", products: exact };
}

export function searchGraph(graph, query) {
  const link = resolveLink(graph, query);
  if (link) {
    const why = new Map(link.products.map((p) => [p.id, { ...evidenceOf(p, graph), match: "exact_link" }]));
    const products = [...link.products].sort((a, b) => why.get(b.id).score - why.get(a.id).score);
    return { products, why, link, intent: { text: "", maxPrice: null, minPrice: null }, creators: [], collections: [], categories: [], total: products.length };
  }
  const intent = parseIntent(query);
  const tokens = norm(intent.text).split(" ").filter(Boolean);
  const priceOk = (p) => {
    const v = Number(p.price);
    if (intent.maxPrice != null && !(v > 0 && v <= intent.maxPrice)) return false;
    if (intent.minPrice != null && !(v >= intent.minPrice)) return false;
    return true;
  };
  const priceOnly = !tokens.length && (intent.maxPrice != null || intent.minPrice != null);
  const empty = { products: [], why: new Map(), creators: [], collections: [], categories: [], total: 0, intent };
  if (!tokens.length && !priceOnly) return empty;
  const matchAll = (hay) => tokens.every((t) => hay.includes(t) || (t.length > 2 && hay.includes(t.replace(/^(ה|ו|ב|ל|מ|ש)/u, ""))));
  const scoreOf = (title, hay) => tokens.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (hay.includes(t) ? 1 : 0), 0);

  const why = new Map();
  const seen = new Map();
  const shared = graph.sharedLinks || sharedAffiliateLinks(graph.products);
  const products = graph.products
    .map((p) => {
      const creator = graph.creatorById.get(p.marketerId);
      const title = norm(`${p.displayTitle} ${p.marketingTitle || ""}`);
      const hay = norm([title, p.description, (p.tags || []).join(" "), p.brand, p.category, categoryName(p.category, "he"), categoryName(p.category, "en"), p.merchant, creator?.name].join(" "));
      return { p, title, hay };
    })
    .filter((x) => priceOk(x.p) && (priceOnly || matchAll(x.hay)))
    // Relevance first (how well the words match); among equally relevant
    // results, the one with more real evidence comes first.
    .map((x) => ({ ...x, rel: scoreOf(x.title, x.hay), ev: evidenceOf(x.p, graph, shared) }))
    .sort((a, b) => b.rel - a.rel || b.ev.score - a.ev.score)
    // One card per store item: the strongest offer stands for it; the others
    // are reachable from it ("עוד המלצות לאותו מוצר").
    .filter((x) => { const k = identityOf(x.p); if (!k) return true; if (seen.has(k)) { seen.get(k).offers += 1; return false; } seen.set(k, x.ev); x.ev.offers = 1; return true; })
    .map((x) => { why.set(x.p.id, x.ev); return x.p; });
  const creators = graph.creators.filter((c) => matchAll(norm([c.name, c.slug, c.bio, c.tags.join(" "), c.categories.map((k) => `${k} ${categoryName(k, "he")}`).join(" ")].join(" "))));
  const collections = graph.collections.filter((c) => matchAll(norm([c.title.he, c.title.en, c.description.he, c.description.en, c.category, c.category && categoryName(c.category, "he")].join(" "))));
  const categories = graph.categories.filter((c) => matchAll(norm(`${c.id} ${categoryName(c.id, "he")} ${categoryName(c.id, "en")}`)));
  const words = (list) => (priceOnly ? [] : list);
  return { products, why, intent, creators: words(creators), collections: words(collections), categories: words(categories), total: products.length + words(creators).length + words(collections).length + words(categories).length };
}

/**
 * "Picked for you" — only from real local signals (saved, viewed, followed).
 * Returns { products: [], reason: null } when there is no signal.
 */
export function lunaPicks(graph, { favorites = [], viewed = [], following = [] } = {}, limit = 8) {
  const seeds = [...new Set([...(favorites || []), ...(viewed || [])])].map((id) => graph.byId.get(id)).filter(Boolean);
  const followedIds = new Set((following || []).filter((id) => graph.creatorById.has(id)));
  if (!seeds.length && !followedIds.size) return { products: [], reason: null };
  const cats = new Set(seeds.map((p) => p.category));
  const seedIds = new Set(seeds.map((p) => p.id));
  const picks = graph.products.filter((p) => !seedIds.has(p.id) && (cats.has(p.category) || followedIds.has(p.marketerId))).slice(0, limit);
  const fav = seeds.find((p) => (favorites || []).includes(p.id));
  const reason = fav
    ? { kind: "saved", productTitle: fav.displayTitle }
    : seeds[0]
      ? { kind: "viewed", productTitle: seeds[0].displayTitle }
      : { kind: "following", creatorName: graph.creatorById.get([...followedIds][0])?.name || "" };
  return { products: picks, reason: picks.length ? reason : null };
}

/** Factual reasons a product is shown — every line is computed from real fields. */
export function productInsights(graph, product) {
  if (!product) return [];
  const out = [];
  const creator = graph.creatorById.get(product.marketerId);
  if (creator) out.push({ kind: "creator", he: `נבחר ונוסף על ידי ${creator.name}`, en: `Picked and added by ${creator.name}` });
  const boards = collectionsFor(graph, product.id).filter((b) => b.kind !== "creator");
  if (boards.length) out.push({ kind: "collection", he: `${boards.length === 1 ? "מופיע באוסף" : "מופיע באוספים"} ${boards.map((b) => `„${b.title.he}”`).join(", ")}`, en: `Featured in ${boards.map((b) => b.title.en).join(", ")}` });
  const peers = graph.products.filter((p) => p.category === product.category && Number(p.price) > 0).map((p) => Number(p.price)).sort((a, b) => a - b);
  if (peers.length >= 3 && Number(product.price) > 0) {
    const median = peers[Math.floor(peers.length / 2)];
    if (Number(product.price) < median) out.push({ kind: "price", he: `מתחת למחיר החציוני בקטגוריה (${formatPrice(median, "he")})`, en: `Below the category median price (${formatPrice(median, "en")})` });
  }
  const a = product.attention || { clicks: 0, views: 0 };
  if (a.clicks + a.views > 0) out.push({ kind: "attention", he: `${heAnd(heCount(a.views, "views"), heCount(a.clicks, "clicks"))} נרשמו ב־${TREND_WINDOW_DAYS} הימים האחרונים`, en: `${enCount(a.views, "views")} and ${enCount(a.clicks, "clicks")} recorded in the last ${TREND_WINDOW_DAYS} days` });
  if (product.deal) out.push({ kind: "deal", he: `המחיר ירד מ־${formatPrice(product.deal.was, "he")}`, en: `Price dropped from ${formatPrice(product.deal.was, "en")}` });
  return out;
}
