/**
 * AI-Powered Recommendations Engine
 * - Personalized discovery based on user behavior
 * - Trending algorithms
 * - Creator affinity scoring
 * - Smart feed ranking
 */

export function buildUserProfile(products, user, favorites, following, clicks, views) {
  // Build interest vector from user's interactions
  const categoryPrefs = {};
  const creatorPrefs = {};
  
  (clicks || []).forEach(c => {
    if (c.productId) {
      const product = (products || []).find(p => p.id === c.productId);
      if (product) {
        categoryPrefs[product.category] = (categoryPrefs[product.category] || 0) + 3;
      }
    }
  });
  
  (favorites || []).forEach(fav => {
    const product = (products || []).find(p => p.id === fav);
    if (product) {
      categoryPrefs[product.category] = (categoryPrefs[product.category] || 0) + 2;
      creatorPrefs[product.marketerId] = (creatorPrefs[product.marketerId] || 0) + 1.5;
    }
  });
  
  following?.forEach(creatorId => {
    creatorPrefs[creatorId] = (creatorPrefs[creatorId] || 0) + 1;
  });
  
  return { categoryPrefs, creatorPrefs, favoriteCount: favorites?.length || 0 };
}

export function scoreProduct(product, userProfile, interactions) {
  let score = 0;
  
  // Base score: recency (newer is better)
  const ageInDays = (Date.now() - product.createdAt) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(1, 10 / (1 + ageInDays * 0.1));
  score += recencyBoost;
  
  // Engagement: clicks and favorites
  score += (product.clicks || 0) * 0.5;
  score += (interactions?.[product.id]?.favoriteCount || 0) * 0.8;
  
  // Creator affinity: boost products from creators user follows
  if (userProfile.creatorPrefs[product.marketerId]) {
    score += userProfile.creatorPrefs[product.marketerId] * 2;
  }
  
  // Category affinity: boost categories user interacts with
  if (userProfile.categoryPrefs[product.category]) {
    score += userProfile.categoryPrefs[product.category] * 1.5;
  }
  
  // Diversity bonus: less clicked products get small boost to avoid echo chamber
  const avgClicks = 5;
  if ((product.clicks || 0) < avgClicks) {
    score += 0.5;
  }
  
  // Price preference: balance expensive vs budget
  if (product.price > 0) {
    const priceScore = Math.max(0.5, 2 / (1 + Math.abs(Math.log(product.price / 50))));
    score += priceScore * 0.3;
  }
  
  return score;
}

export function getPersonalizedFeed(products, userProfile, limit = 20) {
  const scored = products
    .map(p => ({ product: p, score: scoreProduct(p, userProfile, {}) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scored.map(s => s.product);
}

export function getTrendingProducts(products, clicks, sales, window = 7) {
  // Calculate trending score: recent engagement velocity
  const now = Date.now();
  const windowMs = window * 24 * 60 * 60 * 1000;
  
  const scored = products.map(p => {
    const recentClicks = clicks?.filter(c => 
      c.productId === p.id && (now - c.ts) < windowMs
    )?.length || 0;
    
    const recentSales = sales?.filter(s => 
      s.productId === p.id && (now - s.ts) < windowMs
    )?.length || 0;
    
    // Momentum score: clicks trend + conversion
    const momentum = recentClicks * 0.7 + recentSales * 2;
    
    return { product: p, score: momentum };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.product);
}

export function getCreatorRecommendations(marketers, userProfile, products, limit = 5) {
  // Recommend creators based on user interests
  const scored = marketers.map(m => {
    let score = 0;
    
    // Creator affinity from user profile
    if (userProfile.creatorPrefs[m.id]) {
      score += userProfile.creatorPrefs[m.id] * 5;
    }
    
    // Creator quality: active, good engagement
    const theirProducts = products.filter(p => p.marketerId === m.id && p.status === 'approved');
    const avgEngagement = theirProducts.reduce((sum, p) => sum + (p.clicks || 0), 0) / Math.max(1, theirProducts.length);
    score += Math.min(avgEngagement * 0.5, 5);
    
    // Recency bonus
    const latestProduct = theirProducts.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latestProduct) {
      const daysSinceActive = (Date.now() - latestProduct.createdAt) / (1000 * 60 * 60 * 24);
      if (daysSinceActive < 7) score += 2;
    }
    
    return { creator: m, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.creator);
}

export function getSimilarProducts(targetProduct, products, limit = 5) {
  // Find products similar to target
  const scored = products
    .filter(p => p.id !== targetProduct.id && p.status === 'approved')
    .map(p => {
      let similarity = 0;
      
      // Same category
      if (p.category === targetProduct.category) similarity += 3;
      
      // Similar price range (±30%)
      if (Math.abs(p.price - targetProduct.price) / targetProduct.price < 0.3) similarity += 2;
      
      // Same creator
      if (p.marketerId === targetProduct.marketerId) similarity += 1;
      
      // Keyword overlap
      const targetWords = new Set((targetProduct.title + ' ' + (targetProduct.description || '')).toLowerCase().split(/\s+/));
      const productWords = new Set((p.title + ' ' + (p.description || '')).toLowerCase().split(/\s+/));
      const overlap = [...targetWords].filter(w => productWords.has(w)).length;
      similarity += overlap * 0.5;
      
      return { product: p, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  return scored.map(s => s.product);
}

export function getSearchRecommendations(query, products, marketers) {
  const q = query.toLowerCase().trim();
  if (!q) return { products: [], creators: [] };
  
  const words = q.split(/\s+/);
  
  const scoredProducts = products
    .map(p => {
      let score = 0;
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      
      words.forEach(word => {
        if (title.includes(word)) score += 5; // Title match highest
        if (desc.includes(word)) score += 2;
        if ((p.category || '').toLowerCase().includes(word)) score += 1;
      });
      
      return { product: p, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  
  const scoredCreators = marketers
    .map(m => {
      let score = 0;
      if ((m.name || '').toLowerCase().includes(q)) score += 5;
      if ((m.bio || '').toLowerCase().includes(q)) score += 2;
      return { creator: m, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  
  return {
    products: scoredProducts.map(s => s.product),
    creators: scoredCreators.map(s => s.creator),
  };
}

export function getSeasonalTrends(products, sales, category) {
  // Identify seasonal trends within a category
  const now = new Date();
  const month = now.getMonth();
  
  const seasonalFactors = {
    // Summer (6-8): beach, swimwear
    6: { categories: ['Fashion', 'Beauty'], boost: 1.3 },
    7: { categories: ['Fashion', 'Beauty'], boost: 1.3 },
    8: { categories: ['Fashion', 'Beauty'], boost: 1.3 },
    // Winter (11-1): cozy, gifts
    11: { categories: ['Home', 'Fashion'], boost: 1.2 },
    0: { categories: ['Home', 'Fashion'], boost: 1.2 },
    1: { categories: ['Home'], boost: 1.2 },
    // Spring (2-4): fresh, outdoors
    2: { categories: ['Fashion', 'Beauty'], boost: 1.1 },
    3: { categories: ['Fashion', 'Beauty'], boost: 1.1 },
    4: { categories: ['Fashion', 'Beauty'], boost: 1.1 },
  };
  
  const seasonalFactor = seasonalFactors[month] || { boost: 1 };
  
  const relevant = products.filter(p => 
    p.status === 'approved' && 
    (!category || p.category === category)
  );
  
  return relevant
    .map(p => ({
      product: p,
      score: ((p.clicks || 0) + (sales?.filter(s => s.productId === p.id)?.length || 0) * 3) * seasonalFactor.boost
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.product);
}

/**
 * דירוג אמינות — "רק המוצרים הכי טובים עולים".
 * מדרג מוצרים לפי מכירות בפועל + קליקים + סטטוס מאושר, כך שהקונה שרואה
 * תמונה רואה קודם את מה שכבר הוכח כטוב בקהילה.
 * @returns {Array} מוצרים עם שדות _trustScore / _salesCount / _clicks
 */
export function rankByTrust(products = [], sales = [], limit = 6) {
  const countByProduct = {};
  (sales || []).forEach((s) => {
    if (s && s.productId) countByProduct[s.productId] = (countByProduct[s.productId] || 0) + 1;
  });

  return [...(products || [])]
    .filter((p) => p && p.status === "approved")
    .map((p) => {
      const salesCount = countByProduct[p.id] || 0;
      const clicks = Number(p.clicks || 0);
      const trust = salesCount * 4 + clicks * 0.5;
      return { ...p, _trustScore: trust, _salesCount: salesCount, _clicks: clicks };
    })
    .sort((a, b) => b._trustScore - a._trustScore)
    .slice(0, limit);
}

/**
 * תגיות פיד — "רק הטובים עולים".
 * מחשב אילו מוצרים מגיעים לתגית (מומלץ / הכי נמכר / טרנדינג) לפי
 * מכירות אמיתיות + קליקים, בעזרת rankByTrust הקיים.
 * מחזיר Map של productId → { label, variant } — O(1) חיפוש ברינדור.
 *
 * @returns {Map<string,{label:string,variant:string}>}
 */
export function getFeedBadges(products = [], sales = [], { topN = 5 } = {}) {
  const ranked = rankByTrust(products, sales, products.length);
  if (!ranked.length) return new Map();

  // מוצרים הכי טובים (פ�ילוט)
  const topIds = new Set(ranked.slice(0, topN).map((p) => p.id));

  // ספירת מכירות לכל מוצר
  const salesByProduct = {};
  (sales || []).forEach((s) => {
    if (s && s.productId) salesByProduct[s.productId] = (salesByProduct[s.productId] || 0) + 1;
  });

  // כמות המכירות המקסימלית (לזיהוי "הכי נמכר")
  let maxSales = 0;
  Object.values(salesByProduct).forEach((n) => {
    if (n > maxSales) maxSales = n;
  });

  const badges = new Map();
  ranked.forEach((p) => {
    const salesCount = salesByProduct[p.id] || 0;
    if (topIds.has(p.id) && salesCount >= 2) {
      badges.set(p.id, { label: "⭐ מומלץ", variant: "trust" });
    } else if (salesCount >= 3 && salesCount === maxSales && maxSales > 0) {
      badges.set(p.id, { label: "🔥 הכי נמכר", variant: "hot" });
    } else if (topIds.has(p.id) && salesCount >= 1) {
      badges.set(p.id, { label: "📈 טרנדינג", variant: "trend" });
    }
  });

  return badges;
}
