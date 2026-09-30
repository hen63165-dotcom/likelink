import { readBody } from "../_utils/readBody.mjs";
import { paypalBase, getPayPalToken } from "../_utils/paypal.js";
import { isAuthorizedCron } from "../_utils/cronAuth.mjs";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "../../src/lib/cloud/kvReadGuard.js";
import { createPrivateKv } from "../../src/lib/cloud/marketerPrivacy.js";
// Vercel Serverless Function — Payouts Processor 💰
//
// Daily cron (02:00 UTC) that scans all pending payouts and processes them
// according to each creator's chosen method:
//   - "paypal" → PayPal Mass Payouts API (real money, when credentials set)
//   - "bank"   → marked as "recorded" for manual bank transfer by the owner
//   - "other"  → recorded with the creator's paymentNote for manual handling
//
// Auth: Authorization: Bearer CRON_SECRET | PAYOUTS_SECRET (POST may also send { secret })
//
// Storage: kv "marketplace:payouts" → [ { id, marketerId, amount, method, status, ... } ]

const PAYOUTS_KEY = "marketplace:payouts";
const MARKETERS_KEY = "marketplace:marketers";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

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
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// ─── PayPal Mass Payouts ───────────────────────────────────────────────────

// Token + endpoint come from the shared PayPal helper so payouts always hit
// the same environment (sandbox/live) as checkout and subscriptions.
async function getPayPalAccessToken() {
  return getPayPalToken();
}

async function sendPayPalPayout(payout, recipientEmail) {
  const token = await getPayPalAccessToken();
  if (!token) return { ok: false, note: "PayPal credentials missing" };

  const res = await fetch(`${paypalBase()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        // STABLE batch id (no Date.now!): PayPal rejects a duplicate batch id,
        // so a retried/overlapping run can never send the same money twice.
        sender_batch_id: `likelink-${payout.id}`,
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

async function reconcilePayPalPayout(base, payout) {
  if (!payout?.reference) return { ok: false, status: "unknown" };
  const token = await getPayPalAccessToken();
  if (!token) return { ok: false, status: "credentials_missing" };
  try {
    const res = await fetch(`${base}/v1/payments/payouts/${encodeURIComponent(payout.reference)}?fields=batch_header`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: "lookup_failed", httpStatus: res.status };
    const status = String(data?.batch_header?.batch_status || "").toUpperCase();
    return { ok: true, status };
  } catch {
    return { ok: false, status: "lookup_error" };
  }
}

// Creator privacy: marketers/payouts reads merge their server-only private
// maps; writes split them out (src/lib/cloud/marketerPrivacy.js).
const privateKv = createPrivateKv({ get: (k, fb) => kvGetRaw(k, fb), set: (k, v) => kvSetRaw(k, v), assertWritable: assertKvWritable });
const kvGet = (key, fallback = null) => privateKv.get(key, fallback);
const kvSet = (key, value) => privateKv.set(key, value);

// ─── main processor ────────────────────────────────────────────────────────

export async function processPendingPayouts() {
  const [payouts, marketers] = await Promise.all([
    kvGet(PAYOUTS_KEY, []),
    kvGet(MARKETERS_KEY, []),
  ]);

  if (!Array.isArray(payouts) || payouts.length === 0) {
    return { ok: true, processed: 0, message: "No payouts to process" };
  }

  // ── Crash-safe + idempotent processing ──
  // Claimable = still pending, or a "processing" claim that went stale
  // (the previous run died before resolving it) with NO PayPal batch yet.
  const STALE_MS = 30 * 60 * 1000;
  const isClaimable = (p) =>
    p.status === "pending" ||
    (p.status === "processing" && !p.reference && Date.now() - (p.claimedAt || 0) > STALE_MS);

  // Reconcile previously submitted PayPal batches before claiming anything new.
  // "processing" is not treated as paid until PayPal reports a terminal success.
  const reconciled = [];
  const reconciledPayouts = [];
  for (const p of payouts) {
    if (p.status !== "processing" || !p.reference) {
      reconciledPayouts.push(p);
      continue;
    }
    const check = await reconcilePayPalPayout(paypalBase(), p);
    const state = String(check.status || "").toUpperCase();
    if (check.ok && ["SUCCESS", "COMPLETED"].includes(state)) {
      reconciled.push({ payoutId: p.id, status: "paid", paypalStatus: state });
      reconciledPayouts.push({ ...p, status: "paid", paidAt: Date.now(), paypalStatus: state });
    } else if (check.ok && ["FAILED", "DENIED", "BLOCKED", "RETURNED", "REFUNDED"].includes(state)) {
      reconciled.push({ payoutId: p.id, status: "failed", paypalStatus: state });
      reconciledPayouts.push({ ...p, status: "failed", paidAt: null, paypalStatus: state, note: `PayPal batch terminal status: ${state}` });
    } else {
      reconciledPayouts.push({ ...p, paypalStatus: state || p.paypalStatus || "UNKNOWN" });
    }
  }

  const pending = reconciledPayouts.filter(isClaimable);
  if (pending.length === 0 && reconciled.length === 0) {
    if (JSON.stringify(reconciledPayouts) !== JSON.stringify(payouts)) await kvSet(PAYOUTS_KEY, reconciledPayouts);
    return { ok: true, processed: 0, reconciled, message: "No pending payouts" };
  }

  const results = [...reconciled];
  const updatedPayouts = [...reconciledPayouts];

  for (const payout of pending) {
    const marketer = marketers.find((m) => m.id === payout.marketerId);
    const method = String(payout.method || "paypal").toLowerCase();

    // Claim BEFORE touching PayPal and persist the claim immediately: two
    // overlapping runs (cron + manual) can then never double-send. The stable
    // sender_batch_id inside sendPayPalPayout is the second safety net.
    const idx = updatedPayouts.findIndex((p) => p.id === payout.id);
    if (idx !== -1) {
      updatedPayouts[idx] = { ...updatedPayouts[idx], status: "processing", claimedAt: Date.now() };
      try { await kvSet(PAYOUTS_KEY, updatedPayouts); } catch { /* best-effort */ }
    }

    let result;
    if (method === "paypal") {
      // The recipient captured on the payout record wins; the live marketer
      // record is only a fallback for older payouts without one.
      const email = (typeof payout.recipient === "string" ? payout.recipient : payout.recipient?.payPalEmail) ||
        marketer?.payPalEmail;
      if (!email) {
        result = { ok: false, note: "No PayPal email for creator" };
      } else {
        result = await sendPayPalPayout(payout, email);
      }
    } else if (method === "bank") {
      result = {
        ok: true,
        reference: `BANK-${payout.id}`,
        note: "Bank transfer recorded — the owner transfers manually using the private recipient details.",
      };
    } else {
      result = {
        ok: true,
        reference: `OTHER-${payout.id}`,
        note: "Recorded — the owner handles it manually using the creator's private payment note.",
      };
    }

    if (idx !== -1) {
      updatedPayouts[idx] = {
        ...updatedPayouts[idx],
        status: result.ok && method === "paypal" ? "processing" : (result.ok ? "paid" : "failed"),
        reference: result.reference || updatedPayouts[idx].reference,
        paidAt: result.ok && method !== "paypal" ? Date.now() : null,
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }

  // Bearer CRON_SECRET / PAYOUTS_SECRET only (x-vercel-cron and ?secret= are spoofable/leaky).
  const isCron = req.method === "GET" && isAuthorizedCron(req, [process.env.PAYOUTS_SECRET]);

  if (isCron) {
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }
    try {
      const _r = await processPendingPayouts();
      json(res, _r);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500);
    }
    return;
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      json(res, { ok: false, error: "bad_json" }, 400);
      return;
    }
    // Fail closed: with PAYOUTS_SECRET unset, undefined === undefined must
    // never authorize a payout run.
    const payoutsSecret = String(process.env.PAYOUTS_SECRET || "");
    if (!payoutsSecret || !(isAuthorizedCron(req, [payoutsSecret]) || String(body?.secret || "") === payoutsSecret)) {
      json(res, { ok: false, error: "unauthorized" }, 401);
      return;
    }
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }
    try {
      const _r = await processPendingPayouts();
      json(res, _r);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500);
    }
    return;
  }

  json(res, { ok: false, error: "method_not_allowed" }, 405);
}

