/**
 * LikeLink2 Growth Learning Loop 🔄
 * ==================================
 * After distribution, collect whatever real performance data is available.
 * Compare creative variants. Identify:
 *   - winning hooks
 *   - weak hooks
 *   - winning formats
 *   - weak formats
 *   - winning CTAs
 *   - winning channels
 *   - winning product/trend combinations
 *   - declining opportunities
 *
 * Feed those findings back into the next generation cycle.
 * Learning must be reversible and auditable.
 * Never silently rewrite core business rules based on one noisy result.
 */

import { OPPORTUNITY_DECISIONS } from "./opportunityEngine.js";
import { createProvenance, EVIDENCE_LEVELS, validateGrowthSignal, sanitizeSignalForStorage } from "./securityControls.js";

const LEARNING_MAX_EVENTS = 5000;
const LEARNING_MIN_SAMPLE = 5;

export function recordPerformanceEvent(event) {
  if (!event || !event.creativeId) return null;
  const validation = validateGrowthSignal(event);
  if (!validation.valid) {
    return { rejected: true, reason: validation.reason, event };
  }
  const provenance = createProvenance({
    source: event.source || "growth_learning",
    actor: event.actor || null,
    session: event.session || null,
    product: event.productId,
    creator: event.creatorId || null,
    provider: event.provider || null,
    eventType: event.type,
    evidenceLevel: event.evidenceLevel || EVIDENCE_LEVELS.MEASURED,
  });
  const events = loadLearningEvents();
  const entry = {
    ...sanitizeSignalForStorage(event),
    provenance,
    ts: event.ts || Date.now(),
    id: `perf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  events.push(entry);
  const trimmed = events.slice(-LEARNING_MAX_EVENTS);
  saveLearningEvents(trimmed);
  return entry;
}

export function getPerformanceEvents({ since = null, creativeId = null, productId = null, trendId = null } = {}) {
  let events = loadLearningEvents();
  if (since) events = events.filter((e) => e.ts >= since);
  if (creativeId) events = events.filter((e) => e.creativeId === creativeId);
  if (productId) events = events.filter((e) => e.productId === productId);
  if (trendId) events = events.filter((e) => e.trendId === trendId);
  return events;
}

export function computeCreativeMetrics(events) {
  const byCreative = {};
  for (const ev of events) {
    if (!ev.creativeId) continue;
    byCreative[ev.creativeId] = byCreative[ev.creativeId] || { views: 0, clicks: 0, conversions: 0, revenue: 0 };
    if (ev.type === "view") byCreative[ev.creativeId].views += 1;
    else if (ev.type === "click") byCreative[ev.creativeId].clicks += 1;
    else if (ev.type === "conversion") {
      byCreative[ev.creativeId].conversions += 1;
      byCreative[ev.creativeId].revenue += safeNum(ev.amount);
    }
  }
  return Object.entries(byCreative).map(([creativeId, data]) => {
    const ctr = data.views > 0 ? (data.clicks / data.views) * 100 : 0;
    const cvr = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
    return { creativeId, ...data, ctr: Math.round(ctr * 100) / 100, cvr: Math.round(cvr * 100) / 100 };
  });
}

export function computeWinningPatterns(events) {
  const byHook = {};
  const byCta = {};
  const byFormat = {};
  const byChannel = {};
  const byProduct = {};
  const byTrend = {};

  for (const ev of events) {
    if (ev.hook) {
      byHook[ev.hook] = byHook[ev.hook] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byHook[ev.hook].views += 1;
      else if (ev.type === "click") byHook[ev.hook].clicks += 1;
      else if (ev.type === "conversion") byHook[ev.hook].conversions += 1;
    }
    if (ev.cta) {
      byCta[ev.cta] = byCta[ev.cta] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byCta[ev.cta].views += 1;
      else if (ev.type === "click") byCta[ev.cta].clicks += 1;
      else if (ev.type === "conversion") byCta[ev.cta].conversions += 1;
    }
    if (ev.creativeType) {
      byFormat[ev.creativeType] = byFormat[ev.creativeType] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byFormat[ev.creativeType].views += 1;
      else if (ev.type === "click") byFormat[ev.creativeType].clicks += 1;
      else if (ev.type === "conversion") byFormat[ev.creativeType].conversions += 1;
    }
    if (ev.platform) {
      byChannel[ev.platform] = byChannel[ev.platform] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byChannel[ev.platform].views += 1;
      else if (ev.type === "click") byChannel[ev.platform].clicks += 1;
      else if (ev.type === "conversion") byChannel[ev.platform].conversions += 1;
    }
    if (ev.productId) {
      byProduct[ev.productId] = byProduct[ev.productId] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byProduct[ev.productId].views += 1;
      else if (ev.type === "click") byProduct[ev.productId].clicks += 1;
      else if (ev.type === "conversion") byProduct[ev.productId].conversions += 1;
    }
    if (ev.trendId) {
      byTrend[ev.trendId] = byTrend[ev.trendId] || { conversions: 0, clicks: 0, views: 0 };
      if (ev.type === "view") byTrend[ev.trendId].views += 1;
      else if (ev.type === "click") byTrend[ev.trendId].clicks += 1;
      else if (ev.type === "conversion") byTrend[ev.trendId].conversions += 1;
    }
  }

  function rank(map, minSample = LEARNING_MIN_SAMPLE) {
    return Object.entries(map)
      .filter(([, d]) => (d.views || 0) >= minSample)
      .map(([key, d]) => ({ key, ...d, ctr: d.views > 0 ? (d.clicks / d.views) * 100 : 0, cvr: d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0 }))
      .sort((a, b) => (b.conversions || 0) - (a.conversions || 0));
  }

  return {
    hooks: rank(byHook),
    ctas: rank(byCta),
    formats: rank(byFormat),
    channels: rank(byChannel),
    productCombinations: rank(byProduct),
    trendCombinations: rank(byTrend),
  };
}

export function learningSummary(patterns, lang = "he") {
  const parts = [];
  if (patterns.hooks[0]) parts.push(lang === "he" ? `הוק: ${patterns.hooks[0].key}` : `Hook: ${patterns.hooks[0].key}`);
  if (patterns.formats[0]) parts.push(lang === "he" ? `פורמט: ${patterns.formats[0].key}` : `Format: ${patterns.formats[0].key}`);
  if (patterns.channels[0]) parts.push(lang === "he" ? `ערוץ: ${patterns.channels[0].key}` : `Channel: ${patterns.channels[0].key}`);
  return parts.join(" · ") || (lang === "he" ? "אין מספיק נתונים ללמידה" : "Insufficient data for learning");
}

function loadLearningEvents() {
  try {
    const raw = localStorage.getItem("likelink_learning_events");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLearningEvents(events) {
  try {
    localStorage.setItem("likelink_learning_events", JSON.stringify(events));
  } catch {
    // storage full or unavailable — learning is best-effort
  }
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
