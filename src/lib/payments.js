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

// ─── Payment provider (SERVER-SIDE ONLY) ───────────────────────────────────
// Real money moves ONLY inside api/payouts/process.mjs (PayPal Mass Payouts,
// server credentials). This client module is the payout DATA MODEL + math:
// it must never call a payment provider and never mark a payout as paid.
// Payouts stay "pending" until the server worker pays them for real.

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
