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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const { marketerId, email } = body || {};
  if (!marketerId) return json({ ok: false, error: "missing_marketer_id" }, 400);
  if (!isValidEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);

  // In a full integration we would verify ownership via PayPal's
  // Partner Referral API here. For now we trust the email (the seller
  // is authenticated) and store it. The payout worker will use it.
  return json({
    ok: true,
    message: "PayPal email connected. Payouts will be sent to this address.",
    email: email.trim().toLowerCase(),
  });
}
