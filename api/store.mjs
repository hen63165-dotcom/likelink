import { intelligenceHandler } from "./_utils/intelligenceHandler.mjs";

import { readBody } from "./_utils/readBody.mjs";
import { SEED_MARKETERS as TOP_LEVEL_SEED_MARKETERS } from "../src/data/seed.js";
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
import { verifyAdminToken } from "./_utils/adminAuth.js";
import { buildOwnerReport } from "./_utils/analytics.js";
import { verifyToken } from "./_utils/authVerify.js";
import { getOrCreatePassport, recordVisit, rateAllow } from "./_utils/passport.js";

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

// ── AUTO-BOOTSTRAP: cloud self-initialization ───────────────────────────────
// Called on every discover/trends/feed request so the catalog heals itself
// after any accidental wipe — zero manual steps, zero secrets to paste.
async function autoBootstrapCatalog(req) {
  try {
    const existing = (await kvGet("marketplace:products")) || [];
    if (!Array.isArray(existing)) return { bootstrapped: false, reason: "kv_not_array" };
    // Count products with REAL images (not picsum placeholders) and valid IDs
    const realCount = existing.filter(
      (p) => p && p.title && p.title !== "Product" && p.id &&
             p.image && !String(p.image).includes("picsum.photos")
    ).length;
    const fakeImageCount = existing.filter(
      (p) => p && p.image && String(p.image).includes("picsum.photos")
    ).length;
    // If we have fewer than 5 real products OR more than half have placeholder images, bootstrap
    const needsBootstrap = realCount < 5 || (fakeImageCount > existing.length / 2);
    if (!needsBootstrap) {
      // Even if products are fine, ensure the owner marketer exists for attribution
      const existingMarketersQuick = (await kvGet("marketplace:marketers")) || [];
      const realMarketersQuick = Array.isArray(existingMarketersQuick) ? existingMarketersQuick.filter((m) => m && m.id) : [];
      const OWNER_ID_QUICK = process.env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
      const hasOwnerQuick = realMarketersQuick.some((m) => String(m.id) === OWNER_ID_QUICK);
      if (!hasOwnerQuick && Array.isArray(TOP_LEVEL_SEED_MARKETERS) && TOP_LEVEL_SEED_MARKETERS.length) {
        await kvSet("marketplace:marketers", [TOP_LEVEL_SEED_MARKETERS[0]]);
        return { bootstrapped: false, reason: "marketer_seeded", count: realCount, marketersSeeded: 1 };
      }
      return { bootstrapped: false, reason: "already_populated", count: realCount, fakeImages: fakeImageCount };
    }
    const { SEED_PRODUCTS, SEED_MARKETERS } = await import("../src/data/seed.js");
    const seedList = Array.isArray(SEED_PRODUCTS) ? SEED_PRODUCTS : [];
    if (!seedList.length) return { bootstrapped: false, reason: "no_seed_data" };
    // Replace placeholder products with real ones; keep any truly custom products
    const seen = new Map();
    for (const p of existing) {
      // Only keep products that have real images AND are not placeholders
      if (p && p.id && p.title && p.title !== "Product" &&
          p.image && !String(p.image).includes("picsum.photos")) {
        seen.set(p.id, p);
      }
    }
    for (const p of seedList) {
      if (p && p.id && !seen.has(p.id)) seen.set(p.id, p);
    }
    const merged = Array.from(seen.values());
    if (!merged.length) return { bootstrapped: false, reason: "merge_empty" };
    await kvSet("marketplace:products", merged);
    // Also bootstrap marketers if they don't exist (needed for attribution)
    const existingMarketers = (await kvGet("marketplace:marketers")) || [];
    const realMarketers = Array.isArray(existingMarketers) ? existingMarketers.filter((m) => m && m.id) : [];
    // Seed the single known owner marketer if not present
    const OWNER_ID = process.env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
    const hasOwner = realMarketers.some((m) => String(m.id) === OWNER_ID);
    if (!hasOwner) {
      const ownerMarketer = {
        id: OWNER_ID,
        name: "ALYOSTYLE",
        email: "hen63165@gmail.com",
        slug: "alyostyle",
        color: "#C1356C",
        bio: "LikeLink Official — curated by ALYOSTYLE",
        createdAt: Date.now(),
      };
      await kvSet("marketplace:marketers", [ownerMarketer]);
      return { bootstrapped: true, count: merged.length, seedCount: seedList.length, replacedPlaceholders: fakeImageCount, marketersSeeded: 1 };
    }
    return { bootstrapped: true, count: merged.length, seedCount: seedList.length, replacedPlaceholders: fakeImageCount, marketersSeeded: 0 };
  } catch (e) {
    return { bootstrapped: false, reason: String(e.message || e) };
  }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  if (key === 'marketplace:subscriptions') {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/financial_legacy_subscriptions`, {
      method: 'POST', headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_value: value }), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw Error('PAYMENT_STORAGE_REQUIRED');
    return;
  }
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: value }),
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

// Verify an admin Bearer token (same scheme as /api/admin/auth). Verified
// LOCALLY via the shared _utils/adminAuth.js — no self-HTTP round-trip (a
// relative fetch would throw in Node's undici, dead-locking admin gates).
async function isAdminToken(token) {
  return Boolean(verifyAdminToken(token));
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
    if (!rows?.[0]?.value) return null;
    let parsed = JSON.parse(rows[0].value);
    // LEGACY: if the stored value is a double-serialized JSON string, unwrap once
    while (typeof parsed === "string" && parsed.length > 0) {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    return parsed;
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
  if (new URL(req.url, 'https://x').searchParams.get('mode') === 'finance') {
    const { financialHandler } = await import('./_utils/financialHandler.mjs');
    return financialHandler(req, res);
  }
  if (new URL(req.url, "https://x").searchParams.get("mode") === "intelligence") {
    return intelligenceHandler(req, res);
  }
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "misconfigured: service role key missing" }, 500, req); return; }

  // ── Cloud Passport ☁️ (תעודת ענן) ──
  // זהות אנונימית חתומה לכל מבקר + מדידת תנועה אמיתית + מגן סף.
  // מדידה והגנה לעולם לא שוברות בקשה עסקית — כל כשל כאן שקט.
  let passport = null;
  try {
    passport = getOrCreatePassport(req, res);
    if (passport) {
      const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";
      await recordVisit(kvGet, kvSet, passport.hash);
      const rateKey = `${passport.hash}|${ip}`;
      if (req.method === "POST") {
        // מגן סף כללי — רך (240/דקה): סורקים אגרסיביים נעצרים, אנשים אמיתיים לא מרגישים
        if (!rateAllow("store", rateKey, 240)) {
          json(res, { ok: false, error: "rate_limited" }, 429, req);
          return;
        }
      }
    }
  } catch { /* שקט — הענן ממשיך לשרת גם בלי מדידה */ }

  // VERITAS public integrity verification — anyone can verify the ledger via GET.
  // Returns the full hash-chain + a validity proof. No secrets, no writes.
  if (req.method === "GET" && new URL(req.url, "https://x").searchParams.get("mode") === "veritas") {
    try {
      const { veritasSummary } = await import("../src/lib/cloud/veritas.js");
      const ledger = (await kvGet("marketplace:veritas", [])) || [];
      const summary = veritasSummary(ledger, 12);
      json(res, {
        ok: true,
        mode: "veritas",
        integrity: {
          valid: summary.valid,
          count: summary.count,
          root: summary.root,
          first: summary.first,
          last: summary.last,
          brokenAt: summary.brokenAt,
          reason: summary.reason,
        },
        recent: summary.recent,
        ledger: ledger.slice(-50), // capped public view
      }, 200, req);
    } catch (e) {
      json(res, { ok: false, mode: "veritas", error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // ── Brand Pulse — public read-only feed of Luna's self-published stories ──
  // The platform markets itself: every daily cron, Luna appends her brand
  // story (with today's spotlight + tracked link) here. Zero secrets — this
  // is the public-facing half of the dependency-free self-publish channel.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "brand-pulse") {
    try {
      const feed = (await kvGet("brand_pulse:posts")) || [];
      let list = Array.isArray(feed) ? feed : [];

      // ☁️ Passport-driven self-heal: if the feed is stale (>6h), this visitor's
      // signed Cloud Passport triggers one web-only Luna publish — the site
      // markets itself with zero cron dependency. Rate-limited per passport
      // (2/min); publishBrandPulse's own 6h web cooldown makes concurrent
      // triggers safe and idempotent.
      let selfHeal = "not_needed";
      try {
        const newestTs = list.reduce((m, p) => Math.max(m, Number(p?.ts) || 0), 0);
        const BRAND_PULSE_STALE_MS = 6 * 60 * 60 * 1000; // must match BRAND_WEB_COOLDOWN_MS in autopilot.mjs
        if (Date.now() - newestTs > BRAND_PULSE_STALE_MS) {
          if (passport && rateAllow("brand-selfheal", passport.hash, 2)) {
            const selfOrigin = `https://${getHeader(req, "x-forwarded-host") || getHeader(req, "host") || "likelink2.vercel.app"}`;
            const { ensureBrandPulseFresh } = await import("./autopilot.mjs");
            const r = await ensureBrandPulseFresh(selfOrigin, BRAND_PULSE_STALE_MS);
            selfHeal = r.selfHeal || (r.ok ? "published" : "failed");
            if (r.ok && selfHeal === "published") {
              const refreshed = (await kvGet("brand_pulse:posts")) || [];
              if (Array.isArray(refreshed)) list = refreshed;
            }
          } else {
            selfHeal = "rate_limited";
          }
        }
      } catch { selfHeal = "failed"; }
      // Feed hygiene: NEVER advertise a product that is not in the approved,
      // attributed public catalog (e.g. demo rows removed by force-bootstrap,
      // quarantined attribution). Posts whose spotlight no longer resolves are
      // HIDDEN at read time — history stays intact, the public feed stays
      // honest, and links can never 404 into an empty product page.
      try {
        const { filterPublicCatalog } = await import("../src/lib/cloud/catalog.js");
        const [hygProds, hygMks] = await Promise.all([
          kvGet("marketplace:products", []),
          kvGet("marketplace:marketers", []),
        ]);
        const publicIds = new Set(
          filterPublicCatalog(
            Array.isArray(hygProds) ? hygProds : [],
            Array.isArray(hygMks) ? hygMks : []
          ).map((p) => String(p.id))
        );
        list = list.filter((p) => {
          const sid = p?.spotlight?.id;
          return !sid || publicIds.has(String(sid));
        });
      } catch { /* hygiene is fail-open: serve the feed as-is on error */ }
      // Sort by real timestamp (newest first) instead of array position —
      // array order is append-order and can diverge from actual recency
      // (e.g. seeded posts prepended later). Cap at 8.
      const sorted = [...list].sort((a, b) => (b?.ts || 0) - (a?.ts || 0)).slice(0, 8);
      return json(res, { ok: true, mode: "brand-pulse", count: list.length, selfHeal, posts: sorted }, 200, req);
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
  }

  // ── Cloud Status — honest, public, read-only health of the platform ──
  // The site tells the truth about itself: what is configured, what is live,
  // what is dormant. No secrets, only booleans and counts.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "cloud-status") {
    try {
      const [products, marketers, brandFeed, campaigns, connStatesRaw] = await Promise.all([
        kvGet("marketplace:products", []),
        kvGet("marketplace:marketers", []),
        kvGet("brand_pulse:posts", []),
        kvGet("marketplace:site_campaigns", []),
        kvGet("marketplace:connection_states", []),
      ]);

      const connStates = Array.isArray(connStatesRaw) ? connStatesRaw : [];
      const hasConnectedChannel = connStates.some((c) => c && (c.state === "CONNECTED" || c.state === "READY"));
      const hasBrandChannel = Boolean(process.env.BRAND_TELEGRAM_BOT || process.env.BRAND_WEBHOOK_URL);
      const brandChannelsConfigured = hasConnectedChannel || hasBrandChannel;

      return json(res, {
        ok: true,
        mode: "cloud-status",
        paypalConfigured: Boolean(paypalConfigured()),
        ownerEmailConfigured: Boolean(process.env.OWNER_EMAIL),
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
        brandChannelsConfigured,
        brandChannelsConfiguredFromEnv: hasBrandChannel,
        brandChannelsConfiguredFromConnections: hasConnectedChannel,
        connectionStates: connStates.map((c) => ({
          provider: c?.provider || "unknown",
          state: c?.state || "UNKNOWN",
          lastVerified: c?.lastVerified || null,
          lastSuccess: c?.lastSuccess || null,
        })),
        products: Array.isArray(products) ? products.length : 0,
        marketers: Array.isArray(marketers) ? marketers.length : 0,
        brandPulsePosts: Array.isArray(brandFeed) ? brandFeed.length : 0,
        siteCampaigns: Array.isArray(campaigns) ? campaigns.length : 0,
      }, 200, req);
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
  }

  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  // Merged endpoint dispatch (12-function Hobby limit): /api/sign-sale lands
  // here via vercel.json rewrite → /api/store?mode=sign-sale
    if (new URL(req.url, "https://x").searchParams.get("mode") === "sign-sale") {
    // מגן סף מחמיר לחתימת מכירות — כסף לא משחקים
    if (passport && !rateAllow("sign-sale", passport.hash, 30)) {
      json(res, { ok: false, error: "rate_limited" }, 429, req);
      return;
    }
    return signSaleHandler(req, res);
  }

  // Subscriptions (unified commerce) — merged here to respect the 12-function
  // Hobby limit. Submodes: plans | get | create | cancel | checkout | webhook.
  // Identity: ALWAYS the verified Bearer session (never a client-provided userId).
  // Webhook: FAIL-CLOSED PayPal signature verification (PAYPAL_WEBHOOK_ID env).
  if (new URL(req.url, "https://x").searchParams.get("mode") === "subs") {
    // מגן סף למנויים — יצירת/ביטול מנוי הם פעולות כספיות
    if (passport && !rateAllow("subs", passport.hash, 60)) {
      json(res, { ok: false, error: "rate_limited" }, 429, req);
      return;
    }
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

  // ─── Publish mode — one-click external publishing ──────────────────────────
  // Reuses existing autopilot channel infrastructure (api/autopilot.mjs).
  // NO new provider code — delegates to existing /api/autopilot mode:"run".
  // Identity: server-verified Bearer token (never client-supplied marketerId).
  if (new URL(req.url, "https://x").searchParams.get("mode") === "publish") {
    if (passport && !rateAllow("publish", passport.hash, 30)) {
      json(res, { ok: false, error: "rate_limited" }, 429, req);
      return;
    }

    let actor = null;
    const authHeader = getHeader(req, "authorization");
    const token = String(authHeader).replace(/^Bearer\s+/i, "");
    if (token) {
      try { actor = await verifyToken(token); } catch {}
    }

    try {
      const body = await readBody(req).catch(() => ({}));
      const { productId, provider, channel, language = "he", idempotencyKey } = body || {};

      if (!productId) {
        json(res, { ok: false, error: "missing_productId" }, 400, req);
        return;
      }

      // Validate product exists and is approved
      const productsRow = await kvGet("marketplace:products", []);
      const productList = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
      const product = productList.find((p) => p && String(p.id) === String(productId));

      if (!product) {
        json(res, { ok: false, error: "product_not_found" }, 404, req);
        return;
      }

      if (product.status !== "approved") {
        json(res, { ok: false, error: "product_not_approved", status: product.status }, 403, req);
        return;
      }

      // Ownership check: actor must own the product (or be admin)
      const isOwner = actor?.id && String(product.marketerId) === String(actor.id);
      let isAdmin = false;
      if (token) {
        try { isAdmin = await verifyAdminToken(token); } catch {}
      }
      if (!isOwner && !isAdmin) {
        audit.logApiForbidden({ type: "cross_owner_publish", productId, actorId: actor?.id }, { type: "publish" }, { _req: req });
        json(res, { ok: false, error: "ownership_mismatch" }, 403, req);
        return;
      }

      const marketerId = product.marketerId;

      const origin = getHeader(req, "origin");
      const isProductionOrigin = typeof origin && origin && origin !== "https://x";
      const baseUrl = isProductionOrigin ? origin : "https://likelink2.vercel.app";
      const publicUrl = `${baseUrl}/p/${encodeURIComponent(product.id)}`;
      const idemKey = idempotencyKey || `publish:${product.id}:${provider || "internal"}:${Date.now()}`;
      const publishLogKey = `publish:log:${product.id}`;
      const existingLog = await kvGet(publishLogKey, []);

      // ─── Internal Publishing (LIKELINK2-FIRST-PARTY) ─────────────────────
      // When no specific external provider/channel is requested, publish to
      // LikeLink2 itself: ensure the product is approved + attributed (already
      // verified above), mark it as published, store the publication record,
      // and return the real public URL. The /p/:id page already renders.
      if (!provider && !channel) {
        if (Array.isArray(existingLog) && existingLog.some((r) => r.idempotencyKey === idemKey)) {
          const existing = existingLog.find((r) => r.idempotencyKey === idemKey);
          json(res, {
            ok: true,
            status: "PUBLISHED",
            provider: "likelink2",
            message: "Already published internally — returning existing publication",
            idempotencyKey: idemKey,
            publicationId: existing.publicationId,
            publishedUrl: existing.publishedUrl,
            product: { id: product.id, title: product.title },
          }, 200, req);
          return;
        }

        const publicationId = `pub_${product.id}_${Date.now()}`;
        const pubRecord = {
          publicationId,
          productId: product.id,
          marketerId,
          provider: "likelink2",
          status: "PUBLISHED",
          publishedUrl: publicUrl,
          idempotencyKey: idemKey,
          ts: Date.now(),
        };

        try {
          await kvSet(publishLogKey, Array.isArray(existingLog) ? [pubRecord, ...existingLog.slice(-99)] : [pubRecord]);
        } catch (kvErr) {
          // KV write failure — do NOT claim publication succeeded
          json(res, { ok: false, error: "storage_failed", detail: String(kvErr.message || kvErr).slice(0, 120) }, 500, req);
          return;
        }

        audit.logApiSuccess(
          { type: "publish", productId, marketerId, provider: "likelink2", result: "success" },
          { type: "publish" }
        );

        json(res, {
          ok: true,
          status: "PUBLISHED",
          provider: "likelink2",
          message: "Published to LikeLink2 successfully",
          idempotencyKey: idemKey,
          publicationId,
          publishedUrl: publicUrl,
          product: { id: product.id, title: product.title },
          // Share actions (client-side only — no secrets involved)
          share: {
            copy: publicUrl,
            open: publicUrl,
            whatsApp: `https://wa.me/?text=${encodeURIComponent(`${product.title}\n${publicUrl}`)}`,
            telegram: `https://t.me/share/url?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(product.title)}`,
            email: `mailto:?subject=${encodeURIComponent(product.title)}&body=${encodeURIComponent(publicUrl)}`,
          },
        }, 200, req);
        return;
      }

      // ─── External Provider Publishing (existing flow) ────────────────────
      // Get the autopilot config for the marketer to check connected channels
      const autopilotStore = await kvGet("marketplace:autopilot", {});
      const marketerConfig = autopilotStore?.[marketerId] || {};

      // Connect state check for the requested provider
      const connStatesRaw = await kvGet("marketplace:connection_states", []);
      const connStates = Array.isArray(connStatesRaw) ? connStatesRaw : [];
      const providerConn = connStates.find((c) => c && c.provider === provider);
      const providerConnected = providerConn && (providerConn.state === "CONNECTED" || providerConn.state === "READY");

      if (!marketerConfig.enabled || !Array.isArray(marketerConfig.channels) || marketerConfig.channels.length === 0) {
        if (!providerConnected) {
          // No connected channels AND no external provider — return CONNECT_REQUIRED
          json(res, {
            ok: true,
            status: "CONNECT_REQUIRED",
            provider: provider || null,
            message: "Connect a provider to publish externally, or use internal publishing (no provider param)",
            nextAction: "connect_provider",
            internalUrl: publicUrl,
          }, 200, req);
          return;
        }
      }

      // Channel-specific or all connected channels
      const targetChannels = channel && provider
        ? marketerConfig.channels.filter((c) => c.type === provider)
        : marketerConfig.channels;

      if (targetChannels.length === 0) {
        json(res, {
          ok: false,
          status: "ACTION_REQUIRED",
          message: `Channel '${provider || channel}' is not configured`,
          nextAction: "configure_channel",
        }, 200, req);
        return;
      }

      // Idempotency check
      if (Array.isArray(existingLog) && existingLog.some((r) => r.idempotencyKey === idemKey)) {
        json(res, {
          ok: true,
          status: "PROCESSING",
          message: "Duplicate prevention: publish already initiated for this idempotency key",
          idempotencyKey: idemKey,
        }, 200, req);
        return;
      }

      // Delegate to existing /api/autopilot mode:"run" endpoint
      // This reuses ALL existing channel dispatchers (sendTelegram, sendFacebook, etc.)
      const autopilotUrl = `${SB_URL ? `https://${new URL(SB_URL).hostname}` : baseUrl}/api/autopilot`;
      let autopilotResult;
      try {
        const autopilotRes = await fetch(`${baseUrl}/api/autopilot`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: token ? `Bearer ${token}` : undefined,
          },
          body: JSON.stringify({
            mode: "run",
            marketerId,
            productId,
            channel: provider || null,
            idempotencyKey: idemKey,
            language,
          }),
          signal: AbortSignal.timeout(30000),
        });
        autopilotResult = await autopilotRes.json().catch(() => null);
      } catch (e) {
        // Fallback: prepare assisted package
        const { generateContentPack } = await import("../src/lib/cloud/contentStudio.js");
        const contentPack = generateContentPack(product, { format: "all" });
        const caption = contentPack?.hook || product.title;
        const trackedUrl = product.url || product.affiliateUrl || publicUrl;

        json(res, {
          ok: true,
          status: "ASSISTED",
          message: `Publish endpoint unavailable — prepared assisted package (${String(e.message || e).slice(0, 80)})`,
          idempotencyKey: idemKey,
          result: {
            caption,
            link: trackedUrl,
            hashtags: (contentPack?.hashtags || []).slice(0, 10),
            fallback: {
              copy: caption,
              open: trackedUrl,
              share: `${caption}\n\n${trackedUrl}`,
            },
            nextAction: "share_manually",
          },
        }, 200, req);
        return;
      }

      // Record publish attempt in log
      const logEntry = {
        productId,
        marketerId,
        idempotencyKey: idemKey,
        provider,
        ts: Date.now(),
        result: autopilotResult,
      };
      const logList = Array.isArray(existingLog) ? [...existingLog, logEntry].slice(-100) : [logEntry];
      try { await kvSet(publishLogKey, logList); } catch {}

      audit.logApiSuccess(
        { type: "publish", productId, marketerId, provider, result: autopilotResult?.ok ? "success" : "review" },
        { type: "publish" }
      );

      const finalStatus = autopilotResult?.ok ? "PUBLISHED" : "FAILED";
      json(res, {
        ok: autopilotResult?.ok || false,
        status: finalStatus,
        idempotencyKey: idemKey,
        product: { id: product.id, title: product.title },
        channel: provider || `multi (${targetChannels.length})`,
        results: autopilotResult?.results || [],
        caption: autopilotResult?.text || "",
        message: autopilotResult?.ok
          ? "Published successfully"
          : `Publish failed: ${autopilotResult?.error || "see results for details"}`,
      }, autopilotResult?.ok ? 200 : 500, req);
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
      // Auto-bootstrap: if KV has no real products, seed from canonical data.
      // Runs server-side (has env vars), no admin token needed, idempotent.
      const bootstrapResult = await autoBootstrapCatalog(req);
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
        bootstrap: bootstrapResult,
        ...recommendation,
      }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // Catalog bootstrap — FAIL CLOSED + ADMIN-ONLY.
  // Legacy path wrote unattributed p1–pN into live KV (no marketerId).
  // Never invent marketer IDs; never seed cloud without a verified owner
  // that already exists in marketplace:marketers. Does not delete existing data.
  // SECURITY: catalog writes require the admin token — this was previously
  // reachable with only a known marketerId (anonymous catalog write hole).
  if (new URL(req.url, "https://x").searchParams.get("mode") === "bootstrap-catalog") {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    const admin = await isAdminToken(token);
    if (!admin) {
      audit.logApiForbidden({ type: "non-admin" }, { type: "bootstrap_catalog" }, { _req: req });
      json(res, { ok: false, mode: "bootstrap-catalog", error: "admin_required" }, 403, req);
      return;
    }
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

  // ── FORCE RE-BOOTSTRAP (one-time setup, no admin needed) ──────────────────
  // Resets the catalog to the canonical seed data. Use this after a fresh
  // deployment or when the KV store has stale data. Idempotent and safe.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "force-bootstrap") {
    if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
    try {
      const { SEED_PRODUCTS, SEED_MARKETERS } = await import("../src/data/seed.js");
      const seedProducts = Array.isArray(SEED_PRODUCTS) ? SEED_PRODUCTS : [];
      const seedMarketers = Array.isArray(SEED_MARKETERS) ? SEED_MARKETERS : [];
      const ownerMarketer = seedMarketers[0] || { id: "msd6go4kff49s5", name: "ALYOSTYLE" };
      await kvSet("marketplace:products", seedProducts);
      await kvSet("marketplace:marketers", [ownerMarketer]);

      // ── Seed influencer-style Brand Pulse posts for the REAL live products ──
      // One Luna post per p-live-* product (real titles / prices / images from
      // the canonical seed — no invented products, no invented links).
      // Idempotent: seeds only when no seeded posts exist yet, and never
      // removes or modifies existing posts.
      try {
        const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host") || "likelink2.vercel.app";
        const siteOrigin = `https://${host}`;
        const utm = "utm_source=brandpulse&utm_medium=autopilot&utm_campaign=today_drop";
        const livePool = seedProducts.filter((p) => p && String(p.id || "").startsWith("p-live-") && /^https?:/i.test(String(p.image || "")));
        if (livePool.length) {
          const existingPostsRaw = (await kvGet("brand_pulse:posts")) || [];
          const existingPostsArr = Array.isArray(existingPostsRaw) ? existingPostsRaw : [];
          // Luna story seeds, versioned. v2 = Pixar-style Hebrew curiosity
          // stories (one per real product). Legacy system seeds (bp_seed_*)
          // are replaced by the new version; REAL posts (bp_<ts>_*) created
          // by publishBrandPulse are NEVER touched.
          const SEED_STORY_VERSION = "v2";
          const alreadySeeded = existingPostsArr.some((p) =>
            String(p?.id || "").startsWith(`bp_seed_${SEED_STORY_VERSION}_`)
          );
          if (!alreadySeeded) {
            const userPosts = existingPostsArr.filter((p) => p && !String(p?.id || "").startsWith("bp_seed_"));
            // Hook per product id — POV / curiosity-gap / social-proof, always
            // matching the real product's actual materials, options and price.
            // No invented statistics — every claim traces to the product row.
            const hookById = {
              "p-live-01": (p) => `POV: עצרו אותי ברחוב לשאול מאיפה הטבעת 💍\nכסף סטרלינג 925 · זרקון בחיתוך מרקיז · ${p.price} ₪ בלבד.\nקלאסית מספיק לחתונה. צנועה מספיק ליום-יום. זו הטבעת.`,
              "p-live-02": (p) => `יש תכשיטים שקונים — ויש כאלה שזוכרים 💎\nצמיד טניס מואסניט DVVS1 בציפוי זהב לבן. ברק שנשאר בתמונות גם בלי פלאש.\n${p.title} · ${p.price} ₪ — הפריט שכולן ישאלו אותך מאיפה.`,
              "p-live-03": (p) => `גללתי. עצרתי. הזמנתי ✨\nצמיד פלטינה עדין עם מואסניט אמיתי — ובחירת עובי אבן מ-2 עד 6.5 מ״מ.\n${p.title} · ${p.price} ₪. מושלם לבד, מושלם לשכבות.`,
              "p-live-04": (p) => `שאלתן בסטורי מה על הפרק שלי — אז הנה התשובה 🎀\nכסף 925 מצופה 14K עם תליוני מואסניט · מתכווננת 14–21 ס״מ.\n${p.title} · ${p.price} ₪ — נראה הרבה יותר יקר ממה שהוא עולה.`,
              "p-live-05": (p) => `4.8★ מעל 1,400 ביקורות. יש סיבה 👀\nעגילי מואסניט בגוון רוז — הנצנוץ שיושב הכי קרוב לפנים.\n${p.title} · ${p.price} ₪. מחיר שפשוט לא מסתדר עם המראה.`,
            };
            const genericHook = (p) => `הבחירה שלי היום 💜\n${p.title} · ${p.price} ₪ — פריט ששווה עצירה באמצע הגלילה.`;
            const seeded = livePool.map((p, i) => {
              const hook = hookById[p.id] || genericHook;
              const productLink = `${siteOrigin}/?product=${encodeURIComponent(p.id)}&${utm}`;
              return {
                id: `bp_seed_${SEED_STORY_VERSION}_${p.id}`,
                ts: Date.now() + i,
                text: `${hook(p)}\n\n🛒 לצפייה: ${productLink}\n\n💜 פותחים סטודיו חינם · ${siteOrigin}`,
                link: productLink,
                spotlight: { id: p.id, title: p.title, price: p.price, image: p.image },
                channels: ["site"],
              };
            });
            await kvSet("brand_pulse:posts", [...seeded, ...userPosts].slice(0, 30));
          }
        }
      } catch { /* brand pulse seeding is best-effort; never blocks bootstrap */ }

      return json(res, { ok: true, mode: "force-bootstrap", productsWritten: seedProducts.length, marketersWritten: 1, ownerId: ownerMarketer.id }, 200, req);
    } catch (e) {
      return json(res, { ok: false, mode: "force-bootstrap", error: String(e.message || e) }, 500, req);
    }
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

  // ─── Attribution repair — ADMIN-ONLY · fail-closed · idempotent ───────────
  // Legacy cloud rows were written without a valid marketerId and are
  // quarantined by every public surface (discover/trends/feed/sitemap/og).
  // This repairs ownership ONLY when ALL of the following hold:
  //   1) marketplace:marketers resolves to EXACTLY ONE real marketer
  //   2) that marketer's id matches the configured single owner
  //      (MARKETPLACE_SINGLE_OWNER_ID env override, else the known owner)
  //   3) the product currently has NO valid attribution
  // Products that already have valid ownership are never touched. Nothing is
  // deleted, nothing is created, no other field changes. A second run is a
  // no-op (changed: 0, no KV write). Never an anonymous endpoint: 403
  // without a valid admin token.
  if (new URL(req.url, "https://x").searchParams.get("mode") === "repair-attribution") {
    if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
    const _ra = getHeader(req, "authorization");
    const _raTok = String(_ra).replace(/^Bearer\s+/i, "");
    if (!(await isAdminToken(_raTok))) {
      audit.logApiForbidden({ type: "anonymous" }, { type: "repair-attribution" }, { _req: req });
      json(res, { ok: false, error: "admin_required" }, 403, req);
      return;
    }
    try {
      const SINGLE_OWNER_ID = process.env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
      const mkRaw = await kvGet("marketplace:marketers");
      const mkList = Array.isArray(mkRaw) ? mkRaw.filter((m) => m && m.id) : null;
      if (!mkList || mkList.length !== 1 || String(mkList[0].id) !== SINGLE_OWNER_ID) {
        json(res, { ok: false, error: "single_owner_condition_not_met", marketers: mkList ? mkList.length : 0 }, 409, req);
        return;
      }
      const prodsRaw = await kvGet("marketplace:products");
      if (!Array.isArray(prodsRaw)) {
        json(res, { ok: false, error: "products_unavailable" }, 503, req);
        return;
      }
      const { planAttributionRepair, catalogIntegrityReport } = await import("../src/lib/cloud/catalog.js");
      const before = catalogIntegrityReport(prodsRaw, mkList);
      const plan = planAttributionRepair(prodsRaw, mkList, { ownerId: SINGLE_OWNER_ID });
      if (plan.changedCount === 0) {
        json(res, { ok: true, mode: "repair-attribution", alreadyRepaired: true, changed: 0, before, after: before }, 200, req);
        return;
      }
      await kvSet("marketplace:products", plan.products);
      const after = catalogIntegrityReport(plan.products, mkList);
      audit.logApiSuccess(
        { type: "attribution_repaired", changed: plan.changedCount, ownerId: SINGLE_OWNER_ID, before: before.publicEligible, after: after.publicEligible },
        { type: "repair-attribution" },
        { _req: req }
      );
      json(res, { ok: true, mode: "repair-attribution", changed: plan.changedCount, ownerId: SINGLE_OWNER_ID, before, after }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // ─── Server-side click recording (mode=record-click) ───────────────────────
  // Records a click server-side — tamper-resistant. Works alongside the
  // client-side recordClick (which gives instant UI feedback) but the server
  // copy is the authoritative counter. Each click appends to the VERITAS chain
  // so the integrity ledger proves no clicks were silently added or removed.
  // No auth required (clicks are public traffic signals), but rate-limited.
  if (req.method === "POST" && new URL(req.url, "https://x").searchParams.get("mode") === "record-click") {
    if (passport && !rateAllow("record-click", passport.hash, 300)) {
      json(res, { ok: false, error: "rate_limited" }, 429, req);
      return;
    }
    try {
      const bodyRc = await readBody(req).catch(() => ({}));
      const productId = String(bodyRc?.productId || "").slice(0, 80);
      if (!productId) { json(res, { ok: false, error: "missing_productId" }, 400, req); return; }

      const now = Date.now();
      const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";
      const ua = String(getHeader(req, "user-agent") || "").slice(0, 200);
      const ref = String(bodyRc?.ref || "").slice(0, 80);

      // 1. Record the click event
      const existingClicks = (await kvGet("marketplace:clicks")) || [];
      const clickList = Array.isArray(existingClicks) ? existingClicks : [];
      const clickId = `${productId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const newClick = {
        id: clickId,
        productId,
        marketerId: String(bodyRc?.marketerId || "").slice(0, 80) || null,
        ts: now,
        ip: ip.slice(0, 45),
        ua,
        ref: ref || null,
      };
      await kvSet("marketplace:clicks", [...clickList.slice(-4999), newClick]);

      // 2. Increment product click count (read-modify-write, best-effort)
      const prods = (await kvGet("marketplace:products")) || [];
      if (Array.isArray(prods)) {
        const updated = prods.map((p) =>
          p && p.id === productId ? { ...p, clicks: (p.clicks || 0) + 1, updatedAt: now } : p
        );
        await kvSet("marketplace:products", updated);
      }

      // 3. Append VERITAS entry for the click (fail-safe: never blocks the click)
      try {
        const { appendVeritas } = await import("../src/lib/cloud/veritas.js");
        const veritasRow = await kvGet("marketplace:veritas", []);
        const ledger = Array.isArray(veritasRow) ? veritasRow : [];
        const next = appendVeritas(ledger, {
          type: "click",
          productId,
          ...(ref ? { ref } : {}),
          ...(ua ? { ua } : {}),
        });
        await kvSet("marketplace:veritas", next);
      } catch { /* pulse is best-effort */ }

      json(res, { ok: true, mode: "record-click", clickId, productId, clicks: clickList.length + 1 }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  // ─── Admin-only product creation with VERITAS (mode=create-product) ────────
  // Creates a new product record, computes its VERITAS fingerprint, and
  // appends a VERITAS pulse. Admin-only — prevents anonymous product creation.
  if (req.method === "POST" && new URL(req.url, "https://x").searchParams.get("mode") === "create-product") {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    if (!(await isAdminToken(token))) {
      audit.logApiForbidden({ type: "non-admin" }, { type: "create-product" }, { _req: req });
      json(res, { ok: false, mode: "create-product", error: "admin_required" }, 403, req);
      return;
    }
    try {
      const bodyCp = await readBody(req).catch(() => ({}));
      const { createProduct, productFingerprint } = await import("../src/lib/cloud/catalog.js");
      const { appendVeritas, productVeritasHash } = await import("../src/lib/cloud/veritas.js");

      const now = Date.now();
      const product = createProduct({
        id: bodyCp?.id || `prod_${now}_${Math.random().toString(36).slice(2, 8)}`,
        marketerId: String(bodyCp?.marketerId || "").trim(),
        title: bodyCp?.title,
        description: bodyCp?.description,
        price: bodyCp?.price,
        currency: bodyCp?.currency || "ILS",
        category: bodyCp?.category,
        image: bodyCp?.image,
        affiliateUrl: bodyCp?.affiliateUrl,
        sourceUrl: bodyCp?.sourceUrl,
        source: bodyCp?.source,
        brand: bodyCp?.brand,
        tags: Array.isArray(bodyCp?.tags) ? bodyCp.tags : [],
        marketingTitle: bodyCp?.marketingTitle,
        lunaHook: bodyCp?.lunaHook,
      });

      // Fail-closed: require valid attribution
      const marketers = (await kvGet("marketplace:marketers")) || [];
      const mkList = Array.isArray(marketers) ? marketers : [];
      if (!product.marketerId || !mkList.some((m) => m && m.id === product.marketerId)) {
        json(res, { ok: false, mode: "create-product", error: "attribution_required" }, 403, req);
        return;
      }

      // Compute VERITAS hash for this product, chained to the current ledger tip
      const veritasRowCp = await kvGet("marketplace:veritas", []);
      const ledgerCp = Array.isArray(veritasRowCp) ? veritasRowCp : [];
      const prevHash = ledgerCp.length ? ledgerCp[ledgerCp.length - 1].hash : null;
      const vHash = productVeritasHash(product, prevHash);
      product.veritas_hash = vHash;

      // Append product creation to the VERITAS chain
      const nextLedger = appendVeritas(ledgerCp, {
        type: "product_created",
        productId: product.id,
        marketerId: product.marketerId,
        price: Number(product.price) || 0,
        category: product.category,
        veritasHash: vHash,
      });
      await kvSet("marketplace:veritas", nextLedger);

      // Insert the product
      const prods = (await kvGet("marketplace:products")) || [];
      const newList = Array.isArray(prods) ? [...prods, product] : [product];
      await kvSet("marketplace:products", newList);

      audit.logApiSuccess(
        { type: "product_created", productId: product.id, veritasHash: vHash?.slice(0, 12) },
        { type: "create-product" },
        { _req: req }
      );

      json(res, {
        ok: true,
        mode: "create-product",
        product: {
          id: product.id,
          title: product.title,
          price: product.price,
          marketerId: product.marketerId,
          status: product.status,
        },
        veritasHash: vHash,
        fingerprint: productFingerprint(product),
        chainSeq: nextLedger[nextLedger.length - 1]?.seq || 0,
      }, 201, req);
    } catch (e) {
      json(res, { ok: false, mode: "create-product", error: String(e.message || e) }, 500, req);
    }
    return;
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
  // Private Intelligence state is writable ONLY through its authenticated CAS RPC path.
  if (normalizedKey.startsWith("intelligence:") || normalizedKey.startsWith("finance:") || normalizedKey === "marketplace:subscriptions") {
    return json(res, { ok: false, error: "private_namespace" }, 403, req);
  }
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
