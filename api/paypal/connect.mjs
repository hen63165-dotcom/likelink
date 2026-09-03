// Vercel Serverless Function — PayPal Connect 🔗
//
// POST /api/paypal/connect
//   body: { marketerId, email }
//
// Validates the email and returns it as a pending destination. An email-format
// check is not proof that a PayPal account exists or accepts payouts.
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
    verified: false,
    message: "PayPal email saved. Account verification is still required before payout.",
    email: email.trim().toLowerCase(),
  });
}
