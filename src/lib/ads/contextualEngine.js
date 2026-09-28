/**
 * LikeLink Ads OS — Contextual Ads Engine
 * =======================================
 * Matches sponsored products to user intent/context in real-time.
 * Pure module — no network, no secrets.
 */

import { PLACEMENT } from "./types.js";
import { isPublicCatalogProduct } from "../cloud/catalog.js";
import { getAvailableCreativeTypesForPlacement, getRecommendedCreativeTypeForPlacement } from "./creativeStudio.js";

function scoreProductForContext(product, context) {
  if (!product || !isPublicCatalogProduct(product, [])) return 0;

  let score = 0;

  // Base eligibility
  if (!product.affiliateUrl && !product.url) return 0;
  if (!product.image) return 0;
  if (product.price <= 0) return 0;

  // Category match
  if (context.category && product.category === context.category) {
    score += 30;
  }

  // Price range match
  if (context.priceMax && product.price <= context.priceMax) {
    score += 15;
  }
  if (context.priceMin && product.price >= context.priceMin) {
    score += 10;
  }

  // Intent keywords in title/description
  if (context.intent) {
    const text = `${product.title || ""} ${product.description || ""}`.toLowerCase();
    const keywords = context.intent.toLowerCase().split(/\s+/).filter(Boolean);
    for (const kw of keywords) {
      if (text.includes(kw)) score += 5;
    }
  }

  // Trending/engagement signals
  if (product.clicks > 10) score += 10;
  if (product.clicks > 100) score += 10;

  // Recency
  const ageHours = (Date.now() - (product.createdAt || Date.now())) / (1000 * 60 * 60);
  if (ageHours < 24) score += 5;
  else if (ageHours < 168) score += 3;

  // Affiliate URL present
  if (product.affiliateUrl) score += 5;

  // Has images
  if (product.image) score += 5;

  return Math.max(0, score);
}

function filterEligibleProducts(products, context) {
  return products
    .filter(p => isPublicCatalogProduct(p, []))
    .filter(p => p.affiliateUrl || p.url)
    .filter(p => p.image)
    .filter(p => p.price > 0);
}

function rankProducts(products, context, limit = 10) {
  return products
    .map(p => ({ product: p, score: scoreProductForContext(p, context) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.product);
}

export function findSponsoredCandidates(products, context, placementId, campaignFilters = {}) {
  const eligible = filterEligibleProducts(products, context);

  // Apply campaign filters
  let filtered = products;
  if (campaignFilters.categories?.length) {
    filtered = filtered.filter(p => campaignFilters.categories.includes(p.category));
  }
  if (campaignFilters.priceMax) {
    filtered = filtered.filter(p => p.price <= campaignFilters.priceMax);
  }
  if (campaignFilters.priceMin) {
    filtered = filtered.filter(p => p.price >= campaignFilters.priceMin);
  }
  if (campaignFilters.excludeIds?.length) {
    filtered = filtered.filter(p => !campaignFilters.excludeIds.includes(p.id));
  }

  const eligibleFiltered = filterEligibleProducts(filtered, context);
  const ranked = rankProducts(eligibleFiltered, context);

  return ranked;
}

export function selectSponsoredProducts(products, context, placementId, count = 3, campaignFilters = {}) {
  const candidates = findSponsoredCandidates(products, context, placementId, campaignFilters);
  return candidates.slice(0, count);
}

export function buildContextualAdUnit(product, placementId, creative, options = {}) {
  const spec = {
    id: `ad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    productId: product.id,
    placementId,
    creativeId: creative?.id,
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      affiliateUrl: product.affiliateUrl,
      url: product.url,
    },
    creative: creative ? {
      id: creative.id,
      type: creative.type,
      format: creative.format,
      assets: creative.assets,
      copy: creative.copy,
      trackedUrl: creative.trackedUrl,
    } : null,
    disclosure: "ממומן",
    tracking: {
      impressionId: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clickId: null,
    },
    meta: {
      placementId,
      timestamp: Date.now(),
      sessionId: options.sessionId || null,
    },
  };

  return spec;
}

export function createContextualRecommendation(product, context, options = {}) {
  const placementId = PLACEMENT.CONTEXTUAL_RECOMMENDATION;
  const type = getRecommendedCreativeTypeForPlacement(PLACEMENT.CONTEXTUAL_RECOMMENDATION);

  return {
    id: `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "contextual_recommendation",
    placementId,
    productId: product.id,
    creativeType: "product_demo",
    context: {
      source: context.source || "unknown",
      intent: context.intent || null,
      category: context.category || null,
    },
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      affiliateUrl: product.affiliateUrl,
    },
    copy: {
      headline: product.title,
      price: Number(product.price) > 0 ? `₪${product.price}` : "",
      cta: "לפרטים 👇",
      disclosure: "המלצה קונטקסטואלית · קישור שותפים",
    },
    trackedUrl: product.affiliateUrl || product.url || "",
    meta: {
      timestamp: Date.now(),
      sessionId: options.sessionId || null,
    },
  };
}

export function buildSponsoredFeedUnit(product, creative, placementId, options = {}) {
  if (!product || !creative) return null;

  return {
    id: `spon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "sponsored_feed_unit",
    placementId,
    productId: product.id,
    creativeId: creative.id,
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      affiliateUrl: product.affiliateUrl,
    },
    creative: {
      id: creative.id,
      type: creative.type,
      format: creative.format,
      assets: creative.assets,
      copy: creative.copy,
      trackedUrl: creative.trackedUrl,
    },
    disclosure: {
      text: "ממומן",
      variant: "feed",
    },
    tracking: {
      impressionId: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clickId: `clk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    },
    meta: {
      placementId,
      timestamp: Date.now(),
      sessionId: options.sessionId || null,
    },
  };
}

export function buildSponsoredSearchUnit(product, creative, placementId, query, options = {}) {
  if (!product || !creative) return null;

  return {
    id: `spon_search_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "sponsored_search_unit",
    placementId,
    productId: product.id,
    creativeId: creative.id,
    query,
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      affiliateUrl: product.affiliateUrl,
    },
    creative: {
      id: creative.id,
      type: creative.type,
      format: creative.format,
      assets: creative.assets,
      copy: creative.copy,
      trackedUrl: creative.trackedUrl,
    },
    disclosure: {
      text: "ממומן",
      variant: "search",
    },
    tracking: {
      impressionId: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clickId: `clk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    },
    meta: {
      placementId,
      query,
      timestamp: Date.now(),
      sessionId: options.sessionId || null,
    },
  };
}

export function buildSponsoredDiscoveryUnit(product, creative, placementId, options = {}) {
  if (!product || !creative) return null;

  return {
    id: `spon_disc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "sponsored_discovery_unit",
    placementId,
    productId: product.id,
    creativeId: creative.id,
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      affiliateUrl: product.affiliateUrl,
    },
    creative: {
      id: creative.id,
      type: creative.type,
      format: creative.format,
      assets: creative.assets,
      copy: creative.copy,
      trackedUrl: creative.trackedUrl,
    },
    disclosure: {
      text: "ממומן",
      variant: "discovery",
    },
    tracking: {
      impressionId: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clickId: `clk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    },
    meta: {
      placementId,
      timestamp: Date.now(),
      sessionId: options.sessionId || null,
    },
  };
}