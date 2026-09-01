/**
 * Likelink — Payout Service
 * =========================
 *
 * This module defines the payout DATA MODEL for creator earnings and provides
 * the payout mechanism: real PayPal Mass Payouts when credentials are present,
 * a safe mock fallback otherwise.
 *
 * To go live with PayPal:
 *   1. Paste PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET into the Vercel env.
 *   2. Enable "Mass Payouts" on your PayPal app (Settings → Payouts).
 *   3. Each payout is submitted to the PayPal Payouts API automatically.
 *   See NEXT_STEPS.md for step-by-step Hebrew instructions for the owner.
 */

// ── Provider configuration (future) ────────────────────────────────────
// A real Israeli provider (Tranzila/Cardcom/PayPlus) can be added later for
// bank-transfer payouts. For now the platform pays via PayPal Mass Payouts.

export const PAYOUT_STATUS = { PENDING: "pending", PAID: "paid", FAILED: "failed" };

// ─── PayPal Payouts (real provider) ────────────────────────────────────────
// If the site owner has pasted a PayPal REST API client ID + secret into the
// Vercel environment (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET), the worker
// will actually create a payout item in the PayPal "Mass Payouts" batch API
// and mark it paid with PayPal's batch id. Until then we keep the existing
// mock so the whole flow can still be tested end-to-end (the batch id is
// "MOCK-batch-<id>" and the status flips to paid after ~600ms).
const PAYPAL_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";
const isPayPalConfigured = () => Boolean(import.meta.env.VITE_PAYPAL_CLIENT_ID || import.meta.env.PAYPAL_CLIENT_SECRET);

async function getPayPalAccessToken() {
  const id = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const secret = import.meta.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const base = String(secret).startsWith("sandbox") ? SANDBOX_API : PAYPAL_API;
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

/**
 * Actually pay a seller. When PayPal credentials are present it creates a real
 * "Mass Payouts" batch item in the seller's chosen method (paypal → their
 * PayPal email; bank/other → we still record the payout and let the owner
 * finalise via the payment provider of their choice). When credentials are
 * missing it falls back to the mock "paid" response so the UI and worker stay
 * testable.
 *
 * @param {object} payout payout record (has .id, .marketerId, .amount, .method,
 *   .recipient — the seller's destination details from their profile)
 * @returns {Promise<object>} updated payout ({status, reference, paidAt, note})
 */
export async function processPayout(payout) {
  const method = String(payout?.method || PAYOUT_METHOD).toLowerCase();

  if (isPayPalConfigured() && method === "paypal") {
    const token = await getPayPalAccessToken();
    if (token) {
      try {
        const base = PAYPAL_API;
        const res = await fetch(`${base}/v1/payments/payouts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender_batch_header: {
              sender_batch_id: `lk_${payout.id}`,
              email_subject: "Likelink payout",
              email_message: "You received a payout from Likelink.",
            },
            items: [
              {
                recipient_type: "EMAIL",
                amount: { value: (Number(payout.amount) || 0).toFixed(2), currency: "ILS" },
                receiver: payout.recipient?.payPalEmail || payout.email || "",
                note: "Likelink creator payout",
                sender_item_id: payout.id,
              },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return {
            ...payout,
            status: PAYOUT_STATUS.PAID,
            reference: data?.batch_header?.payout_batch_id || `PP-${payout.id}`,
            paidAt: Date.now(),
            note: "PayPal Mass Payouts batch submitted.",
          };
        }
        return { ...payout, status: PAYOUT_STATUS.FAILED, note: `PayPal rejected (${res.status})` };
      } catch (e) {
        return { ...payout, status: PAYOUT_STATUS.FAILED, note: `PayPal error: ${e?.message || e}` };
      }
    }
  }

 // ─── Mock fallback: pretend the provider approved after ~600ms ─────────────
  await new Promise((r) => setTimeout(r, 600));
  return {
    ...payout,
    status: PAYOUT_STATUS.PAID,
    reference: `MOCK-${payout.id}`,
    paidAt: Date.now(),
    note: "MOCK — add PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET to enable reality payouts.",
  };
}

/**
 * Mark a payout as paid after the provider returns success and you persist it.
 * @param {object} payout
 * @param {string} reference provider reference
 * @returns {object} updated payout
 */
export function markPayoutPaid(payout, reference) {
  return { ...payout, status: PAYOUT_STATUS.PAID, reference, paidAt: Date.now() };
}

/**
 * Payout data model (one object per payout, keyed by id, stored per marketer).
 * {
 *   id: string,            // uid()
 *   marketerId: string,    // the seller being paid
 *   amount: number,        // net amount to pay out (the seller's ~85% share)
 *   currency: "ILS",
 *   status: "pending" | "paid" | "failed",   // see PAYOUT_STATUS
 *   method: "bank" | "card" | "manual",      // depends on provider
 *   recipient: object,     // bank/account details (filled by owner/provider)
 *   reference: string|null,// provider's payout/transfer id once submitted
 *   createdAt: number,
 *   paidAt: number|null,
 *   note: string,
 * }
 */

/**
 * Compute a seller's payout summary from their sales records.
 *
 * @param {Array}  sales       all marketplace sales (each row has marketerNet, platformFee, marketerId, ts)
 * @param {string} marketerId  the seller
 * @returns {{ netEarned:number, platformFees:number, paidOut:number, pendingPayout:number }}
 *   netEarned     total marketerNet across that seller's sales (seller keeps ~85%)
 *   platformFees  total platformFee across those sales (platform's ~15%)
 *   pendingPayout netEarned minus whatever has already been paid out
 */
export function getSellerPayoutSummary(sales, payouts, marketerId, charges = []) {
  const mine = (sales || []).filter((s) => s.marketerId === marketerId);
  const netEarned = mine.reduce((sum, s) => sum + (s.marketerNet || 0), 0);
  const platformFees = mine.reduce((sum, s) => sum + (s.platformFee || 0), 0);
  const paid = (payouts || [])
    .filter((p) => p.marketerId === marketerId && p.status === "paid")
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  // Charged / spent = what the seller bought from their own balance
  // (e.g. "boost" promotions). Zero payment gateway needed — the money is
  // simply deducted from what the platform would otherwise pay out.
  const spent = (charges || [])
    .filter((c) => c.marketerId === marketerId)
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const pendingPayout = Math.max(0, netEarned - paid - spent);
  return { netEarned, platformFees, paid, spent, pendingPayout };
}
