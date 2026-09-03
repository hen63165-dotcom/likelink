// Vercel Serverless Function — PayPal Checkout Order Capture & Sale Recorder 💰
//
// Captures the payment after buyer approves on PayPal, records the sale in the
// marketplace (per-seller split), and creates pending payouts automatically.
//
// POST /api/checkout/capture-order
// Body: { orderId, items: [{ productId, marketerId, title, price, quantity }] }
// Returns: { ok, captureId, sales, total, status }
//
// GET /api/checkout/capture-order?token=<PAYPAL_TOKEN>&PayerID=<...>
// (Redirect target from PayPal — processes the return and captures)

const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";
const SALES_KEY = "marketplace:sales";
const PAYOUTS_KEY = "marketplace:payouts";
const MARKETERS_KEY = "marketplace:marketers";
const SETTINGS_KEY = "marketplace:settings";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS, GET");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
}

function html(res, body, status = 200) {
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
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

async function kvGet(key, fallback = null) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : fallback;
  } catch {
    return fallback;
  }
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function successPage(type, message, origin) {
  const color = type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#f59e0b";
  const title = type === "success" ? "התשלום הצליח!" : type === "error" ? "שגיאה בתשלום" : "התשלום בטיפול";
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "…";
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${title}</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
.card{background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.d{width:48px;height:48px;border-radius:50%;background:${color}20;color:${color};display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}
h1{font-size:20px;color:${color};margin:0 0 8px}p{color:#6b7280;font-size:14px;margin:0 0 24px}
a{display:inline-block;padding:10px 24px;border-radius:8px;background:${color};color:#fff;text-decoration:none;font-weight:600}</style>
</head><body><div class="card"><div class="d">${icon}</div><h1>${title}</h1><p>${message}</p>
<a href="${origin}/">חזרה לאתר</a></div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);
  const origin = `${String(getH("x-forwarded-proto") || "https").split(",")[0].trim()}://${getH("x-forwarded-host") || getH("host") || "likelink.app"}`;
  if (req.method === "GET") {
    const url = new URL(req.url, origin);
    const orderId = url.searchParams.get("token");
    if (!orderId) { html(res, successPage("error", "Missing order token", origin)); return; }
    const token = await getAccessToken();
    if (!token) { html(res, successPage("error", "Payment service not configured", origin)); return; }
    try {
      const captureRes = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
      });
      if (!captureRes.ok) { html(res, successPage("error", `Payment failed (${captureRes.status})`, origin)); return; }
      const capture = await captureRes.json();
      html(res, capture.status === "COMPLETED" ? successPage("success", `Payment completed! Order ${orderId}`, origin) : successPage("pending", `Payment status: ${capture.status}`, origin));
    } catch (e) { html(res, successPage("error", `Capture failed: ${String(e.message || e).slice(0, 100)}`, origin)); }
    return;
  }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }

  let body;
  try { body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text()); } catch { json(res, { ok: false, error: "bad_json" }, 400); return; }
  const { orderId, buyerEmail = "", items = [] } = body;
  if (!orderId) { json(res, { ok: false, error: "missing_orderId" }, 400); return; }
  if (!Array.isArray(items) || items.length === 0) { json(res, { ok: false, error: "empty_items" }, 400); return; }
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(buyerEmail).trim())) {
    json(res, { ok: false, error: "invalid_buyer_email" }, 400);
    return;
  }
  const token = await getAccessToken();
  if (!token) { json(res, { ok: false, error: "paypal_not_configured" }, 503); return; }
  let capture;
  try {
    const captureRes = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
    });
    if (!captureRes.ok) { const err = await captureRes.text(); json(res, { ok: false, error: "capture_failed", detail: err.slice(0, 200) }, 502); return; }
    capture = await captureRes.json();
  } catch (e) { json(res, { ok: false, error: "capture_failed", detail: String(e.message || e).slice(0, 200) }, 500); return; }
  if (capture.status !== "COMPLETED") { json(res, { ok: false, error: "payment_not_completed", status: capture.status }, 402); return; }
  const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;
  const settings = (await kvGet(SETTINGS_KEY, {})) || {};
  const platformFeePercent = Number(settings.platformFeePercent ?? 15);
  const currentSales = (await kvGet(SALES_KEY, [])) || [];
  const currentPayouts = (await kvGet(PAYOUTS_KEY, [])) || [];
  const marketers = (await kvGet(MARKETERS_KEY, [])) || [];
  const sales = [];
  const payoutsToUpdate = [...currentPayouts];
  const sellerNetMap = {};
  const now = Date.now();
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity || 1));
    const saleAmount = Number(item.price || 0) * qty;
    const fee = Math.round(saleAmount * (platformFeePercent / 100) * 100) / 100;
    const net = Math.round((saleAmount - fee) * 100) / 100;
    const sale = { id: uid(), orderId, captureId, productId: item.productId || null, marketerId: item.marketerId || null, title: String(item.title || "Order").slice(0, 120), saleAmount, commissionAmount: saleAmount, platformFee: fee, marketerNet: net, quantity: qty, ts: now };
    sales.push(sale); currentSales.push(sale);
    if (item.marketerId && net > 0) sellerNetMap[item.marketerId] = (sellerNetMap[item.marketerId] || 0) + net;
  }
  for (const [marketerId, netAmount] of Object.entries(sellerNetMap)) {
    if (netAmount <= 0) continue;
    const marketer = marketers.find((m) => m.id === marketerId);
    payoutsToUpdate.push({ id: uid(), marketerId, amount: Math.round(netAmount * 100) / 100, status: "pending", method: marketer?.paymentMethod || "paypal", recipient: { payPalEmail: marketer?.payPalEmail || "", bank: marketer?.bankDetails || {} }, source: "checkout", orderId, ts: now, paidAt: null, note: `Auto-created from PayPal checkout ${orderId}` });
  }
  try { await Promise.all([kvSet(SALES_KEY, currentSales), kvSet(PAYOUTS_KEY, payoutsToUpdate)]); } catch (e) {
    json(res, {
      ok: false,
      error: "payment_captured_persistence_failed",
      captureId,
      recoveryRequired: true,
    }, 503);
    return;
  }
  const sellerPayoutDetails = Object.entries(sellerNetMap).map(([id, amt]) => {
    const m = marketers.find((mk) => mk.id === id);
    return { marketerId: id, net: Math.round(amt * 100) / 100, sellerEmail: m?.payPalEmail || m?.email || "", sellerName: m?.name || "" };
  });
  fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/invoice/send`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, buyerEmail: String(buyerEmail).trim(), items: sales.map((s) => ({ title: s.title, price: s.saleAmount / s.quantity, quantity: s.quantity })), total: sales.reduce((s, x) => s + x.saleAmount, 0), platformFee: sales.reduce((s, x) => s + x.platformFee, 0), sellerPayouts: sellerPayoutDetails, currency: "ILS" }),
  }).catch(() => {});
  json(res, { ok: true, captureId, sales, total: sales.reduce((s, x) => s + x.saleAmount, 0).toFixed(2), platformFees: sales.reduce((s, x) => s + x.platformFee, 0).toFixed(2), sellerPayouts: sellerPayoutDetails.map((s) => ({ marketerId: s.marketerId, net: s.net })), status: capture.status });
}
