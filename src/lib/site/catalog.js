// Public-site catalog helpers — pure functions over REAL marketplace data.
//
// Truth rules (enforced here so every public surface inherits them):
//   • Media is classified into exactly one state:
//       REAL_VIDEO          a playable video file a person uploaded/filmed
//       SYNTHETIC_ANIMATION a first-party animation rendered from product photos
//       STATIC_IMAGE        a product photo
//       MISSING_MEDIA       nothing usable — the UI shows a designed fallback
//     An animation is never presented as a filmed video.
//   • Popularity is never invented: "activity" is counted from the real
//     click/view ledger; with too little data the UI says so.
//   • Collections built from catalog attributes are labelled as automatic.
import { isPublicCatalogProduct } from "../cloud/catalog.js";
import { categoryLabels } from "../i18n.js";

export const MEDIA_STATE = Object.freeze({
  REAL_VIDEO: "REAL_VIDEO",
  SYNTHETIC_ANIMATION: "SYNTHETIC_ANIMATION",
  STATIC_IMAGE: "STATIC_IMAGE",
  MISSING_MEDIA: "MISSING_MEDIA",
});

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i;
// Sources written by LikeLink's own photo-to-motion renderer ("studio" is the
// legacy tag of the same browser renderer).
const SYNTHETIC_SOURCE = /^(likelink_(auto|overview|first_party)|studio$)/i;

export function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** One video record → REAL_VIDEO | SYNTHETIC_ANIMATION | null (not playable). */
export function videoMediaState(video) {
  const url = String(video?.videoUrl || "");
  if (!isHttpUrl(url) || !VIDEO_FILE.test(url)) return null;
  if (/motion_svg/i.test(String(video?.videoStatus || ""))) return null;
  if (video?.synthetic === true || SYNTHETIC_SOURCE.test(String(video?.source || ""))) {
    return MEDIA_STATE.SYNTHETIC_ANIMATION;
  }
  return MEDIA_STATE.REAL_VIDEO;
}

export function videoProductId(video) {
  return String(video?.productId || video?.productTags?.[0]?.productId || "");
}

/**
 * The best truthful media for a product:
 * real video > synthetic animation file > product photo > missing.
 */
export function productMedia(product, videos = []) {
  const id = String(product?.id || "");
  const image = isHttpUrl(product?.image) ? String(product.image) : "";
  const own = (Array.isArray(videos) ? videos : []).filter(
    (v) => v && v.public !== false && videoProductId(v) === id
  );
  const real = own.find((v) => videoMediaState(v) === MEDIA_STATE.REAL_VIDEO);
  if (real) return { state: MEDIA_STATE.REAL_VIDEO, videoUrl: real.videoUrl, poster: image, video: real };
  const synthetic = own.find((v) => videoMediaState(v) === MEDIA_STATE.SYNTHETIC_ANIMATION);
  if (synthetic) return { state: MEDIA_STATE.SYNTHETIC_ANIMATION, videoUrl: synthetic.videoUrl, poster: image, video: synthetic };
  if (image) return { state: MEDIA_STATE.STATIC_IMAGE, image };
  return { state: MEDIA_STATE.MISSING_MEDIA };
}

/** Public, playable videos only (never local blob: drafts). */
export function publicVideos(videos = []) {
  return (Array.isArray(videos) ? videos : [])
    .filter((v) => v && v.public !== false && videoMediaState(v))
    .map((v) => ({ ...v, mediaState: videoMediaState(v) }));
}

const MERCHANTS = [
  [/(^|\.)aliexpress\.[a-z.]+$|(^|\.)s\.click\.aliexpress\.com$/i, "AliExpress"],
  [/(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.to$/i, "Amazon"],
  [/(^|\.)ebay\.[a-z.]+$/i, "eBay"],
  [/(^|\.)shein\.[a-z.]+$/i, "SHEIN"],
  [/(^|\.)temu\.com$/i, "Temu"],
  [/(^|\.)iherb\.com$/i, "iHerb"],
  [/(^|\.)asos\.com$/i, "ASOS"],
  [/(^|\.)etsy\.com$/i, "Etsy"],
  [/(^|\.)zara\.com$/i, "ZARA"],
  [/(^|\.)next\.co\.il$/i, "NEXT"],
  [/(^|\.)terminalx\.com$/i, "Terminal X"],
  [/(^|\.)ksp\.co\.il$/i, "KSP"],
];

/** The store where the purchase actually happens (from the product link). */
export function merchantOf(product) {
  const raw = String(product?.affiliateUrl || product?.sourceUrl || "");
  let host = "";
  try {
    const u = new URL(raw);
    // A platform /r wrapper → the real destination.
    const inner = u.pathname.replace(/\/$/, "") === "/r" ? u.searchParams.get("u") : "";
    host = new URL(inner || raw).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!host) return { name: "", host: "" };
  for (const [re, name] of MERCHANTS) if (re.test(host)) return { name, host };
  return { name: host.replace(/^www\./, ""), host };
}

export function categoryLabel(category, lang = "he") {
  const dict = categoryLabels[lang === "en" ? "en" : "he"] || {};
  return dict[category] || dict.Other || String(category || "");
}

export function publicCatalog(products = [], marketers = []) {
  return (Array.isArray(products) ? products : []).filter((p) => isPublicCatalogProduct(p, marketers));
}

/** Public creators: only marketers with at least one public product. No private fields. */
export function publicCreators(marketers = [], products = []) {
  const counts = new Map();
  for (const p of publicCatalog(products, marketers)) counts.set(p.marketerId, (counts.get(p.marketerId) || 0) + 1);
  return (Array.isArray(marketers) ? marketers : [])
    .filter((m) => m?.id && counts.has(m.id))
    .map((m) => ({
      id: m.id,
      slug: m.slug || m.id,
      name: String(m.name || "").trim(),
      bio: String(m.bio || "").trim(),
      color: m.color || null,
      avatar: isHttpUrl(m.avatar || m.image) ? (m.avatar || m.image) : "",
      productCount: counts.get(m.id),
    }));
}

/** Real activity from the click/view ledger — never estimated. */
export function activityByProduct(clicks = []) {
  const map = new Map();
  for (const c of Array.isArray(clicks) ? clicks : []) {
    if (!c?.productId) continue;
    const a = map.get(c.productId) || { clicks: 0, views: 0 };
    if (c.type === "view") a.views++;
    else a.clicks++;
    map.set(c.productId, a);
  }
  return map;
}

export const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export function isNewProduct(product, now = Date.now()) {
  const ts = Number(product?.createdAt || product?.updatedAt || 0);
  return ts > 0 && now - ts < NEW_WINDOW_MS;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "") // Hebrew niqqud
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain, explainable search over products and creators (all tokens must match). */
export function searchCatalog(query, { products = [], marketers = [] } = {}) {
  const tokens = norm(query).split(" ").filter(Boolean);
  const pub = publicCatalog(products, marketers);
  if (!tokens.length) return { products: [], creators: [], tokens };
  const hay = (p) =>
    norm([
      p.title, p.marketingTitle, p.brand, p.description, p.category,
      categoryLabel(p.category, "he"), categoryLabel(p.category, "en"),
      Array.isArray(p.tags) ? p.tags.join(" ") : "", merchantOf(p).name,
    ].join(" "));
  const productHits = pub.filter((p) => {
    const h = hay(p);
    return tokens.every((t) => h.includes(t));
  });
  const creatorHits = publicCreators(marketers, products).filter((c) => {
    const h = norm(`${c.name} ${c.bio}`);
    return tokens.every((t) => h.includes(t));
  });
  return { products: productHits, creators: creatorHits, tokens };
}

/**
 * Collections: the creators' own collections first, then automatic ones built
 * from real catalog attributes (category / price band / brand) — labelled so.
 */
export function buildCollections({ products = [], marketers = [], collections = [] } = {}, lang = "he") {
  const pub = publicCatalog(products, marketers);
  const byId = new Map(pub.map((p) => [p.id, p]));
  const out = [];
  for (const c of Array.isArray(collections) ? collections : []) {
    const items = (c?.productIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!items.length) continue;
    out.push({ id: `c-${c.id}`, kind: "creator", title: c.title, marketerId: c.marketerId, products: items });
  }
  const byCategory = new Map();
  for (const p of pub) {
    const k = p.category || "Other";
    byCategory.set(k, [...(byCategory.get(k) || []), p]);
  }
  for (const [cat, items] of byCategory) {
    if (items.length < 2) continue;
    out.push({ id: `cat-${cat}`, kind: "category", category: cat, title: categoryLabel(cat, lang), products: items });
  }
  for (const max of [50, 100, 200]) {
    const items = pub.filter((p) => Number(p.price) > 0 && Number(p.price) <= max);
    if (items.length >= 3) {
      out.push({ id: `under-${max}`, kind: "price", max, title: lang === "en" ? `Under ₪${max}` : `עד ₪${max}`, products: items.sort((a, b) => a.price - b.price) });
    }
  }
  const byBrand = new Map();
  for (const p of pub) {
    const b = String(p.brand || "").trim();
    if (!b) continue;
    byBrand.set(b, [...(byBrand.get(b) || []), p]);
  }
  for (const [brand, items] of byBrand) {
    if (items.length >= 2) out.push({ id: `brand-${brand}`, kind: "brand", title: brand, products: items });
  }
  return out;
}

/** Price drops detected by the daily price watch (real events only). */
export function detectedPriceDrops(notifications = [], products = []) {
  const byId = new Map((Array.isArray(products) ? products : []).map((p) => [String(p?.id), p]));
  const drops = [];
  for (const n of Array.isArray(notifications) ? notifications : []) {
    if (n?.type !== "price_drop") continue;
    const m = String(n.id || "").match(/^pricedrop_(.+)_\d+$/);
    const product = m ? byId.get(m[1]) : null;
    if (product) drops.push({ product, ts: Number(n.ts) || 0, text: String(n.body || "") });
  }
  return drops.sort((a, b) => b.ts - a.ts);
}

/** Budget picks: real prices only, cheapest first. */
export function budgetPicks(products = [], max = 100) {
  return (Array.isArray(products) ? products : [])
    .filter((p) => Number(p?.price) > 0 && Number(p.price) <= max)
    .sort((a, b) => Number(a.price) - Number(b.price));
}

/** "₪1,299" with correct grouping; empty string when there is no real price. */
export function formatPrice(price, lang = "he") {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "";
  const s = n.toLocaleString(lang === "en" ? "en-US" : "he-IL", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `₪${s}`;
}

/** Tracked outbound link — the server resolves the stored affiliate URL by pid. */
export function trackedDealPath(product, src = "site") {
  return `/r?pid=${encodeURIComponent(String(product?.id || ""))}&src=${encodeURIComponent(src)}`;
}

/** Is this product sold directly on LikeLink (same-origin checkout)? */
export function directCheckoutUrl(product, origin = "") {
  const checkout = product?.checkoutUrl || product?.directCheckoutUrl || product?.purchaseUrl || product?.paymentUrl;
  if (!checkout || !origin) return "";
  try {
    return new URL(checkout).origin === new URL(origin).origin ? String(checkout) : "";
  } catch {
    return "";
  }
}
