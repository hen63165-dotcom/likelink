/**
 * Likelink — Payout Service
 * =========================
 *
 * This module defines the payout DATA MODEL for creator earnings and provides
 * a single, clearly-marked integration point where the real Israeli payment
 * provider's API call will be made.
 *
 * STATUS: MOCK / READY-TO-WIRE.
 *   - The data model below is final and correct.
 *   - `processPayout()` currently returns a mock "paid" result.
 *   - To go live, the site owner must:
 *       1. Sign up with an Israeli payment provider (Tranzila, Cardcom, or
 *          PayPlus) and obtain real API credentials.
 *       2. Paste those credentials into PROVIDER_CONFIG below (and a .env file
 *          — see NEXT_STEPS.md).
 *       3. Replace the body of `processPayout()` marked "PAYMENT PROVIDER API
 *          CALL GOES HERE" with the provider's real transfer request.
 *   See NEXT_STEPS.md for step-by-step Hebrew instructions for the owner.
 */

// ── Provider configuration ─────────────────────────────────────────────
// The owner fills these in once they have real credentials. Placeholders now.
const PROVIDER_CONFIG = {
  provider: "REPLACE_WITH (Tranzila | Cardcom | PayPlus)",
  merchantId: import.meta.env.VITE_RAV_MERCHANT_ID || "REPLACE_ME",
  apiKey: import.meta.env.VITE_RAV_API_KEY || "REPLACE_ME",
  apiBaseUrl: "https://api.example-pay.com/v1", // replace with real endpoint
};

export const PAYOUT_STATUS = { PENDING: "pending", PAID: "paid", FAILED: "failed" };

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
export function getSellerPayoutSummary(sales, payouts, marketerId) {
  const mine = (sales || []).filter((s) => s.marketerId === marketerId);
  const netEarned = mine.reduce((sum, s) => sum + (s.marketerNet || 0), 0);
  const platformFees = mine.reduce((sum, s) => sum + (s.platformFee || 0), 0);
  const paid = (payouts || [])
    .filter((p) => p.marketerId === marketerId && p.status === "paid")
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingPayout = Math.max(0, netEarned - paid);
  return { netEarned, platformFees, paid, pendingPayout };
}

/**
 * Actually pay a seller. MOCK implementation (resolve "paid").
 *
 * When the owner has real provider credentials, replace the marked section
 * below with the provider's real payout/transfer request.
 *
 * @param {object} payout Payout data-model object (see above)
 * @returns {Promise<object>} the same payout, updated with { status, reference, paidAt }
 */
export async function processPayout(payout) {
  // ---- PAYMENT PROVIDER API CALL GOES HERE ------------------------------
  // Example (Tranzila-like) shape — replace with the real request:
  //
  //   const res = await fetch(`${PROVIDER_CONFIG.apiBaseUrl}/payouts`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${PROVIDER_CONFIG.apiKey}`,
  //     },
  //     body: JSON.stringify({
  //       merchantId: PROVIDER_CONFIG.merchantId,
  //       amount: payout.amount,
  //       currency: payout.currency,
  //       method: payout.method,
  //       recipient: payout.recipient,
  //     }),
  //   });
  //   if (!res.ok) return { ...payout, status: PAYOUT_STATUS.FAILED, note: "Provider rejected the request." };
  //   const data = await res.json();
  //   return { ...payout, status: PAYOUT_STATUS.PAID, reference: data.id, paidAt: Date.now() };
  // -----------------------------------------------------------------------

  // Mock: pretend the provider approved the transfer after ~600ms.
  await new Promise((r) => setTimeout(r, 600));
  return {
    ...payout,
    status: PAYOUT_STATUS.PAID,
    reference: `MOCK-${payout.id}`,
    paidAt: Date.now(),
    note: "MOCK — wire up a real provider in processPayout() (see NEXT_STEPS.md).",
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
