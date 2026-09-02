// Vercel Serverless Function - Automated Invoice & Receipt Email
//
// Sends professional HTML receipt to buyer after payment via Resend API.
// Also notifies each seller of their sale + pending payout.
//
// POST /api/invoice/send
// Body: { orderId, buyerEmail, buyerName, items, total, platformFee, sellerPayouts }

const RESEND_API = "https://api.resend.com/emails";

function json(res, obj, status) {
  if (status === undefined) status = 200;
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

function money(n, currency) {
  if (currency === undefined) currency = "ILS";
  var val = Number(n || 0).toFixed(2);
  return currency === "ILS" ? "NIS " + val : val + " " + currency;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateReceiptHtml({ orderId, buyerName, items, total, currency, businessName, businessId, date }) {
  const rows = items.map((it) => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px">${escapeHtml(it.title || "Product")}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:14px">${it.quantity || 1}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px;font-family:monospace">${money(it.price, currency)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px;font-family:monospace">${money((it.price || 0) * (it.quantity || 1), currency)}</td>
  </tr>`).join("");
  return "<!DOCTYPE html><html lang='he' dir='rtl'><head><meta charset='utf-8'><title>Receipt " + orderId + "</title></head><body style='margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif'><div style='max-width:600px;margin:24px auto;background:#fff;border-radius:12px;padding:32px'><h1 style='color:#6C4CF1'>Payment Receipt</h1><p>Order: " + orderId + "</p><p>Date: " + date + "</p><p>Business: " + escapeHtml(businessName || "Likelink") + "</p>" + (businessId ? "<p>ID: " + escapeHtml(businessId) + "</p>" : "") + (buyerName ? "<p>Buyer: " + escapeHtml(buyerName) + "</p>" : "") + "<table style='width:100%;border-collapse:collapse'><thead><tr style='background:#f0f0f0'><th style='padding:10px;text-align:right'>Item</th><th style='padding:10px'>Qty</th><th style='padding:10px'>Price</th><th style='padding:10px'>Total</th></tr></thead><tbody>" + rows + "</tbody></table><div style='text-align:right;margin-top:16px;font-size:18px;font-weight:bold;color:#6C4CF1'>" + money(total, currency) + "</div><p style='font-size:11px;color:#999;margin-top:24px'>Official payment confirmation.</p></div></body></html>";
}

async function sendViaResend({ to, subject, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: from || process.env.RECEIPT_FROM || "Likelink <receipts@likelink.app>",
      to: Array.isArray(to) ? to : [to],
      subject, html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) { const err = await res.text(); return { ok: false, reason: `resend_error_${res.status}`, detail: err.slice(0, 200) }; }
  const data = await res.json();
  return { ok: true, id: data.id };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }
  let body;
  try { body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text()); } catch { json(res, { ok: false, error: "bad_json" }, 400); return; }
  const { orderId, buyerEmail, buyerName, items = [], total = 0, platformFee = 0, sellerPayouts = [], currency = "ILS" } = body;
  if (!orderId) { json(res, { ok: false, error: "missing_orderId" }, 400); return; }
  const businessName = process.env.BUSINESS_NAME || "Likelink";
  const businessId = process.env.BUSINESS_ID || "";
  var date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const results = { buyer: null, sellers: [] };
  if (buyerEmail && buyerEmail.includes("@")) {
    const html = generateReceiptHtml({ orderId, buyerName, items, total, currency, businessName, businessId, date });
    results.buyer = await sendViaResend({ to: buyerEmail, subject: "Payment Receipt - Order #" + orderId, html });
  }
  if (Array.isArray(sellerPayouts) && sellerPayouts.length > 0) {
    for (const sp of sellerPayouts) {
      if (sp.sellerEmail && sp.sellerEmail.includes("@")) {
        var sellerHtml = "<div style='font-family:Arial;max-width:480px;margin:0 auto;padding:24px'><h2 style='color:#6C4CF1'>New Sale!</h2><p>You have a new sale.</p><div style='background:#f0f0f0;border-radius:8px;padding:16px'><p><strong>Order:</strong> " + orderId + "</p><p><strong>Your payout:</strong> " + money(sp.net, currency) + "</p></div><p style='font-size:12px;color:#888'>Payment will be sent to your PayPal automatically.</p></div>";
        var r = await sendViaResend({ to: sp.sellerEmail, subject: "New Sale - Order #" + orderId, html: sellerHtml });
        results.sellers.push({ email: sp.sellerEmail, ...r });
      }
    }
  }
  json(res, { ok: true, results });
}
