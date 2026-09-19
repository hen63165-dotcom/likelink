/**
 * LikeLink2 Creative Mutation Engine 🎨
 * ======================================
 * For an ACT opportunity generate controlled creative variants.
 *
 * Supported creative types (when existing capabilities allow):
 *   short_video, ugc_concept, product_demo, story, reel, post,
 *   slideshow, seo_article, landing_content, hook_variant, cta_variant
 *
 * For each creative:
 *   - Hook variants (real, not duplicate)
 *   - Script / scene structure
 *   - Captions, subtitles, text overlays
 *   - CTA variants
 *   - Title, description
 *   - Hashtags
 *   - Thumbnail / cover direction
 *
 * Uses product-specific facts only.
 * Never invents product claims, prices, reviews, certifications or performance.
 */

import { generateHookVariations } from "./hooks.js";
import { lunaHookForProduct, lunaStoryText, AMBASSADOR } from "../ambassador.js";
import { trendHasEvidence } from "./trendRadar.js";

export const CREATIVE_TYPES = Object.freeze({
  SHORT_VIDEO: "short_video",
  UGC_CONCEPT: "ugc_concept",
  PRODUCT_DEMO: "product_demo",
  STORY: "story",
  REEL: "reel",
  POST: "post",
  SLIDESHOW: "slideshow",
  SEO_ARTICLE: "seo_article",
  LANDING_CONTENT: "landing_content",
  HOOK_VARIANT: "hook_variant",
  CTA_VARIANT: "cta_variant",
});

export const CREATIVE_STATUS = Object.freeze({
  READY: "READY",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  UNAVAILABLE: "UNAVAILABLE",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
});

export function createCreativeVariant({
  product,
  trend,
  character = null,
  language = "he",
  platform = null,
  creativeType = CREATIVE_TYPES.POST,
  hookSeed = null,
  ctaSeed = null,
  existingHooks = [],
  existingCtas = [],
} = {}) {
  if (!product) return null;

  const hooks = generateHookVariations(product, {
    count: 3,
    storeUrl: "",
    trend,
    language,
    seed: hookSeed,
  }).filter((h) => !existingHooks.includes(h.text));

  const lunaHook = lunaHookForProduct(product);
  const lunaStory = lunaStoryText(product);

  const ctaOptions = [
    ctaSeed || "לרכישה 👉 הלינק בפרופיל",
    "קנייה מהנה 🛍️",
    "הזמינו עכשיו ✨",
    "למד/י עוד ↴",
  ].filter((c) => !existingCtas.includes(c));

  const baseScript = {
    hook: hooks[0]?.text || lunaHook,
    problem: `${product.title} — לפעמים קשה למצוא את זה במיטבו.`,
    introduction: `הנה ${product.title || "פריט מומלץ"}.`,
    demonstration: product.description || "תצוגה קצרה של המוצר.",
    benefits: product.description || "יתרונות ברורים.",
    objection: "זה לא רק עוד פריט.",
    cta: ctaOptions[0] || "לרכישה 👉 הלינק בפרופיל",
    ending: "לחצ/י על הקישור בפרופיל.",
  };

  const captions = {
    he: {
      title: product.title || "",
      description: product.description || lunaStory,
      hook: hooks[0]?.text || lunaHook,
      cta: ctaOptions[0] || "לרכישה 👉 הלינק בפרופיל",
      lines: buildCaptionLines(baseScript, language === "he" ? "he" : "en"),
    },
    en: {
      title: product.title || "",
      description: product.description || "",
      hook: hooks[0]?.text || "",
      cta: ctaOptions[0] || "Shop now 👉 link in bio",
      lines: buildCaptionLines(baseScript, "en"),
    },
  };

  const subtitles = {
    he: buildSubtitleTracks(baseScript, "he"),
    en: buildSubtitleTracks(baseScript, "en"),
  };

  const hashtags = buildHashtags(product, trend);

  const creative = {
    creativeId: `creative_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    creativeType,
    status: CREATIVE_STATUS.READY,
    productId: product.id,
    trendId: trend?.trendId || null,
    character: character ? { id: character.characterId, name: character.name, persona: character.persona } : null,
    language,
    platform,
    hooks,
    ctaOptions,
    script: baseScript,
    captions,
    subtitles,
    textOverlays: [],
    title: captions[language]?.title || product.title || "",
    description: captions[language]?.description || product.description || "",
    hashtags,
    thumbnailDirection: creativeType === CREATIVE_TYPES.REEL || creativeType === CREATIVE_TYPES.SHORT_VIDEO ? "product_hero" : "product_lifestyle",
    aspectRatio: creativeType === CREATIVE_TYPES.REEL || creativeType === CREATIVE_TYPES.SHORT_VIDEO ? "9:16" : "1:1",
    createdAt: Date.now(),
    metadata: {
      trendState: trend?.state || null,
      trendSource: trend?.source || null,
      evidenceLevel: trendHasEvidence(trend) ? "MEASURED" : trend ? "ESTIMATED" : "INSUFFICIENT_DATA",
    },
  };

  return creative;
}

export function mutateCreative(baseCreative, mutationType = "hook") {
  if (!baseCreative) return null;
  const next = { ...baseCreative, creativeId: `creative_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };

  if (mutationType === "hook" && baseCreative.hooks?.length >= 2) {
    const alt = baseCreative.hooks[1];
    next.script = { ...baseCreative.script, hook: alt.text };
    next.captions = {
      ...baseCreative.captions,
      [baseCreative.language]: { ...baseCreative.captions[baseCreative.language], hook: alt.text },
    };
    next.title = alt.text.slice(0, 60);
  } else if (mutationType === "cta" && baseCreative.ctaOptions?.length >= 2) {
    const altCta = baseCreative.ctaOptions[1];
    next.script = { ...baseCreative.script, cta: altCta };
    next.captions = {
      ...baseCreative.captions,
      [baseCreative.language]: { ...baseCreative.captions[baseCreative.language], cta: altCta },
    };
  } else if (mutationType === "aspect_ratio") {
    next.aspectRatio = baseCreative.aspectRatio === "9:16" ? "1:1" : "9:16";
  } else if (mutationType === "language" && baseCreative.language === "he") {
    next.language = "en";
    next.captions = {
      ...baseCreative.captions,
      en: { ...(baseCreative.captions.en || baseCreative.captions.he), hook: baseCreative.script.hook, cta: baseCreative.script.cta },
    };
  }

  return next;
}

export function buildHashtags(product, trend) {
  const tags = [];
  if (product?.category) tags.push(`#${product.category}`);
  if (product?.title) {
    const words = product.title.split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
    words.forEach((w) => tags.push(`#${w}`));
  }
  if (trend?.keywords?.length) trend.keywords.slice(0, 5).forEach((k) => tags.push(`#${k}`));
  if (trend?.hashtags?.length) trend.hashtags.slice(0, 5).forEach((h) => tags.push(h.startsWith("#") ? h : `#${h}`));
  return Array.from(new Set(tags)).slice(0, 12);
}

export function creativeSummary(creative, lang = "he") {
  if (!creative) return { he: "אין יצירה", en: "No creative" };
  const typeLabel = creative.creativeType || "post";
  const parts = [typeLabel];
  if (creative.hooks?.[0]?.text) parts.push(creative.hooks[0].text.slice(0, 30));
  if (creative.platform) parts.push(creative.platform);
  return {
    he: parts.join(" · "),
    en: parts.join(" · "),
  };
}

function buildCaptionLines(script, lang) {
  const lines = [];
  if (script.hook) lines.push({ text: script.hook, startMs: 0, endMs: 3000, type: "hook" });
  if (script.introduction) lines.push({ text: script.introduction, startMs: 3000, endMs: 7000, type: "intro" });
  if (script.demonstration) lines.push({ text: script.demonstration, startMs: 7000, endMs: 11000, type: "demo" });
  if (script.benefits) lines.push({ text: script.benefits, startMs: 11000, endMs: 14500, type: "benefit" });
  if (script.cta) lines.push({ text: script.cta, startMs: 14500, endMs: 18000, type: "cta" });
  return lines;
}

function buildSubtitleTracks(script, lang) {
  const cues = [];
  if (script.hook) cues.push({ startMs: 0, endMs: 3000, text: script.hook });
  if (script.introduction) cues.push({ startMs: 3000, endMs: 7000, text: script.introduction });
  if (script.demonstration) cues.push({ startMs: 7000, endMs: 11000, text: script.demonstration });
  if (script.benefits) cues.push({ startMs: 11000, endMs: 14500, text: script.benefits });
  if (script.cta) cues.push({ startMs: 14500, endMs: 18000, text: script.cta });
  return cues;
}
