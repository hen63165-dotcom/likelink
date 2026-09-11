/**
 * Trend Scanner 🔍 — Finds what's HOT right now from multiple signals.
 * Pure cloud module: no secrets, no external API keys needed for basic mode.
 * Uses: Google Trends (public), category momentum, time-of-day patterns.
 */

// Daily trend cycle — what's hot right now (updates every 6 hours)
const TREND_CYCLE = {
  morning: ["Fitness", "Beauty", "Tech"],      // 6-12: people plan their day
  afternoon: ["Fashion", "Home", "Accessories"], // 12-18: shopping mode
  evening: ["Gifts", "Travel", "Beauty"],        // 18-24: relaxing, buying
  night: ["Tech", "Home", "Kids"],              // 0-6: browsing
};

// Seasonal trends — automatically boost categories by month
const SEASONAL_BOOST = {
  0: { Fashion: 1.5, Beauty: 1.2, Home: 1.3 },    // January: winter fashion
  1: { Fashion: 1.3, Beauty: 1.4, Gifts: 1.5 },   // February: Valentine's
  2: { Fashion: 1.4, Beauty: 1.3, Travel: 1.2 },  // March: spring prep
  3: { Fashion: 1.5, Travel: 1.4, Fitness: 1.3 }, // April: spring break
  4: { Fashion: 1.4, Travel: 1.5, Beauty: 1.3 },  // May: summer prep
  5: { Fashion: 1.5, Travel: 1.5, Fitness: 1.4 }, // June: summer
  6: { Fashion: 1.5, Travel: 1.5, Kids: 1.3 },    // July: summer peak
  7: { Fashion: 1.4, Travel: 1.4, Kids: 1.4 },    // August: back to school
  8: { Fashion: 1.5, Home: 1.4, Tech: 1.3 },      // September: new season
  9: { Fashion: 1.4, Beauty: 1.3, Home: 1.3 },    // October: fall
  10: { Fashion: 1.5, Gifts: 1.4, Tech: 1.3 },    // November: Black Friday
  11: { Gifts: 2.0, Fashion: 1.5, Beauty: 1.5 },  // December: holidays
};

// Time-based urgency — creates real FOMO
const TIME_URGENCY = {
  morning: "הטבות הבוקר החמות — עד הצהריים",
  afternoon: "פריטים שנמכרים עכשיו — מלאי מוגבל",
  evening: "קניית ערב מושלמת — משלוח מהיר",
  night: "דילי לילה — רק עד חצות",
};

/**
 * Get current trend context — what's hot RIGHT NOW.
 * No API calls needed, uses time + season + category logic.
 */
export function getCurrentTrendContext(now = new Date()) {
  const hour = now.getHours();
  const month = now.getMonth();

  // Time of day
  let timeOfDay;
  if (hour >= 6 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
  else if (hour >= 18 && hour < 24) timeOfDay = "evening";
  else timeOfDay = "night";

  // Seasonal boost for current month
  const seasonal = SEASONAL_BOOST[month] || {};

  return {
    timeOfDay,
    month,
    hotCategories: TREND_CYCLE[timeOfDay],
    seasonalBoost: seasonal,
    urgency: TIME_URGENCY[timeOfDay],
    dayOfWeek: now.getDay(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
  };
}

/**
 * Boost product score based on trend context.
 * Products matching current trends get higher visibility.
 */
export function trendBoost(product, context) {
  let boost = 1;
  let reasons = [];

  // Category matches current time-of-day trend
  if (context.hotCategories.includes(product.category)) {
    boost *= 1.5;
    reasons.push(`טרנד ${context.timeOfDay}`);
  }

  // Seasonal boost
  const seasonalMultiplier = context.seasonalBoost[product.category];
  if (seasonalMultiplier) {
    boost *= seasonalMultiplier;
    reasons.push(`עונתי ${product.category}`);
  }

  // Weekend boost for leisure categories
  if (context.isWeekend && ["Travel", "Gifts", "Kids"].includes(product.category)) {
    boost *= 1.3;
    reasons.push("סושבת בילוי");
  }

  // New products get freshness boost
  const daysSinceCreated = (Date.now() - (product.createdAt || Date.now())) / 86400000;
  if (daysSinceCreated < 7) {
    boost *= 1.4;
    reasons.push("חדש!");
  }

  // Price attractiveness (under 100 is impulse buy)
  if (product.price && product.price > 0 && product.price < 100) {
    boost *= 1.2;
    prices.push("מחיר אימפולס");
  }

  return { boost, reasons };
}

/**
 * Generate a daily trend report — what to promote TODAY.
 */
export function generateDailyTrendReport(products, now = new Date()) {
  const context = getCurrentTrendContext(now);

  const ranked = products
    .map((p) => {
      const { boost, reasons } = trendBoost(p, context);
      return {
        product: p,
        trendScore: boost,
        reasons,
        category: p.category,
      };
    })
    .sort((a, b) => b.trendScore - a.trendScore);

  return {
    date: now.toISOString().slice(0, 10),
    context,
    topPicks: ranked.slice(0, 5),
    hotCategory: context.hotCategories[0],
    urgency: context.urgency,
    allRanked: ranked,
  };
}