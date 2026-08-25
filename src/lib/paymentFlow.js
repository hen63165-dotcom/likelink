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

/**
 * Builds a real PayPal Standard checkout URL (_xclick).
 * The buyer is redirected to PayPal and pays directly into the seller's
 * Business PayPal account. No server or API secrets required, which makes it
 * suitable for static deployments (Vercel) and supports ILS.
 */
export function buildPayPalStandardCheckoutUrl({
  payPalEmail,
  itemName,
  amount,
  currency = "ILS",
  quantity = 1,
  custom = "",
  returnUrl,
  cancelReturnUrl,
}) {
  const email = String(payPalEmail || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  const safeAmount = Number(amount || 0);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) return "";

  const params = new URLSearchParams({
    cmd: "_xclick",
    business: email,
    item_name: String(itemName || "Order").slice(0, 127),
    amount: safeAmount.toFixed(2),
    currency_code: currency,
    quantity: String(Math.max(1, Number(quantity) || 1)),
    no_shipping: "0",
    no_note: "0",
  });
  if (custom) params.set("custom", String(custom).slice(0, 255));
  if (returnUrl) params.set("return", returnUrl);
  if (cancelReturnUrl) params.set("cancel_return", cancelReturnUrl);

  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

/**
 * Groups cart items by their seller so each seller gets paid into their own
 * Business PayPal account.
 */
export function groupCartItemsBySeller(cartItems = []) {
  const groups = new Map();
  for (const item of cartItems) {
    const sellerId = item?.marketer?.id || "guest";
    if (!groups.has(sellerId)) {
      groups.set(sellerId, { seller: item?.marketer || null, items: [], total: 0 });
    }
    const group = groups.get(sellerId);
    group.items.push(item);
    group.total += Number(item?.product?.price || 0) * Number(item?.quantity || 1);
  }
  return Array.from(groups.values());
}
