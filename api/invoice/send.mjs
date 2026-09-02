// Vercel Serverless Function — Automated Invoice & Receipt Email 🧾
//
// Sends professional HTML receipt to buyer after payment via Resend API.
// Also notifies each seller of their sale + pending payout.
//
// POST /api/invoice/send
// Body: { orderId, buyerEmail, buyerName, items, total, platformFee, sellerPayouts }

const RESEND_API = "https://api.resend.com/emails";

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

function money(n, currency = "ILS") {
  return currency === "ILS" ? `₪${Number(n || 0).toFixed(2)}` : `${Number(n || 0).toFixed(2)} ${currency}`;
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
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבלה ${orderId}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Tahoma,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#6C4CF1,#9333EA);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">קבלת תשלום</h1>
    <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px">Payment Receipt</p>
  </div>
  <div style="padding:32px">
    <div style="display:flex;justify-content:space-between;margin-bottom:24px">
      <div><p style="margin:0;font-size:12px;color:#888">מספר הזמנה</p><p style="margin:4px 0 0;font-size:14px;font-family:monospace;font-weight:600">${orderId}</p></div>
      <div style="text-align:left"><p style="margin:0;font-size:12px;color:#888">תאריך</p><p style="margin:4px 0 0;font-size:14px;font-weight:600">${date}</p></div>
    </div>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;font-weight:600">${escapeHtml(businessName || "Likelink")}</p>
      ${businessId ? `<p style="margin:4px 0 0;font-size:12px;color:#888">ח.פ. ${escapeHtml(businessId)}</p>` : ""}
    </div>
    ${buyerName ? `<p style="margin:0 0 16px;font-size:14px">לכבוד: <strong>${escapeHtml(buyerName)}</strong></p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#f0f0f0">
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666">מוצר</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666">כמות</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666">מחיר</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666">סה"כ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="border-top:2px solid #eee;padding-top:16px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:14px;color:#666">סה"כ לתשלום:</span>
        <span style="font-size:18px;font-weight:700;color:#6C4CF1;font-family:monospace">${money(total, currency)}</span>
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:#999;text-align-center">קבלה זו מהווה אישור תשלום רשמי. כל המחירים כוללים מע"ם לפי חוק.</p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px;text-align:center"><p style="margin:0;font-size:12px;color:#888">Likelink — פלטפורמת מסחר ישראלית</p></div>
</div></body></html>`;
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
  const date = new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });
  const results = { buyer: null, sellers: [] };
  if (buyerEmail && buyerEmail.includes("@")) {
    const html = generateReceiptHtml({ orderId, buyerName, items, total, currency, businessName, businessId, date });
    results.buyer = await sendViaResend({ to: buyerEmail, subject: `קבלת תשלום — הזמנה #${orderId} | Likelink`, html });
  }
  if (Array.isArray(sellerPayouts) && sellerPayouts.length > 0) {
    for (const sp of sellerPayouts) {
      if (sp.sellerEmail && sp.sellerEmail.includes("@")) {
        const sellerHtml = `<div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:24px" dir="rtl"><h2 style="color:#6C4CF1">מכרת מוצר! 🎉</h2><p>קיימת מכירה חדשה.</p><div style="background:#f0f0f0;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0"><strong>הזמנה:</strong> ${orderId}</p><p style="margin:4px 0 0"><strong>סכום לתשלום לך:</strong> ${money(sp.net, currency)}</p></div><p style="font-size:12px;color:#888">התשלום יועבר לחשבון ה-PayPal שלך דרך מערכת ה-Payouts האוטומטית.</p></div>`;
        const r = await sendViaResend({ to: sp.sellerEmail, subject: `מכירה חדשה! הזמנה #${orderId} | Likelink`, html: sellerHtml });
        results.sellers.push({ email: sp.sellerEmail, ...r });
      }
    }
  }
  json(res, { ok: true, results });
}
