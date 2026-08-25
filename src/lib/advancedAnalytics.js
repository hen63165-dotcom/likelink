/**
 * Advanced Analytics with Predictive Insights
 * ML-driven analytics, forecasts, and recommendations
 */

export function getCreatorForecasts(marketer, products, sales, days = 30) {
  // Predict next 30 days of earnings
  if (!sales || sales.length === 0) {
    return { forecast: [], confidence: 0, warning: 'Not enough data' };
  }
  
  const mySales = sales.filter(s => s.marketerId === marketer.id);
  if (mySales.length < 3) {
    return { forecast: [], confidence: 0, warning: 'Minimum 3 sales needed for forecast' };
  }
  
  // Calculate daily average from last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentSales = mySales.filter(s => s.ts > thirtyDaysAgo);
  const dailyAvg = recentSales.length > 0 ? recentSales.length / 30 : mySales.length / Math.max(1, Math.floor((Date.now() - mySales[0].ts) / (24 * 60 * 60 * 1000)));
  const avgRevenue = recentSales.length > 0 ? recentSales.reduce((sum, s) => sum + (s.marketerNet || 0), 0) / 30 : 0;
  
  // Simple linear forecast with variance
  const forecast = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    // Add small random variance (±20%)
    const variance = (Math.random() - 0.5) * 0.4;
    const predictedRevenue = avgRevenue * (1 + variance);
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      predictedRevenue: Math.max(0, predictedRevenue),
      confidence: Math.max(0.5, Math.min(1, 0.6 + recentSales.length * 0.04)), // Higher with more data
    });
  }
  
  return {
    forecast,
    confidence: Math.min(1, 0.6 + recentSales.length * 0.04),
    trend: dailyAvg > 2 ? 'Growing' : dailyAvg > 1 ? 'Stable' : 'Declining',
    projectedMonthlyRevenue: avgRevenue * 30,
  };
}

export function getProductPerformanceAnalysis(product, clicks, sales) {
  // Deep analysis of individual product performance
  const productClicks = clicks?.filter(c => c.productId === product.id)?.length || 0;
  const productSales = sales?.filter(s => s.productId === product.id) || [];
  const totalRevenue = productSales.reduce((sum, s) => sum + (s.commissionAmount || 0), 0);
  
  // Calculate key metrics
  const conversionRate = productClicks > 0 ? (productSales.length / productClicks) * 100 : 0;
  const avgOrderValue = productSales.length > 0 ? totalRevenue / productSales.length : 0;
  
  // Performance tier
  let tier = 'Average';
  if (conversionRate > 5 && productClicks > 20) tier = 'Top Performer 🚀';
  else if (conversionRate > 2 && productClicks > 10) tier = 'Strong Performer ⭐';
  else if (productClicks < 5) tier = 'Needs Optimization ⚠️';
  
  // Recommendations
  const recommendations = [];
  if (conversionRate < 1) recommendations.push('Improve product description or image');
  if (productClicks < 5) recommendations.push('Promote this product more');
  if (!product.image) recommendations.push('Add a product image');
  if (!product.description || product.description.length < 20) recommendations.push('Write a better description');
  if (productClicks > 50 && productSales.length < 3) recommendations.push('Price may be too high - consider discount');
  
  return {
    productId: product.id,
    title: product.title,
    tier,
    clicks: productClicks,
    sales: productSales.length,
    conversionRate: conversionRate.toFixed(2) + '%',
    totalRevenue: totalRevenue.toFixed(2),
    avgOrderValue: avgOrderValue.toFixed(2),
    daysActive: Math.floor((Date.now() - product.createdAt) / (1000 * 60 * 60 * 24)),
    recommendations,
    shouldBoost: productClicks > 30 && productSales.length > 2, // Good engagement
  };
}

export function getCompetitiveAnalysis(marketer, marketers, products, sales) {
  // Compare creator to top performers in same categories
  const myProducts = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved') || [];
  const myCategories = [...new Set(myProducts.map(p => p.category))];
  
  const competitorData = marketers
    .filter(m => m.id !== marketer.id)
    .map(m => {
      const theirProducts = products?.filter(p => p.marketerId === m.id && p.status === 'approved') || [];
      const theirCategories = new Set(theirProducts.map(p => p.category));
      
      // Overlap score: shared categories
      const categoryOverlap = myCategories.filter(c => theirCategories.has(c)).length;
      
      if (categoryOverlap === 0) return null;
      
      const theirClicks = theirProducts.reduce((sum, p) => sum + (p.clicks || 0), 0);
      const theirSales = sales?.filter(s => s.marketerId === m.id)?.length || 0;
      
      return {
        creator: m,
        categoryOverlap,
        productCount: theirProducts.length,
        totalClicks: theirClicks,
        totalSales: theirSales,
        avgClicksPerProduct: theirProducts.length > 0 ? theirClicks / theirProducts.length : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.totalClicks || 0) - (a.totalClicks || 0))
    .slice(0, 5);
  
  const myClicks = myProducts.reduce((sum, p) => sum + (p.clicks || 0), 0);
  const mySales = sales?.filter(s => s.marketerId === marketer.id)?.length || 0;
  const myAvgClicks = myProducts.length > 0 ? myClicks / myProducts.length : 0;
  
  return {
    myMetrics: {
      productCount: myProducts.length,
      totalClicks: myClicks,
      totalSales: mySales,
      avgClicksPerProduct: myAvgClicks,
    },
    competitors: competitorData,
    benchmarks: {
      avgProductCount: competitorData.length > 0 ? competitorData.reduce((sum, c) => sum + c.productCount, 0) / competitorData.length : 0,
      avgClicksPerProduct: competitorData.length > 0 ? competitorData.reduce((sum, c) => sum + c.avgClicksPerProduct, 0) / competitorData.length : 0,
    },
    recommendation: myAvgClicks < (competitorData[0]?.avgClicksPerProduct || 0) ? 'Optimize content to match top performers' : 'You\'re outperforming competitors!',
  };
}

export function getEngagementMetrics(marketer, products, clicks, views) {
  // Calculate engagement quality score
  const myProducts = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved') || [];
  const myClicks = clicks?.filter(c => {
    const p = products?.find(pr => pr.id === c.productId);
    return p?.marketerId === marketer.id;
  })?.length || 0;
  
  // Calculate multiple engagement indicators
  const indicators = {
    engagementRate: myClicks > 0 ? (myClicks / Math.max(1, myProducts.length)) * 100 : 0,
    contentFreshness: myProducts.length > 0 
      ? Math.max(0, 100 - ((Date.now() - myProducts[myProducts.length - 1].createdAt) / (1000 * 60 * 60 * 24) * 5))
      : 0,
    contentDiversity: new Set(myProducts.map(p => p.category)).size,
    consistencyScore: calculateConsistency(myProducts),
    audienceGrowthRate: calculateGrowthRate(clicks?.filter(c => {
      const p = products?.find(pr => pr.id === c.productId);
      return p?.marketerId === marketer.id;
    }) || []),
  };
  
  const totalScore = (
    Math.min(indicators.engagementRate / 2, 25) +
    indicators.contentFreshness * 0.25 +
    Math.min(indicators.contentDiversity * 5, 20) +
    indicators.consistencyScore * 0.15 +
    indicators.audienceGrowthRate * 0.1
  );
  
  return {
    ...indicators,
    overallScore: Math.min(totalScore, 100),
    tier: totalScore > 75 ? 'Elite Engagement' : totalScore > 50 ? 'Strong Engagement' : totalScore > 25 ? 'Moderate Engagement' : 'Low Engagement',
  };
}

function calculateConsistency(products) {
  if (products.length < 2) return 50;
  
  // Days between posts
  const sortedByDate = [...products].sort((a, b) => b.createdAt - a.createdAt);
  const intervals = [];
  
  for (let i = 0; i < sortedByDate.length - 1; i++) {
    const days = (sortedByDate[i].createdAt - sortedByDate[i + 1].createdAt) / (1000 * 60 * 60 * 24);
    intervals.push(days);
  }
  
  // Standard deviation of intervals (lower = more consistent)
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, x) => sum + Math.pow(x - avgInterval, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  
  // Convert to 0-100 score (lower stdDev = higher score)
  return Math.max(0, 100 - stdDev * 5);
}

function calculateGrowthRate(clicks) {
  if (clicks.length < 2) return 0;
  
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  
  const lastWeekClicks = clicks.filter(c => c.ts > weekAgo).length;
  const previousWeekClicks = clicks.filter(c => c.ts > twoWeeksAgo && c.ts <= weekAgo).length;
  
  if (previousWeekClicks === 0) return lastWeekClicks > 0 ? 100 : 0;
  
  return ((lastWeekClicks - previousWeekClicks) / previousWeekClicks) * 100;
}

export function getAnomalyDetection(product, historicalClicks) {
  // Detect unusual engagement patterns
  if (!historicalClicks || historicalClicks.length < 5) return null;
  
  const daily = {};
  historicalClicks.forEach(c => {
    const day = new Date(c.ts).toISOString().split('T')[0];
    daily[day] = (daily[day] || 0) + 1;
  });
  
  const values = Object.values(daily);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  // Flag if today is >2 std devs away
  const today = new Date().toISOString().split('T')[0];
  const todayClicks = daily[today] || 0;
  
  if (Math.abs(todayClicks - avg) > stdDev * 2) {
    return {
      type: todayClicks > avg ? 'spike' : 'drop',
      message: todayClicks > avg 
        ? `Engagement spike! ${todayClicks} clicks (avg: ${avg.toFixed(1)})`
        : `Engagement dip. ${todayClicks} clicks (avg: ${avg.toFixed(1)})`,
      expectedNormal: avg.toFixed(1),
      actual: todayClicks,
    };
  }
  
  return null;
}
