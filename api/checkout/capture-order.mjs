import { readBody } from "../_utils/readBody.mjs";
import { originFromRequest } from "../_utils/origin.mjs";
// Vercel Serverless Function — PayPal Checkout Order Capture & Sale Recorder 💰
//
// Captures the payment after buyer approves on PayPal, records the sale in the
// marketplace (per-seller split), and creates pending payouts automatically.
//
// POST /api/checkout/capture-order
// Body: { orderId }  (items/prices come from the server record checkout:order:<orderId>)
// Returns: { ok, captureId, sales, total, status }
//
// GET /api/checkout/capture-order?token=<PAYPAL_TOKEN>&PayerID=<...>
// (Redirect target from PayPal — processes the return and captures)

import { isApprovedOrigin } from "../_utils/cors.js";
import { paypalBase, getPayPalToken } from "../_utils/paypal.js";
import {
  calculateReferralCommission,
  captureMatchesOrder,
  REFERRAL_COMMISSION_RATE_PERCENT,
} from "../_utils/checkoutCatalog.mjs";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "../../src/lib/cloud/kvReadGuard.js";
import { createPrivateKv } from "../../src/lib/cloud/marketerPrivacy.js";
import {
  getCheckoutOrderByPayPalId,
  hashIdempotencyKey,
  updateCheckoutOrder,
} from "../_utils/checkoutOrders.mjs";

const SALES_KEY = "marketplace:sales";
const PAYOUTS_KEY = "marketplace:payouts";
const MARKETERS_KEY = "marketplace:marketers";
const SETTINGS_KEY = "marketplace:settings";

const SB_URL = process.env.VITE_SUPABASE_URL;
// 🔒 Fail loud: payment capture writes use the SERVICE ROLE key only.
// Never fall back to the anon key — if it is missing, the guard below
// returns 500 "misconfigured: service role key missing". No value invented.
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS, GET");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
}

function html(res, body, status = 200) {
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
}

// PayPal token + endpoint: the shared helper (one sandbox/live switch).
const getAccessToken = getPayPalToken;

async function kvGetRaw(key, fallback = null) {
  // A failed read returns the fallback but marks the key (kvReadGuard) so
  // kvSet refuses to overwrite real data with that fallback.
  if (!SB_URL || !SB_KEY) return fallback;
  let res;
  try {
    res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
  } catch {
    noteKvReadFailed(key);
    return fallback;
  }
  const row = await readKvResponse(key, res);
  return row.found ? row.value : fallback;
}

async function kvSetRaw(key, value) {
  assertKvWritable(key);
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

function uid(seed) {
  return `co_${hashIdempotencyKey(seed).slice(0, 24)}`;
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

// Creator privacy: marketers/payouts reads merge their server-only private
// maps; writes split them out (src/lib/cloud/marketerPrivacy.js).
const privateKv = createPrivateKv({ get: (k, fb) => kvGetRaw(k, fb), set: (k, v) => kvSetRaw(k, v), assertWritable: assertKvWritable });
const kvGet = (key, fallback = null) => privateKv.get(key, fallback);
const kvSet = (key, value) => privateKv.set(key, value);

export default async function handler(req, res) {
  // 🔒 CORS: no wildcard. Echo back ONLY a validated approved origin
  // (same-origin requests need no ACAO header at all) — same pattern as
  // api/push.mjs and api/google-feed.mjs.
  const corsOrigin = String(req.headers?.origin || "");
  if (isApprovedOrigin(corsOrigin)) res.setHeader("access-control-allow-origin", corsOrigin);

  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  // Public origin: single source of truth (api/_utils/origin.mjs).
  const origin = process.env.PUBLIC_ORIGIN || process.env.LIKELINK_BASE_URL || originFromRequest(req);
  if (req.method === "GET") {
    const url = new URL(req.url, origin);
    const orderId = url.searchParams.get("token");
    if (!orderId) { html(res, successPage("error", "Missing order token", origin)); return; }
    // Keep one authoritative capture path: the app POST includes the pending
    // cart and buyer email, so it can persist the sale, payout, and receipt.
    const returnUrl = `${origin}/?paypal_return=1&token=${encodeURIComponent(orderId)}`;
    res.writeHead(302, { Location: returnUrl, "cache-control": "no-store" });
    res.end();
    return;
  }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }

  let body;
  try { body = await readBody(req); } catch { json(res, { ok: false, error: "bad_json" }, 400); return; }
  const { orderId } = body || {};
  if (!orderId || !/^[A-Za-z0-9-]{6,64}$/.test(String(orderId))) { json(res, { ok: false, error: "missing_orderId" }, 400); return; }
  // Storage is checked BEFORE any money moves: a capture that cannot be
  // recorded would take the buyer's money with no sale behind it.
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 503); return; }

  // The server-priced record written by create-order is the ONLY source of
  // what was bought, for how much, and which creator is credited.
  let orderRow;
  try {
    orderRow = await getCheckoutOrderByPayPalId(SB_URL, SB_KEY, orderId);
  } catch (error) {
    console.error("[capture] checkout order lookup failed", orderId, String(error?.message || error).slice(0, 160));
    json(res, { ok: false, error: "storage_unavailable" }, 503);
    return;
  }
  const record = orderRow?.order_data || null;
  if (!record || !Array.isArray(record.lines) || !record.lines.length) { json(res, { ok: false, error: "order_not_found" }, 404); return; }

  // Anti-fraud idempotency: the SAME PayPal order can never create two sales
  // (e.g. the buyer's return URL fires twice).
  const salesValue = (await kvGet(SALES_KEY, [])) || [];
  const currentSales = Array.isArray(salesValue) ? salesValue : [];
  try { assertKvWritable(SALES_KEY); } catch { json(res, { ok: false, error: "storage_unavailable" }, 503); return; }
  if (Array.isArray(currentSales) && currentSales.some((s) => s && s.orderId === orderId) && orderRow?.status === "CAPTURED") {
    json(res, { ok: true, alreadyRecorded: true, orderId });
    return;
  }

  if (orderRow?.status === "CAPTURED") {
    json(res, { ok: true, alreadyRecorded: true, orderId, captureId: orderRow.capture_id });
    return;
  }
  if (orderRow?.status === "PENDING_CAPTURE" && !orderRow.capture_result) {
    const leaseUpdatedAt = orderRow.updated_at;
    const leaseAge = Date.now() - new Date(leaseUpdatedAt).getTime();
    if (!leaseUpdatedAt || !Number.isFinite(leaseAge) || leaseAge < 60_000) {
      json(res, { ok: false, error: "capture_in_progress" }, 409);
      return;
    }
    try {
      const reclaimed = await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
        status: "PENDING_CAPTURE",
        failure_code: "CAPTURE_RETRY",
      }, "PENDING_CAPTURE", leaseUpdatedAt);
      if (!reclaimed) {
        json(res, { ok: false, error: "capture_in_progress" }, 409);
        return;
      }
      orderRow = reclaimed;
    } catch (error) {
      console.error("[capture] could not recover expired capture lease", orderId, String(error?.message || error).slice(0, 160));
      json(res, { ok: false, error: "storage_unavailable" }, 503);
      return;
    }
  }
  if (orderRow && orderRow.status !== "CREATED" && orderRow.status !== "PENDING_CAPTURE" && orderRow.status !== "RECOVERY_REQUIRED") {
    json(res, { ok: false, error: "order_not_capturable", status: orderRow.status }, 409);
    return;
  }
  if (orderRow?.status === "CREATED") {
    try {
      const claimed = await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
        status: "PENDING_CAPTURE",
        failure_code: null,
      }, "CREATED");
      if (!claimed) {
        const latest = await getCheckoutOrderByPayPalId(SB_URL, SB_KEY, orderId);
        if (latest?.status === "CAPTURED") {
          json(res, { ok: true, alreadyRecorded: true, orderId, captureId: latest.capture_id });
          return;
        }
        json(res, { ok: false, error: "capture_in_progress" }, 409);
        return;
      }
      orderRow = claimed;
    } catch (error) {
      console.error("[capture] could not claim checkout order", orderId, String(error?.message || error).slice(0, 160));
      json(res, { ok: false, error: "storage_unavailable" }, 503);
      return;
    }
  }

  let capture = orderRow?.capture_result || null;
  if (!capture) {
  const token = await getAccessToken();
  if (!token) { json(res, { ok: false, error: "paypal_not_configured" }, 503); return; }
  try {
    const captureRes = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": `capture-${hashIdempotencyKey(orderId).slice(0, 30)}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!captureRes.ok) {
      console.warn("[capture] PayPal capture rejected", captureRes.status, (await captureRes.text().catch(() => "")).slice(0, 200));
      json(res, { ok: false, error: "capture_failed" }, 502);
      return;
    }
    capture = await captureRes.json();
  } catch (e) {
    console.warn("[capture] PayPal capture error", String(e?.message || e).slice(0, 200));
    json(res, { ok: false, error: "capture_failed" }, 502);
    return;
  }
  }
  if (capture.status === "COMPLETED" && orderRow) {
    const unit = capture.purchase_units?.[0];
    const captureInfo = unit?.payments?.captures?.[0];
    const safeCapture = {
      status: capture.status,
      purchase_units: [{
        custom_id: unit?.custom_id || null,
        payments: {
          captures: [{
            id: captureInfo?.id || null,
            custom_id: captureInfo?.custom_id || null,
            amount: captureInfo?.amount ? {
              value: String(captureInfo.amount.value || ""),
              currency_code: String(captureInfo.amount.currency_code || ""),
            } : null,
          }],
        },
      }],
    };
    try {
      const saved = await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
        capture_id: captureInfo?.id || orderId,
        capture_result: safeCapture,
      }, "PENDING_CAPTURE");
      if (!saved) throw new Error("capture_state_conflict");
      capture = safeCapture;
      orderRow = saved;
    } catch (error) {
      console.error("[capture] CRITICAL: PayPal captured but durable evidence write failed", JSON.stringify({
        orderId,
        captureId: captureInfo?.id || orderId,
        amount: captureInfo?.amount?.value || null,
        currency: captureInfo?.amount?.currency_code || null,
        error: String(error?.message || error).slice(0, 160),
      }));
      json(res, { ok: false, error: "payment_captured_persistence_failed", captureId: captureInfo?.id || orderId, recoveryRequired: true }, 503);
      return;
    }
  }
  if (capture.status !== "COMPLETED") { json(res, { ok: false, error: "payment_not_completed", status: capture.status }, 402); return; }
  const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;
  // What PayPal actually charged must equal the stored server-priced total.
  if (!captureMatchesOrder(capture, record)) {
    console.error("[capture] amount/currency mismatch", orderId, JSON.stringify(capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount || {}));
    try {
      await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
        status: "AMOUNT_MISMATCH",
        capture_id: captureId,
        capture_result: capture,
        failure_code: "AMOUNT_MISMATCH",
      });
    } catch (error) {
      console.error("[capture] could not persist amount mismatch", orderId, String(error?.message || error).slice(0, 160));
    }
    json(res, { ok: false, error: "payment_amount_mismatch", captureId, recoveryRequired: true }, 409);
    return;
  }

  const settings = (await kvGet(SETTINGS_KEY, {})) || {};
  const platformFeePercent = Number(settings.platformFeePercent ?? 15);
  const payoutValue = (await kvGet(PAYOUTS_KEY, [])) || [];
  const currentPayouts = Array.isArray(payoutValue) ? payoutValue : [];
  const marketerValue = (await kvGet(MARKETERS_KEY, [])) || [];
  const marketers = Array.isArray(marketerValue) ? marketerValue : [];
  const buyerEmail = String(record.buyerEmail || "").trim();
  const sales = [];
  const payoutsToUpdate = [...currentPayouts];
  const sellerNetMap = {};
  const now = Date.now();
  for (const line of record.lines) {
    const qty = Math.max(1, Number(line.quantity || 1));
    const saleAmount = Math.round(Number(line.unitPrice || 0) * qty * 100) / 100;
    const fee = Math.round(saleAmount * (platformFeePercent / 100) * 100) / 100;
    const net = Math.round((saleAmount - fee) * 100) / 100;
    const referralCommissionAmount = calculateReferralCommission(fee, Boolean(record.referralCreatorId));
    const existingSale = currentSales.find((existing) => existing?.orderId === orderId && existing?.productId === (line.productId || null));
    const sale = existingSale ? {
      ...existingSale,
      referralCreatorId: record.referralCreatorId || null,
      referralCommissionBasis: "platform_fee",
      referralCommissionRatePercent: record.referralCreatorId ? REFERRAL_COMMISSION_RATE_PERCENT : 0,
      referralCommissionAmount,
      referralCommissionStatus: referralCommissionAmount > 0 ? "calculated_unpaid" : "not_applicable",
    } : {
      id: uid(`${orderId}:${line.productId || "unknown"}`),
      orderId,
      captureId,
      productId: line.productId || null,
      marketerId: line.marketerId || null,
      referralCreatorId: record.referralCreatorId || null,
      referralCommissionBasis: "platform_fee",
      referralCommissionRatePercent: record.referralCreatorId ? REFERRAL_COMMISSION_RATE_PERCENT : 0,
      referralCommissionAmount,
      referralCommissionStatus: referralCommissionAmount > 0 ? "calculated_unpaid" : "not_applicable",
      title: String(line.title || "Order").slice(0, 120),
      saleAmount,
      commissionAmount: saleAmount,
      platformFee: fee,
      marketerNet: net,
      quantity: qty,
      ts: now,
      source: "paypal_checkout",
    };
    sales.push(sale);
    if (line.marketerId && net > 0) sellerNetMap[line.marketerId] = (sellerNetMap[line.marketerId] || 0) + net;
  }
  for (const [marketerId, netAmount] of Object.entries(sellerNetMap)) {
    if (netAmount <= 0) continue;
    const marketer = marketers.find((m) => m.id === marketerId);
    if (!payoutsToUpdate.some((payout) => payout?.orderId === orderId && payout?.marketerId === marketerId)) {
      payoutsToUpdate.push({ id: uid(`${orderId}:${marketerId}`), marketerId, amount: Math.round(netAmount * 100) / 100, status: "pending", method: marketer?.paymentMethod || "paypal", recipient: { payPalEmail: marketer?.payPalEmail || "", bank: marketer?.bankDetails || {} }, source: "checkout", orderId, ts: now, paidAt: null, note: `Auto-created from PayPal checkout ${orderId}` });
    }
  }
  const salesToUpdate = [
    ...currentSales.filter((sale) => sale?.orderId !== orderId),
    ...sales,
  ];
  try { await Promise.all([kvSet(SALES_KEY, salesToUpdate), kvSet(PAYOUTS_KEY, payoutsToUpdate)]); } catch (e) {
    try {
      await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
        status: "RECOVERY_REQUIRED",
        capture_id: captureId,
        capture_result: capture,
        failure_code: "SALE_OR_PAYOUT_PERSISTENCE_FAILED",
      });
    } catch (recoveryError) {
      console.error("[capture] CRITICAL: recovery state also failed", orderId, captureId, String(recoveryError?.message || recoveryError).slice(0, 160));
    }
    console.error("[capture] captured but not recorded", orderId, captureId, String(e?.message || e));
    json(res, {
      ok: false,
      error: "payment_captured_persistence_failed",
      captureId,
      recoveryRequired: true,
    }, 503);
    return;
  }
  try {
    const saved = await updateCheckoutOrder(SB_URL, SB_KEY, orderId, {
      status: "CAPTURED",
      capture_id: captureId,
      capture_result: capture,
      failure_code: null,
    });
    if (!saved) throw new Error("checkout_order_missing_after_capture");
    orderRow = saved;
  } catch (error) {
    console.error("[capture] CRITICAL: sale materialized but checkout state update failed", orderId, captureId, String(error?.message || error).slice(0, 160));
    json(res, { ok: false, error: "payment_captured_persistence_failed", captureId, recoveryRequired: true }, 503);
    return;
  }
  const sellerPayoutDetails = Object.entries(sellerNetMap).map(([id, amt]) => {
    const m = marketers.find((mk) => mk.id === id);
    return { marketerId: id, net: Math.round(amt * 100) / 100, sellerEmail: m?.payPalEmail || m?.email || "", sellerName: m?.name || "" };
  });
  // Receipt email: awaited (bounded) because a fire-and-forget request is
  // dropped once the response is sent. Sent to the public origin, never
  // VERCEL_URL (deployment URLs can sit behind Vercel Authentication).
  let receipt = { ok: false, skipped: "no_buyer_email" };
  if (buyerEmail) {
    try {
      const r = await fetch(`${origin}/api/invoice/send`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.STORE_SIGN_SECRET ? { authorization: `Bearer ${process.env.STORE_SIGN_SECRET}` } : {}) },
        body: JSON.stringify({ orderId, buyerEmail, items: sales.map((s) => ({ title: s.title, price: s.saleAmount / s.quantity, quantity: s.quantity })), total: sales.reduce((s, x) => s + x.saleAmount, 0), platformFee: sales.reduce((s, x) => s + x.platformFee, 0), sellerPayouts: sellerPayoutDetails, currency: "ILS" }),
        signal: AbortSignal.timeout(8000),
      });
      receipt = { ok: r.ok, status: r.status };
    } catch (e) {
      receipt = { ok: false, error: String(e?.message || e).slice(0, 80) };
    }
  }
  json(res, { ok: true, captureId, sales, total: sales.reduce((s, x) => s + x.saleAmount, 0).toFixed(2), platformFees: sales.reduce((s, x) => s + x.platformFee, 0).toFixed(2), sellerPayouts: sellerPayoutDetails.map((s) => ({ marketerId: s.marketerId, net: s.net })), status: capture.status, receipt: { sent: Boolean(receipt.ok) } });
}
