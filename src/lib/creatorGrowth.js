/**
 * Device-local creator growth records. These are real user-created records;
 * they are never seeded and never claim cross-device delivery or publication.
 */
import { publicUrl, withAttribution, utmFor, buildShareLink } from "./acquisition.js";

const PROMOTIONS_KEY = "ll:creator-promotions:v1";
const MAX_PROMOTIONS = 30;

export const PROMOTION_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  READY_TO_SHARE: "READY_TO_SHARE",
  APPROVED: "APPROVED",
});

export const PROMOTION_GOALS = Object.freeze([
  { id: "profile", he: "לגדול את הפרופיל", en: "Grow your profile" },
  { id: "collaboration", he: "למצוא שיתופי מותג", en: "Find brand collaborations" },
  { id: "product", he: "לקדם מוצר", en: "Promote a product" },
  { id: "ugc", he: "להפיץ UGC", en: "Distribute UGC" },
  { id: "traffic", he: "להביא תנועה", en: "Generate traffic" },
  { id: "leads", he: "ליצור לידים", en: "Generate leads" },
]);

function store() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
function read() {
  try { const value = JSON.parse(store()?.getItem(PROMOTIONS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function write(entries) { try { store()?.setItem(PROMOTIONS_KEY, JSON.stringify(entries.slice(-MAX_PROMOTIONS))); return true; } catch { return false; } }
function clean(value, max = 600) { return String(value ?? "").trim().slice(0, max); }
function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function actorId(actor) { return clean(actor?.id, 120); }

export function getPromotionGoal(id) { return PROMOTION_GOALS.find((goal) => goal.id === id) || PROMOTION_GOALS[0]; }

export function buildPromotionLink({ product, marketer, goal = "profile", channel = "copy" } = {}) {
  if (!product?.id) return null;
  const ref = clean(marketer?.slug || marketer?.id, 120);
  return withAttribution(publicUrl(`/p/${encodeURIComponent(product.id)}`), {
    ...utmFor({ source: `creator_${channel}`, medium: "social", campaign: "creator_self_promotion", content: goal }),
    ...(ref ? { ref } : {}),
    product_id: clean(product.id, 120),
  });
}

export function buildPromotionMessage({ product, goalId = "profile", copy = "", cta = "" } = {}) {
  const title = clean(product?.title || product?.name, 120);
  const goal = getPromotionGoal(goalId);
  const hook = clean(copy, 600) || (title ? `${title} — בואו לבדוק את הפרטים` : "כדאי לבדוק את התוכן הזה");
  const action = clean(cta, 180) || (goal.id === "product" ? "לבדיקת המוצר" : "לפתיחת התוכן");
  return `${hook}\n\n${action}`;
}

export function savePromotionDraft({ marketer, product, goalId = "profile", channels = [], copy = "", cta = "" } = {}) {
  const creator = actorId(marketer);
  if (!creator || !product?.id) return null;
  const draft = {
    id: makeId("promo"), creatorId: creator, productId: clean(product.id, 120),
    productTitle: clean(product.title || product.name, 160), goalId: getPromotionGoal(goalId).id,
    channels: [...new Set(channels.map((c) => clean(c, 30)).filter(Boolean))].slice(0, 5),
    copy: clean(copy, 1200), cta: clean(cta, 240), canonicalUrl: buildPromotionLink({ product, marketer, goal: goalId, channel: channels[0] || "copy" }),
    status: PROMOTION_STATUS.DRAFT, createdAt: Date.now(), updatedAt: Date.now(),
  };
  write([...read().filter((entry) => entry?.creatorId !== creator), draft]);
  return draft;
}

export function getPromotionDrafts(creatorIdValue) {
  const creator = clean(creatorIdValue, 120);
  return creator ? read().filter((entry) => entry?.creatorId === creator).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
}

export function savePromotionStatus(draft, status) {
  if (!draft?.id || !Object.values(PROMOTION_STATUS).includes(status)) return null;
  const entries = read(); const index = entries.findIndex((entry) => entry.id === draft.id && entry.creatorId === draft.creatorId);
  if (index < 0) return null;
  entries[index] = { ...draft, status, updatedAt: Date.now() }; write(entries); return entries[index];
}

export function buildPromotionShareLink(draft, channel = "copy") {
  if (!draft?.canonicalUrl) return null;
  const url = withAttribution(draft.canonicalUrl, utmFor({ source: `creator_${clean(channel, 30)}`, medium: "social", campaign: "creator_self_promotion", content: draft.goalId }));
  if (channel === "copy" || channel === "native") return url;
  return buildShareLink(channel, url, buildPromotionMessage({ product: { title: draft.productTitle }, goalId: draft.goalId, copy: draft.copy, cta: draft.cta }));
}
