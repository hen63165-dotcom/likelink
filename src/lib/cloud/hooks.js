/**
 * LikeLink Hook Engine 🎣 (Hebrew content → tracked traffic)
 * =========================================================
 * Generates SHORT, sharp, honest Hebrew hook variations per product.
 *
 * Rules (§47–§50):
 *   • Curiosity / problem recognition / benefit / emotion — never fabricated
 *     facts. Hooks use ONLY fields that exist on the product record
 *     (title, price, category). No invented claims, no fake urgency,
 *     no unproven promises.
 *   • Every variation pairs with a LikeLink TRACKED link (utm params, same
 *     scheme as AutoPilot's trackLink) so Content → click → Product →
 *     Checkout keeps its attribution.
 *   • Deterministic by product id + variation index — the same product always
 *     yields the same hook set (stable for A/B measurement later).
 *
 * Reuses the existing Luna voice (src/lib/ambassador.js) as variation #1.
 */

import { lunaHook, AMBASSADOR } from "../ambassador.js";

// Angle bank — each angle is a TEMPLATE using only safe product fields.
const ANGLES = [
  {
    id: "curiosity",
    build: (p) => `רגע — יש סיבה ש"${p.title}" מקבל תשומת לב. שווה להציץ לפני שממשיכים 👀`,
  },
  {
    id: "problem",
    build: (p) => `אם גם אתם מחפשים פתרון פשוט בנושא ${p.category || "הזה"} — "${p.title}" עשוי לחסוך לכם הרבה זמן.`,
  },
  {
    id: "benefit",
    build: (p) => `מצאנו את "${p.title}" — קצר, ברור, ובלי סיפורים. כל הפרטים בלינק.`,
  },
  {
    id: "emotion",
    build: (p) => `יש מוצרים שפשוט כיף להמליץ עליהם. "${p.title}" הוא אחד מהם ✨`,
  },
  {
    id: "social",
    build: (p) => `"${p.title}" — אחד הפריטים שאנשים שואלים עליהם שוב ושוב. הנה הלינק הישר למוצר.`,
  },
];

/**
 * Generate hook variations for a product.
 * @param {object} product — { id, title, price?, category? } (existing record)
 * @param {object} opts — { count, storeUrl }
 * @returns {Array<{ id, angle, text, link }>} — deterministic, tracked
 */
export function generateHookVariations(product, { count = 3, storeUrl = null } = {}) {
  if (!product?.id || !product?.title) return [];
  const variations = [
    {
      id: "luna",
      angle: "luna",
      text: `${lunaHook(product.id)}\n${product.title}${Number(product.price) > 0 ? ` · ₪${product.price}` : ""}\n${buildTrackedLink(product, { storeUrl, channel: "luna" })}`,
      link: buildTrackedLink(product, { storeUrl, channel: "luna" }),
      voice: AMBASSADOR.nameEn,
    },
  ];
  for (let i = 0; i < ANGLES.length && variations.length < 1 + count; i++) {
    const angle = ANGLES[(hash(product.id) + i) % ANGLES.length];
    const link = buildTrackedLink(product, { storeUrl, channel: angle.id });
    variations.push({
      id: `${angle.id}_${i}`,
      angle: angle.id,
      text: `${angle.build(product)}\n${link}`,
      link,
    });
  }
  return variations;
}

/** Deterministic hash (same scheme as ambassador.lunaHook). */
function hash(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Build a LikeLink TRACKED link for content — same UTM scheme as AutoPilot,
 * so every click keeps its attribution through the existing /r forwarder.
 * Never points content at an external page (no attribution loss).
 */
export function buildTrackedLink(product, { storeUrl = null, channel = "content" } = {}) {
  const base = String(storeUrl || "").trim() || (typeof window !== "undefined" ? `${window.location.origin}/u/${product?.id || ""}` : "");
  try {
    const u = new URL(base);
    u.searchParams.set("utm_source", "likelink_content");
    u.searchParams.set("utm_medium", channel);
    u.searchParams.set("utm_campaign", String(product?.id || "").slice(0, 60));
    return u.href;
  } catch {
    return base;
  }
}

/**
 * Hook optimization (§50) — RECOMMENDATION ONLY, from measured data.
 * Compares hook angles by clicks (the only stage measured today) and reports
 * honestly: null when there is not enough data. The AI never invents success.
 *
 * @param {Array} clicks — verified click records (may carry utm_campaign + utm_medium)
 * @param {Array} products — products (for titles)
 * @returns {{ recommendation: string|null, measured: boolean, byAngle: Array }}
 */
export function recommendHookAngles(clicks, products = []) {
  const byAngle = {};
  for (const c of Array.isArray(clicks) ? clicks : []) {
    const source = String(c?.src || "");
    if (!source.startsWith("likelink_content")) continue; // only content-engine clicks
    const angle = String(c?.med || "unknown"); // utm_medium carries the hook angle
    byAngle[angle] = (byAngle[angle] || 0) + 1;
  }
  const rows = Object.entries(byAngle)
    .map(([angle, count]) => ({ angle, clicks: count }))
    .sort((a, b) => b.clicks - a.clicks);
  // Minimum sample for an honest recommendation — below this: no conclusion.
  const MIN_SAMPLE = 30;
  const total = rows.reduce((s, r) => s + r.clicks, 0);
  if (rows.length < 2 || total < MIN_SAMPLE) {
    return { recommendation: null, measured: false, byAngle: rows, minSample: MIN_SAMPLE };
  }
  const top = rows[0];
  const runnerUp = rows[1];
  if (top.clicks > runnerUp.clicks * 1.5) {
    return {
      recommendation: `הזווית "${top.angle}" מייצרת יותר קליקים (${top.clicks} מול ${runnerUp.clicks}).`,
      measured: true,
      byAngle: rows,
    };
  }
  return { recommendation: null, measured: true, byAngle: rows, note: "אין הבדל מובהק בין הזוויות עדיין." };
}
