import { createHash } from "node:crypto";
import { readBody } from "../_utils/readBody.mjs";
// Vercel Serverless Function — PayPal Checkout Order Creator 🛒
//
// Creates a real PayPal v2/checkout/orders for the buyer's cart.
// The order total = sum of the CATALOG prices of the requested products
// (multi-seller carts are paid as one transaction; the platform then splits
// funds to sellers via the daily Payouts worker).
//
// The browser sends product ids, quantities, buyer email, and an optional
// referral token. Prices and seller attribution come from server data; the
// referral token is resolved to a creator id before the order is persisted.
//
// Env vars: PAYPAL_CLIENT_ID (fallback VITE_PAYPAL_CLIENT_ID), PAYPAL_CLIENT_SECRET,
//           PAYPAL_ENV=sandbox|live (optional), VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/checkout/create-order
// Body: { items: [{ productId, quantity }], buyerEmail, referralCreatorId? }
// Returns: { ok, orderId, approvalUrl, total, currency }

import { jsonCors } from "../_utils/cors.js";
import { paypalBase, getPayPalToken } from "../_utils/paypal.js";
import { originFromRequest } from "../_utils/origin.mjs";
import { priceCart } from "../_utils/checkoutCatalog.mjs";
import { noteKvReadFailed, readKvResponse } from "../../src/lib/cloud/kvReadGuard.js";
import {
  getCheckoutOrderByIdempotency,
  hashIdempotencyKey,
  insertCheckoutOrder,
  deleteExpiredCheckoutOrders,
  updateCheckoutOrderByIdempotency,
} from "../_utils/checkoutOrders.mjs";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type", "idempotency-key"],
  });
}

async function kvGetStrict(key) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    noteKvReadFailed(key);
    return { failed: true };
  }
  return readKvResponse(key, res);
}

function checkoutId() {
  return `co_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { items = [], buyerEmail = "" } = body || {};
  const rawReferralCreatorId = String(body?.referralCreatorId || "").trim();
  if (rawReferralCreatorId.length > 120 || /[\u0000-\u001f\u007f]/.test(rawReferralCreatorId)) {
    json(res, { ok: false, error: "invalid_referral" }, 400, req);
    return;
  }
  const rawIdempotencyKey = String(req.headers?.["idempotency-key"] || "").trim();
  if (rawIdempotencyKey.length < 16 || rawIdempotencyKey.length > 200) {
    json(res, { ok: false, error: "idempotency_key_required" }, 400, req);
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    json(res, { ok: false, error: "empty_cart" }, 400, req);
    return;
  }
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(buyerEmail).trim())) {
    json(res, { ok: false, error: "invalid_buyer_email" }, 400, req);
    return;
  }
  // Fail closed: without storage the order could not be verified at capture.
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 503, req); return; }

  const catalog = await kvGetStrict("marketplace:products");
  if (catalog.failed) { json(res, { ok: false, error: "catalog_unavailable" }, 503, req); return; }
  const priced = priceCart(items, catalog.found ? catalog.value : []);
  if (!priced.ok) { json(res, { ok: false, error: priced.error, productId: priced.productId }, 400, req); return; }
  let referralCreatorId = null;
  if (rawReferralCreatorId) {
    const referralCreators = await kvGetStrict("marketplace:marketers");
    if (referralCreators.failed) { json(res, { ok: false, error: "referral_unavailable" }, 503, req); return; }
    const token = rawReferralCreatorId.toLowerCase();
    const creator = (Array.isArray(referralCreators.value) ? referralCreators.value : []).find((row) =>
      [row?.id, row?.slug].some((value) => String(value || "").trim().toLowerCase() === token)
    );
    if (!creator?.id) { json(res, { ok: false, error: "invalid_referral" }, 400, req); return; }
    referralCreatorId = String(creator.id);
  }
  const normalizedItems = items
    .map((item) => ({ productId: String(item?.productId || "").trim(), quantity: Math.floor(Number(item?.quantity ?? 1)) }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
  const normalizedEmail = String(buyerEmail || "").trim().toLowerCase();
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ items: normalizedItems, buyerEmail: normalizedEmail, lines: priced.lines, total: priced.total, currency: priced.currency, referralCreatorId }))
    .digest("hex");
  const idempotencyKey = hashIdempotencyKey(rawIdempotencyKey);
  let existing;
  try {
    await deleteExpiredCheckoutOrders(SB_URL, SB_KEY);
    existing = await getCheckoutOrderByIdempotency(SB_URL, SB_KEY, idempotencyKey);
  } catch (error) {
    console.error("[checkout] idempotency lookup failed", String(error?.message || error).slice(0, 160));
    json(res, { ok: false, error: "storage_unavailable" }, 503, req);
    return;
  }
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      json(res, { ok: false, error: "idempotency_key_conflict" }, 409, req);
      return;
    }
    if (existing.status === "CREATED" && existing.paypal_order_id && existing.order_data?.approvalUrl) {
      json(res, {
        ok: true,
        orderId: existing.paypal_order_id,
        status: "CREATED",
        approvalUrl: existing.order_data.approvalUrl,
        total: Number(existing.order_data.total).toFixed(2),
        currency: existing.order_data.currency,
        replayed: true,
      }, 200, req);
      return;
    }
    json(res, { ok: false, error: "checkout_in_progress" }, 409, req);
    return;
  }

  // Never pretend a production checkout succeeded. A missing credential is a
  // deployment/configuration error, not an order that can be approved.
  const token = await getPayPalToken();
  if (!token) {
    json(res, { ok: false, error: "paypal_not_configured" }, 503, req);
    return;
  }

  // Return/cancel targets are built server-side from the public origin — a
  // client-supplied URL could turn PayPal's redirect into an open redirect.
  const coId = checkoutId();
  const money = (n) => Number(n).toFixed(2);

  try {
    const inserted = await insertCheckoutOrder(SB_URL, SB_KEY, {
      idempotency_key: idempotencyKey,
      request_fingerprint: requestFingerprint,
      status: "CREATING",
      order_data: {
        checkoutId: coId,
        lines: priced.lines,
        total: priced.total,
        currency: priced.currency,
        buyerEmail: normalizedEmail,
        referralCreatorId,
      },
    });
    if (!inserted) {
      const raced = await getCheckoutOrderByIdempotency(SB_URL, SB_KEY, idempotencyKey);
      if (raced?.request_fingerprint === requestFingerprint && raced.status === "CREATED" && raced.order_data?.approvalUrl) {
        json(res, {
          ok: true,
          orderId: raced.paypal_order_id,
          status: "CREATED",
          approvalUrl: raced.order_data.approvalUrl,
          total: Number(raced.order_data.total).toFixed(2),
          currency: raced.order_data.currency,
          replayed: true,
        }, 200, req);
        return;
      }
      json(res, { ok: false, error: raced ? "checkout_in_progress" : "storage_unavailable" }, raced ? 409 : 503, req);
      return;
    }
    const origin = originFromRequest(req);
    const orderRes = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": `create-${idempotencyKey.slice(0, 30)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: coId,
            amount: {
              currency_code: priced.currency,
              value: money(priced.total),
              breakdown: { item_total: { currency_code: priced.currency, value: money(priced.total) } },
            },
            items: priced.lines.map((l) => ({
              name: l.title.slice(0, 127),
              sku: l.productId.slice(0, 127),
              unit_amount: { currency_code: priced.currency, value: money(l.unitPrice) },
              quantity: String(l.quantity),
            })),
          },
        ],
        // GUEST_CHECKOUT opens PayPal's card form first, so a buyer can pay with a
        // credit/debit card without a PayPal account (PayPal processes the card;
        // LikeLink never sees card data). PayPal decides per buyer/country.
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "LikeLink",
              locale: "he-IL",
              landing_page: "GUEST_CHECKOUT",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: `${origin}/?paypal_return=1`,
              cancel_url: `${origin}/`,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!orderRes.ok) {
      // Provider detail stays in the server log — the buyer gets a clear code.
      console.warn("[checkout] PayPal order rejected", orderRes.status, (await orderRes.text().catch(() => "")).slice(0, 300));
      json(res, { ok: false, error: "paypal_order_failed" }, 502, req);
      return;
    }

    const order = await orderRes.json();
    // With payment_source the buyer link is "payer-action" ("approve" on older responses).
    const approvalLink = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!order.id || !approvalLink) { json(res, { ok: false, error: "paypal_order_failed" }, 502, req); return; }

    try {
      const saved = await updateCheckoutOrderByIdempotency(SB_URL, SB_KEY, idempotencyKey, {
        paypal_order_id: order.id,
        status: "CREATED",
        order_data: {
          checkoutId: coId,
          lines: priced.lines,
          total: priced.total,
          currency: priced.currency,
          buyerEmail: normalizedEmail,
          referralCreatorId,
          approvalUrl: approvalLink,
          paypalStatus: order.status || "CREATED",
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, "CREATING");
      if (!saved) throw new Error("checkout_order_state_conflict");
    } catch (error) {
      console.error("[checkout] PayPal order created but database persistence failed", order.id, String(error?.message || error).slice(0, 180));
      json(res, { ok: false, error: "order_persistence_failed", recoveryRequired: true }, 503, req);
      return;
    }

    json(res, {
      ok: true,
      orderId: order.id,
      status: order.status,
      approvalUrl: approvalLink,
      total: money(priced.total),
      currency: priced.currency,
    }, 200, req);
  } catch (e) {
    console.warn("[checkout] order creation error", String(e?.message || e).slice(0, 200));
    json(res, { ok: false, error: "order_creation_failed" }, 500, req);
  }
}
