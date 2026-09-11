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

const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export function paypalBase() {
  if (String(process.env.PAYPAL_ENV || "").trim().toLowerCase() === "sandbox") {
    return SANDBOX_API;
  }
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

// ── SELF-PROVISIONING BILLING PLANS (zero-touch) ─────────────────────────────
// The cloud creates its own PayPal Billing Plans on demand using the existing
// server PayPal credentials. No owner has to run a script or paste plan IDs.
// Prices come from the single source of truth (src/lib/plans.js) and are
// converted to USD (PayPal Billing requires a supported currency). Checkout is
// idempotent: plans are created once and cached (in-memory + optional KV), and
// any already-existing PayPal plan with the same name is reused.
//
// Safety: this ONLY creates billing-plan objects — it NEVER moves money, never
// creates subscriptions, never charges anyone. Creation is safe and reversible.
const PLANS_KV_KEY = "marketplace:paypal_plans";
const PRODUCT_KV_KEY = "marketplace:paypal_product";
const PRODUCT_NAME = "LikeLink Cloud";
const ILS_TO_USD = 0.27; // PayPal Billing requires USD; settle later in the buyer's ILS flow.

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
  // Adopt an existing product first (idempotent — never duplicate).
  try {
    const listRes = await fetch(`${paypalBase()}/v1/catalog/products?page_size=20&total_required=true`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    const listData = await listRes.json().catch(() => ({}));
    const found = (listData.products || []).find((p) => p.name === PRODUCT_NAME);
    if (found?.id) {
      productCache = found.id;
      if (kvSet) { try { await kvSet(PRODUCT_KV_KEY, found.id); } catch { /* best-effort */ } }
      return found.id;
    }
  } catch { /* fall through to create */ }
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

export function planPriceUsd(priceIls) {
  const usd = Math.max(1, Math.round((Number(priceIls) || 0) * ILS_TO_USD * 100) / 100);
  return usd.toFixed(2);
}

export function planName(planId, billingPeriod) {
  const p = planId === "free" ? "Free" : planId.charAt(0).toUpperCase() + planId.slice(1);
  return `LikeLink ${p} ${billingPeriod === "yearly" ? "Yearly" : "Monthly"}`;
}

/**
 * Create a single real PayPal Billing Plan. Returns { id } or { error }.
 * Safe + idempotent-per-name: if a plan with this name already exists in the
 * PayPal account we return it rather than duplicate.
 */
async function upsertPayPalPlan({ id: planId, billingPeriod, priceIls, productId }) {
  const token = await getPayPalToken();
  if (!token) return { error: "paypal_auth_failed" };
  if (!productId) return { error: "paypal_product_failed" }; // PayPal requires product_id on every plan
  const body = {
    product_id: productId,
    name: planName(planId, billingPeriod),
    description: `LikeLink ${planId} ${billingPeriod} plan`,
    billing_cycles: [
      {
        frequency: { interval_unit: billingPeriod === "yearly" ? "YEAR" : "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: planPriceUsd(priceIls), currency_code: "USD" } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  };
  try {
    const res = await fetch(`${paypalBase()}/v1/billing/plans`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) return { id: data.id };
    // Name-collision → list plans and adopt the existing one (idempotent).
    if (res.status === 400 || res.status === 409) {
      try {
        const listRes = await fetch(`${paypalBase()}/v1/billing/plans?page_size=50&total_required=true`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });
        const listData = await listRes.json().catch(() => ({}));
        const found = (listData.plans || []).find((p) => p.name === body.name);
        if (found?.id) return { id: found.id };
      } catch { /* fall through to error */ }
    }
    return { error: `paypal_plan_failed_${res.status}` };
  } catch {
    return { error: "paypal_plan_network_failed" };
  }
}

/**
 * Ensure all paid monthly+yearly plans exist. Returns a map keyed by
 * `planId:monthly|yearly` → PayPal plan id (null when PayPal isn't configured).
 * Uses the existing platform single source of truth for plan prices.
 */
export async function ensureBillingPlans({ kvGet, kvSet } = {}) {
  if (plansCache) return plansCache;
  if (!paypalConfigured()) return {};
  // Durable cache (KV) first — avoids PayPal API churn on every cold start.
  try {
    if (kvGet) {
      const cached = await kvGet(PLANS_KV_KEY, null);
      if (cached && typeof cached === "object" && Object.keys(cached).length) {
        plansCache = cached;
        return cached;
      }
    }
  } catch { /* ignore — fall through to create */ }

  // PayPal Billing requires every plan to point at a catalog Product.
  const productId = await ensurePayPalProduct({ kvGet, kvSet });
  if (!productId) return {};

  const { getAllPlans } = await import("../../src/lib/plans.js");
  const defs = getAllPlans().filter((p) => p.id !== "free");
  const out = {};
  const missing = [];
  for (const p of defs) {
    for (const period of ["monthly", "yearly"]) {
      const key = `${p.id}:${period}`;
      out[key] = null;
      const priceIls = period === "yearly" ? p.priceYearly : p.price;
      const created = await upsertPayPalPlan({ id: p.id, billingPeriod: period, priceIls, productId });
      if (created.id) out[key] = created.id;
      else missing.push(key);
    }
  }
  // Cache whatever we got (even partial) so we don't hammer PayPal repeatedly.
  const hasAny = Object.values(out).some(Boolean);
  if (hasAny && kvSet) {
    try { await kvSet(PLANS_KV_KEY, out); } catch { /* best-effort */ }
  }
  plansCache = out;
  return out;
}

// Resolve a plan id → PayPal Billing plan id for checkout. Falls back to env if
// present (legacy), then to the self-provisioned mapping.
export async function resolvePayPalPlanId(planId, billingPeriod, { kvGet, kvSet } = {}) {
  const envKey = billingPeriod === "yearly"
    ? { starter: "PAYPAL_PLAN_STARTER_Y", professional: "PAYPAL_PLAN_PROFESSIONAL_Y", enterprise: "PAYPAL_PLAN_ENTERPRISE_Y" }[planId]
    : { starter: "PAYPAL_PLAN_STARTER", professional: "PAYPAL_PLAN_PROFESSIONAL", enterprise: "PAYPAL_PLAN_ENTERPRISE" }[planId];
  if (envKey && process.env[envKey]) return process.env[envKey];
  const plans = await ensureBillingPlans({ kvGet, kvSet });
  return plans[`${planId}:${billingPeriod}`] || null;
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
