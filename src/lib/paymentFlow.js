/**
 * Israeli commerce payment flow for Likelink2.
 * Uses a Business PayPal path as the current operational fallback while preserving a clean provider abstraction.
 */

export const PAYMENT_MODE = {
  PAYPAL_BUSINESS: "paypal_business",
  MANUAL_PAYOUT: "manual_payout",
  MIXED: "mixed",
};

export function buildBusinessPayPalFlow({ sellerName, email, amount, currency = "ILS" }) {
  const safeAmount = Number(amount || 0);
  return {
    mode: PAYMENT_MODE.PAYPAL_BUSINESS,
    sellerName: String(sellerName || "Seller").slice(0, 80),
    email: String(email || "").trim(),
    amount: Number.isFinite(safeAmount) ? safeAmount : 0,
    currency,
    checkoutUrl: `https://www.paypal.com/businessmanage/summary?name=${encodeURIComponent(String(sellerName || "Seller"))}`,
    note: "Business PayPal flow is the current default for Israeli creators until a full payment gateway is activated.",
  };
}

export function createSellerCheckoutBundle({ marketer, cartItems = [], subtotal = 0 }) {
  const total = Number(subtotal || 0);
  return {
    seller: {
      id: marketer?.id || "guest",
      name: marketer?.name || "Seller",
      paypalEmail: marketer?.payPalEmail || "",
    },
    items: cartItems,
    subtotal: total,
    currency: "ILS",
    paymentMode: marketer?.payPalEmail ? PAYMENT_MODE.PAYPAL_BUSINESS : PAYMENT_MODE.MANUAL_PAYOUT,
    instructions: marketer?.payPalEmail
      ? "Buyer will be redirected to a business PayPal checkout or sent the merchant email for secure transfer."
      : "Seller payout flow is currently manual until a payment gateway is configured.",
  };
}

export function getPaymentReadiness({ marketer, hasGateway = false }) {
  return {
    ready: hasGateway || Boolean(marketer?.payPalEmail),
    mode: hasGateway ? PAYMENT_MODE.MIXED : (marketer?.payPalEmail ? PAYMENT_MODE.PAYPAL_BUSINESS : PAYMENT_MODE.MANUAL_PAYOUT),
    recommended: "Business PayPal account for Israeli commerce + manual payout fallback until gateway integration.",
  };
}
