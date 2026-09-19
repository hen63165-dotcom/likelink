/**
 * LikeLink2 Trend Radar 🔭
 * =========================
 * Evidence-based trend lifecycle tracking for LikeLink2 Autonomous Growth OS.
 *
 * Lifecycle states:
 *   DETECTED → RISING → ACCELERATING → PEAK → DECLINING → EXPIRED
 *   or INSUFFICIENT_DATA when evidence is lacking.
 *
 * Rules:
 *   - Never label a trend "viral", "hottest", "best", or "trending now" without evidence.
 *   - If real external trend data is unavailable, mark as INSUFFICIENT_DATA.
 *   - All fields are honest: missing evidence = null / INSUFFICIENT_DATA, never invented.
 */

export const TREND_STATES = Object.freeze({
  DETECTED: "DETECTED",
  RISING: "RISING",
  ACCELERATING: "ACCELERATING",
  PEAK: "PEAK",
  DECLINING: "DECLINING",
  EXPIRED: "EXPIRED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});

export const TREND_STATE_LABELS = Object.freeze({
  [TREND_STATES.DETECTED]: { he: "נמצאה", en: "Detected" },
  [TREND_STATES.RISING]: { he: "עולה", en: "Rising" },
  [TREND_STATES.ACCELERATING]: { he: "מאיצה", en: "Accelerating" },
  [TREND_STATES.PEAK]: { he: "פסגה", en: "Peak" },
  [TREND_STATES.DECLINING]: { he: "יורדת", en: "Declining" },
  [TREND_STATES.EXPIRED]: { he: "פג תוקף", en: "Expired" },
  [TREND_STATES.INSUFFICIENT_DATA]: { he: "אין נתונים", en: "Insufficient Data" },
});

export const TREND_STATE_COLORS = Object.freeze({
  [TREND_STATES.DETECTED]: "#8B5CF6",
  [TREND_STATES.RISING]: "#3B82F6",
  [TREND_STATES.ACCELERATING]: "#06B6D4",
  [TREND_STATES.PEAK]: "#10B981",
  [TREND_STATES.DECLINING]: "#F59E0B",
  [TREND_STATES.EXPIRED]: "#6B7280",
  [TREND_STATES.INSUFFICIENT_DATA]: "#9CA3AF",
});

export function createTrend(input = {}) {
  const now = Date.now();
  return {
    trendId: String(input.trendId || `trend_${now}_${Math.random().toString(36).slice(2, 8)}`),
    state: input.state || TREND_STATES.INSUFFICIENT_DATA,
    previousState: input.previousState || null,
    source: input.source || null,
    sourceTimestamp: input.sourceTimestamp || null,
    geography: input.geography || null,
    language: input.language || null,
    category: input.category || null,
    platform: input.platform || null,
    signal: input.signal || null,
    direction: input.direction || null,
    momentum: input.momentum || null,
    keywords: Array.isArray(input.keywords) ? input.keywords.filter(Boolean) : [],
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.filter(Boolean) : [],
    audienceRelevance: input.audienceRelevance || null,
    evidence: input.evidence || null,
    relatedProducts: Array.isArray(input.relatedProducts) ? input.relatedProducts.filter(Boolean) : [],
    confidence: input.confidence || null,
    score: input.score || 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt || now + 7 * 24 * 60 * 60 * 1000,
    metadata: input.metadata || {},
  };
}

export function transitionTrendState(trend, newState) {
  if (!trend) return null;
  return {
    ...trend,
    previousState: trend.state,
    state: newState,
    updatedAt: Date.now(),
  };
}

export function trendIsActive(trend) {
  if (!trend) return false;
  return [
    TREND_STATES.DETECTED,
    TREND_STATES.RISING,
    TREND_STATES.ACCELERATING,
    TREND_STATES.PEAK,
  ].includes(trend.state);
}

export function trendIsStale(trend) {
  if (!trend) return true;
  if (!trend.expiresAt) return true;
  return Date.now() > trend.expiresAt;
}

export function trendHasEvidence(trend) {
  if (!trend) return false;
  return Boolean(trend.source && trend.sourceTimestamp && (trend.keywords?.length || trend.signal));
}

export function scoreTrendForOpportunity(trend, product) {
  if (!trend || !product) return 0;
  let score = 0;
  if (trend.state === TREND_STATES.ACCELERATING) score += 40;
  else if (trend.state === TREND_STATES.RISING) score += 30;
  else if (trend.state === TREND_STATES.PEAK) score += 20;
  else if (trend.state === TREND_STATES.DETECTED) score += 10;
  else score -= 20;

  if (trendHasEvidence(trend)) score += 20;
  if (!trendIsStale(trend)) score += 10;
  if (trend.category && trend.category === product.category) score += 20;
  if (trend.language) score += 5;
  if (trend.geography) score += 5;
  if (trend.audienceRelevance) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function summarizeTrend(trend, lang = "he") {
  if (!trend) return { he: "אין טרנד", en: "No trend" };
  const label = TREND_STATE_LABELS[trend.state]?.[lang] || trend.state;
  const parts = [label];
  if (trend.platform) parts.push(trend.platform);
  if (trend.category) parts.push(trend.category);
  if (trend.signal) parts.push(trend.signal);
  return {
    he: parts.join(" · "),
    en: parts.join(" · "),
  };
}

export function trendToCard(trend, lang = "he") {
  if (!trend) return null;
  const label = TREND_STATE_LABELS[trend.state]?.[lang] || trend.state;
  const color = TREND_STATE_COLORS[trend.state] || "#9CA3AF";
  return {
    id: trend.trendId,
    state: trend.state,
    label,
    color,
    platform: trend.platform,
    category: trend.category,
    signal: trend.signal,
    keywords: trend.keywords || [],
    hashtags: trend.hashtags || [],
    momentum: trend.momentum,
    confidence: trend.confidence,
    evidence: trend.evidence,
    source: trend.source,
    updatedAt: trend.updatedAt,
    summary: summarizeTrend(trend, lang),
  };
}
