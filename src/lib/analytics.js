/**
 * Analytics tracking for Likelink platform
 * Tracks views, clicks, conversions, and creator performance
 */

/**
 * Track a product view
 */
export function trackView(productId, marketerId, source = "feed") {
  try {
    const event = {
      type: "view",
      productId,
      marketerId,
      source,
      timestamp: Date.now(),
    };
    
    // Store in localStorage for now (can be extended to send to analytics service)
    const views = JSON.parse(localStorage.getItem("likelink_analytics_views") || "[]");
    views.push(event);
    
    // Keep only last 1000 views to prevent storage bloat
    const trimmed = views.slice(-1000);
    localStorage.setItem("likelink_analytics_views", JSON.stringify(trimmed));
    
    return event;
  } catch (e) {
    console.error("Analytics tracking failed:", e);
    return null;
  }
}

/**
 * Track a product click
 */
export function trackClick(productId, marketerId, source = "feed") {
  try {
    const event = {
      type: "click",
      productId,
      marketerId,
      source,
      timestamp: Date.now(),
    };
    
    const clicks = JSON.parse(localStorage.getItem("likelink_analytics_clicks") || "[]");
    clicks.push(event);
    const trimmed = clicks.slice(-1000);
    localStorage.setItem("likelink_analytics_clicks", JSON.stringify(trimmed));
    
    return event;
  } catch (e) {
    console.error("Analytics tracking failed:", e);
    return null;
  }
}

/**
 * Track a conversion/sale
 */
export function trackConversion(productId, marketerId, amount, commission) {
  try {
    const event = {
      type: "conversion",
      productId,
      marketerId,
      amount,
      commission,
      timestamp: Date.now(),
    };
    
    const conversions = JSON.parse(localStorage.getItem("likelink_analytics_conversions") || "[]");
    conversions.push(event);
    const trimmed = conversions.slice(-1000);
    localStorage.setItem("likelink_analytics_conversions", JSON.stringify(trimmed));
    
    return event;
  } catch (e) {
    console.error("Analytics tracking failed:", e);
    return null;
  }
}

/**
 * Get analytics summary for a creator
 */
export function getCreatorAnalytics(marketerId, products = []) {
  try {
    const views = JSON.parse(localStorage.getItem("likelink_analytics_views") || "[]");
    const clicks = JSON.parse(localStorage.getItem("likelink_analytics_clicks") || "[]");
    const conversions = JSON.parse(localStorage.getItem("likelink_analytics_conversions") || "[]");
    
    const creatorViews = views.filter((v) => v.marketerId === marketerId).length;
    const creatorClicks = clicks.filter((c) => c.marketerId === marketerId).length;
    const creatorConversions = conversions.filter((c) => c.marketerId === marketerId);
    
    const totalEarnings = creatorConversions.reduce((sum, c) => sum + (c.commission || 0), 0);
    const totalSales = creatorConversions.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    // Top selling products
    const productSales = {};
    creatorConversions.forEach((c) => {
      if (!productSales[c.productId]) {
        productSales[c.productId] = { count: 0, earnings: 0 };
      }
      productSales[c.productId].count += 1;
      productSales[c.productId].earnings += c.commission || 0;
    });
    
    const topProducts = Object.entries(productSales)
      .map(([productId, data]) => ({
        productId,
        ...data,
      }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 5);
    
    return {
      views: creatorViews,
      clicks: creatorClicks,
      conversions: creatorConversions.length,
      totalEarnings,
      totalSales,
      topProducts,
      clickToViewRate: creatorViews > 0 ? ((creatorClicks / creatorViews) * 100).toFixed(1) : 0,
      conversionRate: creatorClicks > 0 ? ((creatorConversions.length / creatorClicks) * 100).toFixed(1) : 0,
    };
  } catch (e) {
    console.error("Failed to get analytics:", e);
    return {
      views: 0,
      clicks: 0,
      conversions: 0,
      totalEarnings: 0,
      totalSales: 0,
      topProducts: [],
      clickToViewRate: 0,
      conversionRate: 0,
    };
  }
}

/**
 * Get platform-wide analytics (for admin)
 */
export function getPlatformAnalytics() {
  try {
    const views = JSON.parse(localStorage.getItem("likelink_analytics_views") || "[]");
    const clicks = JSON.parse(localStorage.getItem("likelink_analytics_clicks") || "[]");
    const conversions = JSON.parse(localStorage.getItem("likelink_analytics_conversions") || "[]");
    
    const totalGMV = conversions.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalCommission = conversions.reduce((sum, c) => sum + (c.commission || 0), 0);
    
    // Top creators
    const creatorStats = {};
    conversions.forEach((c) => {
      if (!creatorStats[c.marketerId]) {
        creatorStats[c.marketerId] = { sales: 0, earnings: 0 };
      }
      creatorStats[c.marketerId].sales += 1;
      creatorStats[c.marketerId].earnings += c.commission || 0;
    });
    
    const topCreators = Object.entries(creatorStats)
      .map(([marketerId, data]) => ({ marketerId, ...data }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);
    
    return {
      totalViews: views.length,
      totalClicks: clicks.length,
      totalConversions: conversions.length,
      totalGMV,
      totalCommission,
      avgOrderValue: conversions.length > 0 ? totalGMV / conversions.length : 0,
      topCreators,
    };
  } catch (e) {
    console.error("Failed to get platform analytics:", e);
    return {
      totalViews: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalGMV: 0,
      totalCommission: 0,
      avgOrderValue: 0,
      topCreators: [],
    };
  }
}
