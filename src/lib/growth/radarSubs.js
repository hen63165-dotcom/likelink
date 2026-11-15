// The trend radar's subscription records (server-only kv `radar:subscriptions`), pure.
// Used by api/store.mjs (sub=radar-get / radar-checkout / radar-cancel) and by the tests.
//
//   • A record belongs to one PayPal environment (`env`: "sandbox" | "live"; records saved before the
//     field are live). A Sandbox test subscription never grants access, blocks a checkout or is
//     cancelled while the server talks to Live, and the other way round.
//   • Access = an ACTIVE subscription, or a cancelled one whose paid period has not ended
//     (cancellation.js decides that date). A pending one (not approved at PayPal) never gives access.

const ENV_DEFAULT = "live";

/** The caller's records in the current PayPal environment. */
export function ownRadarSubs(all, userId, env) {
  const want = String(env || ENV_DEFAULT);
  return (Array.isArray(all) ? all : []).filter((s) => s && s.userId === userId && String(s.env || ENV_DEFAULT) === want);
}

/** True while this record opens the radar. */
export function radarSubAccess(sub, now = Date.now()) {
  if (!sub) return false;
  const st = String(sub.status || "").toLowerCase();
  if (st === "active") return true;
  if (st === "cancelled") return Date.parse(sub.expiresAt || "") > Number(now);
  return false;
}

/** The record that speaks for the caller: active, else cancelled with time left, else the latest pending. */
export function currentRadarSub(own, now = Date.now()) {
  const list = Array.isArray(own) ? own : [];
  return list.filter((s) => String(s.status) === "active").at(-1)
    || list.filter((s) => String(s.status) === "cancelled" && radarSubAccess(s, now)).at(-1)
    || list.filter((s) => String(s.status) === "pending").at(-1)
    || null;
}

/** The record a cancel request acts on: one that can still be billed or is waiting for approval. */
export function cancellableRadarSub(own) {
  const list = Array.isArray(own) ? own : [];
  return list.filter((s) => ["active", "suspended", "pending"].includes(String(s.status))).at(-1) || null;
}

/** What the browser may see of a record (no PayPal ids, no e-mail). */
export function publicRadarSub(sub) {
  if (!sub) return null;
  return {
    planId: sub.planId, billingPeriod: sub.billingPeriod, status: sub.status, price: sub.price, currency: sub.currency,
    createdAt: sub.createdAt || null, activatedAt: sub.activatedAt || null,
    cancelledAt: sub.cancelledAt || null, expiresAt: sub.expiresAt || null,
    refund: sub.refund ? { amount: sub.refund.amount, fee: sub.refund.fee, currency: sub.refund.currency } : null,
  };
}
