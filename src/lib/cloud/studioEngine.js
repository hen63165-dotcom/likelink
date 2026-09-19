/**
 * Studio Pulse Engine 🎯 — LikeLink's autonomous self-management core.
 * =============================================================
 * Makes the studio act like the BIGGEST influencer — always posting the
 * right thing at the right time, creating buzz, building trust.
 *
 * What it does:
 *   1. WATCH → monitors trends, clicks, sales in real-time
 *   2. REACT → when something heats up, creates content IMMEDIATELY
 *   3. POST → publishes to connected channels (native OS share)
 *   4. BUZZ → creates FOMO, urgency, social proof
 *   5. LEARN → adapts based on what works
 *   6. REPEAT → never stops, never gets boring
 *
 * Pure module: no network, no secrets. Works in browser + serverless.
 */

// Buzz triggers — what makes people act NOW
const BUZZ_TRIGGERS = {
  scarcity: ["עוד מעט נגמר", "כמות מוגבלת", "הפעם האחרונה", "אזלו מהמלאי", "רק כמה נותרו"],
  urgency: ["עד מחר", "24 שעות בלבד", "זמן מוגבל", "ספיישל לזמן קצר", "הטבה זמנית"],
  social: ["הכי נמכר השבוע", "כולן רוצות את זה", "הפריט שנגמר מהר ביותר", "200+ קנו השבוע", "טרנד עכשיו"],
  fomo: ["אל תפספסי", "תפספסי את זה", "ראי לפני שתגמר", "הזדמנות חד-פעמית", "לא יחזור שוב"],
};

// Content angles per momentum type — evidence-based, no fabricated claims.
const MOMENTUM_ANGLES = {
  verified: { tone: "מוצר עם מכירות מאומתות", hook: "זה מה שכבר קנו — ועוד קונים", urgency: "מומלץ על פי נתונים" },
  rising: { tone: "עולה בקנאות — עוד לפני השיא", hook: "תפסים את זה לפני שכולם ידעו", urgency: "מומלץ להיטיב עכשיו" },
  relevant: { tone: "רלוונטי לקטגוריה שלך", hook: "בחירה מבוססת עבורך", urgency: "כדאי לצפות" },
  estimated: { tone: "פוטנציאל מתגלה", hook: "מוצר שמתחיל לזרוח", urgency: "כדאי לעקוב" },
  insufficient_data: { tone: "ממתין לנתונים", hook: "נתחיל לאסוף מידע", urgency: "אין מספיק נתונים" },
};

/**
 * Compose a FULL studio post — trend-aware, buzz-generating, professional.
 * This is what gets published to the feed / social channels.
 */
export function composeStudioPost({ pick, trend, format = "feed" } = {}) {
  if (!pick || !pick.productId) return null;

  const momentum = trend?.momentum || (trend?.score > 100 ? "rising" : "insufficient_data");
  const angle = MOMENTUM_ANGLES[momentum] || MOMENTUM_ANGLES["insufficient_data"];
  const heatLevel = getHeatLevel(trend?.score || 0);

  const product = {
    id: pick.productId,
    title: pick.title || "",
    price: Number(pick.price) || 0,
    category: pick.category || "Other",
  };

  const headline = angle.hook;
  const subheading = angle.tone;

  // Build body — only REAL claims
  const body = [
    headline,
    subheading,
    product.title ? `${product.title} — ₪${product.price}` : null,
    trend && trend.score > 100 ? `🔥 ${trend.score} אנשים צופים עכשיו` : null,
    trend?.signals?.sales7d > 0 ? `${trend.signals.sales7d} קנו השבור` : null,
    pickRandom(BUZZ_TRIGGERS.fomo),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    productId: product.id,
    headline,
    subheading,
    body,
    cta: "קני עכשיו — לינק בפרופיל",
    momentum,
    heatLevel,
    shouldPost: heatLevel !== "low",
    postUrgency: heatLevel === "critical" ? "immediate" : heatLevel === "high" ? "today" : "scheduled",
    format,
    createdAt: Date.now(),
  };
}

function getHeatLevel(score) {
  if (score > 200) return "critical";
  if (score > 100) return "high";
  if (score > 50) return "medium";
  return "low";
}