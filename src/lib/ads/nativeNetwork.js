import { PLACEMENT } from "./types.js";

export const PLACEMENT_SPECS = Object.freeze({
  [PLACEMENT.FEED_SPONSORED]: {
    id: PLACEMENT.FEED_SPONSORED,
    name: { he: "פיד ממומן", en: "Feed Sponsored" },
    description: { he: "מוצר ממומן שמופיע בפיד הגילוי בין תוצאות אורגניות", en: "Sponsored product appearing in discovery feed among organic results" },
    component: "SponsoredProductCard",
    maxPerPage: 3,
    spacing: 4,
    formats: ["image", "carousel"],
    targeting: ["category", "price_range", "intent"],
    minBid: 0.5,
    ctrBenchmark: 0.02,
    alwaysAvailable: true,
  },
  [PLACEMENT.SEARCH_SPONSORED]: {
    id: PLACEMENT.SEARCH_SPONSORED,
    name: { he: "חיפוש ממומן", en: "Search Sponsored" },
    description: { he: "מוצר ממומן בראש תוצאות החיפוש", en: "Sponsored product at top of search results" },
    component: "SponsoredSearchResult",
    maxPerPage: 2,
    spacing: 0,
    formats: ["image", "carousel"],
    targeting: ["query", "category", "price_range"],
    minBid: 0.8,
    ctrBenchmark: 0.03,
    alwaysAvailable: true,
  },
  [PLACEMENT.DISCOVERY_SPONSORED]: {
    id: PLACEMENT.DISCOVERY_SPONSORED,
    name: { he: "גילוי ממומן", en: "Discovery Sponsored" },
    description: { he: "מוצר ממומן באזור הגילוי וההמלצות", en: "Sponsored product in discovery/recommendations section" },
    component: "SponsoredDiscoveryCard",
    maxPerPage: 2,
    spacing: 3,
    formats: ["image", "carousel", "video"],
    targeting: ["category", "audience", "trending"],
    minBid: 0.6,
    ctrBenchmark: 0.025,
    alwaysAvailable: true,
  },
  [PLACEMENT.STUDIO_SPONSORED]: {
    id: PLACEMENT.STUDIO_SPONSORED,
    name: { he: "סטודיו ממומן", en: "Studio Sponsored" },
    description: { he: "מוצר ממומן במסך הסטודיו של היוצרים", en: "Sponsored product in creator studio view" },
    component: "SponsoredStudioCard",
    maxPerPage: 1,
    spacing: 0,
    formats: ["video", "reel", "story"],
    targeting: ["creator_niche", "product_category"],
    minBid: 1.0,
    ctrBenchmark: 0.04,
    alwaysAvailable: true,
  },
  [PLACEMENT.STORY_SPONSORED]: {
    id: PLACEMENT.STORY_SPONSORED,
    name: { he: "סטורי ממומן", en: "Story Sponsored" },
    description: { he: "סטורי ממומן ברצף הסטוריז", en: "Sponsored story in story sequence" },
    component: "SponsoredStory",
    maxPerPage: 3,
    spacing: 5,
    formats: ["story", "reel", "video"],
    targeting: ["audience", "trending"],
    minBid: 0.7,
    ctrBenchmark: 0.035,
    alwaysAvailable: true,
  },
  [PLACEMENT.CREATOR_SPONSORED]: {
    id: PLACEMENT.CREATOR_SPONSORED,
    name: { he: "יוצר ממומן", en: "Creator Sponsored" },
    description: { he: "מוצר ממומן בעמוד הפרופיל של יוצר", en: "Sponsored product on creator profile page" },
    component: "SponsoredCreatorCard",
    maxPerPage: 2,
    spacing: 2,
    formats: ["video", "reel", "story", "image"],
    targeting: ["creator_audience", "product_match"],
    minBid: 1.2,
    ctrBenchmark: 0.05,
    alwaysAvailable: true,
  },
  [PLACEMENT.CONTEXTUAL_RECOMMENDATION]: {
    id: PLACEMENT.CONTEXTUAL_RECOMMENDATION,
    name: { he: "המלצה קונטקסטואלית", en: "Contextual Recommendation" },
    description: { he: "המלצת מוצר בתוך תוכן/מאמר/סטורי רלוונטי", en: "Product recommendation within relevant content/story" },
    component: "ContextualProductTag",
    maxPerPage: 5,
    spacing: 1,
    formats: ["product_tag"],
    targeting: ["content_topic", "intent", "category"],
    minBid: 0.3,
    ctrBenchmark: 0.015,
    alwaysAvailable: true,
  },
});

export const NATIVE_PLACEMENTS = Object.values(PLACEMENT_SPECS).filter((p) => p.alwaysAvailable);

export function getPlacementSpec(placementId) {
  return PLACEMENT_SPECS[placementId] || null;
}

export function getAllNativePlacements() {
  return NATIVE_PLACEMENTS;
}

export function getPlacementsForCampaign(campaign) {
  const allowed = campaign.placements || [];
  return allowed.map((id) => PLACEMENT_SPECS[id]).filter(Boolean);
}

export function getAvailablePlacementsForTier(tier) {
  const limits = {
    starter: ["feed_sponsored", "search_sponsored"],
    professional: ["feed_sponsored", "search_sponsored", "discovery_sponsored", "studio_sponsored", "story_sponsored"],
    business: ["feed_sponsored", "search_sponsored", "discovery_sponsored", "studio_sponsored", "story_sponsored", "creator_sponsored", "contextual_recommendation"],
  };
  return (limits[tier] || []).map((id) => PLACEMENT_SPECS[id]).filter(Boolean);
}

export function createPlacementInstance(placementId, campaignId, creativeId, options = {}) {
  const spec = PLACEMENT_SPECS[placementId];
  if (!spec) return null;

  return {
    id: "plc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
    placementId: spec.id,
    campaignId,
    creativeId,
    status: "active",
    bid: options.bid || spec.minBid,
    targeting: options.targeting || {},
    schedule: options.schedule || { start: Date.now(), end: null },
    pacing: options.pacing || "even",
    frequencyCap: options.frequencyCap || { impressions: 3, windowHours: 24 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function validatePlacementConfig(placementId, config) {
  const spec = PLACEMENT_SPECS[placementId];
  if (!spec) return { valid: false, error: "מיקום לא מוכר" };

  const errors = [];

  if (config.bid !== undefined && config.bid < spec.minBid) {
    errors.push("הצעה מינימלית למיקום זה: " + spec.minBid);
  }

  if (config.targeting) {
    const supported = spec.targeting || [];
    const keys = Object.keys(config.targeting);
    for (let i = 0; i < keys.length; i++) {
      if (!supported.includes(keys[i])) {
        errors.push("טירגוט לא נתמך למיקום זה: " + keys[i]);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function calculatePlacementScore(placementId, campaign, creative) {
  const spec = PLACEMENT_SPECS[placementId];
  if (!spec) return 0;

  let score = 0;

  if (creative.format && spec.formats.includes(creative.format)) {
    score += 30;
  }

  const recommendedTypes = {
    feed_sponsored: ["ugc", "lifestyle"],
    search_sponsored: ["ugc", "product_demo"],
    discovery_sponsored: ["ugc", "cinematic_3d"],
    studio_sponsored: ["cinematic_3d", "cinematic_motion"],
    story_sponsored: ["cinematic_3d", "reel"],
    creator_sponsored: ["ugc", "lifestyle"],
    contextual_recommendation: ["product_demo"],
  };

  const types = recommendedTypes[placementId];
  if (types && types.includes(creative.type)) {
    score += 20;
  }

  return score;
}

export function getPlacementLabels(lang) {
  if (lang === undefined) lang = "he";
  const labels = {};
  const entries = Object.entries(PLACEMENT_SPECS);
  for (let i = 0; i < entries.length; i++) {
    const id = entries[i][0];
    const spec = entries[i][1];
    labels[id] = spec.name[lang] || spec.name.he;
  }
  return labels;
}