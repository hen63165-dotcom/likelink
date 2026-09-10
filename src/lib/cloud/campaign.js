/**
 * LikeLink Autonomous Campaign Engine 🎯 (Hebrew-first, deterministic)
 * ====================================================================
 * A THIN orchestration layer on top of the EXISTING systems:
 *   • hooks      → src/lib/cloud/hooks.js (Hook Engine + tracked links)
 *   • luna voice → src/lib/ambassador.js
 *   • publishing → the existing AutoPilot (api/autopilot.mjs) — untouched
 *   • analytics  → measured click data (utm: source=likelink_content, medium=angle)
 *
 * The engine produces a COMPLETE Hebrew content pack per campaign cycle:
 * audience → pain → angle → ranked hooks → story → short-video script →
 * on-screen text → captions → CTA → platform variants → tracked URL → next test.
 *
 * Rules baked in:
 *   • Every cycle gets a UNIQUE campaign id (idempotent measurement).
 *   • Hebrew-native copy — never machine-translated English.
 *   • ONLY real product fields are used (title/price/category/description).
 *     No fabricated facts, no fake urgency, no fake social proof.
 *   • Variation is CONTROLLED: data-driven when sample is sufficient,
 *     deterministic rotation otherwise. The winner is never discarded (§19).
 *   • Publication is NOT done here — only PREPARED ASSETS. Authorized
 *     distribution remains the existing AutoPilot + connected channels.
 *   • Pure module — no network, no secrets, no side effects.
 */

import { generateHookVariations, buildTrackedLink } from "./hooks.js";

// Minimum measured sample before the engine "learns" (same threshold rule
// as recommendHookAngles — no learning from one click).
const MIN_SAMPLE = 30;

// Audience + pain mapping per existing product category (Hebrew, honest,
// generic — no invented product claims).
const AUDIENCE_BY_CATEGORY = {
  Fashion:  { audience: "נשים 20–40 שמתלבשות בסטייל אבל לא רוצות לשלם מחיר בוטיק", pain: "קשה למצוא פריט שנראה יוקרתי במחיר הגיוני" },
  Beauty:   { audience: "נשים שמשקיעות בטיפוח ומחפשות פתרונות פשוטים שעובדים", pain: "מוצרים רבים, מעט בהירות — מה באמת שווה את הכסף" },
  Home:     { audience: "משפחות ושותפים לדירה שרוצים בית מסודר ונעים", pain: "הבית מתמלא בבלאגן וכל פתרון דורש עבודה" },
  Tech:     { audience: "משתמשים שרוצים גאדג'טים שפותרים בעיות אמיתיות", pain: "מפרטים מבלבלים ומוצרים שלא עומדים בהבטחה" },
  Fitness:  { audience: "אנשים שמתאמנים בבית ורוצים תוצאות בלי מכון", pain: "קשה לשמור על שגרה בלי ציוד ובלי זמן" },
  Kids:     { audience: "הורים לילדים שמחפשים משהו חינוכי וגם כיפי", pain: "צעצועים משעממים מהר וההורים קונים שוב ושוב" },
  Accessories: { audience: "קהל שאוהב להשלים לוק עם פרטים קטנים", pain: "הפרט הקטן הוא שהופך לוק — אבל קשה למצוא אותו" },
  Other:    { audience: "קונים מגוונים שאוהבים מציאות טובות", pain: "קשה לדעת איזה מוצר באמת שווה את הקליק" },
};

const ANGLE_LABELS = {
  luna: "לונה — הפנים של LikeLink",
  curiosity: "סקרנות",
  value: "מחיר אמיתי",
  problem: "בעיה → פתרון",
  emotion: "רגש",
  pov: "POV",
  story: "מיני-סיפור",
  contrast: "שיפוט חופשי",
  direct: "ישירות",
  // legacy ids (older click data may still reference them)
  benefit: "תועלת ישירה",
  social: "ראייה חברתית",
};

const hash = (s) => { let h = 0; const x = String(s || ""); for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0; return h; };

/**
 * Pick the angle for this cycle — CONTROLLED variation:
 *  • insufficient data → deterministic rotation across angles
 *  • sufficient data  → keep the winner most cycles (never destroy it),
 *    explore a challenger on ~1 of 3 cycles (deterministic hash decision).
 */
export function pickAngle({ campaignId, angleStats }) {
  const total = Object.values(angleStats || {}).reduce((s, n) => s + n, 0);
  const h = hash(campaignId);
  if (total < MIN_SAMPLE || !angleStats || Object.keys(angleStats).length < 2) {
    const rotation = ["curiosity", "value", "problem", "emotion", "pov", "story", "contrast", "direct", "luna"];
    return { angle: rotation[h % rotation.length], learned: false, reason: "safe_default_rotation" };
  }
  const ranked = Object.entries(angleStats).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0][0];
  if (h % 3 === 0 && ranked.length > 1) {
    return { angle: ranked[1][0], learned: true, reason: "explore_challenger", winner };
  }
  return { angle: winner, learned: true, reason: "keep_winner", winner };
}

/** Rank hooks — measured performance first, deterministic tiebreak. */
function rankHooks(hooks, angleStats) {
  return [...hooks].sort((a, b) =>
    (Number(angleStats?.[b.angle] || 0)) - (Number(angleStats?.[a.angle] || 0)) ||
    hash(a.id) - hash(b.id)
  );
}

/** One data-based recommendation for the next cycle (winner is kept). */
function pickNextTest(angleStats) {
  const ranked = Object.entries(angleStats).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0];
  const weak = ranked[ranked.length - 1];
  if (winner && weak && winner[0] !== weak[0] && winner[1] > weak[1] * 1.5) {
    return `הזווית "${ANGLE_LABELS[winner[0]] || winner[0]}" מובילה (${winner[1]} קליקים מול ${weak[1]}). שומרים עליה כ-WINNER ובודקים במחזור הבא וריאציית Hook חדשה תחת אותה זווית.`;
  }
  return "אין פער מובהק בין הזוויות — ממשיכים לבדוק זווית חלופית במחזור הבא.";
}

/**
 * Build the full campaign content pack for one cycle.
 * @param {object} product  — existing product record {id,title,price,category,description}
 * @param {object} opts     — { storeUrl, angleStats }
 * @returns {object} campaign — complete, publication-ready assets
 */
export function buildCampaign(product, { storeUrl = null, angleStats = {} } = {}) {
  if (!product?.id || !product?.title) return null;
  const campaignId = `cmp_${String(product.id).slice(0, 24)}_${Date.now().toString(36)}`;
  const cat = product.category || "Other";
  const audience = AUDIENCE_BY_CATEGORY[cat] || AUDIENCE_BY_CATEGORY.Other;

  // angle selection — controlled variation, data-driven when possible
  const choice = pickAngle({ campaignId, angleStats });

  // hooks — generate variations, rank by measured data, choose one
  const hooks = rankHooks(generateHookVariations(product, { count: 5, storeUrl }), angleStats);
  const chosen = hooks.find((h) => h.angle === choice.angle) || hooks[0];

  // story — problem → tension → discovery → solution (product facts only)
  const price = Number(product.price) > 0 ? `₪${product.price}` : "";
  const story = [
    `הבעיה: ${audience.pain}.`,
    `רגע של מתח — רוב הפתרונות לזה יקרים או מסובכים.`,
    `הגילוי: ${product.title}${price ? ` ב־${price}` : ""}.`,
    product.description ? `הפרטים: ${String(product.description).slice(0, 140)}` : `כל המידע והמחיר — בלינק.`,
  ].join("\n");

  // short-form vertical video script + on-screen text + captions
  const script = [
    { t: "0–3 שנ'", visual: "קלוז-אפ על המוצר / תנועה חדה", onScreen: chosen.text.split("\n")[0].slice(0, 60), caption: chosen.text.split("\n")[0] },
    { t: "3–8 שנ'", visual: "הצגת הבעיה", onScreen: audience.pain.slice(0, 60), caption: audience.pain },
    { t: "8–15 שנ'", visual: "המוצר בשימוש — הפתרון נכנס", onScreen: product.title.slice(0, 60), caption: `${product.title}${price ? ` · ${price}` : ""}` },
    { t: "15–20 שנ'", visual: "CTA — אצבע מצביעה על הלינק", onScreen: "לפרטים ולרכישה 👇", caption: "הלינק בביו / בחץ" },
  ];

  const cta = "לצפייה ולרכישה — בלינק 👇";
  const trackedUrl = buildTrackedLink(product, { storeUrl, channel: choice.angle });

  // platform-native variants (assets only — publication stays authorized)
  const post = `${chosen.text.split("\n")[0]}\n\n${story}\n\n${cta}\n${trackedUrl}`;
  const shortVideo = {
    script,
    description: `${product.title}${price ? ` · ${price}` : ""}\n${cta}\n${trackedUrl}`,
    hashtags: `#לייקלינק #${cat === "Other" ? "קניות" : cat}`,
  };
  const storyVariant = { frames: script.map((s) => ({ onScreen: s.onScreen, caption: s.caption })), link: trackedUrl };

  // learning — honest, sample-gated
  const totalSample = Object.values(angleStats || {}).reduce((s, n) => s + n, 0);
  const nextTest = totalSample >= MIN_SAMPLE
    ? pickNextTest(angleStats)
    : "אין עדיין מספיק נתונים מדודים — המערכת ממשיכה לאסוף לפני שינוי אסטרטגיה.";

  return {
    campaignId,
    createdAt: new Date().toISOString(),
    productId: product.id,
    product: { id: product.id, title: product.title, price: product.price, category: cat },
    audience,
    angle: { id: choice.angle, label: ANGLE_LABELS[choice.angle] || choice.angle, learned: choice.learned, reason: choice.reason },
    hooks,
    chosenHook: chosen,
    story,
    script,
    cta,
    trackedUrl,
    tracking: { utm_source: "likelink_content", utm_medium: choice.angle, utm_campaign: campaignId, utm_content: chosen.id, productId: product.id },
    variants: { post, short_video: shortVideo, story: storyVariant },
    measurement: { sampleRule: `למידה רק מעל ${MIN_SAMPLE} קליקים מדודים`, byAngle: angleStats || {}, totalSample },
    nextTest,
    publication: "PREPARED_ASSET_ONLY — פרסום מבוצע רק דרך הערוצים המחוברים והמורשים של היוצרת (AutoPilot).",
  };
}

/**
 * Distribution Orchestrator — THIN policy layer (§6).
 * Decides WHERE a campaign may be distributed given real connection states.
 * Never stores provider secrets, never publishes by itself, never fakes
 * authorization: a channel without a real connection is NOT publishable.
 */
export function planDistribution(campaign, connections = []) {
  const plan = [];
  for (const conn of Array.isArray(connections) ? connections : []) {
    const channel = String(conn?.provider || "unknown");
    if (!conn?.connected) {
      plan.push({ channel, status: "NO_AUTHORIZED_CONNECTION", publishable: false });
      continue;
    }
    // Google is a DISCOVERY channel, not a social post — its asset is the
    // validated product data flowing through the existing feed (§13).
    if (channel === "google") {
      plan.push({ channel, status: "READY_DISCOVERY", publishable: true, variant: "product_discovery", asset: "existing_google_feed" });
      continue;
    }
    // PayPal is a money provider, never a distribution channel.
    if (channel === "paypal") {
      plan.push({ channel, status: "NOT_A_DISTRIBUTION_CHANNEL", publishable: false });
      continue;
    }
    plan.push({ channel, status: "READY", publishable: true, variant: "post", trackedUrl: campaign.trackedUrl });
  }
  return {
    campaignId: campaign?.campaignId,
    plan,
    publishableChannels: plan.filter((p) => p.publishable).length,
    distributionStatus: plan.some((p) => p.publishable) ? "READY" : "DISTRIBUTION_BLOCKED",
    blockedReason: plan.some((p) => p.publishable) ? null : "NO_AUTHORIZED_CHANNEL",
  };
}

/**
 * Learning loop input — aggregate measured content clicks per angle.
 * Used by the Owner report (api/_utils/analytics.js). Honesty rules apply:
 * below the minimum sample the loop reports "not enough data", never a guess.
 */
export function learnFromClicks(clicks) {
  const byAngle = {};
  for (const c of Array.isArray(clicks) ? clicks : []) {
    if (String(c?.src || "") !== "likelink_content") continue; // content-engine clicks only
    const angle = String(c?.med || "unknown");
    byAngle[angle] = (byAngle[angle] || 0) + 1;
  }
  const totalSample = Object.values(byAngle).reduce((s, n) => s + n, 0);
  return {
    byAngle,
    totalSample,
    minSample: MIN_SAMPLE,
    sufficient: totalSample >= MIN_SAMPLE && Object.keys(byAngle).length >= 2,
    nextTest: totalSample >= MIN_SAMPLE && Object.keys(byAngle).length >= 2
      ? pickNextTest(byAngle)
      : "אין עדיין מספיק נתונים מדודים כדי להסיק — המערכת ממשיכה לאסוף.",
  };
}


