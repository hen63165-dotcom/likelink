/**
 * LikeLink Ads OS — Tracking Pipeline
 * ====================================
 * Real event collection and attribution pipeline.
 * No fabricated events, no fake conversions.
 */

import { AD_EVENT } from "./types.js";

const EVENTS_KV_KEY = "ads:events";
const ATTRIBUTION_KV_KEY = "ads:attribution";
const SESSION_KV_KEY = "ads:sessions";

function generateEventId() {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSessionId() {
  return `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAdEvent(eventData) {
  const allowedTypes = Object.values(require("./types.js").AD_EVENT);
  if (!allowedTypes.includes(eventData.type)) {
    return { ok: false, error: "סוג אירוע לא תקין" };
  }

  const event = {
    id: generateEventId(),
    type: eventData.type,
    timestamp: Date.now(),
    campaignId: eventData.campaignId || null,
    creativeId: eventData.creativeId || null,
    productId: eventData.productId || null,
    placementId: eventData.placementId || null,
    marketerId: eventData.marketerId || null,
    sessionId: eventData.sessionId || null,
    userAgent: eventData.userAgent || "",
    referrer: eventData.referrer || "",
    utm: eventData.utm || {},
    value: typeof eventData.value === "number" ? eventData.value : null,
    currency: eventData.currency || "ILS",
    meta: eventData.meta || {},
  };

  return { ok: true, event };
}

export function createImpressionEvent(data) {
  return createAdEvent({ ...data, type: "impression" });
}

export function createCreativeViewEvent(data) {
  return createAdEvent({ ...data, type: "creative_view" });
}

export function createClickEvent(data) {
  return createAdEvent({ ...data, type: "click" });
}

export function createProductViewEvent(data) {
  return createAdEvent({ ...data, type: "product_view" });
}

export function createOutboundClickEvent(data) {
  return createAdEvent({ ...data, type: "outbound_click" });
}

export function createPurchaseEvent(data) {
  return createAdEvent({ ...data, type: "purchase" });
}

export function createSpendEvent(data) {
  return createAdEvent({ ...data, type: "spend" });
}

export function createCreativeRenderCompleteEvent(data) {
  return createAdEvent({ ...data, type: "creative_render_complete" });
}

function getSessionId(req) {
  // In real implementation, would read from cookie/header
  return data.sessionId || generateSessionId();
}

export function buildAttributionChain(event, campaigns, creatives) {
  const chain = {
    eventId: event.id,
    campaignId: event.campaignId,
    creativeId: event.creativeId,
    productId: event.productId,
    placementId: event.placementId,
    marketerId: event.marketerId,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    utm: event.utm || {},
    attributionPath: [],
  };

  // Build attribution path
  if (event.campaignId) chain.attributionPath.push({ type: "campaign", id: event.campaignId });
  if (event.creativeId) chain.attributionPath.push({ type: "creative", id: event.creativeId });
  if (event.placementId) chain.attributionPath.push({ type: "placement", id: event.placementId });
  if (event.productId) chain.attributionPath.push({ type: "product", id: event.productId });
  if (event.marketerId) chain.attributionPath.push({ type: "marketer", id: event.marketerId });

  return chain;
}

export function buildAttributionReport(events, campaigns, creatives) {
  const report = {
    totalEvents: events.length,
    byType: {},
    byCampaign: {},
    byCreative: {},
    byPlacement: {},
    byProduct: {},
    conversions: 0,
    revenue: 0,
    spend: 0,
    roas: 0,
    attributionPaths: [],
  };

  for (const event of events) {
    report.byType[event.type] = (report.byType[event.type] || 0) + 1;

    if (event.campaignId) {
      report.byCampaign[event.campaignId] = (report.byCampaign[event.campaignId] || 0) + 1;
    }
    if (event.creativeId) {
      report.byCreative[event.creativeId] = (report.byCreative[event.creativeId] || 0) + 1;
    }
    if (event.placementId) {
      report.byPlacement[event.placementId] = (report.byPlacement[event.placementId] || 0) + 1;
    }
    if (event.productId) {
      report.byProduct[event.productId] = (report.byProduct[event.productId] || 0) + 1;
    }

    if (event.type === "purchase") {
      report.conversions += 1;
      if (typeof event.value === "number") report.revenue += event.value;
    }
    if (event.type === "spend") {
      report.spend += event.value || 0;
    }
  }

  report.roas = report.spend > 0 ? report.revenue / report.spend : 0;

  return report;
}

export function calculateAttribution(events, lookbackDays = 30) {
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter(e => e.timestamp >= cutoff);

  const attribution = {
    lastClick: null,
    firstClick: null,
    linear: {},
    timeDecay: {},
    positionBased: {},
  };

  const conversions = recentEvents.filter(e => e.type === "purchase");
  const clicks = recentEvents.filter(e => e.type === "click" || e.type === "outbound_click");

  for (const conversion of conversions) {
    const relevantClicks = clicks
      .filter(c => c.sessionId === conversion.sessionId && c.timestamp < conversion.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (relevantClicks.length === 0) continue;

    // Last click
    attribution.lastClick = relevantClicks[relevantClicks.length - 1];

    // First click
    attribution.firstClick = relevantClicks[0];

    // Linear
    for (const click of relevantClicks) {
      const key = click.campaignId || click.creativeId || click.placementId;
      if (key) {
        attribution.linear[key] = (attribution.linear[key] || 0) + 1 / relevantClicks.length;
      }
    }

    // Time decay (half-life 7 days)
    const halfLife = 7 * 24 * 60 * 60 * 1000;
    for (const click of relevantClicks) {
      const hoursAgo = (conversion.timestamp - click.timestamp) / (1000 * 60 * 60);
      const weight = Math.pow(0.5, hoursAgo / (halfLife / (1000 * 60 * 60)));
      const key = click.campaignId || click.creativeId || click.placementId;
      if (key) {
        attribution.timeDecay[key] = (attribution.timeDecay[key] || 0) + weight;
      }
    }

    // Position based (40% first, 40% last, 20% middle)
    if (relevantClicks.length === 1) {
      const key = relevantClicks[0].campaignId || relevantClicks[0].creativeId || relevantClicks[0].placementId;
      if (key) attribution.positionBased[key] = (attribution.positionBased[key] || 0) + 1;
    } else if (relevantClicks.length === 2) {
      const firstKey = relevantClicks[0].campaignId || relevantClicks[0].creativeId || relevantClicks[0].placementId;
      const lastKey = relevantClicks[1].campaignId || relevantClicks[1].creativeId || relevantClicks[1].placementId;
      if (firstKey) attribution.positionBased[firstKey] = (attribution.positionBased[firstKey] || 0) + 0.4;
      if (lastKey) attribution.positionBased[lastKey] = (attribution.positionBased[lastKey] || 0) + 0.4;
    } else {
      const firstKey = relevantClicks[0].campaignId || relevantClicks[0].creativeId || relevantClicks[0].placementId;
      const lastKey = relevantClicks[relevantClicks.length - 1].campaignId || relevantClicks[relevantClicks.length - 1].creativeId || relevantClicks[relevantClicks.length - 1].placementId;
      const middleKeys = relevantClicks.slice(1, -1).map(c => c.campaignId || c.creativeId || c.placementId).filter(Boolean);
      if (firstKey) attribution.positionBased[firstKey] = (attribution.positionBased[firstKey] || 0) + 0.4;
      if (lastKey) attribution.positionBased[lastKey] = (attribution.positionBased[lastKey] || 0) + 0.4;
      for (const key of middleKeys) {
        attribution.positionBased[key] = (attribution.positionBased[key] || 0) + 0.2 / middleKeys.length;
      }
    }
  }

  return attribution;
}

export function buildEventFromClient(data, req = null) {
  const sessionId = data.sessionId || (req?.headers?.["x-session-id"] || `ses_${Date.now().toString(36)}`);
  const userAgent = req?.headers?.["user-agent"] || "";
  const referrer = req?.headers?.referer || data.referrer || "";

  return {
    ...data,
    sessionId,
    userAgent,
    referrer,
    timestamp: data.timestamp || Date.now(),
    ip: req?.headers?.["x-forwarded-for"] || req?.headers?.["x-real-ip"] || null,
  };
}

export function createSessionIfNeeded(existingSessionId) {
  if (existingSessionId) return existingSessionId;
  return generateSessionId();
}

export function buildTrackingPixelUrl(eventType, params = {}) {
  const base = "/api/ads/track";
  const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "https://likelink2.vercel.app");
  url.searchParams.set("type", eventType);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function createBeaconPayload(event) {
  return {
    eventId: event.id,
    type: event.type,
    timestamp: event.timestamp,
    campaignId: event.campaignId,
    creativeId: event.creativeId,
    productId: event.productId,
    placementId: event.placementId,
    marketerId: event.marketerId,
    sessionId: event.sessionId,
    utm: event.utm,
    value: event.value,
    currency: event.currency,
  };
}

export function sendBeacon(payload) {
  if (typeof navigator === "undefined") return Promise.resolve(false);
  if (!navigator.sendBeacon) return Promise.resolve(false);

  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = "/api/ads/track";
    navigator.sendBeacon(url, blob);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

export function queueEventForBatch(event, batch = []) {
  batch.push(event);
  if (batch.length >= 10) {
    return { flush: true, batch: [] };
  }
  return { flush: false, batch };
}