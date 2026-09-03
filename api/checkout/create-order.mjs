// Vercel Serverless Function — PayPal Checkout Order Creator 🛒
//
// Creates a real PayPal v2/checkout/orders for the buyer's cart.
// The order total = sum of all item prices (multi-seller carts are paid
// as one transaction; the platform then splits funds to sellers behind
// the scenes via the daily Payouts worker).
//
// Env vars:
//   PAYPAL_CLIENT_ID  (fallback: VITE_PAYPAL_CLIENT_ID)
//   PAYPAL_CLIENT_SECRET
//   PAYPAL_ENV=live  (optional — forces production even if secret has "sandbox")
//
// POST /api/checkout/create-order
// Body: { items: [{ title, price, quantity, sellerName }], returnUrl, cancelUrl }
// Returns: { ok, orderId, approvalUrl }

const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
}

function paypalBase() {
  const secret = process.env.PAYPAL_CLIENT_SECRET || "";
  if (String(process.env.PAYPAL_ENV || "").trim().toLowerCase() === "live") {
    return PAYPAL_API;
  }
  return String(secret).includes("sandbox") ? SANDBOX_API : PAYPAL_API;
}

async function getAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;

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
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400);
    return;
  }

  const { items = [], buyerEmail = "", returnUrl, cancelUrl, custom } = body;
  if (!Array.isArray(items) || items.length === 0) {
    json(res, { ok: false, error: "empty_cart" }, 400);
    return;
  }
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(buyerEmail).trim())) {
    json(res, { ok: false, error: "invalid_buyer_email" }, 400);
    return;
  }

  // Build PayPal order payload
  const paypalItems = items.map((it) => ({
    name: String(it.title || "Product").slice(0, 127),
    unit_amount: {
      currency_code: "ILS",
      value: Number(it.price || 0).toFixed(2),
    },
    quantity: String(Math.max(1, Number(it.quantity) || 1)),
  }));

  const total = items.reduce(
    (sum, it) => sum + Number(it.price || 0) * Math.max(1, Number(it.quantity) || 1),
    0
  );

  const token = await getAccessToken();

  // No PayPal credentials configured — return a mock order for development/testing
  if (!token) {
    json(res, {
      ok: true,
      mock: true,
      orderId: `MOCK-${Date.now()}`,
      approvalUrl: returnUrl || "/",
      total: total.toFixed(2),
      currency: "ILS",
      items: paypalItems,
    });
    return;
  }

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
            amount: {
              currency_code: "ILS",
              value: total.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: "ILS",
                  value: total.toFixed(2),
                },
              },
            },
            items: paypalItems,
            custom_id: typeof custom === "string" ? custom.slice(0, 127) : undefined,
          },
        ],
        application_context: {
          return_url: returnUrl || "/checkout/return",
          cancel_url: cancelUrl || "/checkout/cancel",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      json(res, { ok: false, error: "paypal_order_failed", detail: errText.slice(0, 300) }, 502);
      return;
    }

    const order = await orderRes.json();
    const approvalLink = order.links?.find((l) => l.rel === "approve")?.href;

    json(res, {
      ok: true,
      orderId: order.id,
      status: order.status,
      approvalUrl: approvalLink,
      total: total.toFixed(2),
      currency: "ILS",
    });
  } catch (e) {
    json(res, { ok: false, error: "order_creation_failed", detail: String(e.message || e).slice(0, 200) }, 500);
  }
}
