/**
 * LikeLink Trend Intelligence Engine 🔥
 * =====================================
 * Detects what's HOT right now based on first-party data:
 * clicks, sales, velocity, and momentum — no external APIs needed.
 *
 * Pure module: no network, no secrets, no side effects.
 */

// Trend signals — weighted by commercial value
const SIGNAL_WEIGHTS = {
  verifiedSale: 100,    // Real money = strongest signal
  checkout: 25,         // Purchase intent
  click: 5,             // Interest
  view: 1,              // Awareness
};

/**
 * Calculate trend score for a single product.
 * Higher = hotter right now.
 */
export function trendScore(product, { sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const id = product?.id;
  if (!id) return { score: 0, signals: {}, momentum: 'cold' };

  const dayMs = 24 * 60 * 60 * 1000;
  const window7d = now - 7 * dayMs;
  const window30d = now - 30 * dayMs;

  // Sales for this product (last 7 days)
  const productSales = sales.filter((s) => s?.productId === id && s?.timestamp > window7d);
  const sales30d = sales.filter((s) => s?.productId === id && s?.timestamp > window30d);

  // Clicks for this product (last 7 days)
  const productClicks = clicks.filter((c) => c?.productId === id && c?.timestamp > window7d);
  const clicks30d = clicks.filter((c) => c?.productId === id && c?.timestamp > window30d);

  // Views for this product (last 7 days)
  const productViews = views.filter((v) => v?.productId === id && v?.timestamp > window7d);

  // Velocity: is it accelerating? (7d vs 30d trend)
  const salesVelocity = productSales.length / Math.max(1, sales30d.length / 4.3);
  const clicksVelocity = productClicks.length / Math.max(1, clicks30d.length / 4.3);

  // Composite score
  const score =
    productSales.length * SIGNAL_WEIGHTS.verifiedSale +
    productClicks.length * SIGNAL_WEIGHTS.click +
    productViews.length * SIGNAL_WEIGHTS.view;

  // Momentum classification
  let momentum = 'cold';
  if (salesVelocity > 2 && score > 200) momentum = '🔥 viral';
  else if (salesVelocity > 1.5 && score > 100) momentum = '📈 hot';
  else if (salesVelocity > 1 && score > 50) momentum = '↗️ rising';
  else if (score > 0) momentum = '→ steady';
  else momentum = '❄️ cold';

  return {
    score: Math.round(score),
    momentum,
    signals: {
      sales7d: productSales.length,
      clicks7d: productClicks.length,
      views7d: productViews.length,
      salesVelocity: Math.round(salesVelocity * 100) / 100,
      clicksVelocity: Math.round(clicksVelocity * 100) / 100,
    },
  };
}

/**
 * Rank all products by trend score.
 * Returns hottest products first.
 */
export function rankByTrend(products = [], { sales = [], clicks = [], views = [], now = Date.now(), limit = 10 } = {}) {
  return products
    .map((p) => ({
      product: p,
      ...trendScore(p, { sales, clicks, views, now }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Detect emerging products — new products with early momentum.
 * These get a "NEW & HOT" badge.
 */
export function detectEmerging(products = [], { sales = [], clicks = [], now = Date.now() } = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const window3d = now - 3 * dayMs;

  return products
    .filter((p) => {
      const created = p?.createdAt || 0;
      const isNew = created > window3d;
      const recentClicks = clicks.filter((c) => c?.productId === p?.id && c?.timestamp > window3d).length;
      return isNew && recentClicks > 0;
    })
    .map((p) => ({
      product: p,
      ...trendScore(p, { sales, clicks, now }),
      badge: 'NEW & HOT',
    }));
}

/**
 * Detect declining products — losing momentum.
 * These should be replaced.
 */
export function detectDeclining(products = [], { sales = [], clicks = [], now = Date.now() } = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const window14d = now - 14 * dayMs;
  const window7d = now - 7 * dayMs;

  return products
    .filter((p) => {
      const clicks7d = clicks.filter((c) => c?.productId === p?.id && c?.timestamp > window7d).length;
      const clicks14d = clicks.filter((c) => c?.productId === p?.id && c?.timestamp > window14d).length;
      // Declining: had clicks before, but none recently
      return clicks14d > 5 && clicks7d === 0;
    })
    .map((p) => ({
      product: p,
      ...trendScore(p, { sales, clicks, now }),
      badge: 'DECLINING',
    }));
}

/**
 * Get the single hottest product RIGHT NOW.
 */
export function getHottest(products = [], { sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const ranked = rankByTrend(products, { sales, clicks, views, now, limit: 1 });
  return ranked[0] || null;
}

/**
 * Trend summary for dashboard display.
 */
export function trendSummary(products = [], { sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const ranked = rankByTrend(products, { sales, clicks, views, now });
  const emerging = detectEmerging(products, { sales, clicks, now });
  const declining = detectDeclining(products, { sales, clicks, now });

  return {
    hottest: ranked.slice(0, 3),
    emerging,
    declining,
    totalProducts: products.length,
    activeProducts: ranked.filter((r) => r.score > 0).length,
    timestamp: now,
  };
}
