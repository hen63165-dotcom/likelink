/**
 * Adaptive Growth Brain 🧠 — LikeLink Continuous Growth OS.
 * ========================================================
 * ONE server-side orchestration layer that, every cycle, discovers real
 * opportunity from first-party data and decides what to promote NEXT.
 *
 *   DISCOVER → SCORE → DECIDE → BUILD (via campaign.js) → PREPARE
 *   → MEASURE → LEARN → ADAPT → REPEAT
 *
 * Design rules (hard):
 *   • Evidence over repetition — every day the best OPPORTUNITY wins, never
 *     "same product as yesterday".
 *   • Priority ladder: VERIFIED REVENUE > SALES > CHECKOUTS > ENGAGEMENT >
 *     CLICKS > REACH. Vanity (impressions/clicks) alone must DECAY a score.
 *   • Fatigue mechanism: repeated promotions of the same product without
 *     improving results LOSE priority. Novelty can never override evidence.
 *   • Deterministic + explainable: every decision carries score + reasons.
 *   • Safe fallback: when no first-party signal exists → controlled
 *     deterministic rotation (bootstrap), never randomness that fabricates.
 *   • No network, no secrets, no side effects — pure and testable.
 *   • Publication remains in the existing AutoPilot gateway: this module
 *     only DECIDES and PREPARES. Never fakes a publication.
 */

// Score weights — priority ladder, first-party only.
const W = {
  REVENUE_PER_SALE: 0,      // reserve (revenue added directly as money)
  VERIFIED_SALE: 3,         // each verified sale
  CONVERSION_BONUS: 2,      // clicks → verified sale ratio quality
  CLICK: 0.5,               // a real tracked click
  FRESHNESS_DAYS: 0.01,     // newness bonus per day (up to 30 days old)
  FATIGUE_STRIKE: -2,       // per repeated promotion with no improvement
  MIN_SIGNALS_CLICKS: 5,    // below this, engagement inputs are ignored
};

/** Aggregated first-party signals for ONE product (verified + useful only). */
export function productSignals(product, { sales = [], clicks = [], campaigns = [], now = Date.now() } = {}) {
  const pid = String(product?.id);
  const mySales = (Array.isArray(sales) ? sales : []).filter((s) => s && String(s.productId) === pid);
  const myClicks = (Array.isArray(clicks) ? clicks : []).filter((c) => c && String(c.productId) === pid);
  const promos = (Array.isArray(campaigns) ? campaigns : [])
    .filter((c) => c && (String(c.productId) === pid || String(c?.product?.id) === pid));

  const revenue = mySales.reduce((s, x) => s + (Number(x.saleAmount) || 0), 0);
  const verifiedSales = mySales.length;
  const clicks30 = myClicks.filter((c) => now - Number(c.ts || 0) <= 30 * 86400000).length;
  const clicksAll = myClicks.length;
  const lastTs = myClicks.reduce((m, c) => (Number(c.ts) > m ? Number(c.ts) : m), 0) || null;
  const lastPromoAt = promos.reduce((m, c) => Math.max(m, new Date(c?.createdAt || 0).getTime() || 0), 0);
  const promoCount = promos.length;

  return {
    productId: pid,
    product,
    revenue: Math.round(revenue * 100) / 100,
    verifiedSales,
    checkouts: null,
    clicks30,
    clicksAll,
    conversionRate: clicks30 > 0 ? Math.round((verifiedSales / clicks30) * 10000) / 100 : 0,
    hasSignals: clicksAll > 0 || verifiedSales > 0,
    promoCount,
    lastPromoAt: lastPromoAt ? new Date(lastPromoAt).toISOString() : null,
    ageDays: product?.createdAt ? Math.max(0, (now - new Date(product.createdAt).getTime()) / 86400000) : null,
    lastActivityAt: lastTs ? new Date(lastTs).toISOString() : null,
  };
}

/** Opportunity score — revenue/sales take precedence; clicks alone decay. */
export function opportunityScore(signals) {
  const s = signals || {};
  let raw = 0;
  const reasons = [];

  // VIP: verified revenue + sales (the only real money truth available).
  raw += s.revenue + s.verifiedSales * W.VERIFIED_SALE;
  if (s.verifiedSales > 0) reasons.push(`${s.verifiedSales} מכירות מאומתות │ ₪${(s.revenue || 0).toFixed(2)}`);

  // Conversion quality — only with enough real clicks (anti one-click-learning).
  if ((s.clicks30 || 0) > 0) {
    if ((s.clicks30 || 0) >= W.MIN_SIGNALS_CLICKS && (s.conversionRate || 0) > 1) {
      raw += (s.conversionRate || 0) * W.CONVERSION_BONUS;
      reasons.push(`המרה ${s.conversionRate}% מ-${s.clicks30} קליקים`);
    } else {
      // Clicks without conversion — honest decay: not a fantasy winner.
      raw += (s.clicks30 || 0) * W.CLICK * 0.15;
      reasons.push(`תנועה ללא המרה (${s.clicks30} קליקים)`);
    }
  }

  // Freshness (new product = small truthful discoverability bias).
  if (s.ageDays != null && s.ageDays < 30) {
    raw += (30 - s.ageDays) * W.FRESHNESS_DAYS;
    if (s.ageDays < 7) reasons.push("מוצר חדש");
  }

  // Fatigue: repeated promos without ANY improvement lose priority.
  if (s.promoCount > 0 && (s.clicksAll + s.verifiedSales) === 0) {
    raw += s.promoCount * W.FATIGUE_STRIKE;
    reasons.push(`עייף — ${s.promoCount} קידומים ללא תוצאה`);
  }

  return {
    score: Math.round(raw * 100) / 100,
    reasons,
    hasEnoughSignals: (s.clicks30 || 0) >= W.MIN_SIGNALS_CLICKS || (s.verifiedSales || 0) > 0,
  };
}

/** Rank all approved+attributed products by opportunity score — the SELECT step. */
export function rankOpportunities(approved, { sales = [], clicks = [], campaigns = [], marketers, now = Date.now() } = {}) {
  const hasDirectory = Array.isArray(marketers);
  const marketerIds = new Set((marketers || []).map((m) => m && m.id).filter(Boolean));
  return (Array.isArray(approved) ? approved : [])
    .filter((p) => p && p.status === "approved")
    // Fail-closed: require marketerId; when a marketer directory is supplied,
    // it must resolve. Empty directory ⇒ nothing is publicly promotable.
    .filter((p) => {
      if (!p.marketerId) return false;
      if (!hasDirectory) return true;
      return marketerIds.has(p.marketerId);
    })
    .map((p) => {
      const signals = productSignals(p, { sales, clicks, campaigns, now });
      const { score, reasons, hasEnoughSignals } = opportunityScore(signals);
      return { product: p, signals, score, reasons, hasSignal: signals.hasSignals || hasEnoughSignals };
    })
    .sort((a, b) => b.score - a.score || (b.signals.revenue || 0) - (a.signals.revenue || 0));
}

/**
 * THE decision — what should LikeLink promote RIGHT NOW?
 * Explainable, evidence-first, with safe bootstrap when no data exists.
 * Destination always uses creator slug when available (never fabricates owner).
 */
export function selectOpportunity({ approved, sales = [], clicks = [], campaigns = [], channelStates = [], marketers = [], now = Date.now() } = {}) {
  const list = rankOpportunities(approved, { sales, clicks, campaigns, marketers, now });

  if (!list.length) return { selected: null, reasons: ["אין מוצרים מאושרים עם בעלות מאומתת"], mode: "NONE" };

  const totalActivity = (Array.isArray(sales) ? sales : []).length + (Array.isArray(clicks) ? clicks : []).length;
  const authorized = (Array.isArray(channelStates) ? channelStates : []).some((c) => c?.authorized);
  const ownerPath = (product) => {
    const m = (Array.isArray(marketers) ? marketers : []).find((x) => x && x.id === product?.marketerId);
    return m?.slug || product?.marketerId || product?.id;
  };

  if (totalActivity === 0) {
    // Bootstrap — controlled deterministic rotation, NOT random, NOT fake.
    const idx = Math.floor(now / 86400000) % list.length;
    const pick = list[idx];
    return {
      mode: "BOOTSTRAP",
      selected: pick.product,
      productId: pick.product.id,
      score: pick.score,
      reasons: ["אין עדיין נתונים ראשוניים — בחירה דטרמיניסטית מאוזנת (bootstrap)."],
      breakdown: { signals: pick.signals },
      candidates: list.slice(0, 3).map((x) => ({ productId: x.product.id, title: x.product.title, score: x.score })),
      rejected: list.filter((x, i) => i !== idx).slice(0, 3).map((x) => ({ productId: x.product.id, title: x.product.title, score: x.score })),
      destination: { type: "owned_web", landingPath: `/u/${ownerPath(pick.product)}` },
      authorization: { closestAuthorized: "NONE", distributionBlocked: true },
    };
  }

  const top = list[0];
  return {
    mode: "EVIDENCE",
    selected: top.product,
    productId: top.product.id,
    score: top.score,
    reasons: top.reasons,
    signals: top.signals,
    candidates: list.slice(0, 3).map((x) => ({ productId: x.product.id, title: x.product.title, score: x.score, reasons: x.reasons.slice(0, 2) })),
    rejected: list.slice(1, 4).map((x) => ({ productId: x.product.id, title: x.product.title, score: x.score, reasons: x.reasons.slice(0, 2) })),
    at: new Date(now).toISOString(),
    destination: { type: "owned_web_page", landingPath: `/u/${ownerPath(top.product)}` },
    authorization: { closestAuthorized: authorized ? "has" : "none", distributionBlocked: !authorized },
    nextAction: top.reasons.length ? top.reasons[0] : "אין עדיין די נתונים — בדיקה מבוקרת.",
  };
}