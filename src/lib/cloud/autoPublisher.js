/**
 * Auto Publisher 📱 — The studio that publishes itself like the BIGGEST influencer.
 * =============================================================
 * Every day, the studio:
 *   1. Scans what's hot (trendScanner)
 *   2. Picks the best products for TODAY
 *   3. Creates influencer-style posts (story, reel, tiktok, post)
 *   4. Updates the site homepage with fresh content
 *   5. Generates shareable links for every channel
 *
 * Result: visitors see a LIVE site that changes daily, posted by a "top influencer".
 */

import { getCurrentTrendContext, generateDailyTrendReport } from "./trendScanner";
import { composeLunaFaceForAssistant } from "../ambassador";

// Influencer posting schedule — when to post what
const POSTING_SCHEDULE = {
  morning: { time: "09:00", type: "story", tone: "התחלת יום מושלמת" },
  midday: { time: "13:00", type: "post", tone: "הפסקת צהריים מרעננת" },
  afternoon: { time: "17:00", type: "reel", tone: "אחר הצהריים שלי" },
  evening: { time: "21:00", type: "tiktok", tone: "ערב מדהים" },
};

// Content templates — what the "influencer" says
const INFLUENCER_TEMPLATES = {
  discovery: [
    "מצאתי משהו מדהים שחייב לראות",
    "זה מה שכולן שואלות עליו היום",
    "פתחתי לי עכשיו ואני חייבתם לכן",
    "הפריט שכולן רוצות ולא כולן מוצאות",
  ],
  urgency: [
    "עוד מעט נגמר תפסימו עכשיו",
    "רק כמה יחידות נותרו",
    "מחיר מיוחד לזמן מוגבל",
    "הפעם האחרונה שאני מפרסמת את זה",
  ],
  social: [
    "הפריט הכי נמכר השבור",
    "כולן שואלות איפה קניתי",
    "המוצר שנגמר מהר ביותר",
    "200 אנשים ראו את זה היום",
  ],
    fomo: [
    "אל תפספסי את זה",
    "תפספסי ותתאכזבי",
    "ראי לפני שתגמר",
    "הזדמנות חד-פעמית",
  ],
};

/**
 * Generate a complete daily post — influencer-style, trend-aware.
 */
export function generateDailyPost(products, options = {}) {
  const now = options.now || new Date();
  const trendReport = generateDailyTrendReport(products, now);
  const topPick = trendReport.topPicks[0];

  if (!topPick) return null;

  const context = trendReport.context;
  const product = topPick.product;

  return {
    id: `post_${now.getTime()}`,
    date: now.toISOString().slice(0, 10),
    timeOfDay: context.timeOfDay,
    type: POSTING_SCHEDULE[context.timeOfDay]?.type || "post",
    tone: POSTING_SCHEDULE[context.timeOfDay]?.tone || "",
    headline: pickRandom(INFLUENCER_TEMPLATES.discovery),
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      url: `/p/${product.id}`,
    },
    lunaFace: composeLunaFaceForAssistant(product),
    urgency: context.urgency,
    trendReasons: topPick.reasons,
    hotCategory: trendReport.hotCategory,
    formats: {
      story: generateStoryFormat(product, context),
      reel: generateReelFormat(product, context),
      tiktok: generateTikTokFormat(product, context),
      post: generatePostFormat(product, context),
    },
    seo: {
      title: `${product.title} — ${product.price}₪ | לייקלין`,
      description: `${product.title} ב-${product.price}₪. ${context.urgency}. משלוח מהיר.`,
      image: product.image,
    },
    cta: "קני עכשיו",
    shareText: `${pickRandom(INFLUENCER_TEMPLATES.discovery)}\n${product.title} — ₪${product.price}\n${context.urgency}`,
    createdAt: now.toISOString(),
  };
}

function generateStoryFormat(product, context) {
  return {
    frames: [
      { type: "hook", text: pickRandom(INFLUENCER_TEMPLATES.discovery), duration: 3 },
      { type: "product", text: product.title, duration: 4 },
      { type: "price", text: `₪${product.price}`, duration: 3 },
      { type: "cta", text: context.urgency, duration: 3 },
      { type: "swipe", text: "קני עכשיו", duration: 2 },
    ],
    cta: "Swipe up to shop",
  };
}

function generateReelFormat(product, context) {
  return {
    hook: pickRandom(INFLUENCER_TEMPLATES.discovery),
    script: [
      { time: "0-3s", text: pickRandom(INFLUENCER_TEMPLATES.discovery) },
      { time: "3-10s", text: `${product.title} בדקתי וזה עובד` },
      { time: "10-25s", text: `המחיר? רק ₪${product.price}` },
      { time: "25-30s", text: context.urgency },
    ],
    cta: "Link in bio",
  };
}

function generateTikTokFormat(product, context) {
  return {
    hook: pickRandom(INFLUENCER_TEMPLATES.discovery),
    script: [
      { time: "0-2s", text: pickRandom(INFLUENCER_TEMPLATES.discovery) },
      { time: "2-10s", text: product.title },
      { time: "10-25s", text: `₪${product.price} ${context.urgency}` },
    ],
    cta: "Follow + link in bio",
  };
}

function generatePostFormat(product, context) {
  return {
    slides: [
      { slide: 1, text: pickRandom(INFLUENCER_TEMPLATES.discovery), visual: "product_hero" },
      { slide: 2, text: `${product.title} בדקתי בעצמי`, visual: "demo" },
      { slide: 3, text: `₪${product.price} ${context.urgency}`, visual: "price" },
      { slide: 4, text: "קני עכשיו לינק בביו", visual: "cta" },
    ],
    caption: `${pickRandom(INFLUENCER_TEMPLATES.discovery)}\n\n${product.title} ₪${product.price}\n\n${context.urgency}\n\n${pickRandom(INFLUENCER_TEMPLATES.fomo)}\n\nלינק בביו לפרטים`,
    hashtags: generateHashtags(product),
    cta: "Link in bio to shop",
  };
}

function generateHashtags(product) {
  const base = ["לייקלין", "קניות", "אונליין", "מומלץ", "ישראל"];
  const tags = (product.tags || []).slice(0, 3).map((t) => `#${t}`);
  return [...tags, ...base].slice(0, 10);
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}