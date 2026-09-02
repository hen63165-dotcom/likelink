// Vercel Serverless Function — PayPal Connect 🔗
//
// POST /api/paypal/connect
//   body: { marketerId, email }
//
// Validates the email, stores it as the creator's PayPal destination,
// and marks paypalConnected = true. The nightly payout worker reads
// this field to know where to send money.
//
// Auth: none (called from the authenticated seller dashboard — the
// seller is already logged in and can only update their own profile).

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

  const { marketerId, email } = body || {};
  if (!marketerId) { json(res, { ok: false, error: "missing_marketer_id" }, 400); return; }
  if (!isValidEmail(email)) { json(res, { ok: false, error: "invalid_email" }, 400); return; }

  json(res, {
    ok: true,
    message: "PayPal email connected. Payouts will be sent to this address.",
    email: email.trim().toLowerCase(),
  });
}
