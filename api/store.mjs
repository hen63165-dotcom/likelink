import { readBody } from "./_utils/readBody.mjs";
// Vercel Serverless Function — Store API 🔐
//
// THE GATE for every WRITE to the shared kv table from the browser.
// The browser's anon key can still READ the public feed, but all
// inserts/updates/deletes now go through this function using the
// SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS on the server side).
//
// Why this is the "genius" security layer:
//   - A forger can no longer POST straight to Supabase with the anon key
//     to fake a sale, change the platform fee, or wipe listings.
//   - This function enforces: WHO can write, WHAT key, size limits,
//     and keeps sensitive money keys server/admin-only.
//
// API:
//   POST /api/store  { key, value }  → writes one kv row (upsert)
//   POST /api/store  { key }         → (body.action = "delete") deletes a row
//
// Allowed clients:
//   - any signed-in visitor (writes only NON-sensitive keys)
//   - admin token (writes any key)
//
// Sensitive keys (money/config) are ONLY writable with an admin token.

import { jsonCors, isApprovedOrigin } from "./_utils/cors.js";
import { paypalConfigured, createPayPalSubscription, verifyPayPalWebhook, resolvePayPalPlanId, ensureBillingPlans } from "./_utils/paypal.js";
import { audit } from "./_utils/audit.js";
import { buildOwnerReport } from "./_utils/analytics.js";
import { verifyToken } from "./_utils/authVerify.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Keys that only an admin may write (money/config that must never be forged
// by a browser, even a signed-in creator): settings, payouts.
const SENSITIVE_KEYS = new Set([
  "marketplace:settings".toUpperCase(),
  "marketplace:payouts".toUpperCase(),
]);

// Keys that a creator writes from her own studio browser via a signed path:
// sales self-reports go through /api/sign-sale (threshold + rate-limit + HMAC).
const SIGNED_KEYS = new Set(["marketplace:sales".toUpperCase()]);

const SIGN_SECRET =
  process.env.STORE_SIGN_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  "likelink-store-sign-v1";

const MAX_VALUE_BYTES = 4_000_000; // ~4MB safety cap per kv value
const MAX_KEY_LEN = 120;
const SIG_WINDOW_MS = 5 * 60 * 1000; // valid signature window (5 min)

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

async function kvDelete(key) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(
    `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}`,
    {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok && res.status !== 204) throw new Error(`kv_delete_failed_${res.status}`);
}

// Verify an admin Bearer token (same scheme as /api/admin/auth).
async function isAdminToken(token) {
  if (!token) return false;
  try {
    const res = await fetch("/api/admin/auth", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean(res.ok && data.ok);
  } catch {
    return false;
  }
}

// Verify the HMAC signature produced by /api/sign-sale for a sales self-report.
// The client must send { sig, sale }. We re-derive the canonical string the
// SAME way the signer did (key|marketerId|productId|saleAmount|commissionAmount|ts)
// and ensure the signature is fresh (≤ SIG_WINDOW_MS).
async function verifySaleSignature({ key, sale, sig, sigTs }) {
  if (!sale || typeof sale !== "object" || !sig || !sigTs) return false;
  const now = Date.now();
  if (now - Number(sigTs) > SIG_WINDOW_MS || Number(sigTs) > now + 60_000) return false;

  const canonical = [
    key.toLowerCase(),
    String(sale.marketerId || ""),
    String(sale.productId || ""),
    Number(sale.saleAmount || 0),
    Number(sale.commissionAmount || 0),
    Number(sale.ts || 0),
  ].join("|");

  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", SIGN_SECRET)
    .update(canonical)
    .digest("hex");

  const a = Buffer.from(String(sig), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── sign-sale (merged from the deleted api/sign-sale.mjs to stay under the
// ─── 12-serverless-function Hobby limit). Dispatched by vercel.json rewrite:
// ─── /api/sign-sale → /api/store?mode=sign-sale
const SIGN_MIN_SALE = 1;        // ₪
const SIGN_MAX_SALE = 100000;   // ₪ per sale
const SIGN_MAX_PER_IP_MIN = 15; // signed sales per IP per 60s window
const signWindow = new Map();   // ip → [ts] (per-lambda sliding window)

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : null;
  } catch {
    return null;
  }
}

async function signSaleHandler(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { productId, marketerId, saleAmount, commissionAmount, ts, id } = body || {};
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
  const amount = toNum(saleAmount);
  const commission = toNum(commissionAmount);

  if (!marketerId || !productId) { json(res, { ok: false, error: "missing_fields" }, 400, req); return; }
  if (Number.isNaN(amount) || amount < SIGN_MIN_SALE || amount > SIGN_MAX_SALE) {
    json(res, { ok: false, error: "invalid_amount", min: SIGN_MIN_SALE, max: SIGN_MAX_SALE }, 400, req);
    return;
  }
  if (Number.isNaN(commission) || commission < 0 || commission > amount) {
    json(res, { ok: false, error: "invalid_commission" }, 400, req);
    return;
  }

  // Ownership: the product must exist and belong to this creator.
  const [prods, mks, settings] = await Promise.all([
    kvGet("marketplace:products"),
    kvGet("marketplace:marketers"),
    kvGet("marketplace:settings"),
  ]);
  const product = Array.isArray(prods) ? prods.find((p) => p && p.id === productId) : null;
  if (!product) { json(res, { ok: false, error: "product_not_found" }, 404, req); return; }
  if (product.marketerId !== marketerId) { json(res, { ok: false, error: "not_owner" }, 403, req); return; }
  if (!Array.isArray(mks) || !mks.some((m) => m && m.id === marketerId)) {
    json(res, { ok: false, error: "marketer_not_found" }, 404, req);
    return;
  }

  // Rate limit (per IP, sliding 60s window).
  const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";
  const now = Date.now();
  const win = (signWindow.get(ip) || []).filter((t) => now - t < 60000);
  if (win.length >= SIGN_MAX_PER_IP_MIN) {
    audit.logApiRateLimit({ type: "ip", ip }, { type: "sign-sale" }, { _req: req });
    json(res, { ok: false, error: "rate_limited" }, 429, req);
    return;
  }
  win.push(now);
  signWindow.set(ip, win.slice(-SIGN_MAX_PER_IP_MIN));

  // Build the sale exactly as the client will persist it.
  const finalTs = Number.isFinite(toNum(ts)) ? toNum(ts) : now;
  const feePct = Number(settings?.platformFeePercent ?? 15);
  const fee = Math.round(commission * (feePct / 100) * 100) / 100;
  const sale = {
    id: String(id || `${productId}-${finalTs}`),
    productId,
    marketerId,
    saleAmount: Math.round(amount * 100) / 100,
    commissionAmount: Math.round(commission * 100) / 100,
    platformFee: fee,
    marketerNet: Math.round((commission - fee) * 100) / 100,
    ts: finalTs,
  };

  // HMAC over the SAME canonical string verifySaleSignature() reconstructs.
  const crypto = await import("crypto");
  const canonical = [
    "marketplace:sales",
    String(sale.marketerId),
    String(sale.productId),
    Number(sale.saleAmount),
    Number(sale.commissionAmount),
    Number(sale.ts),
  ].join("|");
  const sig = crypto.createHmac("sha256", SIGN_SECRET).update(canonical).digest("hex");

    json(res, { ok: true, sig, sigTs: now, sale }, 200, req);
}

// ─── Identity link handler (merged from api/identity.mjs) ───────────────────
// Verifies the caller's auth session server-side and writes the trusted
// profiles.marketer_id link using the SERVICE_ROLE key. This is the ONLY
// place that writes that column — the client never writes it directly.

/**
 * verifyToken now lives in ./_utils/authVerify.js (shared with autopilot.mjs).
 */

async function profileUpsert(profileId, marketerId) {
  const res = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ marketer_id: marketerId }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`profile_update_failed_${res.status}`);
}

async function linkIdentityHandler(req, res) {
  // 1. Authenticate the caller via Bearer token (verified server-side).
  const authHeader = getHeader(req, "authorization") || "";
  const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
  const authUser = await verifyToken(token);
  if (!authUser?.id) {
    audit.logApiForbidden({ type: "unauthenticated" }, { type: "identity_link" }, { _req: req });
    json(res, { ok: false, error: "unauthenticated" }, 401, req);
    return;
  }

  // 2. Parse + validate body.
  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { authUserId, marketerId } = body || {};
  if (!authUserId || !marketerId || authUserId !== authUser.id) {
    audit.logApiForbidden(
      { type: "id_mismatch", claimed: authUserId, session: authUser.id },
      { type: "identity_link" },
      { _req: req }
    );
    json(res, { ok: false, error: "identity_mismatch" }, 403, req);
    return;
  }

  // 3. Verify the marketer exists in kv.
  const marketers = (await kvGet("marketplace:marketers")) || [];
  const marketer = marketers.find((m) => m.id === marketerId);
  if (!marketer) {
    json(res, { ok: false, error: "marketer_not_found" }, 404, req);
    return;
  }

  // 4. Claim check: is this marketer already linked to ANOTHER auth user?
  try {
    const claimRes = await fetch(
      `${SB_URL}/rest/v1/profiles?marketer_id=eq.${encodeURIComponent(marketerId)}&select=id`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (claimRes.ok) {
      const existing = await claimRes.json();
      if (existing && existing.length > 0 && existing[0].id !== authUser.id) {
        audit.logApiForbidden(
          { type: "already_claimed", marketerId, by: existing[0].id },
          { type: "identity_link" },
          { _req: req }
        );
        json(res, { ok: false, error: "marketer_already_linked" }, 409, req);
        return;
      }
    }
  } catch (e) {
    // If the profiles table doesn't exist yet, skip the claim check.
    // The marketer_id column is additive; the migration may not have run.
    if (e.message && !e.message.includes("42P01") && !e.message.includes("42702")) {
      // Re-throw only unexpected errors
    }
  }

  // 5. Write the link (idempotent — PATCH on id = auth.uid).
  try {
    await profileUpsert(authUser.id, marketerId);
  } catch (e) {
    json(res, { ok: false, error: `link_write_failed: ${e.message}` }, 500, req);
    return;
  }

  audit.logApiSuccess(
    { type: "identity_linked", authUserId: authUser.id, marketerId },
    { type: "identity_link" },
    { _req: req }
  );
  json(res, { ok: true, authUserId: authUser.id, marketerId }, 200, req);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS (unified commerce) — server-authoritative
// Key: marketplace:subscriptions (server-only — never in CLIENT_WRITABLE_KEYS)
// Identity: verified Supabase session only. Client userId is NEVER trusted.
// Money: only a real PayPal Billing Subscription approval activates a plan.
// ─────────────────────────────────────────────────────────────────────────────
const SUBS_KEY = "marketplace:subscriptions";
const PLAN_ENV_MONTHLY = { starter: "PAYPAL_PLAN_STARTER", professional: "PAYPAL_PLAN_PROFESSIONAL", enterprise: "PAYPAL_PLAN_ENTERPRISE" };
const PLAN_ENV_YEARLY = { starter: "PAYPAL_PLAN_STARTER_Y", professional: "PAYPAL_PLAN_PROFESSIONAL_Y", enterprise: "PAYPAL_PLAN_ENTERPRISE_Y" };

async function subsAuthUser(req) {
  const auth = getHeader(req, "authorization");
  const token = String(auth).replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

async function subsFindOwn(allSubs, authId) {
  return allSubs.find((s) => s && s.userId === authId && (s.status === "active" || s.status === "trial"));
}

async function subsHandler(req, res) {
  const sub = new URL(req.url, "https://x").searchParams.get("sub") || "";
  let body = {};
  try { body = (await readBody(req)) || {}; } catch { body = {}; }

  // ── Public: plan catalog (no secrets — only whether a plan is configured) ──
  if (sub === "plans") {
    try {
      const { getAllPlans } = await import("../src/lib/plans.js");
      const plans = getAllPlans().map((p) => ({
        id: p.id, name: p.name, tagline: p.tagline, price: p.price, priceYearly: p.priceYearly,
        period: p.period, platformFee: p.platformFee, features: p.features, cta: p.cta,
        // Self-provisioning: when PayPal creds exist, plans are created on first
        // demand by the cloud (ensureBillingPlans). Env vars remain the legacy
        // override; absence is no longer a config blocker.
        paypalConfigured: {
          monthly: Boolean(process.env[PLAN_ENV_MONTHLY[p.id]]) || paypalConfigured(),
          yearly: Boolean(process.env[PLAN_ENV_YEARLY[p.id]]) || paypalConfigured(),
        },
      }));
      return json(res, { ok: true, plans, paypalConfigured: paypalConfigured(), selfProvisioning: paypalConfigured() }, 200, req);
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
  }

  // ── PayPal webhook: FAIL-CLOSED signature verification, no session auth ──
  if (sub === "webhook") {
    const event = body; // already parsed by readBody
    if (!event || typeof event !== "object" || !event.event_type) {
      return json(res, { ok: false, error: "no_body" }, 400, req);
    }
    const verdict = await verifyPayPalWebhook(req, event);
    if (!verdict.ok) {
      audit.logApiForbidden({ type: "paypal_webhook", reason: verdict.reason }, { type: "event", event: String(event.event_type).slice(0, 60) }, { _req: req });
      const status = verdict.reason === "config_required" ? 503 : 401;
      return json(res, { ok: false, error: verdict.reason === "config_required" ? "webhook_verification_not_configured" : "webhook_verification_failed" }, status, req);
    }
    try {
      const { activateSubscription, cancelSubscription } = await import("../src/lib/commerce.js");
      const all = (await kvGet(SUBS_KEY, [])) || [];
      const resource = event.resource || {};
      const paypalSubId = resource.id;
      const renewDays = (s) => (s?.billingPeriod === "yearly" ? 365 : 30);
      let updated = all;
      switch (String(event.event_type)) {
        case "BILLING.SUBSCRIPTION.ACTIVATED":
        case "BILLING.SUBSCRIPTION.CREATED":
          updated = all.map((s) => (s.paypalSubscriptionId === paypalSubId ? activateSubscription(s) : s));
          break;
        case "BILLING.SUBSCRIPTION.CANCELLED":
          updated = all.map((s) => (s.paypalSubscriptionId === paypalSubId ? cancelSubscription(s) : s));
          break;
        case "BILLING.SUBSCRIPTION.EXPIRED":
          updated = all.map((s) => (s.paypalSubscriptionId === paypalSubId ? { ...s, status: "expired" } : s));
          break;
        case "BILLING.SUBSCRIPTION.SUSPENDED":
          updated = all.map((s) => (s.paypalSubscriptionId === paypalSubId ? { ...s, status: "suspended" } : s));
          break;
        case "PAYMENT.SALE.COMPLETED": {
          const now = Date.now();
          updated = all.map((s) => {
            if (s.paypalSubscriptionId !== resource.billing_agreement_id) return s;
            const dur = renewDays(s) * 86400000;
            return { ...s, status: "active", lastBillingAt: new Date(now).toISOString(), nextBillingAt: new Date(now + dur).toISOString(), expiresAt: new Date(now + dur).toISOString() };
          });
          break;
        }
        default:
          break; // unknown verified event → acknowledged, no state change
      }
      await kvSet(SUBS_KEY, updated);
      return json(res, { ok: true, received: true }, 200, req);
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
  }

  return subsAuthHandler(req, res, sub, body);
}

// ── Session-protected subscription actions (identity = verified token only) ──
async function subsAuthHandler(req, res, sub, body) {
  const authUser = await subsAuthUser(req);
  if (!authUser?.id) {
    audit.logApiForbidden({ type: "anonymous" }, { type: "subs", submode: sub }, { _req: req });
    return json(res, { ok: false, error: "unauthenticated" }, 401, req);
  }
  const authId = String(authUser.id);

  try {
    const commerce = await import("../src/lib/commerce.js");

    // ── Own subscription state ──
    if (sub === "get") {
      const all = (await kvGet(SUBS_KEY, [])) || [];
      let mine = await subsFindOwn(all, authId);
      let expiredNow = false;
      if (mine && mine.expiresAt && new Date(mine.expiresAt).getTime() < Date.now()) {
        mine = { ...mine, status: "expired" };
        expiredNow = true;
        await kvSet(SUBS_KEY, all.map((s) => (s.id === mine.id ? mine : s))).catch(() => {});
      }
      return json(res, { ok: true, subscription: mine || null, plan: mine && !expiredNow ? mine.planId : "free" }, 200, req);
    }

    // ── Real PayPal Billing checkout: returns the official approval URL ──
    if (sub === "checkout") {
      const planId = String(body.planId || "").toLowerCase();
      const billingPeriod = body.billingPeriod === "yearly" ? "yearly" : "monthly";
      if (!PLAN_ENV_MONTHLY[planId]) return json(res, { ok: false, error: "invalid_plan" }, 400, req);
      if (!paypalConfigured()) return json(res, { ok: false, error: "paypal_not_configured" }, 503, req);
      const paypalPlanId = await resolvePayPalPlanId(planId, billingPeriod, { kvGet, kvSet });
      if (!paypalPlanId) return json(res, { ok: false, error: "plan_not_configured", configRequired: true }, 503, req);
      const origin = getHeader(req, "origin");
      const base = isApprovedOrigin(origin) ? origin : `https://${process.env.VERCEL_URL || "likelink2.vercel.app"}`;
      const result = await createPayPalSubscription({
        paypalPlanId,
        returnUrl: `${base}/studio?sub=return`,
        cancelUrl: `${base}/studio?sub=cancel`,
        customId: authId,
      });
      if (result.error) return json(res, { ok: false, error: result.error }, 502, req);
      // Record the pending subscription bound to the VERIFIED user id.
      const all = (await kvGet(SUBS_KEY, [])) || [];
      const superseded = all.map((s) => (s.userId === authId && (s.status === "pending" || s.status === "active") ? { ...s, status: "cancelled", supersededBy: planId, cancelledAt: new Date().toISOString() } : s));
      const record = commerce.createSubscription({ planId, userId: authId, billingPeriod, paypalSubscriptionId: result.subscriptionId });
      record.authEmail = String(authUser.email || "");
      await kvSet(SUBS_KEY, [...superseded, record]);
      return json(res, { ok: true, approveUrl: result.approveUrl, subscriptionId: result.subscriptionId }, 200, req);
    }

    // ── Create pending subscription locally (idempotent per user) ──
    if (sub === "create") {
      const planId = String(body.planId || "").toLowerCase();
      const billingPeriod = body.billingPeriod === "yearly" ? "yearly" : "monthly";
      if (!PLAN_ENV_MONTHLY[planId]) return json(res, { ok: false, error: "invalid_plan" }, 400, req);
      const all = (await kvGet(SUBS_KEY, [])) || [];
      const existing = await subsFindOwn(all, authId);
      if (existing && existing.planId === planId && existing.billingPeriod === billingPeriod) {
        return json(res, { ok: true, subscription: existing, existing: true }, 200, req);
      }
      const superseded = all.map((s) => (s.userId === authId && (s.status === "pending" || s.status === "active") ? { ...s, status: "cancelled", supersededBy: planId, cancelledAt: new Date().toISOString() } : s));
      const record = commerce.createSubscription({ planId, userId: authId, billingPeriod, paypalSubscriptionId: body.paypalSubscriptionId || null });
      record.authEmail = String(authUser.email || "");
      await kvSet(SUBS_KEY, [...superseded, record]);
      return json(res, { ok: true, subscription: record }, 200, req);
    }

    // ── Cancel own subscription ──
    if (sub === "cancel") {
      const all = (await kvGet(SUBS_KEY, [])) || [];
      const mine = await subsFindOwn(all, authId);
      if (!mine) return json(res, { ok: false, error: "no_active_subscription" }, 404, req);
      const cancelled = commerce.cancelSubscription(mine);
      await kvSet(SUBS_KEY, all.map((s) => (s.id === mine.id ? cancelled : s)));
      return json(res, { ok: true, subscription: cancelled }, 200, req);
    }

    return json(res, { ok: false, error: "invalid_submode" }, 400, req);
  } catch (e) {
    return json(res, { ok: false, error: String(e.message || e) }, 500, req);
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "misconfigured: service role key missing" }, 500, req); return; }

  // Merged endpoint dispatch (12-function Hobby limit): /api/sign-sale lands
  // here via vercel.json rewrite → /api/store?mode=sign-sale
    if (new URL(req.url, "https://x").searchParams.get("mode") === "sign-sale") {
    return signSaleHandler(req, res);
  }

  // Subscriptions (unified commerce) — merged here to respect the 12-function
  // Hobby limit. Submodes: plans | get | create | cancel | checkout | webhook.
  // Identity: ALWAYS the verified Bearer session (never a client-provided userId).
  // Webhook: FAIL-CLOSED PayPal signature verification (PAYPAL_WEBHOOK_ID env).
  if (new URL(req.url, "https://x").searchParams.get("mode") === "subs") {
    return subsHandler(req, res);
  }

  // Native-share publication ("creator-as-channel"): the Owner/creator shares
  // the prepared campaign from their own phone — no OAuth needed. Owner-ONLY
  // (admin token OR verified owner session), append-only field stamp.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "campaign-share") {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    let authorized = await isAdminToken(token);
    if (!authorized) {
      const ownerEmail = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
      if (ownerEmail) {
        const authUser = await verifyToken(token);
        authorized = Boolean(authUser?.email && String(authUser.email).trim().toLowerCase() === ownerEmail);
      }
    }
    if (!authorized) {
      audit.logApiForbidden({ type: "non-owner" }, { type: "campaign_share" }, { _req: req });
      json(res, { ok: false, error: "owner_required" }, 403, req);
      return;
    }
    try {
      const shareBody = await readBody(req).catch(() => ({}));
      const campaignId = String(shareBody?.campaignId || "").slice(0, 80);
      if (!campaignId) { json(res, { ok: false, error: "missing_campaignId" }, 400, req); return; }
      const list = (await kvGet("marketplace:site_campaigns", [])) || [];
      const target = list.find((c) => c && c.campaignId === campaignId);
      if (!target) { json(res, { ok: false, error: "campaign_not_found" }, 404, req); return; }
      // Idempotent: an already-published campaign is never double-stamped.
      if (!target.publishedAt) {
        const updated = list.map((c) => (c.campaignId === campaignId ? { ...c, status: "PUBLISHED", publishedAt: new Date().toISOString(), channel: "native_share" } : c));
        await kvSet("marketplace:site_campaigns", updated);
      }
      json(res, { ok: true, campaignId, status: "PUBLISHED", channel: "native_share" }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // Cloud identity: link auth user → marketer (server-verified Bearer + service-role write)
  if (new URL(req.url, "https://x").searchParams.get("mode") === "link-identity") {
    return linkIdentityHandler(req, res);
  }

  // Owner Cloud Report — global analytics, OWNER-ONLY. Authorized via EITHER
  // the existing admin token (preserved) OR the Owner's verified Supabase
  // session matching OWNER_EMAIL (server-side only — never a client-provided
  // role/flag). This removes the internal "create another Admin" loop while
  // keeping every check server-authoritative.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "cloud-report") {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    let authorized = await isAdminToken(token);
    if (!authorized) {
      // Owner identity path: verified session email must match OWNER_EMAIL
      // (server env). No OWNER_EMAIL configured → this path stays closed.
      const ownerEmail = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
      if (ownerEmail) {
        const authUser = await verifyToken(token);
        authorized = Boolean(
          authUser?.email && String(authUser.email).trim().toLowerCase() === ownerEmail
        );
        if (!authorized) {
          audit.logApiForbidden({ type: "owner_session_mismatch" }, { type: "cloud_report" }, { _req: req });
        }
      }
    }
    if (!authorized) {
      audit.logApiForbidden({ type: "non-admin" }, { type: "cloud_report" }, { _req: req });
      json(res, { ok: false, error: "admin_required" }, 403, req);
      return;
    }
    try {
      const report = await buildOwnerReport();
      json(res, report, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // Public buyer discovery — "best of the best" ranking over the existing
  // public catalog + real first-party signal. Read-only, no auth (products
  // are the public feed); never writes, never invents data.
  // Fail-closed: only products with a valid marketerId → known marketer.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "discover") {
    let q = "";
    try {
      const dbody = await readBody(req);
      q = String(dbody?.query || "").slice(0, 120);
    } catch { /* empty query = discover all */ }
    try {
      const { buildRecommendation } = await import("../src/lib/cloud/discovery.js");
      const { filterPublicCatalog, catalogIntegrityReport } = await import("../src/lib/cloud/catalog.js");
      const [productsRow, marketersRow, salesRow, clicksRow] = await Promise.all([
        kvGet("marketplace:products", []),
        kvGet("marketplace:marketers", []),
        kvGet("marketplace:sales", []),
        kvGet("marketplace:clicks", []),
      ]);
      const marketers = Array.isArray(marketersRow) ? marketersRow : [];
      const publicProducts = filterPublicCatalog(productsRow, marketers);
      const recommendation = buildRecommendation(q, {
        products: publicProducts,
        marketers,
        sales: Array.isArray(salesRow) ? salesRow : [],
        clicks: Array.isArray(clicksRow) ? clicksRow : [],
      });
      json(res, {
        ok: true,
        mode: "discover",
        query: q,
        integrity: catalogIntegrityReport(productsRow, marketers),
        ...recommendation,
      }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // Catalog bootstrap — FAIL CLOSED.
  // Legacy path wrote unattributed p1–pN into live KV (no marketerId).
  // Never invent marketer IDs; never seed cloud without a verified owner
  // that already exists in marketplace:marketers. Does not delete existing data.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "bootstrap-catalog") {
    try {
      const { bootstrapProducts, deduplicate, hasValidAttribution, catalogIntegrityReport } = await import("../src/lib/cloud/catalog.js");
      const force = new URL(req.url, "https://x").searchParams.get("force") === "true";
      const ownerParam = new URL(req.url, "https://x").searchParams.get("marketerId");
      const existing = (await kvGet("marketplace:products")) || [];
      const marketers = (await kvGet("marketplace:marketers")) || [];
      const marketerList = Array.isArray(marketers) ? marketers : [];
      const integrity = catalogIntegrityReport(existing, marketerList);

      // Refuse unattributed writes. Owner must be a real existing marketer.
      const ownerId = ownerParam == null ? "" : String(ownerParam).trim();
      const ownerExists = ownerId && marketerList.some((m) => m && String(m.id) === ownerId);
      if (!ownerExists) {
        json(res, {
          ok: false,
          mode: "bootstrap-catalog",
          error: "attribution_required",
          message: "bootstrap-catalog requires marketerId matching an existing marketplace marketer. Unattributed seed writes are blocked. Existing orphan rows stay in KV but are quarantined from public surfaces.",
          integrity,
        }, 403, req);
        return;
      }

      const realProducts = Array.isArray(existing) ? existing.filter((p) => p && p.title && p.title !== "Product") : [];
      const attributedCount = realProducts.filter((p) => hasValidAttribution(p, marketerList)).length;
      if (attributedCount >= 5 && !force) {
        json(res, { ok: true, mode: "bootstrap-catalog", skipped: true, count: attributedCount, integrity, message: "Attributed catalog already populated" }, 200, req);
        return;
      }

      const newProducts = bootstrapProducts({ marketerId: ownerId }).filter((p) => hasValidAttribution(p, marketerList));
      if (!newProducts.length) {
        json(res, { ok: false, mode: "bootstrap-catalog", error: "empty_bootstrap", integrity }, 400, req);
        return;
      }
      const merged = deduplicate([...realProducts, ...newProducts]);
      await kvSet("marketplace:products", merged);
      json(res, {
        ok: true,
        mode: "bootstrap-catalog",
        added: newProducts.length,
        total: merged.length,
        forced: force,
        marketerId: ownerId,
        integrity: catalogIntegrityReport(merged, marketerList),
      }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // ── Trends Intelligence — what's HOT right now (public = attributed only) ──
  if (new URL(req.url, "https://x").searchParams.get("mode") === "trends") {
    try {
      const { filterPublicCatalog } = await import("../src/lib/cloud/catalog.js");
      const [productsRow, marketersRow, salesRow, clicksRow] = await Promise.all([
        kvGet("marketplace:products", []),
        kvGet("marketplace:marketers", []),
        kvGet("marketplace:sales", []),
        kvGet("marketplace:clicks", []),
      ]);
      const { trendSummary } = await import("../src/lib/cloud/trends.js");
      const publicProducts = filterPublicCatalog(productsRow, marketersRow);
      const summary = trendSummary(publicProducts || [], { sales: salesRow || [], clicks: clicksRow || [] });
      return json(res, { ok: true, ...summary }, 200, req);
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { key, value, action, sig, sigTs, sale } = body || {};
  const normalizedKey = String(key || "").toLowerCase().trim();
  if (!normalizedKey || normalizedKey.length > MAX_KEY_LEN) {
    json(res, { ok: false, error: "invalid_key" }, 400, req);
    return;
  }

  const isDelete = action === "delete";
  const keyUpper = normalizedKey.toUpperCase();
  const isSensitive = SENSITIVE_KEYS.has(keyUpper);
  const isSigned = SIGNED_KEYS.has(keyUpper);

  // Sensitive keys (settings / payouts) require an admin token.
  if (isSensitive && !isDelete) {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    const admin = await isAdminToken(token);
    if (!admin) {
      audit.logApiForbidden({ type: "anonymous" }, { type: "key", key: normalizedKey }, { _req: req });
      json(res, { ok: false, error: "admin_required" }, 403, req);
      return;
    }
  }

  // Sales self-reports require a valid server signature (created by /api/sign-sale).
  if (isSigned && !isDelete) {
    const okSig = await verifySaleSignature({ key: normalizedKey, sale, sig, sigTs });
    if (!okSig) {
      audit.logApiForbidden({ type: "unsigned" }, { type: "key", key: normalizedKey }, { _req: req });
      json(res, { ok: false, error: "invalid_signature" }, 403, req);
      return;
    }
    // The signed sale must actually be present in the value being written, so a
    // signature on one sale can't be used to write an arbitrary array.
    const containsSignedSale =
      Array.isArray(value) &&
      sale?.id &&
      value.some((s) => s && s.id === sale.id);
    if (!containsSignedSale) { json(res, { ok: false, error: "signed_sale_missing" }, 403, req); return; }
    // Anti-fraud: the signed sale must appear EXACTLY once in the written
    // array — the same sale can never create a double commission. And history
    // can only GROW: a write may never shrink the existing sales list.
    const occurrences = value.filter((s) => s && s.id === sale.id).length;
    if (occurrences !== 1) { json(res, { ok: false, error: "duplicate_signed_sale" }, 403, req); return; }
    const currentSales = await kvGet(normalizedKey);
    if (Array.isArray(currentSales) && value.length < currentSales.length) {
      audit.logApiForbidden({ type: "history_shrink", from: currentSales.length, to: value.length }, { type: "key", key: normalizedKey }, { _req: req });
      json(res, { ok: false, error: "sales_history_shrink_denied" }, 403, req);
      return;
    }
  }

  try {
    if (isDelete) {
      // Deletes are admin-only (protect the whole marketplace).
      const auth = getHeader(req, "authorization");
      const token = String(auth).replace(/^Bearer\s+/i, "");
      const admin = await isAdminToken(token);
      if (!admin) {
        audit.logApiForbidden({ type: "non-admin" }, { type: "key", key: normalizedKey }, { _req: req });
        json(res, { ok: false, error: "admin_required" }, 403, req);
        return;
      }
      await kvDelete(normalizedKey);
      json(res, { ok: true, key: normalizedKey, deleted: true }, 200, req);
      return;
    }

    // Size cap
    const valueBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (valueBytes > MAX_VALUE_BYTES) {
      json(res, { ok: false, error: "value_too_large" }, 413, req);
      return;
    }

    await kvSet(normalizedKey, value);
    json(res, { ok: true, key: normalizedKey }, 200, req);
  } catch (e) {
    json(res, { ok: false, error: String(e.message || e) }, 500, req);
  }
}
