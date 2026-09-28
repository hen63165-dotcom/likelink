/**
 * LikeLink Ads OS — Campaign Manager
 * ==================================
 * Manages campaign lifecycle with real persistence.
 * Pure module — no network, no secrets.
 */

import {
  CAMPAIGN_OBJECTIVE,
  CAMPAIGN_STATUS,
  CREATIVE_FORMAT,
  CREATIVE_TYPE,
  PLACEMENT,
  CAMPAIGN_TIER,
  isValidObjective,
  isValidStatus,
  isValidFormat,
  isValidType,
  isValidPlacement,
  isValidTier,
} from "./types.js";

const CAMPAIGN_KV_KEY = "ads:campaigns";
const CREATIVE_KV_KEY = "ads:creatives";
const EVENT_KV_KEY = "ads:events";
const PLACEMENT_KV_KEY = "ads:placements";
const LUNA_DECISIONS_KV_KEY = "ads:luna:decisions";

function generateId(prefix = "cmp") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateCreativeId() {
  return generateId("crt");
}

function generateEventId() {
  return generateId("evt");
}

function generatePlacementId() {
  return generateId("plc");
}

export function getTierLimits(tier) {
  const limits = {
    starter: { maxCampaigns: 3, maxCreatives: 10, maxDailyBudget: 100, placements: ["feed_sponsored", "search_sponsored"] },
    professional: { maxCampaigns: 10, maxCreatives: 50, maxDailyBudget: 500, placements: ["feed_sponsored", "search_sponsored", "discovery_sponsored", "studio_sponsored", "story_sponsored"] },
    business: { maxCampaigns: 50, maxCreatives: 200, maxDailyBudget: 5000, placements: ["feed_sponsored", "search_sponsored", "discovery_sponsored", "studio_sponsored", "story_sponsored", "creator_sponsored", "contextual_recommendation"] },
  };
  return limits[tier] || limits.starter;
}

export function validateCampaign(data) {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push("שם הקמפיין חייב להיות לפחות 2 תווים");
  }
  if (!data.productId || typeof data.productId !== "string") {
    errors.push("מזהה מוצר חובה");
  }
  if (!data.objective || !Object.values({...require("./types.js").CAMPAIGN_OBJECTIVE}).includes(data.objective)) {
    errors.push("מטרה לא תקינה");
  }
  if (data.budget !== undefined && (typeof data.budget !== "number" || data.budget <= 0)) {
    errors.push("תקציב חייב להיות מספר חיובי");
  }
  if (data.dailyBudget !== undefined && (typeof data.dailyBudget !== "number" || data.dailyBudget <= 0)) {
    errors.push("תקציב יומי חייב להיות מספר חיובי");
  }
  if (data.startDate && isNaN(Date.parse(data.startDate))) {
    errors.push("תאריך התחלה לא תקין");
  }
  if (data.endDate && isNaN(Date.parse(data.endDate))) {
    errors.push("תאריך סיום לא תקין");
  }
  if (data.startDate && data.endDate && new Date(data.startDate) >= new Date(data.endDate)) {
    errors.push("תאריך סיום חייב להיות אחרי תאריך התחלה");
  }
  if (data.tier && !Object.values(require("./types.js").CAMPAIGN_TIER).includes(data.tier)) {
    errors.push("דרגה לא תקינה");
  }
  return { valid: errors.length === 0, errors };
}

export function createCampaign(data, { tier = "starter", marketerId } = {}) {
  const validation = validateCampaign(data);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  const limits = getTierLimits(tier);
  if (data.dailyBudget && data.dailyBudget > limits.maxDailyBudget) {
    return { ok: false, error: `תקציב יומי חורג מהמגבלה לדרגה ${tier} (מקסימום ${limits.maxDailyBudget})` };
  }

  const now = Date.now();
  const campaign = {
    id: generateId("cmp"),
    marketerId: marketerId || null,
    name: data.name.trim(),
    productId: data.productId,
    objective: data.objective,
    status: CAMPAIGN_STATUS.DRAFT,
    tier,
    budget: typeof data.budget === "number" ? data.budget : null,
    dailyBudget: typeof data.dailyBudget === "number" ? data.dailyBudget : null,
    startDate: data.startDate ? new Date(data.startDate).getTime() : now,
    endDate: data.endDate ? new Date(data.endDate).getTime() : null,
    targeting: data.targeting || {},
    placements: Array.isArray(data.placements) ? data.placements.filter(p => require("./types.js").isValidPlacement(p)) : ["feed_sponsored", "search_sponsored"],
    creatives: [],
    tracking: {
      utmSource: "likelink_ads",
      utmMedium: "cpc",
      utmCampaign: null, // will be set on activation
    },
    metrics: {
      impressions: 0,
      creativeViews: 0,
      clicks: 0,
      productViews: 0,
      outboundClicks: 0,
      purchases: 0,
      revenue: 0,
      spend: 0,
      ctr: 0,
      cpc: 0,
      roas: 0,
    },
    attribution: {
      confidence: "unknown",
      lastCalculated: null,
    },
    luna: {
      lastDecision: null,
      lastDecisionAt: null,
      decisionsCount: 0,
      learningEnabled: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: marketerId,
  };

  return { ok: true, campaign };
}

export function updateCampaign(campaign, updates) {
  const allowedFields = [
    "name", "objective", "status", "budget", "dailyBudget",
    "startDate", "endDate", "targeting", "placements", "tracking"
  ];
  const updated = { ...campaign };
  let changed = false;

  for (const key of allowedFields) {
    if (updates[key] !== undefined && updates[key] !== campaign[key]) {
      // Validate specific fields
      if (key === "status" && !Object.values(require("./types.js").CAMPAIGN_STATUS).includes(updates[key])) {
        throw new Error(`סטטוס לא תקין: ${updates[key]}`);
      }
      if (key === "placements" && Array.isArray(updates[key])) {
        const invalid = updates[key].filter(p => !require("./types.js").isValidPlacement(p));
        if (invalid.length) throw new Error(`מיקומים לא תקינים: ${invalid.join(", ")}`);
      }
      updated[key] = updates[key];
      changed = true;
    }
  }

  if (changed) {
    updated.updatedAt = Date.now();
  }

  return updated;
}

export function canTransitionStatus(current, next) {
  const validTransitions = {
    draft: ["pending_review", "active"],
    pending_review: ["active", "draft"],
    active: ["paused", "completed", "archived"],
    paused: ["active", "archived"],
    completed: ["archived"],
    archived: [],
  };
  return (validTransitions[current] || []).includes(next);
}

export function getTierLimitsForCampaign(campaign) {
  return getTierLimits(campaign.tier);
}

export function canAddCreative(campaign, currentCreativeCount) {
  const limits = getTierLimits(campaign.tier);
  return currentCreativeCount < limits.maxCreatives;
}

export function canCreateCampaign(currentCampaignCount, tier) {
  const limits = getTierLimits(tier);
  return currentCampaignCount < limits.maxCampaigns;
}

export function getAvailablePlacements(tier) {
  const limits = getTierLimits(tier);
  return limits.placements;
}

export function calculateCampaignHealth(campaign) {
  const m = campaign.metrics;
  const health = {
    score: 0,
    status: "healthy",
    issues: [],
    recommendations: [],
  };

  if (m.impressions === 0) {
    health.issues.push("אין חשיפות עדיין");
    health.recommendations.push("הפעל את הקמפיין או בדוק את המיקומים");
  }

  if (m.creativeViews > 0 && m.clicks === 0) {
    health.issues.push("יש צפיות אבל אין קליקים");
    health.recommendations.push("בדוק את הקריאייטיב וה-CTA");
  }

  if (m.clicks > 0 && m.productViews === 0) {
    health.issues.push("יש קליקים אבל אין צפיות מוצר");
    health.recommendations.push("בדוק את דף המוצר והקישור היוצא");
  }

  if (m.outboundClicks > 0 && m.purchases === 0) {
    health.issues.push("יש קליקים יוצאים אבל אין רכישות");
    health.recommendations.push("בדוק את דף הנחיתה וההמרה");
  }

  if (campaign.status === "active" && m.impressions === 0) {
    health.score = 0;
    health.status = "critical";
  } else if (m.impressions > 0 && m.clicks / m.impressions < 0.01) {
    health.score = 30;
    health.status = "needs_attention";
  } else if (m.clicks > 0 && m.productViews / m.clicks < 0.5) {
    health.score = 50;
    health.status = "needs_attention";
  } else if (m.outboundClicks > 0 && m.purchases / m.outboundClicks < 0.02) {
    health.score = 60;
    health.status = "needs_optimization";
  } else {
    health.score = 80;
    health.status = "healthy";
  }

  return health;
}

export function calculateROAS(campaign) {
  const { revenue, spend } = campaign.metrics;
  if (!spend || spend === 0) return null;
  return revenue / spend;
}

export function calculateCTR(campaign) {
  const { impressions, clicks } = campaign.metrics;
  if (!impressions || impressions === 0) return 0;
  return clicks / impressions;
}

export function calculateCPC(campaign) {
  const { spend, clicks } = campaign.metrics;
  if (!clicks || clicks === 0) return null;
  return spend / clicks;
}

export function calculateConversionRate(campaign) {
  const { outboundClicks, purchases } = campaign.metrics;
  if (!outboundClicks || outboundClicks === 0) return 0;
  return purchases / outboundClicks;
}

export function updateMetrics(campaign, event) {
  const updated = { ...campaign, metrics: { ...campaign.metrics } };
  const m = updated.metrics;

  switch (event.type) {
    case "impression":
      m.impressions += 1;
      break;
    case "creative_view":
      m.creativeViews += 1;
      break;
    case "click":
      m.clicks += 1;
      break;
    case "product_view":
      m.productViews += 1;
      break;
    case "outbound_click":
      m.outboundClicks += 1;
      break;
    case "purchase":
      m.purchases += 1;
      if (typeof event.revenue === "number") m.revenue += event.revenue;
      break;
    case "spend":
      if (typeof event.amount === "number") m.spend += event.amount;
      break;
  }

  // Recalculate derived metrics
  m.ctr = m.impressions > 0 ? m.clicks / m.impressions : 0;
  m.cpc = m.clicks > 0 ? (m.spend || 0) / m.clicks : 0;
  m.roas = m.spend > 0 ? (m.revenue || 0) / m.spend : 0;

  updated.updatedAt = Date.now();
  return updated;
}

export function createCampaignEvent(campaignId, event) {
  return {
    id: generateId("evt"),
    campaignId,
    type: event.type,
    timestamp: Date.now(),
    data: event.data || {},
    sessionId: event.sessionId || null,
    attribution: event.attribution || {},
  };
}

export function buildCampaignUTM(campaign, creativeId = null) {
  const base = {
    utm_source: "likelink_ads",
    utm_medium: "cpc",
    utm_campaign: campaign.id,
  };
  if (creativeId) {
    base.utm_content = creativeId;
  }
  return base;
}

export function buildTrackedUrl(baseUrl, utmParams) {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(utmParams)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

