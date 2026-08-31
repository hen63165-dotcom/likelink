/**
 * Predictive Analytics Engine
 * 
 * Predicts what will sell before it happens.
 * This is what makes Amazon's recommendation engine genius.
 * 
 * Features:
 * - Trend prediction
 * - Product recommendations
 * - Seasonal forecasting
 * - Price optimization
 */

// Analyze trends
export function analyzeTrends() {
  const purchases = JSON.parse(localStorage.getItem('product_purchases') || '{}');
  const views = JSON.parse(localStorage.getItem('product_views') || '{}');
  
  const trends = Object.keys(purchases).map(productId => ({
    productId,
    purchases: purchases[productId],
    views: views[productId] || 0,
    conversionRate: views[productId] ? (purchases[productId] / views[productId]).toFixed(2) : 0,
    trend: calculateTrend(productId),
  }));
  
  return trends.sort((a, b) => b.trend - a.trend);
}

// Calculate trend direction
function calculateTrend(productId) {
  const history = JSON.parse(localStorage.getItem(`trend_${productId}`) || '[]');
  if (history.length < 2) return 0;
  
  const recent = history.slice(-7); // Last 7 data points
  const slope = (recent[recent.length - 1] - recent[0]) / recent.length;
  
  return slope;
}

// Predict next hot products
export function predictHotProducts(products) {
  const trends = analyzeTrends();
  
  return products.map(product => {
    const trend = trends.find(t => t.productId === product.id);
    const score = calculateHotScore(product, trend);
    
    return {
      ...product,
      hotScore: score,
      prediction: getPredictionLabel(score),
      recommendedAction: getRecommendedAction(score),
    };
  }).sort((a, b) => b.hotScore - a.hotScore);
}

// Calculate hot score
function calculateHotScore(product, trend) {
  let score = 0;
  
  // Views weight
  const views = trend?.views || 0;
  score += Math.min(views / 10, 30);
  
  // Purchases weight
  const purchases = trend?.purchases || 0;
  score += Math.min(purchases * 2, 40);
  
  // Conversion rate weight
  const conversion = parseFloat(trend?.conversionRate || 0);
  score += conversion * 20;
  
  // Trend direction
  const trendDirection = trend?.trend || 0;
  score += trendDirection > 0 ? 10 : -5;
  
  return Math.round(score);
}

// Get prediction label
function getPredictionLabel(score) {
  if (score >= 80) return '🔥 עוד חם!';
  if (score >= 60) return '📢 עוד טוב';
  if (score >= 40) return '👑 יציב';
  if (score >= 20) return '😏 צריך קצת עבודה';
  return '❄️ קר';
}

// Get recommended action
function getRecommendedAction(score) {
  if (score >= 80) return 'הפוך לפרסם עכשיו — זה עף!';
  if (score >= 60) return 'כדאי לפרסם — זה עולה';
  if (score >= 40) return 'יציב — אפשר לשמור';
  if (score >= 20) return 'צריך קצת עבודה — נסה תבנית אחרת';
  return 'כדאי לחכות או למחוק';
}

// Get seasonal recommendations
export function getSeasonalRecommendations() {
  const month = new Date().getMonth();
  const season = getSeason(month);
  
  const seasonalProducts = {
    summer: ['בגד ים', 'סנדלים', 'משקפי שמש', 'כובע'],
    winter: ['מעיל', 'גרביים', 'כפכפים', 'צעיף'],
    spring: ['שמלה', 'חצאית', 'נעליים פתוחות', 'גקט'],
    autumn: ['גקט', 'מגף', 'נעליים סגורות', 'מטריה'],
  };
  
  return {
    season,
    recommendedCategories: seasonalProducts[season],
    message: `זמן ${season === 'summer' ? 'קיץ' : season === 'winter' ? 'חורף' : season === 'spring' ? 'אביב' : 'סתיו'} — מה חם עכשיו: ${seasonalProducts[season].join(', ')}`,
  };
}

// Get season from month
function getSeason(month) {
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  if (month >= 11 || month <= 1) return 'winter';
  return 'spring';
}

// Price optimization suggestion
export function suggestPrice(product) {
  const trend = analyzeTrends().find(t => t.productId === product.id);
  const conversion = parseFloat(trend?.conversionRate || 0);
  
  let suggestion = '';
  
  if (conversion > 0.1) {
    suggestion = 'המחיר טוב — אפשר להעלות קצת';
  } else if (conversion > 0.05) {
    suggestion = 'המחיר בסדר — תמשיכי ככה';
  } else if (conversion > 0.02) {
    suggestion = 'כדאי להוריד קצת את המחיר';
  } else {
    suggestion = 'המחיר גבוה מדי — כדאי להוריד משמעותית';
  }
  
  return {
    currentPrice: product.price,
    conversion,
    suggestion,
  };
}

// Record trend data point
export function recordTrendData(productId, value) {
  const history = JSON.parse(localStorage.getItem(`trend_${productId}`) || '[]');
  history.push(value);
  if (history.length > 30) history.shift();
  localStorage.setItem(`trend_${productId}`, JSON.stringify(history));
}
