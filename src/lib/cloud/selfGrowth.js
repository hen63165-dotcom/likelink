/**
 * LikeLink Self-Growth Engine — Autonomous Marketing Pipeline
 * ==========================================================
 * LikeLink's OWN growth engine (free core capability, not paywalled).
 * Pipeline: DISCOVER → VERIFY → SELECT → CREATE → PUBLISH/EXPOSE → TRACK → MEARN → ADAPT
 * All content is based on REAL LikeLink data. No fake popularity, reviews, or urgency.
 */

import { generateHookVariations } from "./hooks.js";
import { lunaHookForProduct, lunaStoryText, AMBASSADOR } from "../ambassador.js";
import { CATEGORIES } from "./catalog.js";

export const CONTENT_TYPES = {
  PRODUCT_DISCOVERY: "product_discovery",
  CATEGORY_PAGE: "category_page",
  TREND_STORY: "trend_story",
  LUNA_STORY: "luna_story",
  EDUCATIONAL: "educational",
};

/**
 * Discover content opportunities from real LikeLink data.
 */
export function discoverOpportunities({ products = [], marketers = [], sales = [], clicks = [], now = Date.now() } = {}) {
  const opportunities = [];

  for (const p of products) {
    if (!p || !p.id || !p.title) continue;
    const signals = {
      clicks: clicks.filter((c) => c?.productId === p.id).length,
      sales: sales.filter((s) => s?.productId === p.id).length,
    };
    opportunities.push({
      type: CONTENT_TYPES.PRODUCT_DISCOVERY,
      productId: p.id,
      title: p.title,
      category: p.category,
      price: p.price,
      image: p.image,
      signals,
      score: signals.sales * 100 + signals.clicks * 10 + (p.image ? 5 : 0),
      reason: signals.sales > 0 ? "real_sales" : signals.clicks > 0 ? "real_clicks" : "catalog_entry",
    });
  }

  const categoryCounts = {};
  for (const p of products) {
    if (p.category) categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count >= 2) {
      opportunities.push({
        type: CONTENT_TYPES.CATEGORY_PAGE,
        category: cat,
        title: CATEGORIES[cat]?.he || cat,
        productCount: count,
        score: count * 20,
        reason: "category_has_products",
      });
    }
  }

  const topProduct = products.find((p) => p?.status === "approved" && p?.image) || products[0];
  if (topProduct) {
    opportunities.push({
      type: CONTENT_TYPES.LUNA_STORY,
      productId: topProduct.id,
      title: topProduct.title,
      category: topProduct.category,
      score: 30,
      reason: "luna_brand_content",
    });
  }

  opportunities.push({
    type: CONTENT_TYPES.EDUCATIONAL,
    title: "איך לפתוח סטודיו ב-Likelink",
    score: 10,
    reason: "platform_education",
  });

  return opportunities.sort((a, b) => b.score - a.score);
}

/**
 * Create a content asset from an opportunity.
 */
export function createContentAsset(opportunity, { products = [], marketers = [], origin = "" } = {}) {
  const contentId = `content_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    contentId,
    type: opportunity.type,
    title: opportunity.title,
    createdAt: Date.now(),
    status: "prepared",
    track: { utm_source: "likelink_growth", utm_medium: opportunity.type, utm_campaign: contentId },
  };

  switch (opportunity.type) {
    case CONTENT_TYPES.PRODUCT_DISCOVERY: {
      const product = products.find((p) => p.id === opportunity.productId);
      if (!product) return null;
      const hooks = generateHookVariations(product, { count: 3, storeUrl: `${origin}/p/${product.id}` });
      const owner = marketers.find((m) => m.id === product.marketerId);
      return {
        ...base,
        product: { id: product.id, title: product.title, price: product.price, image: product.image, category: product.category },
        hooks: hooks.slice(0, 3),
        lunaStory: lunaStoryText(product),
        destination: { type: "product", url: `/p/${product.id}`, trackedUrl: hooks[0]?.link || "" },
        owner: owner ? { name: owner.name, slug: owner.slug } : null,
      };
    }
    case CONTENT_TYPES.CATEGORY_PAGE: {
      const catProducts = products.filter((p) => p.category === opportunity.category).slice(0, 6);
      return {
        ...base,
        category: opportunity.category,
        title: CATEGORIES[opportunity.category]?.he || opportunity.category,
        products: catProducts.map((p) => ({ id: p.id, title: p.title, price: p.price, image: p.image })),
        destination: { type: "category", url: `/discover?cat=${opportunity.category}` },
        productCount: catProducts.length,
      };
    }
    case CONTENT_TYPES.LUNA_STORY: {
      const product = products.find((p) => p.id === opportunity.productId);
      if (!product) return null;
      return {
        ...base,
        character: AMBASSADOR.name,
        product: { id: product.id, title: product.title, price: product.price, image: product.image },
        hook: lunaHookForProduct(product),
        story: lunaStoryText(product),
        destination: { type: "luna_story", url: `/p/${product.id}?utm_source=luna` },
      };
    }
    case CONTENT_TYPES.EDUCATIONAL: {
      return {
        ...base,
        title: "איך לפתוח סטודיו ב-Likelink",
        sections: [
          { title: "מה זה LikeLink?", content: "פלטפורמה אחת שמחברת בין קונים, מוצרים, מוכרים ויוצרים" },
          { title: "למה לפתוח סטודיו?", content: "כלי שיווק, מעקב, תוכן אוטומטי וגדילה אורגנית" },
        ],
        destination: { type: "studio_education", url: "/sell" },
      };
    }
    default:
      return base;
  }
}

/**
 * Generate SEO metadata for a content asset.
 */
export function generateSEO(asset, { origin = "https://likelink2.vercel.app" } = {}) {
  const title = asset.title.length > 60 ? asset.title.slice(0, 57) + "..." : asset.title;
  const description = asset.lunaStory || asset.hooks?.[0]?.text || asset.title;
  const desc = description.length > 160 ? description.slice(0, 157) + "..." : description;
  return {
    title: `${title} | LikeLink`,
    description: desc,
    canonical: `${origin}${asset.destination?.url || "/"}`,
    og: { title: `${title} | LikeLink`, description: desc, image: asset.product?.image || `${origin}/luna-face.svg`, type: "website" },
  };
}

/**
 * Generate sitemap entries from content assets.
 */
export function generateSitemapEntries(assets, { origin = "https://likelink2.vercel.app" } = {}) {
  return assets
    .filter((a) => a.destination?.url && a.status === "published")
    .map((a) => ({
      loc: `${origin}${a.destination.url}`,
      lastmod: new Date(a.createdAt).toISOString().split("T")[0],
      changefreq: a.type === CONTENT_TYPES.TREND_STORY ? "daily" : "weekly",
      priority: a.type === CONTENT_TYPES.PRODUCT_DISCOVERY ? "0.8" : "0.6",
    }));
}

/**
 * Internal traffic loop — generate internal links between content assets.
 */
export function generateInternalLinks(assets, { maxLinks = 5 } = {}) {
  const links = [];
  const byCategory = {};
  for (const a of assets) {
    const cat = a.product?.category || a.category;
    if (cat) {
      byCategory[cat] = byCategory[cat] || [];
      byCategory[cat].push(a);
    }
  }
  for (const [cat, items] of Object.entries(byCategory)) {
    if (items.length >= 2) {
      for (let i = 0; i < Math.min(items.length - 1, maxLinks); i++) {
        links.push({ from: items[i].contentId, to: items[i + 1].contentId, category: cat, type: "related" });
      }
    }
  }
  return links;
}

