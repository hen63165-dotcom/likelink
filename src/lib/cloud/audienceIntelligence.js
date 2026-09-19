/**
 * LikeLink2 Audience Intelligence 🧠
 * ====================================
 * Uses real first-party performance signals from LikeLink2:
 *   impressions/views, clicks, CTR, saves/shares, product engagement,
 *   conversions/sales, platform, language, geography, creative type,
 *   hook, CTA.
 *
 * Learns which audiences and creative patterns perform better.
 * Never infers sensitive personal attributes.
 * Never fabricates demographics.
 */

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeAudienceSignals({ events = [], products = [], marketers = [] } = {}) {
  const byProduct = {};
  const byPlatform = {};
  const byLanguage = {};
  const byHook = {};
  const byCta = {};
  const byCreativeType = {};
  const byGeography = {};

  for (const ev of events) {
    if (!ev || !ev.productId) continue;
    const pid = ev.productId;
    byProduct[pid] = byProduct[pid] || { views: 0, clicks: 0, conversions: 0, revenue: 0 };
    if (ev.type === "view") byProduct[pid].views += 1;
    else if (ev.type === "click") byProduct[pid].clicks += 1;
    else if (ev.type === "conversion") {
      byProduct[pid].conversions += 1;
      byProduct[pid].revenue += safeNum(ev.amount);
    }

    const platform = ev.platform || "web";
    byPlatform[platform] = byPlatform[platform] || { views: 0, clicks: 0, conversions: 0 };
    if (ev.type === "view") byPlatform[platform].views += 1;
    else if (ev.type === "click") byPlatform[platform].clicks += 1;
    else if (ev.type === "conversion") byPlatform[platform].conversions += 1;

    const lang = ev.language || "unknown";
    byLanguage[lang] = byLanguage[lang] || { views: 0, clicks: 0, conversions: 0 };
    if (ev.type === "view") byLanguage[lang].views += 1;
    else if (ev.type === "click") byLanguage[lang].clicks += 1;
    else if (ev.type === "conversion") byLanguage[lang].conversions += 1;

    if (ev.hook) {
      byHook[ev.hook] = byHook[ev.hook] || { views: 0, clicks: 0, conversions: 0 };
      if (ev.type === "view") byHook[ev.hook].views += 1;
      else if (ev.type === "click") byHook[ev.hook].clicks += 1;
      else if (ev.type === "conversion") byHook[ev.hook].conversions += 1;
    }

    if (ev.cta) {
      byCta[ev.cta] = byCta[ev.cta] || { views: 0, clicks: 0, conversions: 0 };
      if (ev.type === "view") byCta[ev.cta].views += 1;
      else if (ev.type === "click") byCta[ev.cta].clicks += 1;
      else if (ev.type === "conversion") byCta[ev.cta].conversions += 1;
    }

    const creativeType = ev.creativeType || "unknown";
    byCreativeType[creativeType] = byCreativeType[creativeType] || { views: 0, clicks: 0, conversions: 0 };
    if (ev.type === "view") byCreativeType[creativeType].views += 1;
    else if (ev.type === "click") byCreativeType[creativeType].clicks += 1;
    else if (ev.type === "conversion") byCreativeType[creativeType].conversions += 1;

    const geo = ev.geography || "unknown";
    byGeography[geo] = byGeography[geo] || { views: 0, clicks: 0, conversions: 0 };
    if (ev.type === "view") byGeography[geo].views += 1;
    else if (ev.type === "click") byGeography[geo].clicks += 1;
    else if (ev.type === "conversion") byGeography[geo].conversions += 1;
  }

  function enrich(map) {
    return Object.entries(map).map(([key, data]) => {
      const ctr = data.views > 0 ? (data.clicks / data.views) * 100 : 0;
      const cvr = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
      return { key, ...data, ctr: Math.round(ctr * 100) / 100, cvr: Math.round(cvr * 100) / 100 };
    });
  }

  return {
    byProduct: enrich(byProduct),
    byPlatform: enrich(byPlatform),
    byLanguage: enrich(byLanguage),
    byHook: enrich(byHook),
    byCta: enrich(byCta),
    byCreativeType: enrich(byCreativeType),
    byGeography: enrich(byGeography),
  };
}

export function getTopPerformers(signals, dimension = "byProduct", metric = "conversions", limit = 5) {
  const dim = signals[dimension] || [];
  return dim
    .slice()
    .sort((a, b) => (safeNum(b[metric]) - safeNum(a[metric])))
    .slice(0, limit);
}

export function getWinningPatterns(signals) {
  const topHooks = getTopPerformers(signals, "byHook", "conversions", 5);
  const topCtas = getTopPerformers(signals, "byCta", "conversions", 5);
  const topFormats = getTopPerformers(signals, "byCreativeType", "conversions", 5);
  const topChannels = getTopPerformers(signals, "byPlatform", "conversions", 5);
  const topGeos = getTopPerformers(signals, "byGeography", "conversions", 5);
  return {
    hooks: topHooks,
    ctas: topCtas,
    formats: topFormats,
    channels: topChannels,
    geographies: topGeos,
  };
}

export function audienceInsightSummary(signals, lang = "he") {
  const patterns = getWinningPatterns(signals);
  const topChannel = patterns.channels[0];
  const topFormat = patterns.formats[0];
  const topHook = patterns.hooks[0];
  const parts = [];
  if (topChannel) parts.push(lang === "he" ? `ערוץ מוביל: ${topChannel.key}` : `Top channel: ${topChannel.key}`);
  if (topFormat) parts.push(lang === "he" ? `פורמט מוביל: ${topFormat.key}` : `Top format: ${topFormat.key}`);
  if (topHook) parts.push(lang === "he" ? `הוק מוביל: ${topHook.key}` : `Top hook: ${topHook.key}`);
  return parts.join(" · ") || (lang === "he" ? "אין מספיק נתונים" : "Insufficient data");
}
