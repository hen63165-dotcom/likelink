// Native agentic campaign building and creator recruitment — LikeLink's own
// code, no AI provider.
//
// build_campaign   goal text + REAL catalog product ids → a DRAFT campaign:
//                  products, budget (only if stated), timeline (only if
//                  stated), and creators matched by the overlap of REAL
//                  topic fields (categories / tags / category / niche) on
//                  their profile. No such field → "insufficient data" —
//                  never an invented or guessed match.
// recruit_creator  a product → creators whose real topics overlap it + a
//                  Hebrew invitation DRAFT. Nothing is ever sent by LikeLink:
//                  deliverInvitation() refuses without explicit owner
//                  permission, and even then only hands the text back for
//                  the owner to send by hand (no network, no notification).
import { stableHash, canonicalProduct, productPageUrl, creatorPageUrl } from "./surfaces.js";
import { compileIntent } from "./intent.js";
import { PERMISSION } from "./capabilities.js";

const toArr = (v) => (Array.isArray(v) ? v : []);
const clean = (s) => String(s ?? "").trim();
const norm = (s) => clean(s).toLowerCase();

/** "תקציב 500 ₪", "₪1,200", "budget 300", "$200" → { amount, currency } | null (only when stated). */
export function parseBudget(text) {
  const t = String(text || "");
  const m = t.match(/(?:תקציב|budget)\s*(?:של\s*)?[:\-]?\s*(₪|\$|€)?\s*([\d.,]+)\s*(₪|ש"ח|שח|ils|nis|\$|usd|€|eur)?/i)
    || t.match(/(₪|\$|€)\s*([\d.,]+)/)
    || t.match(/([\d.,]+)\s*(₪|ש"ח|שח)/);
  if (!m) return null;
  const num = m.find((x, i) => i > 0 && /^[\d.,]+$/.test(String(x || "")));
  const amount = Number(String(num || "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const sym = norm(m.slice(1).find((x) => x && !/^[\d.,]+$/.test(x)) || "₪");
  const currency = sym === "$" || sym === "usd" ? "USD" : sym === "€" || sym === "eur" ? "EUR" : "ILS";
  return { amount, currency, source: "goal_text" };
}

/** "שבוע", "שבועיים", "חודש", "10 ימים", "2 weeks", "a month" → { days, endsAt } | null. */
export function parseTimeline(text, now = Date.now()) {
  const t = String(text || "");
  let days = null;
  const n = t.match(/(\d+)\s*(ימים|יום|days?|שבועות|weeks?|חודשים|months?)/i);
  if (n) {
    const k = Number(n[1]);
    const unit = n[2].toLowerCase();
    days = /שבוע|week/.test(unit) ? k * 7 : /חודש|month/.test(unit) ? k * 30 : k;
  } else if (/שבועיים/.test(t)) days = 14;
  else if (/שבוע|a week|one week/i.test(t)) days = 7;
  else if (/חודשיים/.test(t)) days = 60;
  else if (/חודש|a month|one month/i.test(t)) days = 30;
  if (!days) return null;
  return { days, startsAt: now, endsAt: now + days * 86400000, source: "goal_text" };
}

/** A creator's topics — real profile fields only (never inferred). */
export function creatorTopics(m) {
  const out = [];
  for (const f of ["categories", "tags", "category", "niche", "topics"]) {
    const v = m?.[f];
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,،|]/) : [];
    for (const x of list) if (norm(x)) out.push(norm(x));
  }
  return [...new Set(out)];
}

/** A product's topics — its real category and tags. */
export function productTopics(p) {
  return [...new Set([p?.category, ...toArr(p?.tags)].map(norm).filter(Boolean))];
}

/** Creators whose real topics overlap the wanted topics. */
export function matchCreators({ topics = [], marketers = [], excludeIds = [], limit = 10 } = {}) {
  const want = new Set(toArr(topics).map(norm).filter(Boolean));
  const pool = toArr(marketers).filter((m) => m && m.id && !excludeIds.map(String).includes(String(m.id)));
  const withTopics = pool.filter((m) => creatorTopics(m).length);
  if (!want.size) return { status: "insufficient_data", matches: [], reason: "למוצרים אין קטגוריה או תגיות — אין על מה להתאים" };
  if (!withTopics.length) {
    return { status: "insufficient_data", matches: [], reason: "לאף יוצרת אין תחומי תוכן בפרופיל (categories/tags) — אין נתונים אמיתיים להתאמה, ולונה לא מנחשת" };
  }
  const matches = withTopics
    .map((m) => ({ id: String(m.id), name: clean(m.name), slug: clean(m.slug || m.id), overlap: creatorTopics(m).filter((t) => want.has(t)) }))
    .filter((m) => m.overlap.length)
    .sort((a, b) => b.overlap.length - a.overlap.length || a.name.localeCompare(b.name))
    .slice(0, limit);
  return matches.length
    ? { status: "matched", matches, reason: `${matches.length} יוצרות עם תחומי תוכן חופפים` }
    : { status: "no_overlap", matches: [], reason: `לאף אחת מ-${withTopics.length} היוצרות עם תחומים בפרופיל אין חפיפה לקטגוריות המוצרים` };
}

/**
 * Build a campaign DRAFT from a goal and real product ids.
 * Unknown ids are reported, never invented. The entitlement limits how many
 * products one campaign carries (the rest are listed as over-plan).
 */
export function buildCampaign({ goal, productIds = [], products = [], marketers = [], ownerIds = null, entitlement = null, now = Date.now(), origin } = {}) {
  const text = clean(goal).slice(0, 300);
  const byId = new Map(toArr(products).filter((p) => p && p.id).map((p) => [String(p.id), p]));
  const wanted = [...new Set(toArr(productIds).map(String))];
  const unknown = wanted.filter((id) => !byId.has(id));
  let found = wanted.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const notOwned = ownerIds ? found.filter((p) => !ownerIds.includes(String(p.marketerId))).map((p) => String(p.id)) : [];
  if (ownerIds) found = found.filter((p) => ownerIds.includes(String(p.marketerId)));
  const limit = entitlement?.capabilities?.maxProductsPerRun;
  const overPlan = Number.isFinite(limit) ? found.slice(limit).map((p) => String(p.id)) : [];
  if (Number.isFinite(limit)) found = found.slice(0, limit);
  const intent = compileIntent(text || "קמפיין", {});
  const topics = [...new Set(found.flatMap(productTopics))];
  const productList = found.map((p) => {
    const marketer = toArr(marketers).find((m) => m && String(m.id) === String(p.marketerId)) || null;
    const c = canonicalProduct(p, marketer, origin);
    return { id: c.id, title: c.title, price: c.price, currency: c.currency, category: c.category || null, page: productPageUrl(c), saleModel: c.saleModel };
  });
  const campaign = {
    status: "DRAFT",
    goal: text,
    intent: { outcomes: intent.outcomes, desiredOutcome: intent.desiredOutcome, understood: intent.understood },
    products: productList,
    unknownProductIds: unknown,
    notOwnedProductIds: notOwned,
    overPlanProductIds: overPlan,
    budget: parseBudget(text) || { amount: null, currency: null, source: "not_stated" },
    timeline: parseTimeline(text, now) || { days: null, source: "not_stated" },
    creators: matchCreators({ topics, marketers, excludeIds: ownerIds || [] }),
    guarantees: ["טיוטה בלבד — שום תשלום לא מופעל ושום הודעה לא נשלחת", "תקציב וציר זמן רק אם נאמרו במטרה"],
    createdAt: now,
  };
  campaign.fingerprint = stableHash({ goal: campaign.goal, products: productList.map((p) => p.id), budget: campaign.budget, days: campaign.timeline.days });
  campaign.id = `cmp_${campaign.fingerprint}`;
  return campaign;
}

/** A Hebrew invitation DRAFT from real product + creator fields. */
export function draftInvitation({ product, creator, inviter, origin } = {}) {
  const c = canonicalProduct(product || {}, inviter || null, origin);
  const lines = [
    `היי ${clean(creator?.name) || "יוצרת"},`,
    `אני ${clean(inviter?.name) || "יוצרת ב-LikeLink"} מ-LikeLink, ונראה לי ש"${c.title}" מתאים לקהל שלך${creator?.overlap?.length ? ` (${creator.overlap.join(", ")})` : ""}.`,
    c.price ? `המחיר בקטלוג: ₪${c.price}.` : "",
    Number(product?.commission) > 0 ? `העמלה שמוגדרת למוצר: ₪${Number(product.commission)}.` : "",
    `אפשר לראות את המוצר כאן: ${productPageUrl(c)}`,
    c.creator ? `והסטודיו שלי: ${creatorPageUrl(c)}` : "",
    "אם זה מעניין אותך, אשמח לדבר.",
  ].filter(Boolean);
  return { status: "DRAFT", to: creator ? { id: creator.id, name: creator.name, profile: creator.slug } : null, text: lines.join("\n") };
}

/** recruit_creator: candidates + drafts. Never sends. */
export function recruitCreators({ product, marketers = [], inviterIds = [], origin } = {}) {
  if (!product?.id) return { ok: false, error: "product_not_found" };
  const inviter = toArr(marketers).find((m) => m && String(m.id) === String(product.marketerId)) || null;
  const candidates = matchCreators({ topics: productTopics(product), marketers, excludeIds: [...inviterIds, String(product.marketerId || "")] });
  return {
    ok: true,
    productId: String(product.id),
    candidates,
    drafts: candidates.matches.map((m) => draftInvitation({ product, creator: m, inviter, origin })),
    delivery: { mode: "owner_only", he: "לונה לא שולחת הזמנות — הבעלים מעתיקה ושולחת בעצמה" },
  };
}

export class OwnerExplicitRequiredError extends Error {
  constructor() { super("owner_explicit_required"); this.code = "owner_explicit_required"; }
}

/**
 * The ONLY path to "sending" an invitation, and it never sends: without
 * explicit owner permission it throws; with it, it returns the text for the
 * owner to deliver by hand. No network, no notification, no queue.
 */
export function deliverInvitation(draft, { permission } = {}) {
  if (permission !== PERMISSION.OWNER_EXPLICIT) throw new OwnerExplicitRequiredError();
  if (!draft?.text) throw new Error("invitation_draft_missing");
  return { status: "ready_for_owner", channel: "manual", text: draft.text, sent: false };
}
