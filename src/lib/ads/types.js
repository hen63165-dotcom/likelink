/**
 * LikeLink Ads OS — Core Types & Constants
 * =========================================
 * Pure type definitions for the autonomous ads system.
 * No network, no secrets, no side effects.
 */

// Campaign objectives — real business goals only
export const CAMPAIGN_OBJECTIVE = Object.freeze({
  SALES: "sales",
  AFFILIATE_CLICKS: "affiliate_clicks",
  PRODUCT_DISCOVERY: "product_discovery",
  TRAFFIC: "traffic",
  LEADS: "leads",
});

// Campaign status — real lifecycle states only
export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived",
});

// Creative formats — real output types only
export const CREATIVE_FORMAT = Object.freeze({
  IMAGE: "image",
  VIDEO: "video",
  REEL: "reel",
  STORY: "story",
  CAROUSEL: "carousel",
  COLLECTION: "collection",
  PRODUCT_TAG: "product_tag",
  SPONSORED_PRODUCT: "sponsored_product",
});

// Creative types — real production types only
export const CREATIVE_TYPE = Object.freeze({
  UGC: "ugc",
  CINEMATIC_3D: "cinematic_3d",
  PRODUCT_DEMO: "product_demo",
  LIFESTYLE: "lifestyle",
  UGC_STYLE: "ugc_style",
  CINEMATIC_MOTION: "cinematic_motion",
});

// Placement types — internal LikeLink network placements
export const PLACEMENT = Object.freeze({
  FEED_SPONSORED: "feed_sponsored",
  SEARCH_SPONSORED: "search_sponsored",
  DISCOVERY_SPONSORED: "discovery_sponsored",
  STUDIO_SPONSORED: "studio_sponsored",
  STORY_SPONSORED: "story_sponsored",
  CREATOR_SPONSORED: "creator_sponsored",
  CONTEXTUAL_RECOMMENDATION: "contextual_recommendation",
});

// Event types — real measurable events only
export const AD_EVENT = Object.freeze({
  IMPRESSION: "impression",
  CREATIVE_VIEW: "creative_view",
  CLICK: "click",
  PRODUCT_VIEW: "product_view",
  OUTBOUND_CLICK: "outbound_click",
  CHECKOUT_START: "checkout_start",
  PURCHASE: "purchase",
  AFFILIATE_CONVERSION: "affiliate_conversion",
  CREATIVE_RENDER_COMPLETE: "creative_render_complete",
});

// Luna decision states
export const LUNA_DECISION = Object.freeze({
  KEEP: "keep",
  TEST_VARIATION: "test_variation",
  PAUSE: "pause",
  INCREASE_EXPOSURE: "increase_exposure",
  INSUFFICIENT_DATA: "insufficient_data",
});

// Connection states for external networks
export const EXTERNAL_CONNECTION_STATE = Object.freeze({
  AVAILABLE: "available",
  CONNECTED: "connected",
  NEEDS_AUTH: "needs_auth",
  UNAVAILABLE: "unavailable",
  RATE_LIMITED: "rate_limited",
  FAILED: "failed",
});

// Campaign tier labels
export const CAMPAIGN_TIER = Object.freeze({
  STARTER: "starter",
  PROFESSIONAL: "professional",
  BUSINESS: "business",
});

// Attribution confidence levels
export const ATTRIBUTION_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  UNKNOWN: "unknown",
});

// Helper functions
export function isValidObjective(obj) {
  return Object.values(CAMPAIGN_OBJECTIVE).includes(obj);
}

export function isValidStatus(status) {
  return Object.values(CAMPAIGN_STATUS).includes(status);
}

export function isValidFormat(format) {
  return Object.values(CREATIVE_FORMAT).includes(format);
}

export function isValidType(type) {
  return Object.values(CREATIVE_TYPE).includes(type);
}

export function isValidPlacement(placement) {
  return Object.values(PLACEMENT).includes(placement);
}

export function isValidEvent(event) {
  return Object.values(AD_EVENT).includes(event);
}

export function isValidConnectionState(state) {
  return Object.values(EXTERNAL_CONNECTION_STATE).includes(state);
}

export function isValidTier(tier) {
  return Object.values(CAMPAIGN_TIER).includes(tier);
}

// Hebrew labels
export const OBJECTIVE_LABELS_HE = Object.freeze({
  [CAMPAIGN_OBJECTIVE.SALES]: "מכירות",
  [CAMPAIGN_OBJECTIVE.AFFILIATE_CLICKS]: "קליקים לשותפים",
  [CAMPAIGN_OBJECTIVE.PRODUCT_DISCOVERY]: "גילוי מוצרים",
  [CAMPAIGN_OBJECTIVE.TRAFFIC]: "תנועה",
  [CAMPAIGN_OBJECTIVE.LEADS]: "לידים",
});

export const STATUS_LABELS_HE = Object.freeze({
  [CAMPAIGN_STATUS.DRAFT]: "טיוטה",
  [CAMPAIGN_STATUS.PENDING_REVIEW]: "ממתין לאישור",
  [CAMPAIGN_STATUS.ACTIVE]: "פעיל",
  [CAMPAIGN_STATUS.PAUSED]: "מושהה",
  [CAMPAIGN_STATUS.COMPLETED]: "הושלם",
  [CAMPAIGN_STATUS.ARCHIVED]: "ארכיון",
});

export const FORMAT_LABELS_HE = Object.freeze({
  [CREATIVE_FORMAT.IMAGE]: "תמונה",
  [CREATIVE_FORMAT.VIDEO]: "וידאו",
  [CREATIVE_FORMAT.REEL]: "רילס",
  [CREATIVE_FORMAT.STORY]: "סטורי",
  [CREATIVE_FORMAT.CAROUSEL]: "קרוסלה",
  [CREATIVE_FORMAT.COLLECTION]: "קולקציה",
  [CREATIVE_FORMAT.PRODUCT_TAG]: "תג מוצר",
  [CREATIVE_FORMAT.SPONSORED_PRODUCT]: "מוצר ממומן",
});

export const TYPE_LABELS_HE = Object.freeze({
  [CREATIVE_TYPE.UGC]: "UGC",
  [CREATIVE_TYPE.CINEMATIC_3D]: "3D קולנועי",
  [CREATIVE_TYPE.PRODUCT_DEMO]: "הדגמת מוצר",
  [CREATIVE_TYPE.LIFESTYLE]: "לייפסטייל",
  [CREATIVE_TYPE.UGC_STYLE]: "סגנון UGC",
  [CREATIVE_TYPE.CINEMATIC_MOTION]: "תנועה קולנועית",
});

export const PLACEMENT_LABELS_HE = Object.freeze({
  [PLACEMENT.FEED_SPONSORED]: "פיד ממומן",
  [PLACEMENT.SEARCH_SPONSORED]: "חיפוש ממומן",
  [PLACEMENT.DISCOVERY_SPONSORED]: "גילוי ממומן",
  [PLACEMENT.STUDIO_SPONSORED]: "סטודיו ממומן",
  [PLACEMENT.STORY_SPONSORED]: "סטורי ממומן",
  [PLACEMENT.CREATOR_SPONSORED]: "יוצר ממומן",
  [PLACEMENT.CONTEXTUAL_RECOMMENDATION]: "המלצה קונטקסטואלית",
});

export const TIER_LABELS_HE = Object.freeze({
  [CAMPAIGN_TIER.STARTER]: "Starter",
  [CAMPAIGN_TIER.PROFESSIONAL]: "Professional",
  [CAMPAIGN_TIER.BUSINESS]: "Business",
});

export const CONNECTION_STATE_LABELS_HE = Object.freeze({
  [EXTERNAL_CONNECTION_STATE.AVAILABLE]: "זמין",
  [EXTERNAL_CONNECTION_STATE.CONNECTED]: "מחובר",
  [EXTERNAL_CONNECTION_STATE.NEEDS_AUTH]: "נדרש אימות",
  [EXTERNAL_CONNECTION_STATE.UNAVAILABLE]: "לא זמין",
  [EXTERNAL_CONNECTION_STATE.RATE_LIMITED]: "הגבלת קצב",
  [EXTERNAL_CONNECTION_STATE.FAILED]: "נכשל",
});

export const LUNA_DECISION_LABELS_HE = Object.freeze({
  [LUNA_DECISION.KEEP]: "השאר",
  [LUNA_DECISION.TEST_VARIATION]: "בדוק וריאציה",
  [LUNA_DECISION.PAUSE]: "השהה",
  [LUNA_DECISION.INCREASE_EXPOSURE]: "הגבר חשיפה",
  [LUNA_DECISION.INSUFFICIENT_DATA]: "נתונים לא מספיקים",
});

export const EVENT_LABELS_HE = Object.freeze({
  [AD_EVENT.IMPRESSION]: "חשיפה",
  [AD_EVENT.CREATIVE_VIEW]: "צפייה בקריאייטיב",
  [AD_EVENT.CLICK]: "קליק",
  [AD_EVENT.PRODUCT_VIEW]: "צפייה במוצר",
  [AD_EVENT.OUTBOUND_CLICK]: "קליק יוצא",
  [AD_EVENT.CHECKOUT_START]: "התחלת רכישה",
  [AD_EVENT.PURCHASE]: "רכישה",
  [AD_EVENT.AFFILIATE_CONVERSION]: "המרה לשותף",
  [AD_EVENT.CREATIVE_RENDER_COMPLETE]: "רינדור הושלם",
});