/**
 * LikeLink Ads OS — Creative Studio
 * =================================
 * Generates real ad creatives from product data.
 * No fake content, no fabricated claims.
 */

import { buildCampaign } from "../cloud/campaign.js";
import { generateContentPack } from "../cloud/contentStudio.js";
import { lunaHook, lunaStoryText, AMBASSADOR } from "../ambassador.js";
import { buildTrackedLink } from "../cloud/hooks.js";
import { CREATIVE_FORMAT, CREATIVE_TYPE, PLACEMENT } from "./types.js";

function generateId(prefix = "crt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getProductImages(product) {
  return [product?.image, product?.image2, product?.image3].filter(
    (x) => typeof x === "string" && /^https?:\/\//i.test(x)
  );
}

function hookFor(product, style, he) {
  if (style === "cinematic3d") {
    return he
      ? `✨ ${product?.title || "המוצר"} — סיפור מוצר קולנועי מבית LikeLink`
      : `✨ ${product?.title || "The product"} — a cinematic LikeLink product story`;
  }
  if (style === "cinematic_motion") {
    return he
      ? `🎬 ${product?.title || "המוצר"} — תנועה קולנועית שמספרת את הסיפור`
      : `🎬 ${product?.title || "The product"} — cinematic motion telling the story`;
  }
  return he
    ? `🔥 ${product?.title || "המוצר"} — בואי תראי למה הוא שווה מקום בעגלה`
    : `🔥 ${product?.title || "The product"} — see why it belongs in your cart`;
}

function getPlacementSpecs(placement) {
  const specs = {
    feed_sponsored: { width: 1080, height: 1350, aspect: "4:5", format: ["image", "carousel"] },
    search_sponsored: { width: 1080, height: 1080, aspect: "1:1", format: ["image", "carousel"] },
    discovery_sponsored: { width: 1080, height: 1350, aspect: "4:5", format: ["image", "carousel", "video"] },
    studio_sponsored: { width: 1080, height: 1920, aspect: "9:16", format: ["video", "reel", "story"] },
    story_sponsored: { width: 1080, height: 1920, aspect: "9:16", format: ["story", "reel", "video"] },
    creator_sponsored: { width: 1080, height: 1920, aspect: "9:16", format: ["video", "reel", "story", "image"] },
    contextual_recommendation: { width: 400, height: 400, aspect: "1:1", format: ["image", "product_tag"] },
  };
  return specs[placement] || { width: 1080, height: 1080, aspect: "1:1", format: ["image"] };
}

function generateUGCCreative(product, placement, options = {}) {
  const he = options.lang === "he";
  const images = getProductImages(product);
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  const primaryImage = images[0] || product.image || "";
  const productName = product.title || "מוצר מומלץ";

  const creative = {
    id: `crt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "ugc",
    format: placement === "studio_sponsored" || placement === "story_sponsored" ? "reel" : "image",
    placement,
    productId: product.id,
    marketerId: options.marketerId || null,
    assets: {
      primaryImage,
      images: images.slice(0, 5),
      video: null,
      thumbnail: images[0] || "",
    },
    copy: {
      hook: hookFor(product, "ugc", true),
      headline: `${productName}${price ? ` · ${price}` : ""}`,
      body: `מוצר שנבחר בקפידה על ידי ${AMBASSADOR.name} — ${product.description?.slice(0, 120) || "כל הפרטים בלינק"}`,
      cta: "לרכישה — הלינק בביו 👇",
      disclosure: "ממומן · קישור שותפים",
    },
    trackedUrl: trackedUrl,
    placementSpecs: getPlacementSpecs("feed_sponsored"),
    metadata: {
      style: "ugc",
      palette: "dark",
      badge: "יוצרת · 9:16",
      language: "he",
      createdAt: Date.now(),
    },
    status: "ready",
    renderStatus: "ready",
  };

  return creative;
}

function generateCinematic3DCreative(product, placement, options = {}) {
  const he = options.lang === "he";
  const images = getProductImages(product);
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  const creative = {
    id: `crt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "cinematic_3d",
    format: "video",
    placement,
    productId: product.id,
    marketerId: options.marketerId || null,
    assets: {
      primaryImage: images[0] || "",
      images: images.slice(0, 5),
      video: null,
      thumbnail: images[0] || "",
    },
    copy: {
      hook: hookFor(product, "cinematic3d", true),
      headline: `${product.title}${price ? ` · ${price}` : ""}`,
      body: `סיפור מוצר קולנועי — ${product.description?.slice(0, 140) || "כל הפרטים בלינק"}`,
      cta: "לצפייה ולרכישה 👇",
      disclosure: "ממומן · קישור שותפים",
    },
    trackedUrl: trackedUrl,
    placementSpecs: getPlacementSpecs(placement),
    metadata: {
      style: "cinematic_3d",
      palette: "gold",
      badge: "תנועת מוצר מקורית · 9:16",
      language: "he",
      createdAt: Date.now(),
    },
    status: "pending_render",
    renderStatus: "pending",
  };

  return creative;
}

function generateCinematicMotionCreative(product, placement, options = {}) {
  const he = options.lang === "he";
  const images = getProductImages(product);
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  const creative = {
    id: `crt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "cinematic_motion",
    format: "video",
    placement,
    productId: product.id,
    marketerId: options.marketerId || null,
    assets: {
      primaryImage: images[0] || "",
      images: images.slice(0, 5),
      video: null,
      thumbnail: images[0] || "",
    },
    copy: {
      hook: hookFor(product, "cinematic_motion", true),
      headline: `${product.title}${price ? ` · ${price}` : ""}`,
      body: `תנועה קולנועית שמספרת את הסיפור — ${product.description?.slice(0, 140) || "כל הפרטים בלינק"}`,
      cta: "לצפייה ולרכישה 👇",
      disclosure: "ממומן · קישור שותפים",
    },
    trackedUrl: trackedUrl,
    placementSpecs: getPlacementSpecs(placement),
    metadata: {
      style: "cinematic_motion",
      palette: "gold",
      badge: "תנועה קולנועית · 9:16",
      language: "he",
      createdAt: Date.now(),
    },
    status: "pending_render",
    renderStatus: "pending",
  };

  return creative;
}

function generateProductDemoCreative(product, placement, options = {}) {
  const he = options.lang === "he";
  const images = getProductImages(product);
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  const creative = {
    id: `crt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "product_demo",
    format: "video",
    placement,
    productId: product.id,
    marketerId: options.marketerId || null,
    assets: {
      primaryImage: images[0] || "",
      images: images.slice(0, 5),
      video: null,
      thumbnail: images[0] || "",
    },
    copy: {
      hook: `הדגמה: ${product.title}`,
      headline: `${product.title}${price ? ` · ${price}` : ""}`,
      body: `הדגמה מלאה של המוצר — ${product.description?.slice(0, 140) || "כל הפרטים בלינק"}`,
      cta: "לפרטים ולרכישה 👇",
      disclosure: "ממומן · קישור שותפים",
    },
    trackedUrl: trackedUrl,
    placementSpecs: getPlacementSpecs(placement),
    metadata: {
      style: "product_demo",
      palette: "dark",
      badge: "הדגמת מוצר · 9:16",
      language: "he",
      createdAt: Date.now(),
    },
    status: "pending_render",
    renderStatus: "pending",
  };

  return creative;
}

function generateLifestyleCreative(product, placement, options = {}) {
  const he = options.lang === "he";
  const images = getProductImages(product);
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  const creative = {
    id: `crt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "lifestyle",
    format: "image",
    placement,
    productId: product.id,
    marketerId: options.marketerId || null,
    assets: {
      primaryImage: images[0] || "",
      images: images.slice(0, 5),
      video: null,
      thumbnail: images[0] || "",
    },
    copy: {
      hook: `סגנון חיים עם ${product.title}`,
      headline: `${product.title}${price ? ` · ${price}` : ""}`,
      body: `${product.description?.slice(0, 120) || "השלימי את הלוק"}`,
      cta: "לרכישה — הלינק בביו 👇",
      disclosure: "ממומן · קישור שותפים",
    },
    trackedUrl: trackedUrl,
    placementSpecs: getPlacementSpecs(placement),
    metadata: {
      style: "lifestyle",
      palette: "dark",
      badge: "לייפסטייל",
      language: "he",
      createdAt: Date.now(),
    },
    status: "ready",
    renderStatus: "ready",
  };

  return creative;
}

// ── Truthful media state ────────────────────────────────────────────────
// Ad creatives are generated as copy + the product's real photos. No
// renderer produces their video: `renderStatus: "pending"` is only the
// default written at creation. The UI therefore derives the media state from
// the real asset, never from that flag:
//   playable          a real video URL exists            → "מוכן לצפייה"
//   rendering         a real render job is attached       → "בתהליך יצירה"
//   ready_to_animate  motion format, no video, no job     → "מוכן ליצירת אנימציה"
//   static            image creative (copy + photo)       → "מוכן · טקסט ותמונה"
const MOTION_FORMATS = new Set(["video", "reel", "story"]);
const ACTIVE_RENDER_JOB_STATES = new Set(["queued", "running", "processing"]);

export const CREATIVE_MEDIA_STATE = Object.freeze({
  PLAYABLE: "playable",
  RENDERING: "rendering",
  READY_TO_ANIMATE: "ready_to_animate",
  STATIC: "static",
});

export const CREATIVE_MEDIA_STATE_LABELS_HE = Object.freeze({
  [CREATIVE_MEDIA_STATE.PLAYABLE]: "מוכן לצפייה",
  [CREATIVE_MEDIA_STATE.RENDERING]: "בתהליך יצירה",
  [CREATIVE_MEDIA_STATE.READY_TO_ANIMATE]: "מוכן ליצירת אנימציה",
  [CREATIVE_MEDIA_STATE.STATIC]: "מוכן · טקסט ותמונה",
});

function playableVideoUrl(creative) {
  const url = String(creative?.assets?.video || "").trim();
  return /^(https?:|blob:)/i.test(url) ? url : "";
}

export function isMotionCreative(creative) {
  return MOTION_FORMATS.has(String(creative?.format || ""));
}

export function creativeMediaState(creative) {
  if (playableVideoUrl(creative)) return CREATIVE_MEDIA_STATE.PLAYABLE;
  const job = creative?.renderJob;
  if (job && job.id && ACTIVE_RENDER_JOB_STATES.has(String(job.state || "").toLowerCase())) {
    return CREATIVE_MEDIA_STATE.RENDERING;
  }
  return isMotionCreative(creative) ? CREATIVE_MEDIA_STATE.READY_TO_ANIMATE : CREATIVE_MEDIA_STATE.STATIC;
}

export function creativeVideoUrl(creative) {
  return playableVideoUrl(creative);
}

export function generateCreative(product, type, placement, options = {}) {
  if (!product || !product.id) return null;

  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";

  switch (type) {
    case "ugc":
      return generateUGCCreative(product, placement, { ...options, trackedUrl });
    case "cinematic_3d":
      return generateCinematic3DCreative(product, placement, { ...options, trackedUrl });
    case "cinematic_motion":
      return generateCinematicMotionCreative(product, placement, { ...options, trackedUrl });
    case "product_demo":
      return generateProductDemoCreative(product, placement, { ...options, trackedUrl });
    case "lifestyle":
      return generateLifestyleCreative(product, placement, { ...options, trackedUrl });
    case "ugc_style":
      return generateUGCCreative(product, placement, { ...options, trackedUrl });
    default:
      return generateUGCCreative(product, placement, { ...options, trackedUrl });
  }
}

export function buildCreativePack(product, placement, types = ["ugc", "cinematic_3d", "product_demo", "lifestyle"], options = {}) {
  if (!product) return null;

  const trackedUrl = options.trackedUrl || product.affiliateUrl || product.url || "";
  const pack = {
    productId: product.id,
    placement,
    creatives: [],
    createdAt: Date.now(),
  };

  for (const type of types) {
    const creative = generateCreative(product, type, placement, { ...options, trackedUrl });
    if (creative) pack.creatives.push(creative);
  }

  return pack;
}

export function getAvailableCreativeTypesForPlacement(placement) {
  const map = {
    feed_sponsored: ["ugc", "lifestyle", "product_demo"],
    search_sponsored: ["ugc", "lifestyle", "product_demo"],
    discovery_sponsored: ["ugc", "cinematic_3d", "lifestyle", "product_demo"],
    studio_sponsored: ["cinematic_3d", "cinematic_motion", "product_demo", "ugc"],
    story_sponsored: ["cinematic_3d", "cinematic_motion", "ugc"],
    creator_sponsored: ["ugc", "cinematic_3d", "product_demo", "lifestyle"],
    contextual_recommendation: ["ugc", "product_demo"],
  };
  return map[placement] || ["ugc"];
}

export function getRecommendedCreativeTypeForPlacement(placement) {
  const map = {
    feed_sponsored: "ugc",
    search_sponsored: "ugc",
    discovery_sponsored: "cinematic_3d",
    studio_sponsored: "cinematic_3d",
    story_sponsored: "cinematic_3d",
    creator_sponsored: "ugc",
    contextual_recommendation: "product_demo",
  };
  return map[placement] || "ugc";
}

export function validateCreative(creative) {
  const errors = [];
  if (!creative.id) errors.push("מזהה חסר");
  if (!creative.type) errors.push("סוג חסר");
  if (!creative.format) errors.push("פורמט חסר");
  if (!creative.placement) errors.push("מיקום חסר");
  if (!creative.productId) errors.push("מזהה מוצר חסר");
  if (!creative.copy || !creative.copy.hook) errors.push("הוק חסר");
  if (!creative.copy.headline) errors.push("כותרת חסרה");
  if (!creative.copy.cta) errors.push("CTA חסר");
  if (!creative.copy.disclosure) errors.push("גילוי נאות חסר");
  if (!creative.trackedUrl) errors.push("קישור מעקב חסר");
  return { valid: errors.length === 0, errors };
}