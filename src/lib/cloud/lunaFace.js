// LikeLink — Luna Face 🎀 (pure client composition, no I/O, no secrets)
// ======================================================================
// Turns the EXISTING cloud machinery (Growth-Brain pick + category-exact
// hooks + real product data) into a PERSON: "Luna — the face of LikeLink's
// main studio." Every sentence is generated from REAL data, never invented:
//   • headline  — Luna's category-exact hook for the pick product
//   • reasoning — the REAL reasons the ranking engine gave for the pick
//   • callout   — honest data note (what is measured / not yet measured)
// Reuses lunaHookForProduct + the discover decision. No LLM, no API, no cost.

import { lunaHookForProduct } from "../ambassador.js";

// Short human "story" per reason key (generic, honest — no fake claims).
const REASON_LABELS = {
  verified_sales: "עם מכירות מאומתות מהענן",
  conversions: "קליקים שהופכים לקניות",
  clicks: "הכי הרבה קליקים מדודים",
  fresh: "חדש בקטלוג — שווה צפייה",
  engagement: "הכי הרבה מעורבות",
  momentum: "המומנטום הכי חם עכשיו",
  value: "יחס מחיר־תועלת הכי טוב",
  quality: "המדרג הכי גבוה",
  default: "הבחירה המובילה לפי מדרג הענן",
};

export function reasonLabel(key) {
  if (!key) return REASON_LABELS.default;
  const k = String(key).toLowerCase();
  return REASON_LABELS[k] || REASON_LABELS.default;
}

/** Pick the pick's category-label for the badge (mirror catalog.CATEGORIES). */
const CATEGORY_HE = {
  Fashion: "אופנה",
  Beauty: "יופי וטיפוח",
  Home: "בית ומטבח",
  Tech: "טכנולוגיה",
  Fitness: "ספורט וכושר",
  Kids: "ילדים",
  Accessories: "אקססוריז",
  Pets: "חיות מחמד",
  Gifts: "מתנות",
  Travel: "נסיעות",
  Other: "בחירת הענן",
};

const catHe = (c) => CATEGORY_HE[c] || CATEGORY_HE.Other;

/** Caps text to a given Hebrew-safe length. */
function cap(s, n) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trim() + "…";
}

/**
 * Compose Luna's "face" for the home experience.
 * @param {object} pick — the live discover result (or null)
 * @param {object|null} [trend] — optional live trend data { hottest, activeProducts }
 *   so Luna can say "this is exactly what's heating up right now".
 * @returns {object} — { ok, headline, reasoning, badge, note, followUp, product, trending }
 */
export function composeLunaFace(pick, trend) {
  if (!pick || !pick.productId) {
    return {
      ok: false,
      headline: "לונה עדיין בוחרת את הבחירה של היום ✨",
      reasoning: "כשיהיו מוצרים מאושרים עם נתונים — לונה תספר לך למה.",
      badge: "הסטודיו הראשי",
      note: "ממתין לנתונים אמיתיים בשביל המלצה",
      followUp: null,
      trending: null,
    };
  }
  const product = {
    id: pick.productId,
    title: pick.title || "",
    price: Number(pick.price) || 0,
    category: pick.category || "Other",
  };
  const headline = lunaHookForProduct(product);
  const reasons = Array.isArray(pick.reasons) && pick.reasons.length
    ? pick.reasons.slice(0, 2).map((r) => (typeof r === "string" ? r : reasonLabel(r?.key)))
    : [];
  const baseReasoning = reasons.length ? cap(reasons.join(" · "), 90) : reasonLabel("default");

  // Trend-aware: if the pick is ALSO the hottest trend right now, Luna calls it out.
  let trending = null;
  let trendingBadge = null;
  if (trend && Array.isArray(trend.hottest)) {
    const match = trend.hottest.find((t) => t?.product?.id === product.id);
    if (match && match.score > 50) {
      trending = match;
      trendingBadge = `🔥 ${momentEmoji(match.momentum)}`;
    }
  }

  const badge = trendingBadge || (catHe(pick.category) || "בחירת הענן");
  const followUp = product.title ? cap(`הבחירה שלי היום — ${product.title}`, 70) : null;

  const note = trending
    ? `🔥 ${momentWord(trending.momentum, "he")} בענף ${catHe(product.category)} · מהענן · נתונים אמיתיים בלבד`
    : "מהענן · מבוסס על נתונים אמיתיים בלבד";

  return {
    ok: true,
    headline,
    reasoning: baseReasoning,
    badge,
    note,
    followUp,
    product,
    trending,
  };
}

/** Short momentum emoji for labels. */
function momentEmoji(m) {
  if (!m) return "🔥";
  return {
    "🔥 viral": "🔥",
    "📈 hot": "📈",
    "↗️ rising": "↗️",
    "→ steady": "→",
    "❄️ cold": "❄️",
  }[m] || "🔥";
}
function momentWord(m, lang = "he") {
  const map = {
    "🔥 viral": lang === "he" ? "ויוראלי" : "Viral",
    "📈 hot": lang === "he" ? "חם" : "Hot",
    "↗️ rising": lang === "he" ? "עולה" : "Rising",
    "→ steady": lang === "he" ? "יציב" : "Steady",
    "❄️ cold": lang === "he" ? "קרחום" : "Cold",
  };
  return map[m] || (lang === "he" ? "חם" : "Hot");
}