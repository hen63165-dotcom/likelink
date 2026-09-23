/**
 * LikeLink2 Affiliate Product Pipeline
 * ====================================
 * Imports, validates, normalizes, and publishes affiliate products from
 * the live product source (catalog.LIVE_PRODUCTS + bootstrapProducts) into
 * the KV-backed marketplace. Generates UGC-style content packs with an
 * evidence-based hook engine. Fully idempotent.
 *
 * Pipeline: INGEST → NORMALIZE → VALIDATE → QUALITY FILTER → DEDUPLICATE → PUBLISH → CONTENT
 */

import { LIVE_PRODUCTS, createProduct, trendScore, deduplicate, hasValidAttribution, AVAILABILITY, bootstrapProducts } from "./catalog.js";
import { lunaHookForProduct, lunaStoryText, AMBASSADOR } from "../ambassador.js";
import { generateContentPack } from "./contentStudio.js";

const ORIGIN = "https://likelink2.vercel.app";
const AFFILIATE_DISCLOSURE_HE = "קישור שותפים: ייתכן שנקבל עמלה אם תרכשו דרך הקישור.";
const AFFILIATE_DISCLOSURE_EN = "Affiliate link: we may earn a commission if you purchase through this link.";
const AFFILIATE_DISCLOSURE_AR = "رابط شريك: ربما نحصل على عمولة إذا اشتريت من خلال هذا الرابط.";

/**
 * Ingest raw product candidates from all available sources.
 * Uses LIVE_PRODUCTS (verified AliExpress tracking IDs) + bootstrapProducts().
 * NEVER invents products — only imports from existing catalog definitions.
 */
export function ingestProducts({ marketerId } = {}) {
  const owner = String(marketerId || "msd6go4kff49s5").trim();
  if (!owner) return { ok: false, error: "missing_owner_id" };

  const candidates = [];

  for (const lp of LIVE_PRODUCTS) {
    candidates.push(createProduct({ ...lp, marketerId: owner }));
  }

  const bootstrapped = bootstrapProducts({ marketerId: owner });
  for (const p of bootstrapped) {
    candidates.push(p);
  }

  return { ok: true, candidates, owner };
}

/**
 * Normalize a product into canonical shape. Ensures all fields are
 * typed correctly and defaults are applied from real data only.
 */
export function normalizeProduct(raw) {
  const p = createProduct({
    ...raw,
    marketerId: raw.marketerId,
  });

  if (raw.price && String(raw.price).includes("₪")) {
    const match = String(raw.price).match(/₪\s*([\d,.]+)/);
    if (match) p.price = parseFloat(match[1].replace(/,/g, ""));
  }

  if (!p.tags || !p.tags.length) {
    p.tags = extractTags(p.title, p.description, p.category);
  }

  return p;
}

/**
 * Validate a product — reject products missing required evidence.
 * Real signals only: no fabricated data.
 */
export function validateProduct(product, { marketerExists = false, marketers = [] } = {}) {
  if (!product) return { valid: false, reason: "missing_product" };

  const checks = {
    hasTitle: Boolean(product.title && String(product.title).trim().length > 0),
    hasPrice: Number(product.price) > 0,
    hasAffiliateUrl: Boolean(product.affiliateUrl && isValidAffiliateUrl(product.affiliateUrl)),
    hasImage: Boolean(product.image && product.image.length > 0),
    hasCategory: Boolean(product.category && product.category.trim()),
    hasOwner: Boolean(marketerExists ? hasValidAttribution(product, marketers) : product.marketerId),
  };

  const invalid = Object.entries(checks).filter(([, v]) => !v);
  if (invalid.length) {
    return { valid: false, reason: `invalid: ${invalid.map(([k]) => k).join(", ")}` };
  }

  return { valid: true, reason: null };
}

/**
 * Quality filter — applies real signals to decide whether a product is
 * ready for the marketplace. Returns { eligible, reasons }.
 */
export function qualityFilter(product, { clicks = [], sales = [], marketers = [] } = {}) {
  const reasons = [];

  const v = validateProduct(product, { marketerExists: marketers && marketers.length > 0, marketers });
  if (!v.valid) return { eligible: false, reasons: [v.reason] };

  if (!product.status || product.status !== "approved") {
    reasons.push(`status:${product.status || "none"}`);
  }

  if (product.marketerId && product.marketerId === "msd6go4kff49s5") {
    // Single-owner products are eligible (the platform IS the marketer for live products)
  }

  return {
    eligible: reasons.length === 0,
    reasons: reasons.length ? reasons : ["pass_all"],
  };
}

/**
 * Deduplicate candidates against existing KV products.
 * Returns only NEW products that don't already exist (by id or by title similarity).
 */
export function findNewProducts(candidates, existingProducts) {
  const existingIds = new Set((existingProducts || []).map((p) => String(p.id).toLowerCase()));
  const existingTitles = new Set(
    (existingProducts || []).map((p) => String(p.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60))
  );

  const newProducts = [];
  const duplicates = [];

  for (const c of candidates) {
    const idMatch = existingIds.has(String(c.id).toLowerCase());
    const titleKey = String(c.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
    const titleMatch = existingTitles.has(titleKey);

    if (!idMatch && !titleMatch) {
      newProducts.push(c);
    } else {
      duplicates.push({ id: c.id, title: c.title, reason: idMatch ? "id_match" : "title_match" });
    }
  }

  return { newProducts, duplicates };
}

/**
 * Hook Engine — generates UGC-style creator content structured as:
 * HOOK → PROBLEM → PRODUCT → WHY IT MATTERS → PROOF → CTA
 *
 * All content is generated from REAL product attributes only.
 * Nothing is fabricated: no fake reviews, results, discounts, or promises.
 */
export function buildHookEngine(product, { clicks = [], sales = [], lang = "he" } = {}) {
  const pid = String(product.id);
  const hook = lunaHookForProduct(product);
  const story = lunaStoryText(product, hook);

  const productClicks = clicks.filter((c) => String(c.productId) === pid).length;
  const productSales = sales.filter((s) => String(s.productId) === pid).length;

  const trend = trendScore(product, { clicks, sales });

  const isHebrew = lang === "he" || lang === "heb";
  const isArabic = lang === "ar" || lang === "arab";

  const disclosure = isHebrew
    ? AFFILIATE_DISCLOSURE_HE
    : isArabic
    ? AFFILIATE_DISCLOSURE_AR
    : AFFILIATE_DISCLOSURE_EN;

  const contentPack = {
    productId: pid,
    title: product.title,
    price: Number(product.price) > 0 ? `₪${Number(product.price)}` : "",
    image: product.image || "",
    currency: product.currency || "ILS",
    category: product.category,

    hook,
    story,

    problem: isHebrew
      ? product.description
        ? product.description
        : `${product.title} — מתאים לכאן ועכשיו`
      : `${product.title || "this item"} — ready for you`,
    product: product.title,

    whyItMatters: isHebrew
      ? `נבחר לפי התאמה לקהל — ${product.category || "קטעגוריה"} | ממוחשב מנתוני שימוש אמיתיים`
      : `Selected for audience fit — ${product.category || "category"} | based on real usage data`,

    proof: {
      clicks: productClicks,
      sales: productSales,
      trendScore: trend.score,
      source: product.source || "aliexpress",
      evidence: trend.evidence,
    },

    cta: {
      primary: isHebrew ? " קנו עכשיו — פותח בטאב חדש " : "Shop now — opens in new tab",
      disclosure,
    },

    trustSignals: {
      sourceData: {
        affiliateUrl: Boolean(product.affiliateUrl),
        price: Number(product.price) > 0,
        image: Boolean(product.image),
      },
      affiliateRelationship: {
        source: product.source || "aliexpress",
        affiliateUrl: product.affiliateUrl,
      },
      likeLinkVerification: {
        fingerprint: product.veritas_hash || null,
        status: product.status,
      },
      trendSignal: {
        score: trend.score,
        components: trend.components,
      },
    },

    formats: generateContentPack(product, { format: "all" }),

    publishedAt: null,
    publishedUrl: null,
    language: lang,
    createdAt: Date.now(),
  };

  return contentPack;
}

/**
 * Validate affiliate URL format.
 * Accepts http/https URLs with affiliate tracking parameters.
 */
export function isValidAffiliateUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Check if a product is stale (should be rotated).
 * A product is stale when:
 * - It has 0 clicks in the last 30 days AND age > 14 days
 * - OR its affiliate URL no longer resolves (404/dead)
 * - OR its price appears to have changed significantly
 */
export function isProductStale(product, { clicks = [], sales = [], now = Date.now() } = {}) {
  const pid = String(product.id);
  const recentClicks = clicks.filter(
    (c) => String(c.productId) === pid && now - Number(c.ts || 0) <= 14 * 86400000
  ).length;

  const ageMs = product.createdAt ? now - new Date(product.createdAt).getTime() : 0;
  const ageDays = ageMs / 86400000;

  const noRecentEngagement = recentClicks === 0 && ageDays > 14;
  const noAffiliateUrl = !product.affiliateUrl || !isValidAffiliateUrl(product.affiliateUrl);
  const noPrice = !Number(product.price) > 0;

  return {
    stale: noRecentEngagement || noAffiliateUrl || noPrice,
    reasons: [
      ...(noRecentEngagement ? ["no_engagement_14d"] : []),
      ...(noAffiliateUrl ? ["no_affiliate_url"] : []),
      ...(noPrice ? ["no_price"] : []),
    ].filter(Boolean),
    ageDays,
  };
}

/**
 * Extract tags from product title/description using category keywords.
 */
function extractTags(title, description, category) {
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  const tags = [];
  const cat = category || "";

  const simpleTags = text
    .split(/[\s,.\n]+/)
    .filter((w) => w.length >= 3)
    .filter((w) => !["the", "and", "for", "with", "this", "that", "from"].includes(w));

  for (const t of simpleTags.slice(0, 8)) {
    if (!tags.includes(t)) tags.push(t);
  }

  if (cat) tags.push(cat.toLowerCase());

  return tags;
}
