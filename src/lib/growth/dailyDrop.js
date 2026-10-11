// "הדרופ היומי": every morning, one ready-to-post marketing kit for the site.
//
// The cloud picks today's product and its best video (our own real footage,
// then the seller's video in the premium cut, then Luna), reads today's
// hottest searches in Israel (Google Trends, public feed) and the calendar
// moment, and writes the post for every network: hook, caption, on-screen
// text, hashtags, the tracked link. scripts/marketing/daily-drop.mjs turns it
// into a page the owner posts from in a minute (nothing is posted by itself:
// the networks' official APIs need the owner's connected accounts).
//
// Sales copy that stays true: hooks come from the product's own fields and
// proven formulas (pattern interrupt, see-it-first, save-for-later, question,
// trend), never invented scarcity, prices, sales, reviews or experience. A
// trend is used only when it really matches the product (matchTrends);
// otherwise the copy says nothing about trends.
import { HOOK_FORBIDDEN, buildHookSet, matchTrends, worldOf } from "./likeloop.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

export const DROP_AD = "#פרסומת · קישור שותפים";
// Beyond the hook engine's list: urgency and superlatives that no data backs.
export const DROP_FORBIDDEN = /(רק היום|נשאר|אחרונ|מהרו|לזמן מוגבל|הכי זול|הכי טוב|הכי משתלם|חינם לגמרי|מבצע|הנחה|₪|\d+%)/;
const LOOK_RANK = { real: 4, seller: 3, talking: 2, still: 1 };

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const firstSentence = (s) => (clean(s).split(/(?<=[.!?])\s/)[0] || "").slice(0, 150);
const dayIndex = (now) => Math.floor(now / 86_400_000);

/** A hook is safe when neither rule list matches it. */
export function safeCopy(text) {
  return !HOOK_FORBIDDEN.test(text) && !DROP_FORBIDDEN.test(text);
}

/** The best video for each product in the reels feed (index.json entries). */
export function bestReels(reels = []) {
  const best = new Map();
  for (const r of Array.isArray(reels) ? reels : []) {
    const rank = LOOK_RANK[r?.look] || 0;
    const cur = best.get(r?.productId);
    if (r?.productId && (!cur || rank > cur.rank)) best.set(r.productId, { ...r, rank });
  }
  return best;
}

/**
 * Today's product: one the trends really match first, then one that fits the
 * calendar moment, otherwise a daily rotation over products with a video (so
 * every product gets its day).
 */
export function pickProduct({ products = [], reels = [], trends = [], moment = null, now = Date.now() } = {}) {
  const videos = bestReels(reels);
  const withVideo = products.filter((p) => videos.has(p.id));
  if (!withVideo.length) return null;
  const matched = matchTrends(trends, withVideo).filter((t) => t.relevance === "MATCHED").sort((a, b) => b.confidence - a.confidence);
  if (matched.length) {
    const product = withVideo.find((p) => p.id === matched[0].products[0]);
    return { product, reel: videos.get(product.id), trend: matched[0], reason: "trend" };
  }
  const words = (moment?.words || []).map((w) => String(w).slice(0, 4));
  const fits = withVideo.filter((p) => (moment?.categories || []).includes(p.category) && words.some((w) => clean(p.title).includes(w)));
  const pool = fits.length ? fits : withVideo;
  const product = pool[dayIndex(now) % pool.length];
  return { product, reel: videos.get(product.id), trend: null, reason: fits.length ? "moment" : "rotation" };
}

/** Hooks for today's video, strongest formulas first, all checked. */
export function dropHooks(product, { trend = null, reel = null } = {}) {
  const w = worldOf(product?.category);
  const set = buildHookSet(product, { trend: trend ? { term: trend.term, source: trend.source, observedAt: trend.observedAt } : null });
  const pick = (type) => set.find((h) => h.type === type)?.text;
  const hooks = [
    trend ? pick("trend") : null,
    "עצרי שנייה. תסתכלי על זה מקרוב",
    reel?.look === "real" ? "צילמנו את זה בעצמנו. בלי פילטרים, בלי הדמיות" : null,
    `רואים את ה${w.noun} בווידאו לפני שקונים. ככה קונים באונליין`,
    pick("question"),
    pick("problem"),
    "שמרי את זה לפעם הבאה שתחפשי מתנה",
  ];
  return [...new Set(hooks.filter(Boolean))].filter(safeCopy);
}

const tagWord = (s) => `#${clean(s).replace(/[^\p{L}\p{N}]+/gu, "")}`;

/** Hashtags: the disclosure first, a matched trend, then the product's niche. */
export function dropHashtags(product, trend = null) {
  const niche = {
    Accessories: ["#תכשיטים", "#אקססוריז", "#מתנה", "#אליאקספרס", "#מציאות"],
    Fashion: ["#אופנה", "#סטייל", "#מציאות", "#אליאקספרס"],
    Home: ["#עיצובהבית", "#לבית", "#מציאות", "#אליאקספרס"],
  }[product?.category] || ["#מציאות", "#אליאקספרס", "#קניותאונליין"];
  return [...new Set([trend ? tagWord(trend.term) : null, ...niche, "#LikeLink2"].filter((t) => t && t.length > 2))].slice(0, 7);
}

export function trackedLink(path, source, campaign, origin = PRODUCTION_ORIGIN) {
  const u = new URL(`${origin}${path}`);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign);
  return u.href;
}

/** The site's promise, in lines that are true today (each names a live feature). */
export const VALUE_LINES = Object.freeze([
  "ב־LikeLink2 רואים את המוצר בווידאו לפני שקונים, עם קישור ישיר לחנות.",
  "ב־LikeLink2 יש מודד מידות חינמי לטבעות ולצמידים, ישר מהמסך.",
  "ב־LikeLink2 יש מדריך חינמי: 8 בדיקות לפני שקונים באליאקספרס.",
]);

/** The whole kit for one day: the posts for each network, ready to paste. */
export function buildDrop({ product, reel, trend = null, moment = null, reason = "rotation", now = Date.now(), origin = PRODUCTION_ORIGIN }) {
  const date = new Date(now).toISOString().slice(0, 10);
  const campaign = `daily_drop_${date.replace(/-/g, "")}`;
  const hooks = dropHooks(product, { trend, reel });
  const hook = hooks[0];
  const tags = dropHashtags(product, trend);
  const fact = firstSentence(product.description) || clean(product.title);
  const value = VALUE_LINES[dayIndex(now) % VALUE_LINES.length];
  const page = `/p/${product.id}`;
  const videoNote = reel?.look === "real" ? "צילום אמיתי של המוצר." : reel?.look === "seller" ? "צילום המוצר: המוכר." : "לונה היא דמות AI.";
  const posts = {
    tiktok: {
      onScreen: [hook, clean(product.title).slice(0, 40)],
      caption: [DROP_AD, hook, fact, "הקישור בביו 🔗", videoNote, tags.join(" ")].join("\n"),
      bioLink: trackedLink("/", "tiktok", "bio", origin),
    },
    instagram: {
      onScreen: [hook],
      caption: [DROP_AD, hook, "", clean(product.title), fact, "", 'כתבי "רוצה" בתגובות ואשלח לך את הקישור בפרטי 📩', "", "קישור שותפים: אם תקני דרכו ייתכן שאקבל עמלה, בלי עלות נוספת לך.", videoNote, "", tags.join(" ")].join("\n"),
    },
    shorts: {
      title: `${hook}`.slice(0, 95),
      description: [DROP_AD, fact, trackedLink(page, "youtube", campaign, origin), videoNote].join("\n"),
    },
    whatsapp: { text: [DROP_AD, `✨ ${hook}`, clean(product.title), trackedLink(page, "whatsapp", campaign, origin)].join("\n") },
    telegram: { text: [DROP_AD, `✨ ${hook}`, "", clean(product.title), fact, "", trackedLink(page, "telegram", campaign, origin), "", value].join("\n") },
    facebook: { text: [DROP_AD, hook, "", fact, value, "", trackedLink(page, "facebook", campaign, origin), "", videoNote].join("\n") },
    story: { poll: `${worldOf(product.category).noun} כזה: כן או לא?`, link: trackedLink(page, "instagram_story", campaign, origin) },
  };
  return {
    date,
    campaign,
    reason,
    trend: trend ? { term: trend.term, source: trend.source, observedAt: trend.observedAt, confidence: trend.confidence } : null,
    moment: moment ? { id: moment.id, title: moment.he?.title || "" } : null,
    product: { id: product.id, title: clean(product.title), link: trackedLink(page, "drop", campaign, origin) },
    video: reel ? { file: reel.video, poster: reel.poster || "", look: reel.look, labels: reel.labels || [] } : null,
    hooks,
    hashtags: tags,
    posts,
    value,
  };
}
