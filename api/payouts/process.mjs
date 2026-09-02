// Vercel Serverless Function — Payouts Processor 💰
//
// Daily cron (02:00 UTC) that scans all pending payouts and processes them
// according to each creator's chosen method:
//   - "paypal" → PayPal Mass Payouts API (real money, when credentials set)
//   - "bank"   → marked as "recorded" for manual bank transfer by the owner
//   - "other"  → recorded with the creator's paymentNote for manual handling
//
// Cron auth: x-vercel-cron header OR ?secret=PAYOUTS_SECRET
//
// Storage: kv "marketplace:payouts" → [ { id, marketerId, amount, method, status, ... } ]

const PAYOUTS_KEY = "marketplace:payouts";
const MARKETERS_KEY = "marketplace:marketers";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function kvGet(key, fallback = null) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
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
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// ─── PayPal Mass Payouts ───────────────────────────────────────────────────

async function getPayPalAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const base = String(secret).includes("sandbox") ? SANDBOX_API : PAYPAL_API;
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function sendPayPalPayout(payout, recipientEmail) {
  const token = await getPayPalAccessToken();
  if (!token) return { ok: false, note: "PayPal credentials missing" };

  const res = await fetch(`${PAYPAL_API}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `likelink-${payout.id}-${Date.now()}`,
        email_subject: "Your Likelink payout",
        email_message: "Your earnings have been paid out. Thank you for selling with Likelink!",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: payout.amount.toFixed(2), currency: "ILS" },
          receiver: recipientEmail,
          note: `Payout for ${payout.amount.toFixed(2)} ILS`,
        },
      ],
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return {
      ok: true,
      reference: data?.batch_header?.payout_batch_id || `PP-${payout.id}`,
      note: "PayPal Mass Payouts batch submitted.",
    };
  }
  return { ok: false, note: `PayPal rejected (${res.status})` };
}

// ─── main processor ────────────────────────────────────────────────────────

async function processPendingPayouts() {
  const [payouts, marketers] = await Promise.all([
    kvGet(PAYOUTS_KEY, []),
    kvGet(MARKETERS_KEY, []),
  ]);

  if (!Array.isArray(payouts) || payouts.length === 0) {
    return { ok: true, processed: 0, message: "No payouts to process" };
  }

  const pending = payouts.filter((p) => p.status === "pending");
  if (pending.length === 0) {
    return { ok: true, processed: 0, message: "No pending payouts" };
  }

  const results = [];
  const updatedPayouts = [...payouts];

  for (const payout of pending) {
    const marketer = marketers.find((m) => m.id === payout.marketerId);
    const method = String(payout.method || "paypal").toLowerCase();

    let result;
    if (method === "paypal") {
      const email = marketer?.payPalEmail || payout.recipient;
      if (!email) {
        result = { ok: false, note: "No PayPal email for creator" };
      } else {
        result = await sendPayPalPayout(payout, email);
      }
    } else if (method === "bank") {
      result = {
        ok: true,
        reference: `BANK-${payout.id}`,
        note: `Bank transfer recorded. Creator IBAN: ${marketer?.bankDetails?.iban || "N/A"}. Owner must transfer manually.`,
      };
    } else {
      result = {
        ok: true,
        reference: `OTHER-${payout.id}`,
        note: `Recorded. Creator note: ${marketer?.paymentNote || "N/A"}. Owner handles manually.`,
      };
    }

    const idx = updatedPayouts.findIndex((p) => p.id === payout.id);
    if (idx !== -1) {
      updatedPayouts[idx] = {
        ...updatedPayouts[idx],
        status: result.ok ? "paid" : "failed",
        reference: result.reference || updatedPayouts[idx].reference,
        paidAt: result.ok ? Date.now() : null,
        note: result.note,
      };
    }

    results.push({ payoutId: payout.id, marketerId: payout.marketerId, ...result });
  }

  await kvSet(PAYOUTS_KEY, updatedPayouts);

  return {
    ok: true,
    processed: results.length,
    results,
  };
}

// ─── handler ───────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });

  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);

  const url = new URL(req.url, "https://likelink.app");
  const isCron =
    req.method === "GET" &&
    (Boolean(getH("x-vercel-cron")) ||
      url.searchParams.get("secret") === (process.env.PAYOUTS_SECRET || ""));

  if (isCron) {
    if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);
    try {
      return json(await processPendingPayouts());
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
    } catch {
      return json({ ok: false, error: "bad_json" }, 400);
    }
    if (body?.secret !== process.env.PAYOUTS_SECRET) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);
    try {
      return json(await processPendingPayouts());
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

}
