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

/** Discovery capabilities per plan, derived from the plan's real features. */
function capabilitiesFor(planId) {
  const f = (PLAN_BY_ID[planId] || PLANS.FREE).features;
  return {
    // How many products one Luna goal may act on (analysis is never limited).
    // null = unlimited (JSON-safe; Infinity would serialize as null anyway).
    maxProductsPerRun: Number.isFinite(f.maxProducts) ? f.maxProducts : null,
    // Evidence-ranked opportunity engine across the whole catalog.
    opportunityEngine: Boolean(f.opportunityEngine),
    // Full structured memory (what was tried / happened / blocked / next).
    memoryDepth: f.decisionMemory ? 50 : 10,
    // Prepared payloads for connected external channels (still needs the
    // channel's own authorization + owner approval to send anything).
    externalDistribution: Boolean(f.distribution),
  };
}

/**
 * @param {object}  args
 * @param {object?} args.subscription  the account's record (latest), or null
 * @param {boolean} args.isPlatformOwner  verified OWNER_EMAIL session / admin
 * @param {number}  args.now
 */
export function resolveEntitlement({ subscription = null, isPlatformOwner = false, now = Date.now() } = {}) {
  if (isPlatformOwner) {
    return {
      plan: "enterprise",
      status: "active",
      source: "platform_owner",
      effectiveAt: null,
      expiresAt: null,
      providerRef: null,
      verifiedAt: now,
      reason: "בעלות על הפלטפורמה — מאומתת מהזהות בשרת",
      capabilities: capabilitiesFor("enterprise"),
    };
  }
  const free = (reason, extra = {}) => ({
    plan: "free", status: "active", source: "default", effectiveAt: null, expiresAt: null,
    providerRef: null, verifiedAt: now, reason, capabilities: capabilitiesFor("free"), ...extra,
  });
  if (!subscription) return free("אין מנוי — מסלול חינמי");
  const planId = PLAN_BY_ID[subscription.planId] ? subscription.planId : null;
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

/** Pick the account's record: an entitled one first, else the newest pending. */
export function pickSubscription(all = [], userId) {
  const mine = (Array.isArray(all) ? all : []).filter((s) => s && s.userId === userId);
  const entitled = mine.find((s) => ENTITLED_STATUS.has(String(s.status || "").toLowerCase()));
  if (entitled) return entitled;
  return mine
    .filter((s) => String(s.status || "").toLowerCase() === "pending")
    .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0))[0] || null;
}
