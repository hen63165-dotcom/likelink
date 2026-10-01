/**
 * LikeLink plans — the single source of truth.
 * =============================================
 * The pricing page (public/pricing.html, generated), the in-studio "מה כלול
 * במסלול" view, the entitlement resolver (src/lib/discovery/entitlements.js),
 * the server quota checks and the PayPal plan payloads (api/_utils/paypal.js)
 * all read THIS file. tests/plansConsistency.test.mjs fails if any of them
 * disagree.
 *
 *   FREE          ₪0
 *   STARTER       ₪29 / month · ₪290 / year
 *   PROFESSIONAL  ₪79 / month · ₪790 / year
 *   (yearly = one 12-month term, no automatic renewal)
 *   ELITE         ₪149 / month · ₪1490 / year — "בקרוב", waitlist only, NOT
 *                 provisioned at PayPal and not purchasable.
 *
 * Only features that work in production today are promised (status "live").
 * Anything else is "soon" and is never part of a paid plan's promise.
 */

export const FEATURE_STATUS = Object.freeze({ LIVE: "live", SOON: "soon" });

/**
 * What each plan includes. `plans` maps plan id → true | false | a quota
 * object { monthly } | a short Hebrew note. Order = display order.
 */
export const FEATURES = Object.freeze([
  { id: "studio", status: "live", he: "סטודיו לונה: דרכון גילוי לכל מוצר, ציון, מטרות ובדיקת מערכת", plans: { free: true, starter: true, professional: true } },
  { id: "products", status: "live", he: "מוצרים עם עמוד ציבורי ולינק מעקב", quotaKey: "maxProducts", plans: { free: { total: 5 }, starter: { total: 50 }, professional: { total: 300 } } },
  { id: "goal_scope", status: "live", he: "מוצרים לכל מטרה ששולחים ללונה", quotaKey: "maxProductsPerRun", plans: { free: { total: 5 }, starter: { total: 50 }, professional: { total: 300 } } },
  { id: "share_packs", status: "live", he: "חבילות שיתוף מוכנות עם גילוי נאות ולינק מעקב", plans: { free: true, starter: true, professional: true } },
  { id: "click_stats", status: "live", he: "סטטיסטיקת קליקים אמיתית", plans: { free: "סה\"כ קליקים למוצר", starter: "פירוט לפי מקור ולפי פוסט", professional: "פירוט לפי מקור ולפי פוסט" } },
  { id: "distribution_plans", status: "live", he: "תוכניות הפצה (טיוטות): הוקים, תסריטים, כיתובים, האשטגים ולוח זמנים", quotaKey: "distributionPlans", plans: { free: false, starter: { monthly: 20 }, professional: { monthly: 100 } } },
  { id: "content_export", status: "live", he: "ייצוא חבילת תוכן (CSV או JSON) לתזמון ידני בכלי שתבחרי", plans: { free: false, starter: true, professional: true } },
  { id: "campaigns", status: "live", he: "בניית טיוטת קמפיין מהמטרה", quotaKey: "campaigns", plans: { free: false, starter: false, professional: { monthly: 20 } } },
  { id: "recruit", status: "live", he: "טיוטות הזמנה ליוצרות מתאימות (את שולחת בעצמך)", quotaKey: "recruitDrafts", plans: { free: false, starter: false, professional: { monthly: 30 } } },
  { id: "gpt_api", status: "live", he: "חיבור ל-ChatGPT (Custom GPT) ליצירת טיוטות תוכן", quotaKey: "gptDrafts", plans: { free: false, starter: false, professional: { monthly: 300 } } },
  { id: "priority_support", status: "live", he: "מענה בעדיפות לפניות תמיכה במייל", plans: { free: false, starter: false, professional: true } },
  { id: "channel_posting", status: "soon", he: "שליחת פוסט לערוצים מחוברים (Instagram, TikTok ועוד) באישור לכל פוסט", plans: { free: false, starter: false, professional: false } },
  { id: "ai_video", status: "soon", he: "יצירת סרטונים אוטומטית", plans: { free: false, starter: false, professional: false } },
]);

/** Monthly/total quotas per plan, derived from FEATURES (never typed twice). */
function quotasFor(planId) {
  const out = {};
  for (const f of FEATURES) {
    if (!f.quotaKey || f.status !== "live") continue;
    const v = f.plans[planId];
    out[f.quotaKey] = v && typeof v === "object" ? (v.monthly ?? v.total ?? 0) : 0;
  }
  return out;
}

// Mirrors src/lib/billing/cancellation.js (the server applies exactly these terms).
const CANCEL_HE = "ביטול בכל עת מהסטודיו (\"ביטול מנוי\") או מחשבון ה-PayPal, בלי חיובים נוספים. ביטול בתוך 14 יום מהתשלום הראשון מזכה בהחזר, בניכוי דמי ביטול של 5% או ₪100 (הנמוך מביניהם). אחר כך: במסלול חודשי הגישה נשארת עד סוף החודש ששולם; במסלול שנתי — עד סוף החודש הנוכחי, עם החזר יחסי על החודשים המלאים שנותרו.";

export const PLANS = {
  FREE: {
    id: "free",
    name: { he: "חינמי", en: "Free" },
    tagline: { he: "להתחיל ולנסות את הסטודיו", en: "Get started free" },
    price: 0,
    priceYearly: 0,
    period: "month",
    purchasable: false,
    provision: false,
    comingSoon: false,
    platformFee: 15,
    features: { maxProducts: 5, analytics: "basic", apiAccess: false, prioritySupport: false, decisionMemory: false, opportunityEngine: true, distribution: false },
    quotas: quotasFor("free"),
    locked: { he: "תוכניות הפצה, ייצוא תוכן, קמפיינים, גיוס יוצרות וחיבור ל-ChatGPT נעולים — אפשר לשדרג בכל עת" },
    cancel: { he: "אין חיוב במסלול החינמי." },
    cta: { he: "המסלול הנוכחי שלך", en: "Start free" },
  },
  STARTER: {
    id: "starter",
    name: { he: "Starter", en: "Starter" },
    tagline: { he: "ליוצרת שמפרסמת באופן קבוע", en: "For creators who post regularly" },
    price: 29,
    priceYearly: 290,
    period: "month",
    purchasable: true,
    provision: true,
    comingSoon: false,
    platformFee: 15,
    features: { maxProducts: 50, analytics: "sources", apiAccess: false, prioritySupport: false, decisionMemory: false, opportunityEngine: true, distribution: true },
    quotas: quotasFor("starter"),
    locked: { he: "קמפיינים, גיוס יוצרות וחיבור ל-ChatGPT זמינים במסלול Professional" },
    cancel: { he: CANCEL_HE },
    cta: { he: "התחילי את החבילה · מעבר לתשלום מאובטח", en: "Choose Starter" },
  },
  PROFESSIONAL: {
    id: "professional",
    name: { he: "Professional", en: "Professional" },
    tagline: { he: "לעסק פעיל שמנהל קמפיינים", en: "For active businesses" },
    price: 79,
    priceYearly: 790,
    period: "month",
    purchasable: true,
    provision: true,
    comingSoon: false,
    platformFee: 15,
    features: { maxProducts: 300, analytics: "sources", apiAccess: true, prioritySupport: true, decisionMemory: true, opportunityEngine: true, distribution: true },
    quotas: quotasFor("professional"),
    locked: { he: "שליחה אוטומטית לרשתות ויצירת סרטונים — בקרוב, לא כלולים כרגע" },
    cancel: { he: CANCEL_HE },
    cta: { he: "התחילי את החבילה · מעבר לתשלום מאובטח", en: "Choose Professional" },
  },
  ELITE: {
    id: "elite",
    name: { he: "Elite", en: "Elite" },
    tagline: { he: "בקרוב · רשימת המתנה", en: "Coming soon · waitlist" },
    price: 149,
    priceYearly: 1490,
    period: "month",
    // Teaser only: not provisioned at PayPal, not purchasable, promises nothing.
    purchasable: false,
    provision: false,
    comingSoon: true,
    platformFee: 15,
    features: { maxProducts: 300, analytics: "sources", apiAccess: true, prioritySupport: true, decisionMemory: true, opportunityEngine: true, distribution: true },
    quotas: quotasFor("professional"),
    locked: { he: "המסלול עדיין לא זמין לרכישה — אפשר להצטרף לרשימת ההמתנה" },
    cancel: { he: "אין חיוב — רשימת המתנה בלבד." },
    cta: { he: "הצטרפות לרשימת ההמתנה", en: "Join the waitlist" },
  },
};

// Entitlement keys for feature gating
export const ENTITLEMENTS = {
  ANALYTICS: "analytics",
  API_ACCESS: "apiAccess",
  PRIORITY_SUPPORT: "prioritySupport",
  DECISION_MEMORY: "decisionMemory",
  OPPORTUNITY_ENGINE: "opportunityEngine",
  DISTRIBUTION: "distribution",
};

const entitlementsOf = (p) => ({
  canAddProduct: (count) => Number(count) < p.features.maxProducts,
  canUseDecisionMemory: p.features.decisionMemory,
  canUseOpportunityEngine: p.features.opportunityEngine,
  canDistribute: p.features.distribution,
  maxProducts: p.features.maxProducts,
  platformFee: p.platformFee,
});

// Map plan features to entitlement checks
export const PLAN_ENTITLEMENTS = Object.fromEntries(Object.values(PLANS).map((p) => [p.id, entitlementsOf(p)]));

export function getPlanById(planId) {
  const id = String(planId || "free").toLowerCase();
  return Object.values(PLANS).find((p) => p.id === id) || PLANS.FREE;
}

export function getPlanEntitlements(planId) {
  const id = String(planId || "free").toLowerCase();
  return PLAN_ENTITLEMENTS[id] || PLAN_ENTITLEMENTS[PLANS.FREE.id];
}

export function getAllPlans() {
  return Object.values(PLANS);
}

/** Plans a customer can actually buy today (Elite is a waitlist teaser). */
export function getPurchasablePlans() {
  return Object.values(PLANS).filter((p) => p.purchasable && !p.comingSoon && p.price > 0);
}

/** Plans that exist at PayPal (Starter + Professional → 4 billing plans). */
export function getProvisionedPlans() {
  return Object.values(PLANS).filter((p) => p.provision && p.purchasable && !p.comingSoon);
}

/** Feature rows for one plan, as shown on the pricing page and in the studio. */
export function planFeatureRows(planId) {
  return FEATURES.map((f) => {
    const v = f.plans[planId];
    const included = f.status === "live" && Boolean(v);
    let detail = null;
    if (v && typeof v === "object") detail = v.monthly != null ? `עד ${v.monthly} בחודש` : `עד ${v.total}`;
    else if (typeof v === "string") detail = v;
    return { id: f.id, he: f.he, status: f.status, included, detail };
  });
}
