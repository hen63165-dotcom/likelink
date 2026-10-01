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
//   • "Picked for you" needs a real signal (saved / viewed / followed);
//     without one there are no picks.
//
// Pure and isomorphic: no browser globals, so it runs in node:test as-is.

import { isPublicCatalogProduct } from "./cloud/catalog.js";
import { productMediaTruth, classifyMediaRecord, MEDIA_TRUTH } from "./discovery/mediaTruth.js";

// Render styles of the native reel pipeline (src/lib/media/reelPipeline.js) —
// duplicated as labels only, so the public bundle does not pull the pipeline.
export const REEL_STYLE_LABELS = Object.freeze({
  cinematic3d: { he: "אנימציה תלת־ממדית מסוגננת", en: "Stylized 3D-look animation" },
  ugc_style: { he: "בסגנון UGC · ממוחשב, לא צילום של אדם", en: "UGC-style · computer-made, not filmed by a person" },
  animated_story: { he: "סיפור מוצר מונפש", en: "Animated product story" },
  animated_unbox: { he: "אנבוקסינג מונפש · אנימציה ממוחשבת", en: "Animated unboxing · computer animation" },
  studio: { he: "קליפ מהסטודיו · אנימציה ממוחשבת", en: "Studio clip · computer animation" },
});

export const TREND_WINDOW_DAYS = 14;
export const TREND_MIN_EVENTS = 3;
const DAY = 86_400_000;

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
export function buildPublicGraph({ products = [], marketers = [], collections = [], clicks = [], videos = [], now = Date.now() } = {}) {
  const creatorsList = Array.isArray(marketers) ? marketers.filter((m) => m && m.id) : [];
  const pub = (Array.isArray(products) ? products : [])
    .filter((p) => isPublicCatalogProduct(p, creatorsList))
    .map((p) => ({
      ...p,
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
      description: { he: `${under100.length} מוצרים שהמחיר הרשום שלהם נמוך מ־₪100`, en: `${under100.length} products listed under ₪100` },
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
  for (const v of Array.isArray(videos) ? videos : []) {
    if (!v?.id || !/^https?:\/\//i.test(textOf(v.videoUrl))) continue;
    const truth = classifyMediaRecord(v);
    if (truth.state !== MEDIA_TRUTH.REAL_VIDEO && truth.state !== MEDIA_TRUTH.SYNTHETIC_ANIMATION) continue;
    const tagged = (Array.isArray(v.productTags) ? v.productTags : []).map((t) => t?.productId).filter((id) => byId.has(id));
    const creatorId = creatorById.has(v.marketerId) ? v.marketerId : tagged.length ? byId.get(tagged[0]).marketerId : "";
    if (!creatorId || seenUrls.has(truth.url)) continue;
    seenUrls.add(truth.url);
    const poster = /^https?:\/\//i.test(textOf(v.poster)) ? v.poster : tagged.length ? byId.get(tagged[0]).media.image : "";
    reels.push({ id: `v-${v.id}`, url: truth.url, state: truth.state, poster, style: REEL_STYLE_LABELS[v.style] ? v.style : "", productIds: tagged, creatorId, title: textOf(v.title), createdAt: Number(v.createdAt) || 0 });
  }
  for (const p of pub) {
    if (p.media.video && !seenUrls.has(p.media.video)) {
      seenUrls.add(p.media.video);
      reels.push({ id: `p-${p.id}`, url: p.media.video, state: p.media.state, poster: p.media.poster, style: p.media.style, productIds: [p.id], creatorId: p.marketerId, title: p.displayTitle, createdAt: Number(p.createdAt) || 0 });
    }
  }
  reels.sort((a, b) => b.createdAt - a.createdAt);

  return { products: pub, byId, creators, creatorById, categories, collections: boards, trends, attention, deals, reels };
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
 * Search everything: products, creators, collections and categories.
 * Every token must match somewhere in the item's real fields.
 */
export function searchGraph(graph, query) {
  const tokens = norm(query).split(" ").filter(Boolean);
  const empty = { products: [], creators: [], collections: [], categories: [], total: 0 };
  if (!tokens.length) return empty;
  const matchAll = (hay) => tokens.every((t) => hay.includes(t) || (t.length > 2 && hay.includes(t.replace(/^(ה|ו|ב|ל|מ|ש)/u, ""))));
  const scoreOf = (title, hay) => tokens.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (hay.includes(t) ? 1 : 0), 0);

  const products = graph.products
    .map((p) => {
      const creator = graph.creatorById.get(p.marketerId);
      const title = norm(`${p.displayTitle} ${p.marketingTitle || ""}`);
      const hay = norm([title, p.description, (p.tags || []).join(" "), p.brand, p.category, categoryName(p.category, "he"), categoryName(p.category, "en"), p.merchant, creator?.name].join(" "));
      return { p, title, hay };
    })
    .filter((x) => matchAll(x.hay))
    .sort((a, b) => scoreOf(b.title, b.hay) - scoreOf(a.title, a.hay))
    .map((x) => x.p);
  const creators = graph.creators.filter((c) => matchAll(norm([c.name, c.slug, c.bio, c.tags.join(" "), c.categories.map((k) => `${k} ${categoryName(k, "he")}`).join(" ")].join(" "))));
  const collections = graph.collections.filter((c) => matchAll(norm([c.title.he, c.title.en, c.description.he, c.description.en, c.category, c.category && categoryName(c.category, "he")].join(" "))));
  const categories = graph.categories.filter((c) => matchAll(norm(`${c.id} ${categoryName(c.id, "he")} ${categoryName(c.id, "en")}`)));
  return { products, creators, collections, categories, total: products.length + creators.length + collections.length + categories.length };
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
  if (boards.length) out.push({ kind: "collection", he: `מופיע ב־${boards.map((b) => b.title.he).join(", ")}`, en: `Featured in ${boards.map((b) => b.title.en).join(", ")}` });
  const peers = graph.products.filter((p) => p.category === product.category && Number(p.price) > 0).map((p) => Number(p.price)).sort((a, b) => a - b);
  if (peers.length >= 3 && Number(product.price) > 0) {
    const median = peers[Math.floor(peers.length / 2)];
    if (Number(product.price) < median) out.push({ kind: "price", he: `מתחת למחיר החציוני בקטגוריה (${formatPrice(median, "he")})`, en: `Below the category median price (${formatPrice(median, "en")})` });
  }
  const a = product.attention || { clicks: 0, views: 0 };
  if (a.clicks + a.views > 0) out.push({ kind: "attention", he: `${a.views} צפיות ו־${a.clicks} קליקים נרשמו ב־${TREND_WINDOW_DAYS} הימים האחרונים`, en: `${a.views} views and ${a.clicks} clicks recorded in the last ${TREND_WINDOW_DAYS} days` });
  if (product.deal) out.push({ kind: "deal", he: `המחיר ירד מ־${formatPrice(product.deal.was, "he")}`, en: `Price dropped from ${formatPrice(product.deal.was, "en")}` });
  return out;
}
