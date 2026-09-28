import { readBody } from "../_utils/readBody.mjs";
// Vercel Serverless Function — PayPal Checkout Order Creator 🛒
//
// Creates a real PayPal v2/checkout/orders for the buyer's cart.
// The order total = sum of the CATALOG prices of the requested products
// (multi-seller carts are paid as one transaction; the platform then splits
// funds to sellers via the daily Payouts worker).
//
// The browser sends only { productId, quantity }. Prices, titles and the
// credited creator come from marketplace:products (api/_utils/checkoutCatalog.mjs),
// and the priced order is stored server-side as checkout:order:<paypalOrderId>
// so capture-order records exactly what was charged — never client data.
//
// Env vars: PAYPAL_CLIENT_ID (fallback VITE_PAYPAL_CLIENT_ID), PAYPAL_CLIENT_SECRET,
//           PAYPAL_ENV=sandbox|live (optional), VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST /api/checkout/create-order
// Body: { items: [{ productId, quantity }], buyerEmail }
// Returns: { ok, orderId, approvalUrl, total, currency }

import { jsonCors } from "../_utils/cors.js";
import { paypalBase, getPayPalToken } from "../_utils/paypal.js";
import { originFromRequest } from "../_utils/origin.mjs";
import { priceCart } from "../_utils/checkoutCatalog.mjs";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "../../src/lib/cloud/kvReadGuard.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type"],
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

async function kvSet(key, value) {
  assertKvWritable(key);
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

  // Never pretend a production checkout succeeded. A missing credential is a
  // deployment/configuration error, not an order that can be approved.
  const token = await getPayPalToken();
  if (!token) {
    json(res, { ok: false, error: "paypal_not_configured" }, 503, req);
    return;
  }

  // Return/cancel targets are built server-side from the public origin — a
  // client-supplied URL could turn PayPal's redirect into an open redirect.
  const origin = originFromRequest(req);
  const coId = checkoutId();
  const money = (n) => Number(n).toFixed(2);

  try {
    const orderRes = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
        application_context: {
          return_url: `${origin}/?paypal_return=1`,
          cancel_url: `${origin}/`,
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
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
    const approvalLink = order.links?.find((l) => l.rel === "approve")?.href;
    if (!order.id || !approvalLink) { json(res, { ok: false, error: "paypal_order_failed" }, 502, req); return; }

    // The authoritative record capture-order will use (and nothing else).
    try {
      await kvSet(`checkout:order:${order.id}`, {
        orderId: order.id,
        checkoutId: coId,
        lines: priced.lines,
        total: priced.total,
        currency: priced.currency,
        buyerEmail: String(buyerEmail || "").trim(),
        status: "CREATED",
        createdAt: Date.now(),
      });
    } catch {
      json(res, { ok: false, error: "storage_failed" }, 503, req);
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
