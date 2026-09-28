/**
 * LikeLink Ads OS — Luna Ads Brain
 * =================================
 * Autonomous decision layer for ad optimization.
 * Uses real measured data only — no fabricated signals.
 */

import { LUNA_DECISION } from "./types.js";

const MIN_SAMPLE_FOR_DECISION = 30;
const MIN_CONVERSIONS_FOR_ROAS = 5;

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calculateCTR(impressions, clicks) {
  if (!impressions || impressions === 0) return 0;
  return clicks / impressions;
}

function calculateConversionRate(clicks, conversions) {
  if (!clicks || clicks === 0) return 0;
  return conversions / clicks;
}

function calculateROAS(spend, revenue) {
  if (!spend || spend === 0) return null;
  return revenue / spend;
}

function calculateCPC(spend, clicks) {
  if (!clicks || clicks === 0) return null;
  return spend / clicks;
}

function calculateROI(revenue, spend) {
  if (!spend || spend === 0) return null;
  return (revenue - spend) / spend;
}

export function analyzeCampaignPerformance(campaign) {
  const m = campaign.metrics;
  const analysis = {
    ctr: calculateCTR(m.impressions, m.clicks),
    cpc: calculateCPC(m.spend, m.clicks),
    conversionRate: calculateConversionRate(m.outboundClicks, m.purchases),
    roas: calculateROAS(m.spend, m.revenue),
    roi: calculateROI(m.revenue, m.spend),
    creativeViewRate: m.impressions > 0 ? m.creativeViews / m.impressions : 0,
    productViewRate: m.clicks > 0 ? m.productViews / m.clicks : 0,
    purchaseRate: m.outboundClicks > 0 ? m.purchases / m.outboundClicks : 0,
    sampleSize: {
      impressions: m.impressions,
      clicks: m.clicks,
      outboundClicks: m.outboundClicks,
      purchases: m.purchases,
    },
    hasEnoughData: m.clicks >= MIN_SAMPLE_FOR_DECISION,
    hasEnoughConversions: m.purchases >= MIN_CONVERSIONS_FOR_ROAS,
  };

  return analysis;
}

export function makeLunaDecision(campaign, creativePerformance = []) {
  const analysis = analyzeCampaignPerformance(campaign);

  if (!analysis.hasEnoughData) {
    return {
      decision: "insufficient_data",
      reason: `צריך לפחות ${MIN_SAMPLE_FOR_DECISION} קליקים להחלטה (יש ${analysis.sampleSize.clicks})`,
      confidence: "low",
      action: null,
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  const ctr = analysis.ctr;
  const conversionRate = analysis.conversionRate;
  const roas = analysis.roas;
  const cpc = analysis.cpc;

  const ctrBenchmark = 0.015; // 1.5%
  const conversionBenchmark = 0.02; // 2%
  const roasBenchmark = 2.0; // 2x

  // High performer
  if (analysis.ctr >= ctrBenchmark * 1.5 && analysis.conversionRate >= conversionBenchmark * 1.5) {
    if (analysis.roas && analysis.roas >= roasBenchmark * 1.2) {
      return {
        decision: "increase_exposure",
        reason: "ביצועים מצוינים — CTR, המרות ו-ROAS מעל הממוצע",
        confidence: "high",
        action: "increase_budget_20_percent",
        nextCheckAt: Date.now() + 12 * 60 * 60 * 1000,
      };
    }
    return {
      decision: "keep",
      reason: "ביצועים טובים — CTR והמרות מעל הממוצע",
      confidence: "high",
      action: null,
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  // Good CTR but low conversion
  if (analysis.ctr >= ctrBenchmark && analysis.conversionRate < conversionBenchmark * 0.5) {
    return {
      decision: "test_variation",
      reason: "CTR טוב אבל המרות נמוכות — בדוק דף נחיתה/הצעה",
      confidence: "medium",
      action: "test_landing_page_variation",
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  // Good conversion but low CTR
  if (analysis.ctr < ctrBenchmark * 0.5 && analysis.conversionRate >= conversionBenchmark) {
    return {
      decision: "test_variation",
      reason: "המרות טובות אבל CTR נמוך — בדוק קריאייטיב/הוק",
      confidence: "medium",
      action: "test_creative_hook",
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  // Low performance across the board
  if (analysis.ctr < ctrBenchmark * 0.5 && analysis.conversionRate < conversionBenchmark * 0.5) {
    if (campaign.luna?.decisionsCount >= 2) {
      return {
        decision: "pause",
        reason: "ביצועים נמוכים באופן עקבי — השהה ובדוק מוצר/קהל",
        confidence: "high",
        action: "pause_campaign",
        nextCheckAt: Date.now() + 48 * 60 * 60 * 1000,
      };
    }
    return {
      decision: "test_variation",
      reason: "ביצועים נמוכים — נסה קריאייטיב/קהל חדש",
      confidence: "medium",
      action: "test_new_creative",
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  // ROAS too low but has conversions
  if (analysis.roas !== null && analysis.roas < 1.0 && analysis.conversions > 0) {
    return {
      decision: "test_variation",
      reason: "ROAS מתחת ל-1x — בדוק מחיר/עלות או הצעה",
      confidence: "medium",
      action: "test_bid_adjustment",
      nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  // Default: keep monitoring
  return {
    decision: "keep",
    reason: "ביצועים בטווח הנורמלי — המשך מעקב",
    confidence: "medium",
    action: null,
    nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
  };
}

export function analyzeCreativePerformance(creative, events = []) {
  const impressions = events.filter(e => e.type === "impression" && e.creativeId === creative.id).length;
  const views = events.filter(e => e.type === "creative_view" && e.creativeId === creative.id).length;
  const clicks = events.filter(e => e.type === "click" && e.creativeId === creative.id).length;
  const outboundClicks = events.filter(e => e.type === "outbound_click" && e.creativeId === creative.id).length;

  return {
    impressions,
    views,
    clicks,
    outboundClicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    viewRate: impressions > 0 ? views / impressions : 0,
    clickToViewRate: views > 0 ? clicks / views : 0,
    outboundRate: clicks > 0 ? outboundClicks / clicks : 0,
  };
}

export function recommendCreativeAction(creative, performance) {
  if (performance.impressions < 100) {
    return { action: "wait", reason: "פחות מ-100 חשיפות — מוקדם מדי להחליט" };
  }

  if (performance.ctr < 0.005) {
    return { action: "pause", reason: "CTR נמוך מאוד (< 0.5%) — השהה ובדוק הוק/ויז'ואל" };
  }

  if (performance.ctr < 0.01 && performance.viewRate < 0.1) {
    return { action: "test_hook", reason: "CTR נמוך וצפייה נמוכה — נסה הוק חדש" };
  }

  if (performance.outboundRate < 0.1 && performance.clicks > 20) {
    return { action: "test_landing", reason: "קליקים אבל מעט יציאות למוצר — בדוק דף נחיתה" };
  }

  return { action: "keep", reason: "ביצועים תקינים" };
}

export function generateLunaInsights(campaigns, creatives, events) {
  const insights = [];

  for (const campaign of campaigns) {
    const decision = makeLunaDecision(campaign);
    insights.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      decision: decision.decision,
      reason: decision.reason,
      confidence: decision.confidence,
      action: decision.action,
      nextCheckAt: decision.nextCheckAt,
      metrics: {
        ctr: (campaign.metrics.clicks / (campaign.metrics.impressions || 1) * 100).toFixed(2) + "%",
        cpc: campaign.metrics.cpc ? campaign.metrics.cpc.toFixed(2) : "N/A",
        roas: campaign.metrics.roas ? campaign.metrics.roas.toFixed(2) : "N/A",
        conversions: campaign.metrics.purchases,
      },
    });
  }

  // Creative-level insights
  for (const creative of creatives) {
    const creativeEvents = events.filter(e => e.creativeId === creative.id);
    const perf = analyzeCreativePerformance(creative, creativeEvents);
    const action = recommendCreativeAction(creative, perf);

    if (action.action !== "keep" && action.action !== "wait") {
      insights.push({
        creativeId: creative.id,
        creativeType: creative.type,
        productId: creative.productId,
        action: action.action,
        reason: action.reason,
        metrics: {
          impressions: perf.impressions,
          ctr: (perf.ctr * 100).toFixed(2) + "%",
          clicks: perf.clicks,
        },
      });
    }
  }

  return insights.sort((a, b) => {
    const priority = { pause: 3, test_variation: 2, increase_exposure: 1, keep: 0 };
    return (priority[b.decision] || 0) - (priority[a.decision] || 0);
  });
}

export function recordLunaDecision(campaignId, decision, analysis) {
  return {
    id: `luna_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    campaignId,
    decision: decision.decision,
    reason: decision.reason,
    confidence: decision.confidence,
    action: decision.action,
    analysis: {
      ctr: analysis.ctr,
      conversionRate: analysis.conversionRate,
      roas: analysis.roas,
      cpc: analysis.cpc,
      sampleSize: analysis.sampleSize,
    },
    timestamp: Date.now(),
  };
}

export function getLunaRecommendations(campaigns, creatives, events) {
  return generateLunaInsights(campaigns, creatives, events);
}