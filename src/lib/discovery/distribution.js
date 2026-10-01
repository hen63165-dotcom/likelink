// Distribution engine — from a REAL product to a channel-ready content plan.
//
// Deterministic and native (no AI call): every hook, script line, caption and
// hashtag is built from the product's own fields (title, description, price,
// category, image, creator). Nothing is invented: no testimonials, no "best
// seller", no reviews, no stock or sales claims. A personal line appears only
// as an instruction the creator fills in if — and only if — it is true.
//
// Every plan carries the affiliate disclosure (#פרסומת / קישור שותפים) and,
// when AI-generated visuals are proposed, the AI-label instruction of each
// network. Every calendar post has its own /r tracking link (src=<channel>.<postId>)
// so clicks are attributed per post.
//
// Publishing: nothing is ever posted by LikeLink without the owner's explicit
// approval per post, and a post counts as published ONLY with the network's
// own post id (verifyPublication). No official social API is connected today:
// those channels are "prepared — needs owner connection" with the exact steps.
import { productPageUrl, trackingLink, AFFILIATE_DISCLOSURE_HE, stableHash } from "./surfaces.js";
import { registerCapability, CAPABILITIES, RISK, PERMISSION, EXECUTOR } from "./capabilities.js";
import { imageProvenance, isRealProductPhoto } from "./catalogIntegrity.js";
import { OWNER_ACTIONS } from "./publishers/index.js";

export const DISTRIBUTION_VERSION = 1;
export const POST_STATE = Object.freeze({
  DRAFT: "DRAFT",
  READY_FOR_MANUAL_POST: "READY_FOR_MANUAL_POST",
  REPORTED_BY_CREATOR: "REPORTED_BY_CREATOR", // the creator says it is up — not provider-verified
  REQUIRES_CONNECTION: "REQUIRES_CONNECTION",
  PUBLISHED: "PUBLISHED",                     // only with the provider's own post id
});

const OWNER_CONNECTION_COMMON = "פתיחת אפליקציית מפתחים אצל הרשת, חיבור בחשבון העסקי של הבעלים דרך OAuth, ואישור ההרשאות על ידי הרשת. רק אחרי אימות מול הרשת הערוץ יסומן כמחובר.";

/**
 * Channels a plan can target. `api` describes the OFFICIAL publishing API and
 * what the owner must do; `connected` is decided only by real configuration
 * (see distributionChannels), never assumed.
 */
export const DISTRIBUTION_CHANNELS = Object.freeze([
  {
    id: "instagram_reels", label: "Instagram Reels", format: "וידאו אנכי 9:16, 15–30 שניות", captionMax: 2200, hashtagsMax: 5,
    aiLabel: "אם הסרטון או התמונה נוצרו בבינה מלאכותית: להפעיל את התווית AI info בזמן הפרסום.",
    disclosureTool: "להפעיל את התווית 'שיתוף פעולה בתשלום' (Paid partnership) כשיש קשר מסחרי.",
    api: { name: "Instagram Content Publishing API (Meta Graph API)", ownerAction: `חשבון Instagram מקצועי (Business או Creator), אפליקציית Meta for Developers עם ההרשאה instagram_business_content_publish שעברה App Review. ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "tiktok", label: "TikTok", format: "וידאו אנכי 9:16, 15–30 שניות", captionMax: 2200, hashtagsMax: 5,
    aiLabel: "אם התוכן נוצר בבינה מלאכותית: להפעיל את ההגדרה AI-generated content.",
    disclosureTool: "להפעיל את 'Content disclosure' ולבחור את סוג הקשר המסחרי.",
    api: { name: "TikTok Content Posting API", ownerAction: `אפליקציה ב-TikTok for Developers עם Content Posting API. עד שהאפליקציה עוברת את הביקורת (audit) של TikTok, פוסטים דרך ה-API מתפרסמים כפרטיים בלבד. ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "youtube_shorts", label: "YouTube Shorts", format: "וידאו אנכי 9:16, עד 60 שניות", captionMax: 5000, titleMax: 100, hashtagsMax: 3,
    aiLabel: "אם התוכן מציג אנשים או אירועים שנוצרו או שונו בבינה מלאכותית באופן מציאותי: לסמן 'Altered or synthetic content' ב-YouTube Studio.",
    disclosureTool: "לסמן 'Paid promotion' בהגדרות הסרטון.",
    api: { name: "YouTube Data API v3 (videos.insert)", ownerAction: `פרויקט ב-Google Cloud עם YouTube Data API ומסך הסכמה ל-OAuth. העלאה עולה 1,600 יחידות מכסה, ופרויקט שלא עבר ביקורת של YouTube מעלה סרטונים כפרטיים. ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "facebook", label: "Facebook", format: "פוסט עם תמונה או Reel", captionMax: 5000, hashtagsMax: 3,
    aiLabel: "אם התמונה או הסרטון נוצרו בבינה מלאכותית: להפעיל את התווית AI info.",
    disclosureTool: "להפעיל את 'Paid partnership' כשיש קשר מסחרי.",
    api: { name: "Facebook Pages API (Meta Graph API)", ownerAction: `עמוד פייסבוק עסקי ואפליקציית Meta עם ההרשאה pages_manage_posts שעברה App Review. ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "pinterest", label: "Pinterest", format: "פין תמונה 2:3 (1000×1500)", captionMax: 500, titleMax: 100, hashtagsMax: 3,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בתיאור הפין.",
    disclosureTool: "לסמן 'Paid partnership' כשהאפשרות זמינה, ולשמור את #פרסומת בתיאור.",
    api: { name: "Pinterest API v5 (pins: create)", ownerAction: `אפליקציה ב-Pinterest Developers עם ההרשאה pins:write, וקבלת Standard access (גישת Trial לא מתאימה לפרסום אמיתי). ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "x", label: "X", format: "פוסט קצר עם קישור", captionMax: 280, hashtagsMax: 2,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בפוסט.",
    disclosureTool: "להשאיר #פרסומת בגוף הפוסט.",
    api: { name: "X API v2 (POST /2/tweets)", ownerAction: `חשבון מפתחים ב-X ותוכנית API שמאפשרת כתיבה (לבדוק את המחירים והמגבלות העדכניים). ${OWNER_CONNECTION_COMMON}` },
  },
  {
    id: "whatsapp", label: "WhatsApp (שיתוף ידני)", format: "הודעה או סטטוס עם קישור", captionMax: 1000, hashtagsMax: 0, manualOnly: true,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בהודעה.",
    disclosureTool: "הגילוי הנאות נמצא בתוך נוסח ההודעה.",
    api: null,
  },
  {
    id: "telegram", label: "Telegram", format: "הודעה עם קישור ותמונה", captionMax: 1024, hashtagsMax: 3,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בהודעה.",
    disclosureTool: "הגילוי הנאות נמצא בתוך נוסח ההודעה.",
    // Real publishing with a provider message_id (publishers/telegram.js) once the
    // owner's bot + public channel are set in the studio's autopilot channels.
    api: { name: "Telegram Bot API (sendPhoto / sendMessage)", ownerAction: OWNER_ACTIONS.telegram },
  },
  {
    id: "bluesky", label: "Bluesky", format: "פוסט קצר עם קישור (עד 300 תווים)", captionMax: 300, hashtagsMax: 2,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בפוסט.",
    disclosureTool: "הגילוי הנאות נמצא בתחילת הפוסט.",
    api: { name: "AT Protocol (com.atproto.repo.createRecord)", ownerAction: OWNER_ACTIONS.bluesky },
  },
  {
    id: "mastodon", label: "Mastodon", format: "פוסט עם קישור (עד 500 תווים)", captionMax: 500, hashtagsMax: 3,
    aiLabel: "אם התמונה נוצרה בבינה מלאכותית: לציין זאת בפוסט.",
    disclosureTool: "הגילוי הנאות נמצא בתחילת הפוסט.",
    api: { name: "Mastodon API (POST /api/v1/statuses)", ownerAction: OWNER_ACTIONS.mastodon },
  },
]);

const CHANNEL = Object.fromEntries(DISTRIBUTION_CHANNELS.map((c) => [c.id, c]));

/** Real connection state per channel. `connections` holds provider-verified tokens only (none today). */
export function distributionChannels({ connections = {}, configured = {} } = {}) {
  return DISTRIBUTION_CHANNELS.map((ch) => {
    const verified = Boolean(connections[ch.id]?.verifiedAt && connections[ch.id]?.providerAccountId);
    // CONFIGURED = credentials saved but no post confirmed by the provider yet.
    const state = ch.manualOnly ? "MANUAL" : verified ? "CONNECTED" : configured[ch.id] ? "CONFIGURED" : "REQUIRES_CONNECTION";
    return {
      id: ch.id, label: ch.label, format: ch.format, state,
      stateHe: state === "MANUAL" ? "שיתוף ידני — מוכן" : state === "CONNECTED" ? "מחובר ומאומת" : state === "CONFIGURED" ? "מוגדר — יאומת בפרסום הראשון" : "מוכן — דרוש חיבור של הבעלים",
      api: ch.api?.name || null,
      ownerAction: state === "REQUIRES_CONNECTION" ? ch.api?.ownerAction || null : null,
    };
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const clip = (s, n) => { const t = clean(s); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`; };
const price = (c) => (c.price ? `₪${Number.isInteger(c.price) ? c.price : c.price.toFixed(2)}` : "");
function sentences(text) {
  // No regex lookbehind (older Safari cannot parse it).
  return String(text || "").replace(/([.!?])\s+/g, "$1\n").split(/\n|\s*[•·]\s*/)
    .map((x) => clean(x).replace(/[.!?]+$/, "")).filter((x) => x.length >= 8 && x.length <= 140)
    // A store's rating / review count / "best seller" line is not a fact we can
    // verify (it changes daily) — it never reaches a post.
    .filter((x) => !FORBIDDEN_CLAIMS.test(x));
}
const hashtag = (w) => `#${clean(w).replace(/[^\p{L}\p{N}\s_]/gu, "").trim().replace(/\s+/g, "_")}`;
const STOP = new Set(["של", "עם", "את", "על", "גם", "לכל", "או", "the", "and", "for", "with", "new", "set", "pcs"]);

// Phrases that would be invented claims (tests assert none ever appears).
export const FORBIDDEN_CLAIMS = /(הכי נמכר|רב[ -]?מכר|לקוחות (?:אומרים|ממליצים|מתלהבים)|ביקורות|\d(?:[.,]\d)?\s*כוכבים|חמישה כוכבים|אלפי (?:לקוחות|קונים)|מובטח|best ?seller|customers (?:say|love)|guaranteed|\d(?:\.\d)?\s*stars?)/i;

/** Which disclosure applies, from the real sale model. */
export function disclosureFor(c) {
  if (c.saleModel === "affiliate") return { required: true, tag: "#פרסומת", short: "#פרסומת · קישור שותפים", full: AFFILIATE_DISCLOSURE_HE, placement: "בתחילת הכיתוב + על המסך ב-3 השניות הראשונות" };
  if (c.saleModel === "direct") return { required: true, tag: "#פרסומת", short: "#פרסומת · מוצר שאני מוכרת", full: "גילוי נאות: זה מוצר שאני מוכרת בעצמי.", placement: "בתחילת הכיתוב + על המסך ב-3 השניות הראשונות" };
  return { required: false, tag: "", short: "", full: "", placement: "" };
}

// ── fit ─────────────────────────────────────────────────────────────────────
/**
 * Which channels suit this product, from its own fields and real clicks only.
 * It is a readiness judgement, never a forecast of views or sales.
 */
export function analyzeDistributionFit(c, { clicks = [], issues = [] } = {}) {
  const blockers = [];
  if (!c?.title) blockers.push("למוצר אין כותרת");
  if (c?.status && !["approved", "active", "published"].includes(String(c.status))) blockers.push("המוצר עדיין לא מאושר לפרסום");
  if (c?.saleModel === "none") blockers.push("למוצר אין קישור רכישה או קופה באתר");
  // Catalog integrity (catalogIntegrity.js): a shared affiliate link blocks
  // promotion; a stock photo is never presented as the product.
  for (const i of issues || []) if (i.blocking) blockers.push(i.he);
  const hasImage = Boolean(c?.image) && isRealProductPhoto(c.image);
  const facts = sentences(c?.description);
  const mine = (clicks || []).filter((k) => k && String(k.productId) === String(c?.id));
  const bySource = {};
  for (const k of mine) { const src = String(k.source || "unknown").split(".")[0]; bySource[src] = (bySource[src] || 0) + 1; }
  const channels = DISTRIBUTION_CHANNELS.map((ch) => {
    const reasons = [];
    let fit = "good";
    if (/וידאו|Reel/.test(ch.format) && !hasImage) { fit = "weak"; reasons.push("אין תמונת מוצר לבסס עליה וידאו"); }
    if (ch.id === "pinterest" && !hasImage) { fit = "weak"; reasons.push("פינטרסט דורש תמונה"); }
    if (["x", "telegram", "whatsapp"].includes(ch.id)) reasons.push("טקסט קצר עם קישור — לא דורש מדיה");
    if (hasImage && /וידאו|פין|תמונה/.test(ch.format)) reasons.push("יש תמונת מוצר אמיתית");
    if (bySource[ch.id]) reasons.push(`${bySource[ch.id]} קליקים אמיתיים הגיעו מכאן`);
    return { channel: ch.id, label: ch.label, fit, reasons };
  });
  return {
    productId: c?.id || null,
    ready: blockers.length === 0,
    blockers,
    signals: { hasImage, hasPrice: Boolean(c?.price), factCount: facts.length, saleModel: c?.saleModel || "none", category: c?.category || "" },
    channels,
    evidence: mine.length ? { clicks: mine.length, bySource } : { clicks: 0, note: "אין עדיין קליקים אמיתיים למוצר הזה" },
    note: "ההתאמה מבוססת על שדות המוצר ועל קליקים אמיתיים בלבד. היא לא תחזית של צפיות או מכירות.",
  };
}

// ── content ─────────────────────────────────────────────────────────────────
export function buildHooks(c) {
  const p = price(c);
  const facts = sentences(c.description);
  const hooks = [
    p ? `${c.title} ב-${p} — הנה מה שכדאי לדעת` : `${c.title} — הנה מה שכדאי לדעת`,
    c.category ? `מחפשת ${c.category}? שווה להכיר את ${c.title}` : `שווה להכיר: ${c.title}`,
    facts[0] ? `${facts[0]} — ${c.title}` : "",
    facts.length >= 3 ? `3 דברים על ${c.title} לפני שקונים` : "",
  ].filter(Boolean).map((h) => clip(h, 90));
  return [...new Set(hooks)];
}

const PERSONAL_LINE = "[רק אם השתמשת במוצר בעצמך: משפט אחד, במילים שלך, על מה שחווית. אם לא — השמיטי את השורה הזו. אין להמציא חוויה.]";

/** Hebrew UGC-style scripts (15s / 30s), built only from real fields. */
export function buildScripts(c, hooks = buildHooks(c)) {
  const facts = sentences(c.description).slice(0, 3);
  const p = price(c);
  const d = disclosureFor(c);
  const cta = "הלינק בביו / בתגובה הראשונה";
  const s15 = [
    { t: "0–3", voice: hooks[0], screen: [clip(c.title, 40), d.short].filter(Boolean).join(" · "), shot: c.image ? "תמונת המוצר בתקריב, תנועת זום איטית" : "דמות מצוירת מציגה את שם המוצר" },
    { t: "3–10", voice: facts[0] || (c.category ? `זה ${c.category}.` : c.title), screen: facts[0] ? clip(facts[0], 50) : "", shot: "המוצר מזוויות שונות (מתמונות המוצר בלבד)" },
    { t: "10–15", voice: `${p ? `המחיר בזמן הכתיבה: ${p}. ` : ""}${cta}.`, screen: [p ? `${p} (עשוי להשתנות)` : "", d.short].filter(Boolean).join(" · "), shot: "קריאה לפעולה + הלינק" },
  ];
  const s30 = [
    { t: "0–3", voice: hooks[1] || hooks[0], screen: [clip(c.title, 40), d.short].filter(Boolean).join(" · "), shot: "פתיחה חזקה על המוצר" },
    { t: "3–8", voice: c.category ? `אם את מחפשת ${c.category}, שימי לב לזה.` : "שימי לב לזה.", screen: c.category || "", shot: "הקשר: איפה המוצר משתלב" },
    ...facts.map((f, i) => ({ t: `${8 + i * 4}–${12 + i * 4}`, voice: `${f}.`, screen: clip(f, 50), shot: "תמונת מוצר / פרט רלוונטי" })),
    { t: "", voice: PERSONAL_LINE, screen: "", shot: "את מול המצלמה (אופציונלי)" },
    { t: "–30", voice: `${p ? `המחיר בזמן הכתיבה: ${p}, והוא עשוי להשתנות. ` : ""}${cta}.`, screen: [d.short, "הלינק בביו"].filter(Boolean).join(" · "), shot: "סיום + קריאה לפעולה" },
  ];
  return [
    { id: "s15", length: "15 שניות", beats: s15 },
    { id: "s30", length: "30 שניות", beats: s30 },
  ];
}

export function buildHashtags(c, max = 5) {
  const d = disclosureFor(c);
  const words = clean(c.title).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w)).slice(0, 2);
  const tags = [d.tag, c.category ? hashtag(c.category) : "", ...words.map(hashtag), c.brand ? hashtag(c.brand) : ""].filter((t) => t && t.length > 1);
  return [...new Set(tags)].slice(0, Math.max(0, max));
}

export function buildCaption(c, channelId, { hook, link }) {
  const ch = CHANNEL[channelId];
  const d = disclosureFor(c);
  // A "3 דברים" hook gets three facts; the disclosure tag is already on the first line.
  const facts = sentences(c.description).slice(0, /^3 /.test(hook) ? 3 : 2);
  const tags = buildHashtags(c, ch.hashtagsMax + (d.tag ? 1 : 0)).filter((t) => t !== d.tag).slice(0, ch.hashtagsMax).join(" ");
  const p = price(c);
  const parts = [d.short, hook, ...facts.map((f) => `• ${f}`), p ? `המחיר בזמן הכתיבה: ${p}` : "", link, tags].filter(Boolean);
  let text = parts.join("\n");
  if (text.length > ch.captionMax) {
    // Short networks: disclosure + hook + link always survive.
    text = [d.short, clip(hook, Math.max(20, ch.captionMax - (d.short.length + (link || "").length + 30))), link].filter(Boolean).join("\n");
  }
  return text;
}

/** Storyboard for the 15s script — shots use the real product photo as reference. */
export function buildStoryboard(c, script) {
  return script.beats.map((b, i) => ({
    frame: i + 1, time: b.t, shot: b.shot, onScreen: b.screen, voiceOver: b.voice,
    reference: c.image ? { productPhoto: c.image, rule: "המוצר חייב להיראות כמו בתמונה האמיתית — בלי לשנות צבע, צורה או מה שכלול" } : null,
  }));
}

/**
 * Prompts for ORIGINAL 3D cartoon visuals: an original character presents the
 * real product. Never a known character, studio style, brand mascot or real
 * person — the prompt says so explicitly.
 */
export function buildImagePrompts(c) {
  const subject = c.category || "the product";
  const base = "An original, friendly 3D cartoon character designed for LikeLink (rounded shapes, soft pastel palette, expressive eyes), created from scratch";
  const guard = "The character must not resemble any existing film, TV or game character, any animation studio's recognizable style, any brand mascot, or any real person. No logos, no trademarks, no text other than the Hebrew overlay.";
  const product = c.image ? `The product must match the reference photo exactly (${c.image}) — same shape, color and contents.` : "Show the product generically; do not invent specific features.";
  return [
    { id: "hero", aspect: "9:16", prompt: `${base}, holding up ${subject} ("${c.title}") toward the camera, clean studio background, soft lighting, vertical 9:16. ${product} ${guard}` },
    { id: "pin", aspect: "2:3", prompt: `${base}, standing next to ${subject} ("${c.title}") on a simple pedestal, bright minimal background, room at the top for a Hebrew title, 2:3. ${product} ${guard}` },
    { id: "thumbnail", aspect: "1:1", prompt: `${base}, pointing at ${subject} ("${c.title}") with a curious expression, square 1:1. ${product} ${guard}` },
  ];
}

// ── plan ────────────────────────────────────────────────────────────────────
const SLOTS = [
  { day: 0, channel: "instagram_reels", script: "s15" },
  { day: 0, channel: "tiktok", script: "s15" },
  { day: 1, channel: "whatsapp", script: null },
  { day: 2, channel: "pinterest", script: null },
  { day: 3, channel: "youtube_shorts", script: "s30" },
  { day: 4, channel: "facebook", script: "s30" },
  { day: 5, channel: "telegram", script: null },
  { day: 2, channel: "bluesky", script: null },
  { day: 4, channel: "mastodon", script: null },
  { day: 6, channel: "x", script: null },
];

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * A 7-day plan for one product: hooks, scripts, storyboard, image prompts,
 * captions, hashtags, disclosure, AI labels and a calendar where every post
 * has its own tracking link. Status is always DRAFT.
 */
export function generateDistributionPlan(c0, { now = Date.now(), channels = null, clicks = [], connections = {}, issues = [] } = {}) {
  // Only a real photo of the product may be used as its visual reference.
  const c = c0?.image && !isRealProductPhoto(c0.image) ? { ...c0, image: "" } : c0;
  const fit = analyzeDistributionFit(c0, { clicks, issues });
  if (!fit.ready) return { ok: false, error: "product_not_ready", blockers: fit.blockers, fit };
  const planId = `dp_${stableHash({ id: c.id, fp: c.fingerprint, now: Math.floor(now / 60000) })}`;
  const hooks = buildHooks(c);
  const scripts = buildScripts(c, hooks);
  const d = disclosureFor(c);
  const channelState = Object.fromEntries(distributionChannels({ connections }).map((x) => [x.id, x]));
  const wanted = new Set(channels && channels.length ? channels : DISTRIBUTION_CHANNELS.map((x) => x.id));
  const weak = new Set(fit.channels.filter((x) => x.fit === "weak").map((x) => x.channel));
  const calendar = SLOTS.filter((s) => wanted.has(s.channel) && !weak.has(s.channel)).map((s, i) => {
    const postId = `${planId}-${i + 1}`;
    const src = `${s.channel}.${postId}`.slice(0, 80);
    const link = c.saleModel === "affiliate" ? trackingLink(c, src) : `${productPageUrl(c)}?src=${encodeURIComponent(src)}`;
    const hook = hooks[i % hooks.length];
    const state = channelState[s.channel];
    return {
      postId, date: isoDay(now + s.day * 86400000), suggestedTime: "19:30", timeBasis: "שעה כללית — אין עדיין נתוני קהל שלך",
      channel: s.channel, channelLabel: CHANNEL[s.channel].label, format: CHANNEL[s.channel].format,
      hook, scriptId: s.script, caption: buildCaption(c, s.channel, { hook, link }),
      hashtags: buildHashtags(c, CHANNEL[s.channel].hashtagsMax), link, trackingSource: src,
      disclosure: d.short, aiLabel: CHANNEL[s.channel].aiLabel, disclosureTool: CHANNEL[s.channel].disclosureTool,
      state: POST_STATE.DRAFT,
      publish: { permission: PERMISSION.OWNER_EXPLICIT, mode: ["CONNECTED", "CONFIGURED"].includes(state.state) ? "api" : "manual", requirement: state.ownerAction || null },
    };
  });
  const plan = {
    ok: true, id: planId, version: DISTRIBUTION_VERSION, status: "DRAFT", createdAt: new Date(now).toISOString(),
    productId: c.id, productTitle: c.title, fingerprint: c.fingerprint,
    fit, hooks, scripts, storyboard: buildStoryboard(c, scripts[0]), imagePrompts: buildImagePrompts(c),
    disclosure: d,
    aiLabel: { required: "רק אם משתמשים בתמונות או בסרטונים שנוצרו מהפרומפטים", perChannel: Object.fromEntries(DISTRIBUTION_CHANNELS.map((x) => [x.id, x.aiLabel])) },
    media: {
      productPhoto: c.image || null,
      provenance: imageProvenance(c0?.image),
      note: c.image ? "תמונת המוצר האמיתית משמשת כרפרנס." : "אין תמונה אמיתית של המוצר — הפוסטים הוויזואליים הושמטו. הוסיפי תמונה מדף המוצר בחנות או צילום שלך.",
    },
    video: { mode: "storyboard_only", note: "לא מחובר ספק וידאו — מוכנים תסריט ו-storyboard. הסרטון עצמו נוצר על ידך או בסטודיו הווידאו, ומסומן כאנימציה סינתטית." },
    calendar,
    provenance: { productId: c.id, fingerprint: c.fingerprint, fields: ["title", "description", "price", "category", "image", "brand"].filter((f) => c[f]) },
  };
  return plan;
}

// ── measurement ─────────────────────────────────────────────────────────────
/**
 * Real clicks for the creator's products. `detailed` (Starter+) adds the
 * breakdown by channel and by post (from the tracking link's src).
 */
export function clickStats(clicks = [], productIds = [], { detailed = false } = {}) {
  const ids = new Set(productIds.map(String));
  const mine = (clicks || []).filter((k) => k && ids.has(String(k.productId)) && (!k.type || k.type === "outbound_click" || k.type === "click"));
  const byProduct = {};
  for (const k of mine) byProduct[k.productId] = (byProduct[k.productId] || 0) + 1;
  const out = { total: mine.length, byProduct, detailed: Boolean(detailed) };
  if (detailed) {
    const byChannel = {};
    const byPost = {};
    for (const k of mine) {
      const src = String(k.source || "unknown");
      const [channel, post] = src.includes(".") ? [src.slice(0, src.indexOf(".")), src.slice(src.indexOf(".") + 1)] : [src, null];
      byChannel[channel] = (byChannel[channel] || 0) + 1;
      if (post) byPost[post] = (byPost[post] || 0) + 1;
    }
    Object.assign(out, { byChannel, byPost });
  }
  return out;
}

// ── export ──────────────────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** A content pack for manual scheduling in any tool: CSV (Excel-friendly UTF-8) or JSON. */
export function exportContentPack(plan, format = "csv") {
  if (format === "json") return { filename: `likelink-${plan.productId}-${plan.id}.json`, mime: "application/json", content: JSON.stringify(plan, null, 2) };
  const head = ["date", "time", "channel", "format", "caption", "link", "hashtags", "disclosure", "ai_label", "post_id"];
  const rows = plan.calendar.map((p) => [p.date, p.suggestedTime, p.channelLabel, p.format, p.caption, p.link, p.hashtags.join(" "), p.disclosure, p.aiLabel, p.postId]);
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return { filename: `likelink-${plan.productId}-${plan.id}.csv`, mime: "text/csv", content: `${String.fromCharCode(0xfeff)}${csv}` };
}

// ── capabilities (self-extension; Luna Core unchanged) ──────────────────────
if (!CAPABILITIES.analyze_distribution_fit) {
  registerCapability("analyze_distribution_fit", {
    he: "התאמת המוצר לערוצי הפצה",
    reason: "איזה ערוץ מתאים למוצר — משדות המוצר וקליקים אמיתיים בלבד, בלי תחזית",
    // Read-only, but started by the creator from the studio (never an autonomous Luna step).
    risk: RISK.LOW, permission: PERMISSION.OWNER, executor: EXECUTOR.INTERNAL, isNew: true,
    satisfies: ["distribution_fit_known"],
    preconditions: (p) => [{ ok: Boolean(p?.title), he: "למוצר יש כותרת" }],
    expected: "רשימת ערוצים עם סיבה לכל התאמה, בלי מספרי צפיות",
    verification: "recompute_from_fields",
    evidence: "שדות המוצר + marketplace:clicks",
    recovery: "חישוב בלבד — אין מה לשחזר",
    selfTest: () => analyzeDistributionFit({ id: "t", title: "בדיקה", saleModel: "affiliate", status: "approved" }).ready === true,
  });
}
if (!CAPABILITIES.generate_distribution_plan) {
  registerCapability("generate_distribution_plan", {
    he: "תוכנית הפצה (טיוטה) עם לינק מעקב לכל פוסט",
    reason: "הוקים, תסריטים, כיתובים, האשטגים, storyboard ולוח זמנים — מהשדות האמיתיים, עם גילוי נאות",
    // Counts against the plan's monthly quota, so the creator starts it — never an autonomous step.
    risk: RISK.LOW, permission: PERMISSION.OWNER, executor: EXECUTOR.INTERNAL, isNew: true,
    satisfies: ["distribution_planned"],
    preconditions: (p) => [{ ok: Boolean(p?.isPublic), he: "המוצר ציבורי" }],
    expected: "טיוטה שמורה ב-distribution:plans:<scope> — בלי פרסום",
    verification: "reread_distribution_plan",
    evidence: "התוכנית נקראה חזרה עם אותו מזהה וטביעת אצבע",
    recovery: "טיוטה בלבד — אפשר ליצור מחדש",
    selfTest: () => {
      const plan = generateDistributionPlan({ id: "t", title: "בדיקה", description: "משפט ראשון על המוצר. משפט שני על המוצר.", saleModel: "affiliate", affiliateUrl: "https://example.com/x", status: "approved", origin: "https://likelink2.vercel.app", fingerprint: "f" });
      return plan.ok && plan.calendar.every((p) => p.disclosure && p.state === POST_STATE.DRAFT) && !FORBIDDEN_CLAIMS.test(JSON.stringify(plan));
    },
  });
}
if (!CAPABILITIES.publish_distribution_post) {
  registerCapability("publish_distribution_post", {
    he: "פרסום פוסט מתוכנית ההפצה",
    reason: "פרסום אמיתי דורש ערוץ מחובר ומאומת ואישור מפורש של הבעלים לכל פוסט",
    native: false, adapter: "official_social_api",
    risk: RISK.MEDIUM, permission: PERMISSION.OWNER_EXPLICIT, executor: EXECUTOR.EXTERNAL,
    satisfies: ["distribution_published"],
    preconditions: () => [{ ok: false, he: "אין ערוץ רשתות מחובר ומאומת" }],
    expected: "מזהה פוסט מהרשת עצמה — בלעדיו הפוסט לא נחשב כמפורסם",
    verification: "provider_post_id",
    evidence: "מזהה הפוסט שהרשת החזירה",
    recovery: "אין פרסום בלי מזהה מהרשת; פוסט שנכשל נשאר טיוטה",
  });
}
