/**
 * LikeLink Discovery & Recommendation Layer 🔍
 * ===========================================
 * Buyer-facing "BEST OF THE BEST" foundation, built ONLY on first-party truth:
 * the real public catalog + real tracked clicks + real verified sales.
 *
 * It answers a natural-language (Hebrew) buyer need:
 *   "אני צריך נעליים טובות לריצה" / "מה הכי מומלץ עכשיו?"
 *
 * Pipeline: intent → normalize → candidates → verify → rank → explain →
 * purchase path. It NEVER invents reviews/popularity/scarcity/price — every
 * ranked result carries only what is known (or an honest "no signal").
 *
 * Pure module: no network, no secrets, no side effects. Reuses the scoring
 * from growth.js (priority ladder: verified revenue > sales > checkouts >
 * engagement > clicks) so discovery and the growth brain agree.
 */

import { productSignals, opportunityScore } from "./growth.js";
import { filterPublicCatalog, hasValidAttribution } from "./catalog.js";

// Category aliases (Hebrew) → canonical category keys (same as CATEGORY_KEYS).
const INTENT_KEYWORDS = {
  Fashion: ["בגד", "שמל", "נעל", "מעיל", "טופ", "מכנס", "אופנה", "סטייל", "לבוש", "אאוטפיט"],
  Beauty: ["טיפוח", "בישום", "לחות", "מסקרה", "סרום", "איפור", "לק", "שמפו", "יופי", "פנים"],
  Home: ["מנור", "ספה", "מזכר", "מפית", "הבית", "סיפור", "מרכ", "טפון", "מדף", "כיבוד"],
  Tech: ["נטלמ", "אוזני", "טלפון", "מחשב", "גנגט", "טוען", "מסך", "טק", "ציוד", "מצלמ"],
  Fitness: ["מכונת", "אימון", "ספורט", "ריץ", "האפש", "יוגה", "משקולות", "חידה", "ציוד ספורט"],
  Kids: ["טיל", "צריכה", "משה", "תינוק", "קטנים", "חפש", "גינאות", "שינה"],
  Accessories: ["תיק", "עגיל", "מזון", "שהד", "מברך", "שען", "ענק"],
  Other: [],
};

// A tiny normality map for common confusion — expands the query into the
// canonical keywords. This is NOT English-ML: it just fuses the user's words.
const NORMALIZE_ALIASES = {
  "נעלים": "נעל", "נעליים": "נעל", "נעל": "נעל",
  "מעילות": "מעיל", "מעילים": "מעיל",
  "עגולות": "עגול", "שהד": "שהד",
  "חפש": "חפש", "מחפש": "חפש",
};

function normalize(query) {
  const q = String(query || "").toLowerCase();
  if (!q.trim()) return "";
  // The DB stores Hebrew with diacritics sometimes; keep a light map for
  // common variants (not a real stemmer — never invents meaning).
  let out = q;
  for (const [k, v] of Object.entries(NORMALIZE_ALIASES)) {
    out = out.split(k).join(v);
  }
  return out.trim();
}

/** Extract candidate categories using only the keyword maps. */
function intentCategories(query) {
  const q = normalize(query);
  const hits = new Set();
  for (const [cat, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => q.includes(kw))) hits.add(cat);
  }
  return hits;
}

/** Filter public attributable products by category intent. */
export function matchCandidates(query, products = [], marketers = []) {
  const cats = intentCategories(query);
  const pool = marketers?.length
    ? filterPublicCatalog(products, marketers)
    : (Array.isArray(products) ? products : []).filter((p) => p && p.status === "approved" && p.marketerId);
  return pool.filter((p) => cats.size === 0 || cats.has(p.category));
}

/**
 * Best-of-Best ranking — evidence-first, no fake confidence.
 * @returns {Array<{product, signals, score, reasons, badges}>}
 */
export function rankCandidates(candidates, { sales = [], clicks = [], now = Date.now() } = {}) {
  const ranked = candidates.map((p) => {
    const signals = productSignals(p, { sales, clicks, now });
    const { score, reasons } = opportunityScore(signals);
    const badges = [];
    if (signals.verifiedSales > 0) badges.push(`✓ ${signals.verifiedSales} מכירות`);
    if (signals.conversionRate > 1 && signals.clicks30 >= 5) badges.push(`${signals.conversionRate}% המרה`);
    if (signals.clicks30 > 0) badges.push(`${signals.clicks30} קליקים`);
    if (signals.clicksAll + signals.verifiedSales === 0) badges.push("חדש — ללא נתונים");
    return { product: p, signals, score, reasons, badges };
  });
  return ranked.sort((a, b) => b.score - a.score || (b.signals.revenue || 0) - (a.signals.revenue || 0));
}

/** Momentum: clicks last 7d vs prior 7d → emerging signal (first-party only). */
export function momentumSignal(productId, clicks = [], now = Date.now()) {
  const mine = clicks.filter((c) => c && String(c.productId) === String(productId));
  const wk = now - 7 * 86400000, wk2 = now - 14 * 86400000;
  const recent = mine.filter((c) => Number(c.ts || 0) >= wk).length;
  const prior = mine.filter((c) => Number(c.ts || 0) >= wk2 && Number(c.ts || 0) < wk).length;
  if (recent + prior === 0) return { measure: null, emerging: false, note: "אין נתונים" };
  const ratio = prior === 0 ? (recent > 0 ? 2 : 0) : recent / prior;
  return { measure: recent - prior, emerging: ratio >= 1.5 && recent >= 2, prior, recent, ratio };
}

/** Final buyer-facing recommendation (the "best among the best"). */
export function buildRecommendation(query, { products = [], marketers = [], sales = [], clicks = [], now = Date.now() } = {}) {
  const publicProducts = filterPublicCatalog(products, marketers);
  const cands = matchCandidates(query, publicProducts, marketers);
  const decisionId = `dec_${now}_${Math.random().toString(36).slice(2, 8)}`;
  if (!cands.length) {
    return {
      hasResult: false,
      decisionId,
      intent: { query: normalize(query), categories: [] },
      message: "לא נמצאו מוצרים מתאימים עדיין — נסו מונח אחר.",
      decision: {
        reason: "no_candidates",
        candidatesConsidered: 0,
        rejected: (Array.isArray(products) ? products : []).length,
        quarantined: (Array.isArray(products) ? products : []).length - publicProducts.length,
      },
    };
  }
  const ranked = rankCandidates(cands, { sales, clicks, now });
  // Momentum badge on the top candidate only when a real signal exists.
  const top = ranked[0];
  if (!hasValidAttribution(top.product, marketers)) {
    return {
      hasResult: false,
      decisionId,
      intent: { query: normalize(query), categories: [] },
      message: "לא נמצאו מוצרים עם בעלות מאומתת.",
      decision: { reason: "attribution_fail_closed", candidatesConsidered: cands.length },
    };
  }
  const mom = momentumSignal(top.product.id, clicks, now);
  const rejected = (Array.isArray(products) ? products : []).length - cands.length;
  const owner = (Array.isArray(marketers) ? marketers : []).find((m) => m && m.id === top.product.marketerId);
  const ownerPath = owner?.slug || top.product.marketerId;
  return {
    hasResult: true,
    decisionId,
    intent: { query: query, categories: [...cands.reduce((s, p) => s.add(p.category), new Set())] },
    top: {
      productId: top.product.id,
      title: top.product.title,
      price: top.product.price,
      image: top.product.image || null,
      category: top.product.category,
      marketerId: top.product.marketerId,
      score: top.score,
      reasons: top.reasons,
      badges: top.badges,
      trend: mom,
      purchasePath: {
        type: "owned_web",
        url: `/u/${encodeURIComponent(ownerPath)}?product=${encodeURIComponent(top.product.id)}`,
      },
    },
    alternatives: ranked.slice(1, 4).map((r) => ({
      productId: r.product.id, title: r.product.title, price: r.product.price, score: r.score,
    })),
    decision: {
      reason: "evidence_based_ranking",
      candidatesConsidered: cands.length,
      rejected,
      rankingPolicy: "revenue>sales>engagement>clicks, with fatigue+freshness",
      winnerScore: top.score,
      winnerSignals: {
        verifiedSales: top.signals.verifiedSales,
        revenue: top.signals.revenue,
        clicks30: top.signals.clicks30,
        conversionRate: top.signals.conversionRate,
      },
    },
  };
}