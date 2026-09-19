/**
 * LikeLink2 Opportunity Engine 🎯
 * ================================
 * Central opportunity decision layer for the Autonomous Growth OS.
 *
 * For each product × trend × audience × platform combination evaluate:
 *   - trend relevance
 *   - product relevance
 *   - audience relevance
 *   - geographic relevance
 *   - language relevance
 *   - trend momentum
 *   - freshness
 *   - prior performance
 *   - creative availability
 *   - destination availability
 *   - connection capability
 *   - duplication risk
 *   - compliance/risk
 *
 * Return an internal opportunity decision:
 *   ACT | WATCH | WAIT | IGNORE | BLOCKED
 *
 * Never expose fabricated scores as facts.
 */

import { TREND_STATES, trendIsActive, trendHasEvidence, scoreTrendForOpportunity } from "./trendRadar.js";
import { evaluateCapability } from "./capabilityBroker.js";
import { getConnectionState } from "./connectionManager.js";

export const OPPORTUNITY_DECISIONS = Object.freeze({
  ACT: "ACT",
  WATCH: "WATCH",
  WAIT: "WAIT",
  IGNORE: "IGNORE",
  BLOCKED: "BLOCKED",
});

export const OPPORTUNITY_DECISION_LABELS = Object.freeze({
  [OPPORTUNITY_DECISIONS.ACT]: { he: "הפעל", en: "Act" },
  [OPPORTUNITY_DECISIONS.WATCH]: { he: "עקוב", en: "Watch" },
  [OPPORTUNITY_DECISIONS.WAIT]: { he: "המתן", en: "Wait" },
  [OPPORTUNITY_DECISIONS.IGNORE]: { he: "התעלם", en: "Ignore" },
  [OPPORTUNITY_DECISIONS.BLOCKED]: { he: "חסום", en: "Blocked" },
});

export const OPPORTUNITY_DECISION_COLORS = Object.freeze({
  [OPPORTUNITY_DECISIONS.ACT]: "#10B981",
  [OPPORTUNITY_DECISIONS.WATCH]: "#3B82F6",
  [OPPORTUNITY_DECISIONS.WAIT]: "#F59E0B",
  [OPPORTUNITY_DECISIONS.IGNORE]: "#6B7280",
  [OPPORTUNITY_DECISIONS.BLOCKED]: "#EF4444",
});

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function evaluateOpportunity({
  product,
  trend,
  audience = {},
  platform = null,
  priorPerformance = {},
  creativeAvailability = false,
  connectionStates = {},
  recentContent = [],
  cooldownMs = 0,
  now = Date.now(),
}) {
  const scores = {
    trendRelevance: 0,
    productRelevance: 0,
    audienceRelevance: 0,
    freshness: 0,
    performance: 0,
    capability: 0,
    duplication: 0,
    compliance: 0,
  };

  if (!product) return { decision: OPPORTUNITY_DECISIONS.IGNORE, reason: "no_product", scores };

  scores.productRelevance = 40;

  if (trend) {
    const trendScore = scoreTrendForOpportunity(trend, product);
    scores.trendRelevance = Math.min(30, trendScore / 100 * 30);
    if (!trendIsActive(trend)) scores.trendRelevance = Math.max(0, scores.trendRelevance - 15);
    if (!trendHasEvidence(trend)) scores.trendRelevance = Math.max(0, scores.trendRelevance - 10);
  }

  if (audience?.language && product?.language) {
    scores.audienceRelevance += 10;
  }
  if (audience?.geography && product?.geography) {
    scores.audienceRelevance += 10;
  }
  if (audience?.category && product?.category && audience.category === product.category) {
    scores.audienceRelevance += 10;
  }

  const ageHours = (now - (product.createdAt || now)) / (1000 * 60 * 60);
  if (ageHours < 24) scores.freshness += 15;
  else if (ageHours < 72) scores.freshness += 10;
  else if (ageHours < 168) scores.freshness += 5;

  if (priorPerformance?.ctr > 0) scores.performance += 10;
  if (priorPerformance?.conversions > 0) scores.performance += 10;
  if (priorPerformance?.revenue > 0) scores.performance += 10;

  if (creativeAvailability) scores.capability += 10;

  if (platform && connectionStates[platform]) {
    const conn = connectionStates[platform];
    if (conn === "CONNECTED") scores.capability += 20;
    else if (conn === "READY") scores.capability += 15;
    else if (conn === "DEGRADED") scores.capability += 5;
    else if (conn === "REAUTH_REQUIRED" || conn === "BLOCKED" || conn === "ERROR") scores.capability -= 20;
  }

  const recentForProduct = recentContent.filter((c) => c?.productId === product.id);
  const recentForTrend = trend ? recentContent.filter((c) => c?.trendId === trend.trendId) : [];
  if (recentForProduct.length >= 3) scores.duplication -= 15;
  if (recentForTrend.length >= 2) scores.duplication -= 10;
  if (cooldownMs && now - (recentForProduct[0]?.ts || 0) < cooldownMs) scores.duplication -= 20;

  scores.compliance = 10;

  const total =
    scores.trendRelevance +
    scores.productRelevance +
    scores.audienceRelevance +
    scores.freshness +
    scores.performance +
    scores.capability +
    scores.duplication +
    scores.compliance;

  let decision = OPPORTUNITY_DECISIONS.IGNORE;
  let reason = "low_score";

  if (scores.capability < -10 || scores.compliance < 0) {
    decision = OPPORTUNITY_DECISIONS.BLOCKED;
    reason = scores.capability < -10 ? "capability_blocked" : "compliance_risk";
  } else if (total >= 70) {
    decision = OPPORTUNITY_DECISIONS.ACT;
    reason = "high_opportunity_score";
  } else if (total >= 45) {
    decision = OPPORTUNITY_DECISIONS.WATCH;
    reason = "moderate_score";
  } else if (total >= 25) {
    decision = OPPORTUNITY_DECISIONS.WAIT;
    reason = "low_score";
  } else {
    decision = OPPORTUNITY_DECISIONS.IGNORE;
    reason = "insufficient_evidence";
  }

  if (scores.duplication < -10) {
    decision = OPPORTUNITY_DECISIONS.WAIT;
    reason = "duplication_risk";
  }

  return {
    decision,
    reason,
    scores,
    total,
    confidence: trendHasEvidence(trend) ? "MEASURED" : trend ? "ESTIMATED" : "INSUFFICIENT_DATA",
  };
}

export function selectBestOpportunity(opportunities, maxSelect = 3) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return [];
  const priority = {
    [OPPORTUNITY_DECISIONS.ACT]: 0,
    [OPPORTUNITY_DECISIONS.WATCH]: 1,
    [OPPORTUNITY_DECISIONS.WAIT]: 2,
    [OPPORTUNITY_DECISIONS.IGNORE]: 3,
    [OPPORTUNITY_DECISIONS.BLOCKED]: 4,
  };
  return opportunities
    .slice()
    .sort((a, b) => (priority[a.decision] ?? 5) - (priority[b.decision] ?? 5) || (b.total || 0) - (a.total || 0))
    .slice(0, maxSelect);
}

export function opportunitySummary(opp, lang = "he") {
  if (!opp) return { he: "אין הזדמנות", en: "No opportunity" };
  const decisionLabel = OPPORTUNITY_DECISION_LABELS[opp.decision]?.[lang] || opp.decision;
  const parts = [decisionLabel];
  if (opp.reason) parts.push(opp.reason);
  if (opp.total) parts.push(`score:${Math.round(opp.total)}`);
  return {
    he: parts.join(" · "),
    en: parts.join(" · "),
  };
}
