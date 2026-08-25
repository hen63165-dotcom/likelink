/**
 * Seller AI assistant utilities for Likelink2.
 * Lightweight but production-ready helper layer to power a built-in studio assistant.
 */

export function buildSellerAIInsights({ marketer, products = [], sales = [], notifications = [] }) {
  const mine = products.filter((p) => p.marketerId === marketer?.id);
  const mySales = sales.filter((s) => s.marketerId === marketer?.id);
  const myClicks = mine.reduce((sum, p) => sum + (p.clicks || 0), 0);
  const revenue = mySales.reduce((sum, s) => sum + (s.marketerNet || 0), 0);
  const avgPrice = mine.length ? mine.reduce((sum, p) => sum + (p.price || 0), 0) / mine.length : 0;
  const topCategory = mine.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + (p.clicks || 0);
    return acc;
  }, {});

  const winningCategory = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0];
  const health = Math.min(100, Math.round((myClicks / Math.max(1, mine.length * 15)) * 40 + (revenue / Math.max(1, mine.length * 180)) * 60));

  const actions = [];
  if (!mine.length) actions.push("Add your first 5 products to unlock a faster creator discovery wave.");
  if (mine.length && mine.length < 10) actions.push("Publish 5 more products to increase both reach and conversion opportunities.");
  if (revenue < 200) actions.push("Refresh your top 3 products with stronger imagery and clearer pricing.");
  if (winningCategory) actions.push(`Your best-performing vertical is ${winningCategory[0]}. Build a mini collection around it.`);
  if (notifications.length > 0) actions.push("Use your recent click activity to refresh products with the lowest CTR.");
  actions.push("Launch a cross-platform campaign with WhatsApp, Instagram and TikTok links in one tap.");

  const campaignCopy = `Hi! I just refreshed my creator store with ${mine.length || 0} products and my best-performing picks are now live. Shop my recommended edits and enjoy a fast, easy checkout experience.`;

  return {
    health,
    title: health >= 75 ? "Growth engine is strong" : health >= 45 ? "Momentum is building" : "Quick wins available",
    revenue,
    clicks: myClicks,
    avgPrice,
    topCategory: winningCategory ? winningCategory[0] : "General",
    actions: actions.slice(0, 4),
    campaignCopy,
    scoreLabel: `${health}/100`,
  };
}

export function buildSellerPrompt({ marketer, products = [], sales = [] }) {
  const insights = buildSellerAIInsights({ marketer, products, sales });
  return [
    "You are Likelink AI Studio, the creator growth assistant.",
    `Store: ${marketer?.name || "Your brand"}`,
    `Products: ${products.length}`,
    `Revenue: ${insights.revenue.toFixed(0)} ₪`,
    `Clicks: ${insights.clicks}`,
    `Best vertical: ${insights.topCategory}`,
    "Recommended next move: create a campaign around your top category and refresh product titles with stronger hooks.",
  ].join("\n");
}
