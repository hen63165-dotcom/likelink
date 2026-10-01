// LikeLink — Shared PayPal helpers (server-side only) 🔐
// ========================================================
// Used by api/store.mjs (mode=subs) for the Subscriptions flow.
// NOT a Vercel function (underscore-prefixed) — counts 0 toward the limit.
//
// Security rules:
//   - Credentials come ONLY from server env (PAYPAL_CLIENT_ID/SECRET).
//   - Never log or return secrets/tokens.
//   - Fail loud (CONFIG_REQUIRED) — never invent values.
//   - Webhook verification is FAIL-CLOSED: without PAYPAL_WEBHOOK_ID the
//     webhook refuses to process anything (503), never trusts the body.
import { createHash } from "node:crypto";
import { getProvisionedPlans, getAllPlans } from "../../src/lib/plans.js";

const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

// THE single sandbox/live switch for every PayPal call (checkout, capture,
// subscriptions, payouts): PAYPAL_ENV=sandbox|live wins; otherwise the
// credential decides (PayPal sandbox secrets contain "sandbox").
export function paypalBase() {
  const env = String(process.env.PAYPAL_ENV || "").trim().toLowerCase();
  if (env === "sandbox") return SANDBOX_API;
  if (env === "live") return PAYPAL_API;
  const secret = process.env.PAYPAL_CLIENT_SECRET || "";
  return secret.toLowerCase().includes("sandbox") ? SANDBOX_API : PAYPAL_API;
}

export function paypalConfigured() {
  return Boolean(
    (process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID) &&
      process.env.PAYPAL_CLIENT_SECRET
  );
}

// OAuth2 client-credentials token. Returns null on any failure (caller fail-louds).
export async function getPayPalToken() {
  const id = process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * The system check's PayPal proof: can the server authenticate, and if not,
 * WHY — PayPal refused the credentials (401/403) vs. a network / provider
 * failure. Returns the HTTP status and environment only; never the token.
 */
export async function getPayPalTokenStatus() {
  const id = process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const env = paypalBase() === SANDBOX_API ? "sandbox" : "live";
  const envSource = process.env.PAYPAL_ENV ? "PAYPAL_ENV" : "inferred";
  if (!id || !secret) return { ok: false, status: null, rejected: false, env, envSource };
  try {
    const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status, rejected: res.status === 401 || res.status === 403, env, envSource };
  } catch {
    return { ok: false, status: null, rejected: false, env, envSource, error: "network" };
  }
}

// Direct status check against PayPal's own Subscriptions API. This is the
// fallback path for accounts that haven't configured PAYPAL_WEBHOOK_ID yet:
// without it, BILLING.SUBSCRIPTION.ACTIVATED webhooks are correctly rejected
// (fail-closed) and a paid subscription would otherwise stay "pending"
// forever. Read-only, no money moves, safe to call on every status check.
/**
 * Full server-side view of a PayPal subscription: { status, planId, customId }
 * (null when it cannot be read). Activation must check all three — a status
 * alone would let someone attach any ACTIVE subscription id (e.g. a cheaper
 * plan's, or someone else's) to their account.
 */
export async function getPayPalSubscriptionDetails(paypalSubscriptionId) {
  if (!paypalSubscriptionId) return null;
  const token = await getPayPalToken();
  if (!token) return null;
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    return { status: data.status || null, planId: data.plan_id || null, customId: data.custom_id || null, nextBillingTime: data.billing_info?.next_billing_time || null };
  } catch {
    return null;
  }
}

/**
 * Stop a customer's subscription at PayPal (the customer's own request from
 * the studio). This stops future billing — it never moves money. 204 = done.
 * → { ok:true } | { ok:false, error }
 */
export async function cancelPayPalSubscription(paypalSubscriptionId, reason = "Cancelled by the customer from the LikeLink studio") {
  if (!paypalSubscriptionId) return { ok: false, error: "no_provider_subscription" };
  const token = await getPayPalToken();
  if (!token) return { ok: false, error: "paypal_auth_failed" };
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: String(reason).slice(0, 127) }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 204 || res.ok) return { ok: true };
    return { ok: false, error: `paypal_cancel_failed_${res.status}` };
  } catch {
    return { ok: false, error: "paypal_cancel_network_failed" };
  }
}

export async function getPayPalSubscriptionStatus(paypalSubscriptionId) {
  if (!paypalSubscriptionId) return null;
  const token = await getPayPalToken();
  if (!token) return null;
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.status || null; // e.g. 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED' | 'APPROVAL_PENDING'
  } catch {
    return null;
  }
}

// ── SELF-PROVISIONING BILLING PLANS (zero-touch) ─────────────────────────────
// The cloud creates its own PayPal Billing Plans on demand using the existing
// server PayPal credentials. No owner has to run a script or paste plan IDs.
// Prices come from the single source of truth (src/lib/plans.js) and are
// billed in ILS at exactly the price the site shows. Checkout is
// idempotent: plans are created once and cached (in-memory + optional KV), and
// any already-existing PayPal plan with the same name is reused.
//
// Safety: this ONLY creates billing-plan objects — it NEVER moves money, never
// creates subscriptions, never charges anyone. Creation is safe and reversible.
const PLANS_KV_KEY = "marketplace:paypal_plans";
const PRODUCT_KV_KEY = "marketplace:paypal_product";
const PRODUCT_NAME = "LikeLink Cloud";
export const PLAN_CURRENCY = "ILS"; // the site's prices — the customer is billed what the site shows
// Plans in the owner's PayPal account that are NOT LikeLink's (other
// businesses). LikeLink never adopts, reads, changes, deactivates or bills
// against them — not even when such an id shows up in env or kv. The
// repository is public, so only SHA-256 fingerprints of their ids are kept.
const FOREIGN_PLAN_ID_HASHES = new Set([
  "1228815d44aec872c7ba6a239a70d4505536a8e47e6417f5e64f54431a105772",
  "d8746ae0968acc6c6df69c6af07b10b41431e179e1482578141f97934751ed18",
]);
const planIdHash = (id) => createHash("sha256").update(String(id)).digest("hex");
export const FOREIGN_PLAN_IDS = Object.freeze({ has: (id) => Boolean(id) && FOREIGN_PLAN_ID_HASHES.has(planIdHash(id)) });
/** Test hook: mark a (fake) plan id as foreign. Tests never use the real ids. */
export function _addForeignPlanIdForTest(id) { FOREIGN_PLAN_ID_HASHES.add(planIdHash(id)); }

// A tiny in-memory cache — reset on cold start, but KV is the durable truth.
let plansCache = null;
let productCache = null;

/**
 * Ensure the PayPal catalog Product exists (required parent of every Billing
 * Plan). Idempotent: adopts an existing product with the same name, creates it
 * once otherwise, caches in-memory + KV. Creating a product NEVER moves money.
 */
export async function ensurePayPalProduct({ kvGet, kvSet } = {}) {
  if (productCache) return productCache;
  if (!paypalConfigured()) return null;
  try {
    if (kvGet) {
      const cached = await kvGet(PRODUCT_KV_KEY, null);
      if (cached && typeof cached === "string" && cached.length > 0 && cached.length < 64) {
        productCache = cached;
        return cached;
      }
    }
  } catch { /* ignore — fall through to API */ }
  const token = await getPayPalToken();
  if (!token) return null;
  // Adopt LikeLink's own product first (exact name "LikeLink Cloud"; every
  // page is checked). Other products in the account are never touched. When
  // the list cannot be read we cannot know → nothing is created (no duplicate).
  try {
    for (let page = 1; page <= 10; page++) {
      const listRes = await fetch(`${paypalBase()}/v1/catalog/products?page_size=20&page=${page}&total_required=true`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!listRes.ok) return null;
      const listData = await listRes.json().catch(() => null);
      if (!listData) return null;
      const found = (listData.products || []).find((p) => p.name === PRODUCT_NAME);
      if (found?.id) {
        productCache = found.id;
        if (kvSet) { try { await kvSet(PRODUCT_KV_KEY, found.id); } catch { /* best-effort */ } }
        return found.id;
      }
      if (!(Number(listData.total_pages) > page)) break;
    }
  } catch { return null; }
  // First run only: create the platform product once.
  try {
    const res = await fetch(`${paypalBase()}/v1/catalog/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: PRODUCT_NAME,
        description: "LikeLink creator subscriptions",
        type: "SERVICE",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) {
      productCache = data.id;
      if (kvSet) { try { await kvSet(PRODUCT_KV_KEY, data.id); } catch { /* best-effort */ } }
      return data.id;
    }
  } catch { /* ignore */ }
  return null;
}

/** The plan price exactly as the site shows it (src/lib/plans.js), in ILS. */
export function planPriceIls(priceIls) {
  return (Math.round((Number(priceIls) || 0) * 100) / 100).toFixed(2);
}

export function planName(planId, billingPeriod) {
  const p = planId === "free" ? "Free" : planId.charAt(0).toUpperCase() + planId.slice(1);
  return `LikeLink ${p} ${billingPeriod === "yearly" ? "Yearly" : "Monthly"} (${PLAN_CURRENCY})`;
}

/**
 * The exact PayPal Billing Plan body for one LikeLink plan + period — a pure
 * function, so tests/plansConsistency.test.mjs can prove that what is sent to
 * PayPal equals the pricing page and the entitlements.
 */
export function buildPlanBody({ planId, billingPeriod, priceIls, productId }) {
  const price = planPriceIls(priceIls);
  return {
    product_id: productId,
    name: planName(planId, billingPeriod),
    description: `LikeLink ${planId} ${billingPeriod} plan (₪${price})`,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: billingPeriod === "yearly" ? "YEAR" : "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: planTotalCycles(billingPeriod),
        pricing_scheme: { fixed_price: { value: price, currency_code: PLAN_CURRENCY } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  };
}

/**
 * Monthly renews until cancelled (0 = unlimited cycles). Yearly is ONE
 * 12-month term with no automatic renewal (Consumer Protection Law 13א —
 * a fixed-term transaction may not continue automatically after its end).
 */
export function planTotalCycles(billingPeriod) {
  return billingPeriod === "yearly" ? 1 : 0;
}

/** Every PayPal plan body LikeLink would create (Starter + Professional × monthly/yearly). */
export function plannedBillingPlans(productId = "PROD-LIKELINK") {
  return getProvisionedPlans().flatMap((p) => ["monthly", "yearly"].map((period) => ({
    key: `${p.id}:${period}`,
    body: buildPlanBody({ planId: p.id, billingPeriod: period, priceIls: period === "yearly" ? p.priceYearly : p.price, productId }),
  })));
}

/** Does a full PayPal plan object match what we would create (name, product, ACTIVE, ILS, price)? */
export function planMatches(plan, { name, productId, price, totalCycles = null }) {
  const cycle = (plan?.billing_cycles || []).find((c) => c.tenure_type === "REGULAR") || plan?.billing_cycles?.[0];
  const fp = cycle?.pricing_scheme?.fixed_price;
  return Boolean(plan?.id) && !FOREIGN_PLAN_IDS.has(plan.id) && plan.name === name
    && plan.product_id === productId
    && String(plan.status || "").toUpperCase() === "ACTIVE"
    && Boolean(fp) && fp.currency_code === PLAN_CURRENCY && Number(fp.value) === Number(price)
    && (totalCycles == null || Number(cycle?.total_cycles ?? 0) === Number(totalCycles));
}

async function getPlan(token, id) {
  const res = await fetch(`${paypalBase()}/v1/billing/plans/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  return res.ok ? res.json().catch(() => null) : null;
}

/**
 * Idempotency: adopt an existing ACTIVE plan of this product with the same
 * name, currency and price. PayPal does NOT reject duplicate plan names, so
 * this lookup — not an error code — is what prevents duplicates. When the
 * lookup itself fails we cannot know, so nothing is created.
 */
async function findExistingPlan(token, { name, productId, price, totalCycles = null }) {
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20&total_required=true`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `paypal_plan_list_failed_${res.status}` };
    const data = await res.json().catch(() => ({}));
    // Only LikeLink's own plans: the list is filtered by LikeLink's product
    // (server side AND here), and plans that are not LikeLink's are skipped
    // before any further request is made about them.
    const own = (data.plans || []).filter((p) => p.product_id === productId && !FOREIGN_PLAN_IDS.has(p.id)
      && p.name === name && String(p.status || "").toUpperCase() === "ACTIVE");
    for (const summary of own) {
      const full = await getPlan(token, summary.id);
      if (planMatches(full, { name, productId, price, totalCycles })) return { id: full.id, adopted: true };
    }
    return { id: null };
  } catch {
    return { error: "paypal_plan_list_network_failed" };
  }
}

/**
 * Create (or adopt) one real PayPal Billing Plan in ILS at the site's price.
 * Returns { id, created|adopted } or { error }. Never moves money.
 */
async function upsertPayPalPlan({ id: planId, billingPeriod, priceIls, productId }) {
  const token = await getPayPalToken();
  if (!token) return { error: "paypal_auth_failed" };
  if (!productId) return { error: "paypal_product_failed" }; // PayPal requires product_id on every plan
  const body = buildPlanBody({ planId, billingPeriod, priceIls, productId });
  const { name } = body;
  const price = body.billing_cycles[0].pricing_scheme.fixed_price.value;
  const existing = await findExistingPlan(token, { name, productId, price, totalCycles: planTotalCycles(billingPeriod) });
  if (existing.error || existing.id) return existing;
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/plans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        // PayPal's own idempotency key: a retried request never creates a second plan.
        "PayPal-Request-Id": `likelink-plan-${planId}-${billingPeriod}-${PLAN_CURRENCY}-${price}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) return { id: data.id, created: true, status: data.status || null };
    return { error: `paypal_plan_failed_${res.status}`, detail: String(data?.details?.[0]?.issue || data?.name || "").slice(0, 80) || null };
  } catch {
    return { error: "paypal_plan_network_failed" };
  }
}

// Only the plans that can be bought today exist at PayPal (Starter +
// Professional → 4 billing plans). Elite is a waitlist teaser — never created.
export const PLAN_KEYS = getProvisionedPlans().flatMap((p) => ["monthly", "yearly"].map((per) => `${p.id}:${per}`));
const plansComplete = (map) => PLAN_KEYS.every((k) => Boolean(map?.[k]));

/**
 * Ensure all paid monthly+yearly plans exist in ILS at the site's prices.
 * Returns a map `planId:monthly|yearly` → PayPal plan id, plus currency and
 * productId. Already-provisioned plans are kept; missing ones are retried on
 * the next call (a partial result is never pinned). `report` (optional)
 * collects { created, adopted, failed }.
 */
export async function ensureBillingPlans({ kvGet, kvSet, report = null } = {}) {
  if (plansCache && plansComplete(plansCache)) return plansCache;
  if (!paypalConfigured()) return {};
  let cached = null;
  try { if (kvGet) cached = await kvGet(PLANS_KV_KEY, null); } catch { cached = null; }
  // A cache from another currency (the earlier USD design) is never reused.
  const valid = cached && typeof cached === "object" && cached.currency === PLAN_CURRENCY ? { ...cached } : null;
  // A plan that is not LikeLink's is never kept, even if it reached kv.
  if (valid) for (const k of PLAN_KEYS) if (FOREIGN_PLAN_IDS.has(valid[k])) valid[k] = null;
  if (valid && plansComplete(valid)) { plansCache = valid; return valid; }

  const productId = await ensurePayPalProduct({ kvGet, kvSet });
  if (!productId) { report?.failed.push({ key: "product", error: "paypal_product_failed" }); return valid || {}; }

  const defs = getProvisionedPlans();
  const out = { ...(valid || {}), currency: PLAN_CURRENCY, productId };
  for (const p of defs) {
    for (const period of ["monthly", "yearly"]) {
      const key = `${p.id}:${period}`;
      if (out[key]) continue;
      const r = await upsertPayPalPlan({ id: p.id, billingPeriod: period, priceIls: period === "yearly" ? p.priceYearly : p.price, productId });
      if (r.id) {
        out[key] = r.id;
        report?.[r.adopted ? "adopted" : "created"].push({ key, id: r.id, price: planPriceIls(period === "yearly" ? p.priceYearly : p.price), currency: PLAN_CURRENCY });
      } else {
        out[key] = null;
        report?.failed.push({ key, error: r.error, detail: r.detail || null });
      }
    }
  }
  if (PLAN_KEYS.some((k) => out[k]) && kvSet) {
    try { await kvSet(PLANS_KV_KEY, out); } catch { report?.failed.push({ key: "kv", error: "kv_write_failed" }); }
  }
  plansCache = plansComplete(out) ? out : null;
  return out;
}

/** Read-only proof: each stored plan exists at PayPal, ACTIVE, in ILS, at the site's price. */
export async function verifyBillingPlans(map) {
  const token = await getPayPalToken();
  const defs = Object.fromEntries(getAllPlans().map((p) => [p.id, p]));
  return Promise.all(PLAN_KEYS.map(async (key) => {
    const id = map?.[key];
    const [planId, period] = key.split(":");
    const price = planPriceIls(period === "yearly" ? defs[planId]?.priceYearly : defs[planId]?.price);
    if (!id) return { key, id: null, ok: false, reason: "missing" };
    if (FOREIGN_PLAN_IDS.has(id)) return { key, id, ok: false, reason: "foreign_plan_not_used" };
    if (!token) return { key, id, ok: false, reason: "paypal_auth_failed" };
    const full = await getPlan(token, id).catch(() => null);
    const ok = planMatches(full, { name: planName(planId, period), productId: map.productId, price, totalCycles: planTotalCycles(period) });
    return { key, id, ok, status: full?.status || null, price, currency: PLAN_CURRENCY };
  }));
}

/** Test hook: forget the in-memory caches. */
export function _resetPayPalCaches() { plansCache = null; productCache = null; }

// Resolve a plan id → PayPal Billing plan id for checkout. Falls back to env if
// present (legacy), then to the self-provisioned mapping.
export async function resolvePayPalPlanId(planId, billingPeriod, { kvGet, kvSet } = {}) {
  if (!getProvisionedPlans().some((p) => p.id === planId)) return null; // not purchasable (e.g. Elite)
  const envKey = billingPeriod === "yearly"
    ? { starter: "PAYPAL_PLAN_STARTER_Y", professional: "PAYPAL_PLAN_PROFESSIONAL_Y" }[planId]
    : { starter: "PAYPAL_PLAN_STARTER", professional: "PAYPAL_PLAN_PROFESSIONAL" }[planId];
  if (envKey && process.env[envKey] && !FOREIGN_PLAN_IDS.has(process.env[envKey])) return process.env[envKey];
  // Plans are created ONLY by the owner's button (sub=provision-plans). A
  // customer's checkout reads what exists and never creates anything at PayPal.
  let map = plansCache;
  if (!map && kvGet) { try { map = await kvGet(PLANS_KV_KEY, null); } catch { map = null; } }
  const id = map && typeof map === "object" && map.currency === PLAN_CURRENCY ? map[`${planId}:${billingPeriod}`] || null : null;
  return id && !FOREIGN_PLAN_IDS.has(id) ? id : null;
}
// Create a real PayPal Billing Subscription and return its approval link.
export async function createPayPalSubscription({ paypalPlanId, returnUrl, cancelUrl, customId }) {
  const token = await getPayPalToken();
  if (!token) return { error: "paypal_auth_failed" };
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `ll_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      },
      body: JSON.stringify({
        plan_id: paypalPlanId,
        custom_id: String(customId || "").slice(0, 127) || undefined,
        application_context: {
          brand_name: "LikeLink",
          locale: "he-IL",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `paypal_subscribe_failed_${res.status}` };
    const approve = (data.links || []).find((l) => l.rel === "approve");
    if (!approve?.href) return { error: "paypal_no_approval_link" };
    return { subscriptionId: data.id, approveUrl: approve.href };
  } catch {
    return { error: "paypal_subscribe_failed_network" };
  }
}

// FAIL-CLOSED webhook verification against PayPal's own verification API.
export async function verifyPayPalWebhook(req, rawBodyObject) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { ok: false, reason: "config_required" };
  const h = req.headers || {};
  const get = (n) => h[String(n).toLowerCase()] || h[n] || "";
  const authAlgo = get("paypal-auth-algo");
  const certUrl = get("paypal-cert-url");
  const transmissionId = get("paypal-transmission-id");
  const transmissionSig = get("paypal-transmission-sig");
  const transmissionTime = get("paypal-transmission-time");
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { ok: false, reason: "missing_transmission_headers" };
  }
  // Basic SSRF guard: cert_url must be a PayPal certificate host.
  try {
    const u = new URL(String(certUrl));
    if (!/(^|\.)paypal\.com$/.test(u.hostname)) return { ok: false, reason: "invalid_cert_url" };
  } catch {
    return { ok: false, reason: "invalid_cert_url" };
  }
  const token = await getPayPalToken();
  if (!token) return { ok: false, reason: "paypal_auth_failed" };
  try {
    const res = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: rawBodyObject,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: data.verification_status === "SUCCESS", reason: data.verification_status || `http_${res.status}` };
  } catch {
    return { ok: false, reason: "verification_network_error" };
  }
}
