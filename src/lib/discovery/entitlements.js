// Canonical entitlement resolver — LAW 05 (money before entitlement).
//
// One function decides what an account may do, from the SERVER-verified
// subscription record only (marketplace:subscriptions is server-only; a
// record becomes "active" only after PayPal confirms ACTIVE with this user's
// custom_id and this plan's plan_id). It never calls a provider, so a
// transient provider timeout can never revoke a valid entitlement; only an
// explicit provider state (cancelled/expired/suspended) or a passed
// expiresAt downgrades it. Plans come from src/lib/plans.js (Free / Starter
// ₪29 / Professional ₪79 / Enterprise ₪199) — nothing here changes pricing.
import { PLANS } from "../plans.js";

const PLAN_BY_ID = Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p]));
const ENTITLED_STATUS = new Set(["active", "trial"]);
const STATUS_HE = { cancelled: "בוטל", suspended: "מושהה", expired: "פג תוקף", approval_pending: "ממתין לאישור ב-PayPal", created: "נוצר ולא אושר", failed: "התשלום נכשל" };

/**
 * Capabilities per plan — read from src/lib/plans.js (features + quotas), so
 * the pricing page, the code and the PayPal plans can never disagree
 * (tests/plansConsistency.test.mjs). A quota of 0 means "not included".
 * The internal "owner" plan (platform owner / admin) is unlimited (null).
 */
function capabilitiesFor(planId) {
  if (planId === OWNER_PLAN) {
    return {
      maxProductsPerRun: null, opportunityEngine: true, memoryDepth: 50, externalDistribution: true,
      apiAccess: true, analytics: "sources",
      quotas: Object.fromEntries(QUOTA_KEYS.map((k) => [k, null])),
    };
  }
  const plan = PLAN_BY_ID[planId] || PLANS.FREE;
  const f = plan.features;
  const q = plan.quotas || {};
  return {
    // How many products one Luna goal may act on (analysis is never limited).
    maxProductsPerRun: Number.isFinite(q.maxProductsPerRun) ? q.maxProductsPerRun : null,
    // Evidence-ranked opportunity engine across the whole catalog.
    opportunityEngine: Boolean(f.opportunityEngine),
    // Full structured memory (what was tried / happened / blocked / next).
    memoryDepth: f.decisionMemory ? 50 : 10,
    // Distribution plans (drafts) — sending still needs a connected channel
    // and explicit owner approval per post.
    externalDistribution: Boolean(f.distribution),
    apiAccess: Boolean(f.apiAccess),
    analytics: f.analytics || "basic",
    // Monthly (or total) quotas, exactly as published on the pricing page.
    quotas: Object.fromEntries(QUOTA_KEYS.map((k) => [k, Number.isFinite(q[k]) ? q[k] : 0])),
  };
}

/** The internal plan of the platform owner / admin — never sold. */
export const OWNER_PLAN = "owner";
const QUOTA_KEYS = ["maxProducts", "maxProductsPerRun", "distributionPlans", "campaigns", "recruitDrafts", "gptDrafts", "marketingCycles"];
export { QUOTA_KEYS };

/**
 * @param {object}  args
 * @param {object?} args.subscription  the account's record (latest), or null
 * @param {boolean} args.isPlatformOwner  verified OWNER_EMAIL session / admin
 * @param {number}  args.now
 */
export function resolveEntitlement({ subscription = null, isPlatformOwner = false, now = Date.now() } = {}) {
  if (isPlatformOwner) {
    return {
      plan: OWNER_PLAN,
      status: "active",
      source: "platform_owner",
      effectiveAt: null,
      expiresAt: null,
      providerRef: null,
      verifiedAt: now,
      reason: "בעלות על הפלטפורמה — מאומתת מהזהות בשרת",
      capabilities: capabilitiesFor(OWNER_PLAN),
    };
  }
  const free = (reason, extra = {}) => ({
    plan: "free", status: "active", source: "default", effectiveAt: null, expiresAt: null,
    providerRef: null, verifiedAt: now, reason, capabilities: capabilitiesFor("free"), ...extra,
  });
  if (!subscription) return free("אין מנוי — מסלול חינמי");
  // Only a plan that can actually be bought unlocks anything (Elite is a
  // waitlist teaser; legacy/unknown plan ids resolve to free).
  const planId = PLAN_BY_ID[subscription.planId]?.purchasable && !PLAN_BY_ID[subscription.planId]?.comingSoon ? subscription.planId : null;
  if (!planId) return free("מסלול לא מוכר — מסלול חינמי");
  const expiresAt = subscription.expiresAt ? Date.parse(subscription.expiresAt) || null : null;
  const expired = expiresAt != null && expiresAt < Number(now);
  const status = String(subscription.status || "").toLowerCase();
  const base = {
    source: subscription.paypalSubscriptionId ? "paypal" : subscription.provider || "billing",
    providerRef: subscription.paypalSubscriptionId || subscription.providerRef || null,
    effectiveAt: subscription.startedAt || null,
    expiresAt: subscription.expiresAt || null,
  };
  // A cancelled plan keeps its paid access until the paid period ends.
  const cancelledButPaid = status === "cancelled" && expiresAt != null && !expired;
  if ((ENTITLED_STATUS.has(status) && !expired) || cancelledButPaid) {
    return {
      plan: planId,
      status: cancelledButPaid ? "cancelled_active_until_expiry" : status,
      ...base,
      verifiedAt: Date.parse(subscription.lastBillingAt || subscription.startedAt || "") || null,
      reason: cancelledButPaid ? "המנוי בוטל — הגישה נשארת עד סוף התקופה ששולמה" : "מנוי מאומת בשרת",
      capabilities: capabilitiesFor(planId),
    };
  }
  // pending / approval_pending / created / expired / suspended → no paid access.
  return free(
    status === "pending" ? "התשלום עדיין לא אומת מול PayPal — הגישה בתשלום תיפתח רק אחרי אימות" : `המנוי לא פעיל (${expired ? "פג תוקף" : STATUS_HE[status] || "מצב לא ידוע"})`,
    { pendingPlan: status === "pending" ? planId : null, subscriptionStatus: expired ? "expired" : status, ...base },
  );
}

/** Does this entitlement allow a capability? (used by the orchestrator) */
export function entitlementAllows(ent, capability) {
  return Boolean(ent?.capabilities?.[capability]);
}

/** Pick the account's record: an entitled one first (incl. cancelled-but-paid), else the newest pending. */
export function pickSubscription(all = [], userId, now = Date.now()) {
  const mine = (Array.isArray(all) ? all : []).filter((s) => s && s.userId === userId);
  const entitled = mine.find((s) => ENTITLED_STATUS.has(String(s.status || "").toLowerCase()))
    || mine.find((s) => String(s.status || "").toLowerCase() === "cancelled" && Date.parse(s.expiresAt || "") > Number(now));
  if (entitled) return entitled;
  return mine
    .filter((s) => String(s.status || "").toLowerCase() === "pending")
    .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0))[0] || null;
}

// ── Renewal / cancellation reconciliation (no webhook required) ─────────────
// An ACTIVE record is re-checked against PayPal at most every
// SUB_RECONCILE_MS. Only an explicit PayPal state changes it; a failed lookup
// never revokes access. A cancellation keeps the paid period.
export const SUB_RECONCILE_MS = 12 * 60 * 60 * 1000;
const PERIOD_MS = { monthly: 31 * 86400000, yearly: 366 * 86400000 };

export function needsReconcile(sub, now = Date.now()) {
  return Boolean(sub && String(sub.status || "").toLowerCase() === "active" && sub.paypalSubscriptionId
    && Number(now) - Number(sub.lastReconciledAt || 0) > SUB_RECONCILE_MS);
}

/** End of the period the customer already paid for (best evidence available). */
export function paidPeriodEnd(sub, now = Date.now()) {
  const known = Date.parse(sub?.paidThrough || "");
  if (Number.isFinite(known)) return known;
  const start = Date.parse(sub?.lastBillingAt || sub?.startedAt || "");
  const end = Number.isFinite(start) ? start + (PERIOD_MS[sub?.billingPeriod] || PERIOD_MS.monthly) : NaN;
  return Number.isFinite(end) && end > Number(now) ? end : Number(now);
}

export function reconcileActiveSubscription(sub, details, now = Date.now()) {
  if (!sub || !details?.status) return sub;
  const live = String(details.status).toUpperCase();
  const at = Number(now);
  const next = Date.parse(details.nextBillingTime || "");
  if (live === "ACTIVE") {
    // A renewal PayPal confirms extends access to the next billing time, even
    // when no webhook arrived (PAYPAL_WEBHOOK_ID missing / delivery failed).
    const cur = Date.parse(sub.expiresAt || "");
    const extend = Number.isFinite(next) && (!Number.isFinite(cur) || next > cur);
    return {
      ...sub, lastReconciledAt: at, providerStatus: live,
      ...(Number.isFinite(next) ? { paidThrough: new Date(next).toISOString() } : {}),
      ...(extend ? { expiresAt: new Date(next).toISOString() } : {}),
    };
  }
  if (live === "CANCELLED") {
    return { ...sub, status: "cancelled", providerStatus: live, lastReconciledAt: at, cancelledAt: sub.cancelledAt || new Date(at).toISOString(), expiresAt: sub.expiresAt || new Date(paidPeriodEnd(sub, at)).toISOString() };
  }
  if (live === "SUSPENDED" || live === "EXPIRED") return { ...sub, status: live.toLowerCase(), providerStatus: live, lastReconciledAt: at };
  return { ...sub, providerStatus: live, lastReconciledAt: at };
}
