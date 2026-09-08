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
