/**
 * Trend Scanner 🔍 — Finds what's HOT right now.
 * Uses time-of-day + season + category momentum — no external APIs needed.
 */

const TREND_CYCLE = {
  morning: ["Fitness", "Beauty", "Tech"],
  afternoon: ["Fashion", "Home", "Accessories"],
  evening: ["Gifts", "Travel", "Beauty"],
  night: ["Tech", "Home", "Kids"],
};

const SEASONAL_BOOST = {
  0: { Fashion: 1.5, Beauty: 1.2, Home: 1.3 },
  1: { Fashion: 1.3, Beauty: 1.4, Gifts: 1.5 },
  2: { Fashion: 1.4, Beauty: 1.3, Travel: 1.2 },
  3: { Fashion: 1.5, Travel: 1.4, Fitness: 1.3 },
  4: { Fashion: 1.4, Travel: 1.5, Beauty: 1.3 },
  5: { Fashion: 1.5, Travel: 1.5, Fitness: 1.4 },
  6: { Fashion: 1.5, Travel: 1.5, Kids: 1.3 },
  7: { Fashion: 1.4, Travel: 1.4, Kids: 1.4 },
  8: { Fashion: 1.5, Home: 1.4, Tech: 1.3 },
  9: { Fashion: 1.4, Beauty: 1.3, Home: 1.3 },
  10: { Fashion: 1.5, Gifts: 1.4, Tech: 1.3 },
  11: { Gifts: 2.0, Fashion: 1.5, Beauty: 1.5 },
};

const TIME_URGENCY = {
  morning: "הטבות הבוקר החמות — עד הצהריים",
  afternoon: "פריטים שנמכרים עכשיו — מלאי מוגבל",
  evening: "קניית ערב מושלמת — משלוח מהיר",
  night: "דילי לילה — רק עד חצות",
};

export function getCurrentTrendContext(now = new Date()) {
  const hour = now.getHours();
  const month = now.getMonth();

  let timeOfDay;
  if (hour >= 6 && hour < 12) timeOfDay = "morning";
  else if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
  else if (hour >= 18 && hour < 24) timeOfDay = "evening";
  else timeOfDay = "night";

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

export function trendBoost(product, context) {
  let boost = 1;
  let reasons = [];

  if (context.hotCategories.includes(product.category)) {
    boost *= 1.5;
    reasons.push(`טרנד ${context.timeOfDay}`);
  }

  const seasonalMultiplier = context.seasonalBoost[product.category];
  if (seasonalMultiplier) {
    boost *= seasonalMultiplier;
    reasons.push(`עונתי`);
  }

  if (context.isWeekend && ["Travel", "Gifts", "Kids"].includes(product.category)) {
    boost *= 1.3;
    reasons.push("סוף שבוע");
  }

  const daysSinceCreated = (Date.now() - (product.createdAt || Date.now())) / 86400000;
  if (daysSinceCreated < 7) {
    boost *= 1.4;
    reasons.push("חדש!");
  }

  if (product.price && product.price > 0 && product.price < 100) {
    boost *= 1.2;
    reasons.push("מחיר אימפולס");
  }

  return { boost, reasons };
}

export function generateDailyTrendReport(products, now = new Date()) {
  const context = getCurrentTrendContext(now);

  const ranked = products
    .map((p) => {
      const { boost, reasons } = trendBoost(p, context);
      return { product: p, trendScore: boost, reasons, category: p.category };
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