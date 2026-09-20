/*
 * LikeLink2 Self-Marketing Engine - Native AI Content Creation and Distribution
 * ===========================================================
 * This module implements LikeLink2's native self-marketing capabilities.
 * Luna acts as the LikeLink2-native AI creator/presenter, generating
 * promotional content directly for LikeLink2's benefit.
 *
 * CORE PHILOSOPHY:
 * - Luna only creates content for LikeLink2 itself, not other creators
 * - Uses real LikeLink2 capabilities, data, and performance metrics
 * - Generates multiple creative variants for A/B testing
 * - Integrates with existing trust verification and publishing systems
 * - Native publishing only - no external platform dependencies
 * - Produces promotional content in Hebrew by default with localization support
 *
 * MARKETING LOOP:
 * DETECT → UNDERSTAND → TRUST → CREATE → LOCALIZE → VERIFY → PUBLISH → MEASURE → LEARN → OPTIMIZE → REPEAT
 */

const { detectOpportunities, diagnoseProduct, selfHealProduct, generateLunaContent, generateLunaHooks } = require('./lunaGrowth.js');
const { verifyProduct, trustGateReport, isDiscoveryEligible, TRUST_STATE } = require('./trustVerification.js');
const { buildCampaign, planDistribution, learnFromClicks } = require('./campaign.js');
const { generateContentPack } = require('./contentStudio.js');
const { generateHookVariations, recommendHookAngles } = require('./hooks.js');
const { createProduct } = require('./catalog.js');
const { lunaHook, lunaHookForProduct, lunaStoryText, AMBASSADOR } = require('../ambassador.js');

const LANG_RTL = 'he';

export const LIKE_LINK_SELF_MARKETING = {
  STATE: {
    DETECTING: 'detecting',
    UNDERSTANDING: 'understanding',
    TRUST_CHECKING: 'trust_checking',
    CREATING: 'creating',
    LOCALIZING: 'localizing',
    VERIFYING: 'verifying',
    PUBLISHING: 'publishing',
    MEASURING: 'measuring',
    LEARNING: 'learning',
    OPTIMIZING: 'optimizing',
    COMPLETE: 'complete',
    BLOCKED: 'blocked',
  },

  ACTION: {
    MARKETING_SCAN: 'marketing_scan',
    CONTENT_CREATE: 'content_create',
    HOOK_GENERATE: 'hook_generate',
    CAMPAIGN_BUILD: 'campaign_build',
    PUBLISH_ATTEMPT: 'publish_attempt',
    PERFORMANCE_MEASURE: 'performance_measure',
    OPTIMIZATION: 'optimization',
    LEARNING: 'learning',
  },

  STATUS: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    BLOCKED: 'blocked',
    SKIPPED: 'skipped',
  },
};

function detectMarketingOpportunities({ products = [], sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const summary = require('./trends.js').trendSummary(products, { sales, clicks, views, now });
  const emerging = require('./trends.js').detectEmerging(products, { sales, clicks, now });
  const declining = require('./trends.js').detectDeclining(products, { sales, clicks, now });
  const ranked = require('./trends.js').rankByTrend(products, { sales, clicks, views, now, limit: 20 });

  const opportunities = ranked.map((r) => ({
    productId: r.product.id,
    title: r.product.title,
    score: r.score,
    momentum: r.momentum,
    signals: r.signals,
    type: r.momentum === 'verified' ? 'high_priority' : r.momentum === 'rising' ? 'medium_priority' : r.momentum === 'relevant' ? 'low_priority' : 'bootstrap',
  }));

  return {
    opportunities,
    emerging: emerging.map((e) => ({ productId: e.product.id, title: e.product.title, badge: e.badge })),
    declining: declining.map((d) => ({ productId: d.product.id, title: d.product.title, badge: d.badge })),
    summary: {
      totalProducts: summary.totalProducts,
      activeProducts: summary.activeProducts,
      marketingScore: summary.totalProducts > 0 ? (summary.activeProducts / summary.totalProducts) * 100 : 0,
      timestamp: now,
    },
  };
}

function understandMarketingOpportunity(product, context) {
  const { sales = [], clicks = [], campaigns = [], now = Date.now() } = context;

  const diagnosis = diagnoseProduct(product, { sales, clicks, campaigns, now });

  const marketingInsights = {
    productId: product.id,
    productName: product.title,
    diagnosis,
    recommendedAngles: [],
    bestPostingTimes: [],
    recommendedFrequency: 'daily',
    targetAudience: 'hebrew_speaking_creators',
    contentPillars: [],
  };

  const angleCandidates = [];

  if (product.clicks > 0 && product.sales > 0) {
    angleCandidates.push({
      angle: 'success_story',
      strength: Math.min(product.clicks / 10, 10),
      description: 'Highlight proven performance and engagement',
    });
  }

  if (product.price < 50) {
    angleCandidates.push({
      angle: 'affordable_excellence',
      strength: 8,
      description: 'Emphasize value and accessibility',
    });
  }

  if (product.category === 'Accessories') {
    angleCandidates.push({
      angle: 'style_inspiration',
      strength: 6,
      description: 'Focus on aesthetics and lifestyle',
    });
  }

  angleCandidates.sort((a, b) => b.strength - a.strength);
  marketingInsights.recommendedAngles = angleCandidates.slice(0, 3).map(c => c.angle);

  marketingInsights.contentPillars = angleCandidates.slice(0, 2).map(c => ({
    pillar: c.angle,
    focus: c.description,
    hookVariants: ['whoa', 'mind', 'need', 'prove'],
  }));

  return marketingInsights;
}

function createSelfMarketingContent(product, marketingInsights, language = LANG_RTL) {
  const { recommendedAngles, contentPillars } = marketingInsights;

  const angle = recommendedAngles[0] || 'success_story';
  const pillar = contentPillars[0] || { pillar: 'success_story', focus: 'Highlight proven performance', hookVariants: ['whoa'] };

  const lunaHook = lunaHookForProduct(product);
  const story = lunaStoryText(product, lunaHook);

  const contentPack = generateContentPack(product, { format: 'all' });

  const variants = {};
  const supportedFormats = ['short_video', 'reel', 'story', 'post', 'caption', 'landing'];

  for (const fmt of supportedFormats) {
    if (contentPack?.formats?.[fmt]) {
      variants[fmt] = {
        ...contentPack.formats[fmt],
        angle,
        pillar: pillar.pillar,
        hook: pillar.hookVariants[0] || 'whoa',
        language,
        personalization: {
          productId: product.id,
          marketerId: product.marketerId,
          tone: 'professional_ambassador',
        },
      };
    } else if (contentPack?.formats?.post) {
      variants[fmt] = {
        ...contentPack.formats.post,
        angle,
        pillar: pillar.pillar,
        hook: pillar.hookVariants[0] || 'whoa',
        language,
        personalization: {
          productId: product.id,
          marketerId: product.marketerId,
          tone: 'professional_ambassador',
        },
      };
    }
  }

  const hooks = generateHookVariations(product, { count: 5, format: 'short_video' });

  const marketingContent = {
    product: { id: product.id, title: product.title, price: product.price },
    lunaHook,
    lunaStory: story,
    contentPack,
    variants,
    hooks,
    angle,
    pillar: pillar.pillar,
    language,
    persona: AMBASSADOR,
    marketingFocal: true,
    selfPromotion: true,
    callToAction: {
      cta: 'check_out',
      link: `https://likelink2.vercel.app/p/${product.id}`,
      buttonText: language === 'he' ? 'גלה עוד' : 'Learn More',
    },
    captions: {
      short: contentPack?.captions?.[0] || `גלה את ${product.title} ב-LikeLink2`,
      medium: contentPack?.captions?.[1] || `LikeLink2 מציגה: ${product.title}`, 
      long: contentPack?.captions?.[2] || `גלה מדוע ${product.title} הוא הבחירה המושלמת עבורך`,
    },
    hashtags: {
      hebrew: contentPack?.hashtags?.filter(h => h.includes('#')) || ['#LikeLink2', '#מומלץ'],
      english: contentPack?.hashtags?.filter(h => !h.includes('#'))?.slice(0, 5) || ['#LikeLink2', '#DigitalProducts'],
    },
  };

  return marketingContent;
}

function verifyMarketingContent(content, actor, product, marketers) {
  const marketingVerification = verifyProduct({
    product,
    url: content.callToAction.link,
    actor,
    marketers,
  });

  const verificationReport = trustGateReport(marketingVerification);

  const trustCheck = {
    ...marketingVerification,
    marketingContent: true,
    selfPromotion: true,
    verificationTimestamp: new Date().toISOString(),
    verificationStatus: verificationReport.state,
    eligibleForPublishing: verificationReport.eligible,
    trustGateReport: verificationReport,
  };

  return trustCheck;
}

function localizeMarketingContent(content, language) {
  if (language === LANG_RTL) {
    return content;
  }

  const localized = {
    ...content,
    language,
    captions: {
      short: content.captions.medium,
      medium: content.captions.long,
      long: content.captions.short,
    },
    hashtags: {
      hebrew: content.hashtags.english,
      english: content.hashtags.hebrew,
    },
    callToAction: {
      ...content.callToAction,
      buttonText: language === 'en' ? 'Learn More' : 'גלה עוד',
    },
  };

  return localized;
}

function publishMarketingContent(content, actor, provider = null, channel = null) {
  const publishId = `marketing_${content.product.id}_${Date.now()}`;

  const publishRecord = {
    id: publishId,
    productId: content.product.id,
    marketerId: content.product.marketerId,
    contentType: 'marketing',
    provider: provider || 'likelink2_internal',
    channel: channel || 'native_luna',
    status: 'PUBLISHED',
    content: content,
    actorId: actor?.id || null,
    publishedAt: new Date().toISOString(),
    idempotencyKey: `marketing:${content.product.id}:${provider || 'internal'}:${Date.now()}`,n    marketingMetadata: {
      angle: content.angle,
      pillar: content.pillar,
      language: content.language,
      persona: content.persona,
      selfPromotion: content.marketingFocal,
    },
    analytics: {
      views: 0,
      clicks: 0,
      shares: 0,
      conversions: 0,
    },
  };

  return publishRecord;
}

function measureMarketingPerformance(publishRecord, metrics) {
  const { views = 0, clicks = 0, shares = 0, conversions = 0 } = metrics;

  const performance = {
    productId: publishRecord.productId,
    publishId: publishRecord.id,
    impressions: views,
    engagementRate: views > 0 ? ((clicks + shares + conversions) / views) * 100 : 0,
    clickThroughRate: views > 0 ? (clicks / views) * 100 : 0,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    socialEngagement: shares > 0 ? (shares / Math.max(views, 1)) * 100 : 0,
    timestamp: new Date().toISOString(),
  };

  publishRecord.analytics = { ...publishRecord.analytics, ...performance };

  return performance;
}

function learnFromMarketingPerformance(publishRecord, performance) {
  const insights = {
    productId: publishRecord.productId,
    publishId: publishRecord.id,
    learnedAt: new Date().toISOString(),
    performanceSnapshot: { ...performance },
    recommendations: [],
    optimizations: [],
    nextSteps: [],
  };

  const ctr = performance.clickThroughRate || 0;
  const engagement = performance.engagementRate || 0;

  if (ctr < 1) {
    insights.optimizations.push({
      type: 'hook_improvement',
      reason: 'Low click-through rate detected',
      suggestion: 'Test more compelling hooks like "whoa" or "mind" variants',
    });
  }

  if (engagement < 2) {
    insights.optimizations.push({
      type: 'call_to_action_refinement',
      reason: 'Low engagement rate',
      suggestion: 'Make CTA more direct and value-focused',
    });
  }

  if (performance.conversionRate > 5) {
    insights.recommendations.push({
      type: 'scale_successful_variant',
      reason: 'High conversion rate',
      suggestion: 'Scale this content variant to additional channels',
    });
  }

  insights.nextSteps = [
    'Create additional variants with tested hooks',
    'Localize content for target markets',
    'Monitor performance trends daily',
  ]
    .filter(Boolean)
    .map((text, i) => ({ id: `opt_${i}`, text, priority: 'medium' }));

  return insights;
}

function optimizeMarketingContent(insights, products, metrics = {}) {
  const { products: allProducts, sales = [], clicks = [] } = metrics;

  const optimizationPlan = {
    productId: insights.productId,
    optimizeAt: new Date().toISOString(),
    currentPerformance: insights.performanceSnapshot,
    recommendations: insights.recommendations,
    optimizations: insights.optimizations,
    nextSteps: insights.nextSteps,
    updatedContent: null,
  };

  const allProductsIncluding = allProducts || [insights.productId ? products.find(p => p.id === insights.productId) : null].filter(Boolean);

  if (allProductsIncluding.length > 0) {
    const opportunities = detectMarketingOpportunities({
      products: allProductsIncluding,
      sales,
      clicks,
      now: Date.now(),
    });

    const bestOpportunity = opportunities.opportunities[0];

    if (bestOpportunity && bestOpportunity.score > 5) {
      optimizationPlan.nextSteps.unshift({
        id: 'opp_0',
        text: `Target opportunity: ${bestOpportunity.title} (score: ${bestOpportunity.score})`,
        priority: 'high',
      });
    }
  }

  return optimizationPlan;
}

export function runMarketingCycle({ product, products = [], sales = [], clicks = [], views = [], actor, marketer = actor, language = LANG_RTL, provider = null, channel = null } = {}) {
  const cycleId = `marketing_${product.id}_${Date.now()}`;

  const actions = [];

  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.MARKETING_SCAN,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: detectMarketingOpportunities({ products, sales, clicks, views, now: Date.now() }),
    ts: Date.now(),
  });

  const understanding = understandMarketingOpportunity(product, { sales, clicks, views, now: Date.now() });
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.CONTENT_CREATE,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: understanding,
    ts: Date.now(),
  });

  const content = createSelfMarketingContent(product, understanding, language);
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.CONTENT_CREATE,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: { content, angle: understanding.recommendedAngles[0] },
    ts: Date.now(),
  });

  const marketers = [{ id: product.marketerId, name: 'LikeLink2 Marketing Team' }];
  const verification = verifyMarketingContent(content, actor, product, marketers);
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.VERIFICATION_RUN,
    status: verification.eligibleForPublishing ? LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED : LIKE_LINK_SELF_MARKETING.STATUS.BLOCKED,
    result: verification,
    ts: Date.now(),
  });

  if (!verification.eligibleForPublishing) {
    return {
      ok: false,
      cycleId,
      productId: product.id,
      actions,
      blocked: true,
      reason: 'trust_verification_failed',
      verification,
    };
  }

  const localizedContent = localizeMarketingContent(content, language);
  const publishRecord = publishMarketingContent(localizedContent, actor, provider, channel);
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.PUBLISH_ATTEMPT,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: { publishRecord, provider, channel },
    ts: Date.now(),
  });

  const metrics = {
    views: 0,
    clicks: 0,
    shares: 0,
    conversions: 0,
  };

  const performance = measureMarketingPerformance(publishRecord, metrics);
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.PERFORMANCE_MEASURE,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: performance,
    ts: Date.now(),
  });

  const insights = learnFromMarketingPerformance(publishRecord, performance);
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.LEARNING,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: insights,
    ts: Date.now(),
  });

  const optimization = optimizeMarketingContent(insights, products, { products, sales, clicks });
  actions.push({
    type: LIKE_LINK_SELF_MARKETING.ACTION.OPTIMIZATION,
    status: LIKE_LINK_SELF_MARKETING.STATUS.COMPLETED,
    result: optimization,
    ts: Date.now(),
  });

  return {
    ok: true,
    cycleId,
    productId: product.id,
    actions,
    content: localizedContent,
    publishRecord,
    performance,
    insights,
    optimization,
    eligible: true,
  };
}

export function runDailyMarketingScan({ products = [], sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const opportunities = detectMarketingOpportunities({ products, sales, clicks, views, now });

  const highPriority = opportunities.opportunities.filter(o => o.type === 'high_priority');
  const mediumPriority = opportunities.opportunities.filter(o => o.type === 'medium_priority');

  const marketingScan = {
    timestamp: now,
    summary: opportunities.summary,
    highPriorityOpportunities: highPriority.slice(0, 10),
    mediumPriorityOpportunities: mediumPriority.slice(0, 20),
    totalOpportunities: opportunities.opportunities.length,
    actionCount: highPriority.length + mediumPriority.length,
  };

  return marketingScan;
}

export function analyzeMarketingPerformance(publishRecords = [], timeWindowMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  const windowStart = now - timeWindowMs;

  const recentRecords = publishRecords.filter(r => r.publishedAt && new Date(r.publishedAt).getTime() > windowStart);

  const analysis = {
    timestamp: now,
    totalRecords: recentRecords.length,
    providers: {},
    languages: {},
    angles: {},
    performanceMetrics: {
      totalViews: 0,
      totalClicks: 0,
      totalShares: 0,
      totalConversions: 0,
      averageEngagementRate: 0,
      averageCTR: 0,
      averageConversionRate: 0,
    },
    topPerformingAngles: [],
    bestPerformingLanguages: [],
  };

  for (const record of recentRecords) {
    const provider = record.provider || 'unknown';
    analysis.providers[provider] = (analysis.providers[provider] || 0) + 1;

    const language = record.language || 'unknown';
    analysis.languages[language] = (analysis.languages[language] || 0) + 1;

    const angle = record.marketingMetadata?.angle || 'unknown';
    analysis.angles[angle] = (analysis.angles[angle] || 0) + 1;

    const metrics = record.analytics || {};
    analysis.performanceMetrics.totalViews += metrics.views || 0;
    analysis.performanceMetrics.totalClicks += metrics.clicks || 0;
    analysis.performanceMetrics.totalShares += metrics.shares || 0;
    analysis.performanceMetrics.totalConversions += metrics.conversions || 0;
  }

  const totalRecords = recentRecords.length;
  if (totalRecords > 0) {
    analysis.performanceMetrics.averageEngagementRate = (analysis.performanceMetrics.totalClicks + analysis.performanceMetrics.totalShares + analysis.performanceMetrics.totalConversions) / totalRecords;
    analysis.performanceMetrics.averageCTR = analysis.performanceMetrics.totalClicks / Math.max(analysis.performanceMetrics.totalViews, 1);
    analysis.performanceMetrics.averageConversionRate = analysis.performanceMetrics.totalConversions / Math.max(analysis.performanceMetrics.totalClicks, 1);
  }

  analysis.topPerformingAngles = Object.entries(analysis.angles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([angle, count]) => ({ angle, count }));

  analysis.bestPerformingLanguages = Object.entries(analysis.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([language, count]) => ({ language, count }));

  return analysis;
}

export default {
  LIKE_LINK_SELF_MARKETING,
  runMarketingCycle,
  runDailyMarketingScan,
  analyzeMarketingPerformance,
  detectMarketingOpportunities,
  understandMarketingOpportunity,
  createSelfMarketingContent,
  verifyMarketingContent,
  localizeMarketingContent,
  publishMarketingContent,
  measureMarketingPerformance,
  learnFromMarketingPerformance,
  optimizeMarketingContent,
};
