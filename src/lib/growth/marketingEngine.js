// LikeLink Autonomous Marketing Engine: the pure, isomorphic core. It does not
// call any AI provider and does no I/O. The server runner
// (src/lib/cloud/marketingEngineRunner.js) does the reads, writes and sends.
//
//   INTENT → OPPORTUNITY → CREATIVE → VIDEO → DISTRIBUTION → TRACKING → PROOF
//          → MEASUREMENT → LEARNING → NEXT ACTION
//
// There are two scopes, and both use this same engine:
//   platform          LikeLink Growth Mode. It markets LikeLink itself (real
//                     pages: free studio, reels, discover) and the promotable
//                     public catalog.
//   studio:<id>       Studio Growth Mode. It markets only that studio's own
//                     promotable products, within its verified plan
//                     (entitlement → quota marketingCycles + ENGINE_LIMITS).
//
// The truth rules (enforced here and pinned by tests/marketingEngine.test.mjs):
//   - A product is marketed only if it is promotable (own affiliate link and a
//     real photo). Anything else becomes a REPAIR_DATA next action.
//   - A LikeLink render is SYNTHETIC (ugc_style = SYNTHETIC_UGC_STYLE, never
//     REAL_UGC). Every caption with video says it is computer animation.
//   - A distribution is PUBLISHED only with a provider/internal post id that
//     was read back. An unconnected channel becomes a tracked MANUAL_SHARE
//     item, with the exact missing connection.
//   - Learning uses only recorded events that carry the creative id. Below
//     MIN_EVIDENCE landings it reports INSUFFICIENT_EVIDENCE and never names a
//     winner.
//   - There is no paid spend. Budget caps default to 0, and a paid action is
//     refused unless the owner set a budget for it.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import {
  buildCreativeMatrix, buildHookSet, selectCreatives, MIN_EVIDENCE, HOOK_FORBIDDEN, stableId, FORMATS,
} from "./likeloop.js";
import { AFFILIATE_DISCLOSURE_SHORT } from "../discovery/surfaces.js";

export const ENGINE_VERSION = 1;
export const ENGINE_STAGES = Object.freeze(["INTENT", "OPPORTUNITY", "CREATIVE", "VIDEO", "DISTRIBUTION", "TRACKING", "PROOF", "MEASUREMENT", "LEARNING", "NEXT_ACTION"]);
export const ENGINE_QUOTA_KEY = "marketingCycles";
export const VIDEO_DISCLOSURE = "🎬 הסרטון: אנימציה ממוחשבת, לא צולם";
export const AD_TAG = "#פרסומת";

const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) => String(v ?? "").trim();

/* ─────────────────────────────────────────────────────────────── scopes */

export const PLATFORM_SCOPE = "platform";
export const studioScope = (marketerId) => `studio:${String(marketerId)}`;
export function parseScope(scopeKey) {
  const s = text(scopeKey);
  if (s === PLATFORM_SCOPE) return { kind: "platform", marketerId: null, key: s };
  const m = s.match(/^studio:([A-Za-z0-9_.:-]{1,80})$/);
  return m ? { kind: "studio", marketerId: m[1], key: s } : null;
}

export const KEYS = Object.freeze({
  state: (scopeKey) => `marketing:engine:${scopeKey}`,
  activity: (scopeKey) => `marketing:activity:${scopeKey}`,
  campaigns: (scopeKey) => `marketing:campaigns:${scopeKey}`,
  index: "marketing:index",
  deadletter: "marketing:deadletter",
});

/**
 * Per-plan engine limits, applied on top of the monthly quota from plans.js.
 * "owner" is the platform (LikeLink Growth Mode). It is unlimited by quota but
 * still has safety caps.
 */
export const ENGINE_LIMITS = Object.freeze({
  free: { objectsPerCycle: 0, feedPostsPerDay: 0, autoChannels: false },
  starter: { objectsPerCycle: 2, feedPostsPerDay: 1, autoChannels: false },
  professional: { objectsPerCycle: 4, feedPostsPerDay: 2, autoChannels: true },
  owner: { objectsPerCycle: 4, feedPostsPerDay: 3, autoChannels: true },
});

/** What this entitlement lets the engine do (null quota = unlimited owner). */
export function engineLimits(entitlement) {
  const plan = entitlement?.plan === "owner" ? "owner" : ENGINE_LIMITS[entitlement?.plan] ? entitlement.plan : "free";
  const quota = entitlement?.capabilities?.quotas ? entitlement.capabilities.quotas[ENGINE_QUOTA_KEY] : 0;
  const lim = ENGINE_LIMITS[plan];
  return { plan, monthlyCycles: quota === null ? null : Number(quota) || 0, ...lim, included: quota === null || Number(quota) > 0 };
}

/* ─────────────────────────────────────────────── LikeLink itself (platform) */

/**
 * The LikeLink pages the platform scope markets. Every hook is a question or
 * a plain description of what the page really offers. There are no numbers,
 * no popularity claims and no promises.
 */
export const PLATFORM_OBJECTS = Object.freeze([
  {
    id: "ll-studio", path: "/sell", title: "סטודיו חינמי ליוצרות ב-LikeLink",
    hooks: [
      { type: "problem", text: "ממליצה על מוצרים, והלינקים מפוזרים בכל מקום?" },
      { type: "question", text: "רוצה עמוד יוצרת משלך עם לינקים למעקב?" },
      { type: "story", text: "המלצות בכל מקום. ואז עמוד אחד שמרכז הכול." },
    ],
    body: "סטודיו חינמי: עמוד יוצרת, עמוד לכל מוצר, לינק מעקב וגילוי נאות מובנה.",
    cta: "פתיחת סטודיו בחינם ←",
  },
  {
    id: "ll-reels", path: "/reels", title: "רילס מוצרים ב-LikeLink",
    hooks: [
      { type: "curiosity", text: "מוצרים בסרטונים קצרים. מה תמצאי שם?" },
      { type: "question", text: "מחפשת השראה למוצר הבא בלי לחפש שעות?" },
    ],
    body: "סרטוני מוצר קצרים. כל סרטון מסומן אם הוא אנימציה ממוחשבת.",
    cta: "לצפייה ברילס ←",
  },
  {
    id: "ll-discover", path: "/discover", title: "גילוי מוצרים ב-LikeLink",
    hooks: [
      { type: "gift", text: "מחפשת רעיון למתנה?" },
      { type: "question", text: "מה יוצרות ממליצות עכשיו?" },
    ],
    body: "מוצרים שיוצרות בחרו, לפי קטגוריות. המחירים הם מחירי קטלוג.",
    cta: "לגלות מוצרים ←",
  },
]);

/* ─────────────────────────────────────────────────────────── opportunity */

/**
 * Pick what to market in this cycle.
 * - Products: promotable only, from the scope (a studio's own products only),
 *   ranked by the opportunity score (likeloop:scores), then by the oldest
 *   time marketed. Something marketed within the cooldown waits.
 * - Platform objects: one per cycle in the platform scope, rotating.
 * @returns {{selected: object[], repairs: object[], cooling: string[]}}
 */
export function selectOpportunities({ scope, products = [], truthRows = [], scores = {}, history = [], limit = 2, now = Date.now(), cooldownMs = 20 * 3_600_000 }) {
  const sc = typeof scope === "string" ? parseScope(scope) : scope;
  if (!sc) return { selected: [], repairs: [], cooling: [] };
  const lastAt = new Map();
  for (const h of arr(history)) { const t = Date.parse(h?.at) || 0; if (t > (lastAt.get(h?.objectId) || 0)) lastAt.set(h.objectId, t); }
  const truthBy = new Map(arr(truthRows).map((r) => [r.productId, r]));
  const own = arr(products).filter((p) => p && (sc.kind === "platform" || String(p.marketerId) === sc.marketerId));
  const repairs = [], candidates = [], cooling = [];
  for (const p of own) {
    const t = truthBy.get(p.id);
    if (!t) continue; // not public
    if (t.truthStatus === "NOT_PUBLIC") continue;
    if (t.truthStatus !== "PROMOTABLE") { repairs.push({ objectId: p.id, kind: "product", action: "REPAIR_DATA", repairs: arr(t.repair) }); continue; }
    const since = now - (lastAt.get(p.id) || 0);
    if (since < cooldownMs) { cooling.push(p.id); continue; }
    candidates.push({ kind: "product", objectId: p.id, product: p, score: Number(scores?.[p.id]?.opportunity) || 0, lastAt: lastAt.get(p.id) || 0 });
  }
  candidates.sort((a, b) => b.score - a.score || a.lastAt - b.lastAt || String(a.objectId).localeCompare(String(b.objectId)));
  const selected = [];
  if (sc.kind === "platform") {
    const plat = PLATFORM_OBJECTS.map((o) => ({ o, last: lastAt.get(o.id) || 0 })).filter((x) => now - x.last >= cooldownMs).sort((a, b) => a.last - b.last)[0];
    if (plat) selected.push({ kind: "platform", objectId: plat.o.id, object: plat.o, score: null, lastAt: plat.last });
  }
  for (const c of candidates) { if (selected.length >= limit) break; selected.push(c); }
  return { selected: selected.slice(0, Math.max(0, limit)), repairs, cooling };
}

/* ─────────────────────────────────────────────────────────────── creative */

/** The platform object's creative matrix (hook × the page's CTA). */
export function platformMatrix(o) {
  return arr(o.hooks).filter((h) => !HOOK_FORBIDDEN.test(h.text) && h.text.length <= 70)
    .map((h) => ({ creativeId: stableId("mk", [o.id, h.type]), objectId: o.id, productId: null, hookType: h.type, hook: h.text, opening: "question_card", format: "card", mediaType: "NO_VIDEO", cta: "page", ctaText: o.cta }));
}

/** The tracked URL of one creative on one channel. */
export function trackedUrl(creative, { channel, scopeKey, path, origin = PRODUCTION_ORIGIN }) {
  const q = new URLSearchParams({
    utm_source: channel, utm_medium: channel === "site_feed" ? "feed" : "social",
    utm_campaign: `engine_${scopeKey === PLATFORM_SCOPE ? "platform" : "studio"}`, utm_content: creative.hookType, cid: creative.creativeId,
  });
  return `${origin}${path}?${q}`;
}

const priceLabel = (p) => (Number(p?.price) > 0 ? `₪${Number.isInteger(Number(p.price)) ? Number(p.price) : Number(p.price).toFixed(2)} (מחיר בקטלוג)` : "");

/**
 * The caption. It is built only from real fields. Every caption carries the
 * ad tag; an affiliate product adds its disclosure, and a video adds the
 * animation disclosure.
 */
export function buildCaption({ creative, opportunity, link, video = null }) {
  const lines = [creative.hook];
  if (opportunity.kind === "product") {
    const p = opportunity.product;
    lines.push(text(p.title).slice(0, 90));
    const price = priceLabel(p);
    if (price) lines.push(price);
  } else {
    lines.push(opportunity.object.body);
  }
  lines.push(`${creative.ctaText} ${link}`);
  if (video) lines.push(VIDEO_DISCLOSURE);
  lines.push(opportunity.kind === "product" ? `${AD_TAG} · ${AFFILIATE_DISCLOSURE_SHORT}` : `${AD_TAG} · פרסום עצמי של LikeLink`);
  return lines.filter(Boolean).join("\n");
}

/**
 * Choose the creative for one opportunity. selectCreatives explores untried
 * hook types first and exploits only with ≥ MIN_EVIDENCE landings, so
 * learning changes the pick only when real evidence exists.
 */
export function chooseCreative(opportunity, { learning = { creatives: {} }, done = new Set(), now = Date.now(), seed = 1 } = {}) {
  const matrix = opportunity.kind === "product"
    ? buildCreativeMatrix(opportunity.product, { hooks: buildHookSet(opportunity.product, { now }) })
    : platformMatrix(opportunity.object);
  // Exploration starts at a different hook per object and day, so two products
  // in one cycle do not open with the same line. Evidence (exploit) is unaffected.
  let h = 2166136261; // FNV-1a
  for (const ch of `${opportunity.objectId}:${new Date(now).toISOString().slice(0, 10)}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const types = [...new Set(matrix.map((c) => c.hookType))];
  const order = types.map((_, i) => types[(i + h) % types.length]);
  const rotated = order.flatMap((t) => matrix.filter((c) => c.hookType === t));
  const [pick] = selectCreatives(rotated, learning, { limit: 1, done, seed });
  return pick ? { ...pick, matrixSize: matrix.length } : null;
}

/* ─────────────────────────────────────────────────────────────────── video */

const STYLE_FOR_FORMAT = (format) => FORMATS[format]?.styles || [];

/**
 * The best existing LikeLink render for a product creative. A render is
 * always SYNTHETIC (never REAL_UGC). Returns null if no playable render exists.
 */
export function pickVideo(productId, creative, videos = []) {
  const own = arr(videos).filter((v) => v && v.videoUrl && /^likelink_/.test(text(v.source)) && v.productTags?.[0]?.productId === productId && v.public !== false);
  if (!own.length) return null;
  const wanted = STYLE_FOR_FORMAT(creative?.format);
  const v = own.find((x) => wanted.includes(x.style)) || own[own.length - 1];
  return {
    id: v.id, videoUrl: v.videoUrl, posterUrl: v.posterUrl || v.thumbnail || null, style: v.style || null,
    truth: "SYNTHETIC_ANIMATION", creativeClass: v.style === "ugc_style" ? "SYNTHETIC_UGC_STYLE" : "ANIMATED_PRODUCT_CREATIVE", synthetic: true,
  };
}

/* ──────────────────────────────────────────────────────────── distribution */

/** Channels the engine knows. "internal" ones are LikeLink's own surfaces. */
export const ENGINE_CHANNELS = Object.freeze([
  { id: "site_feed", internal: true, he: "הפיד הציבורי של LikeLink" },
  { id: "telegram", internal: false, he: "Telegram", connect: "חיבור בוט Telegram לערוץ ציבורי (סטודיו ← טייס אוטומטי ← ערוצים)" },
  { id: "instagram", internal: false, he: "Instagram", connect: "חיבור Instagram Business לפרסום אוטומטי (Graph API)" },
  { id: "whatsapp", internal: false, he: "WhatsApp", connect: "ל-WhatsApp אין API לפרסום סטטוס/קבוצה. השיתוף נעשה ידנית מהלינק המוכן" },
  { id: "facebook", internal: false, he: "Facebook", connect: "חיבור עמוד Facebook (Page token)" },
  { id: "tiktok", internal: false, he: "TikTok", connect: "חיבור TikTok (Content Posting API)" },
]);

/**
 * Decide, per channel, what happens with one creative. It never sends anything.
 * @param {object} ctx { scopeKind, connected: {telegram:boolean, instagram:boolean}, autoChannels, settings }
 * @returns {Array<{channel, mode: "PUBLISH_INTERNAL"|"PUBLISH_PROVIDER"|"APPROVAL_REQUIRED"|"MANUAL_SHARE", missingConnection?}>}
 */
export function routeDistribution(ctx = {}) {
  const enabled = ctx.settings?.channels || {};
  const out = [];
  for (const ch of ENGINE_CHANNELS) {
    if (enabled[ch.id] === false) continue;
    if (ch.internal) { out.push({ channel: ch.id, mode: "PUBLISH_INTERNAL" }); continue; }
    const connected = Boolean(ctx.connected?.[ch.id]);
    if (ch.id === "telegram" && connected) {
      // Standing permission: the platform always has it. A studio has it only
      // if it is on a plan with autoChannels and the owner switched on
      // autoPublish.telegram in its own session. Otherwise the post waits for
      // per-post approval.
      const allowed = ctx.scopeKind === "platform" || (ctx.autoChannels && ctx.settings?.autoPublish?.telegram === true);
      out.push({ channel: ch.id, mode: allowed ? "PUBLISH_PROVIDER" : "APPROVAL_REQUIRED" });
      continue;
    }
    out.push({ channel: ch.id, mode: "MANUAL_SHARE", missingConnection: ch.connect });
  }
  return out;
}

/** A share link a person can open to post manually (only where the network has one). */
export function manualShareUrl(channel, caption, link) {
  if (channel === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(caption)}`;
  if (channel === "telegram") return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(caption.replace(link, "").trim())}`;
  if (channel === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
  return null; // Instagram/TikTok have no web share intent. Copy the caption and the link.
}

/* ─────────────────────────────────────────────────── measurement + learning */

/**
 * Real events → per-creative evidence. Products: marketplace:clicks views with
 * a cid are landings, and the other click types are outbound. Platform pages:
 * marketplace:funnel "landing" with a cid is a landing, and studio_cta /
 * signup_completed with that cid are outcomes. Only events that carry a known
 * creative id count.
 */
export function measure({ clicks = [], funnel = [], creativeIds = [] }) {
  const ids = new Set(arr(creativeIds));
  const per = {};
  const stat = (cid) => (per[cid] ||= { landings: 0, outbound: 0, signups: 0 });
  for (const e of arr(clicks)) {
    const cid = text(e?.cid);
    if (!cid || !ids.has(cid)) continue;
    if (e.type === "view") stat(cid).landings += 1; else stat(cid).outbound += 1;
  }
  for (const e of arr(funnel)) {
    const cid = text(e?.cid);
    if (!cid || !ids.has(cid)) continue;
    if (e.type === "landing") stat(cid).landings += 1;
    else if (e.type === "studio_cta") stat(cid).outbound += 1;
    else if (e.type === "signup_completed" || e.type === "signup_confirm_sent") stat(cid).signups += 1;
  }
  const landings = Object.values(per).reduce((n, s) => n + s.landings, 0);
  const rate = (s) => (s.landings >= MIN_EVIDENCE ? s.outbound / s.landings : null);
  return {
    status: landings >= MIN_EVIDENCE ? "LEARNING" : "INSUFFICIENT_EVIDENCE",
    minEvidence: MIN_EVIDENCE,
    landings,
    outbound: Object.values(per).reduce((n, s) => n + s.outbound, 0),
    signups: Object.values(per).reduce((n, s) => n + s.signups, 0),
    creatives: Object.fromEntries(Object.entries(per).map(([k, s]) => [k, { ...s, clickRate: rate(s) }])),
    note: "רק אירועים שנרשמו בפועל עם מזהה הקריאייטיב נספרים. אין נתוני רכישה, ולכן לא מדווחות רכישות.",
  };
}

/**
 * The next action per marketed object, from evidence only.
 * Returns { objectId, action, reason } with action ∈
 *   REPAIR_DATA | CREATE_VIDEO | SHARE_MANUAL | MEASURE | EXPLOIT | RETIRE_CREATIVE
 */
export function nextActions({ marketed = [], repairs = [], learning = { creatives: {} }, campaigns = [] }) {
  const out = repairs.map((r) => ({ objectId: r.objectId, action: "REPAIR_DATA", reason: r.repairs.join(" · ") || "חסרים נתוני מוצר" }));
  const byObject = new Map();
  for (const c of arr(campaigns)) { if (!byObject.has(c.objectId)) byObject.set(c.objectId, []); byObject.get(c.objectId).push(c); }
  for (const m of marketed) {
    const items = byObject.get(m.objectId) || [];
    const cids = [...new Set(items.map((x) => x.creativeId))];
    const evid = cids.map((cid) => ({ cid, s: learning.creatives?.[cid] })).filter((x) => x.s && x.s.landings >= MIN_EVIDENCE);
    if (m.kind === "product" && !m.video) { out.push({ objectId: m.objectId, action: "CREATE_VIDEO", reason: "אין עדיין סרטון מאומת למוצר. בקשת רינדור נשלחה למנוע הרילס" }); continue; }
    if (evid.length >= 2) {
      evid.sort((a, b) => b.s.clickRate - a.s.clickRate);
      out.push({ objectId: m.objectId, action: "EXPLOIT", creativeId: evid[0].cid, reason: `לקריאייטיב ${evid[0].cid} יש ${Math.round(evid[0].s.clickRate * 100)}% הקלקה מתוך ${evid[0].s.landings} כניסות` });
      const worst = evid[evid.length - 1];
      if (worst.s.clickRate < evid[0].s.clickRate / 2) out.push({ objectId: m.objectId, action: "RETIRE_CREATIVE", creativeId: worst.cid, reason: `הקלקה ${Math.round(worst.s.clickRate * 100)}%, פחות מחצי מהמוביל` });
      continue;
    }
    const manual = items.filter((x) => x.status === "MANUAL_SHARE_READY").length;
    out.push(manual
      ? { objectId: m.objectId, action: "SHARE_MANUAL", reason: `${manual} פריטי שיתוף מוכנים עם לינק מעקב. ערוצים חיצוניים לא מחוברים` }
      : { objectId: m.objectId, action: "MEASURE", reason: `פחות מ-${MIN_EVIDENCE} כניסות מתועדות. אין עדיין מסקנה` });
  }
  return out;
}

/** Budget gate. There are no paid actions today; this refuses any action with a cost above the remaining owner budget. */
export function budgetAllows(settings = {}, costIls = 0, spentIls = 0) {
  const cap = Number(settings?.budget?.monthlyCapIls) || 0;
  if (!(costIls > 0)) return { allowed: true };
  return costIls + spentIls <= cap ? { allowed: true } : { allowed: false, error: "budget_exceeded", capIls: cap, spentIls };
}

/** Default engine state for a scope. A studio is disabled until its owner turns it on. */
export function defaultState(scopeKey, now = Date.now()) {
  return {
    scope: scopeKey, version: ENGINE_VERSION, enabled: scopeKey === PLATFORM_SCOPE, paused: false,
    settings: { channels: {}, autoPublish: { telegram: false }, budget: { currency: "ILS", monthlyCapIls: 0, spentIls: 0 } },
    runs: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
}

/** Owner-editable settings, sanitized. Only known fields are kept. */
export function sanitizeSettings(input = {}, prev = {}) {
  const channels = {};
  for (const ch of ENGINE_CHANNELS) if (typeof input?.channels?.[ch.id] === "boolean") channels[ch.id] = input.channels[ch.id];
  const cap = Number(input?.budget?.monthlyCapIls);
  return {
    channels: { ...(prev.channels || {}), ...channels },
    autoPublish: { telegram: typeof input?.autoPublish?.telegram === "boolean" ? input.autoPublish.telegram : Boolean(prev.autoPublish?.telegram) },
    budget: { currency: "ILS", monthlyCapIls: Number.isFinite(cap) && cap >= 0 ? Math.min(cap, 100000) : Number(prev.budget?.monthlyCapIls) || 0, spentIls: Number(prev.budget?.spentIls) || 0 },
  };
}
