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
 * Creates a real PayPal checkout order server-side and returns the approval URL.
 * The buyer is redirected to PayPal to approve, then PayPal redirects back to
 * /api/checkout/capture-order which captures the payment and records the sale.
 *
 * @param {Array}  items   cart items: { title, price, quantity, productId, marketerId }
 * @param {string} returnUrl  where PayPal redirects after approval
 * @param {string} cancelUrl  where PayPal redirects on cancel
 * @returns {Promise<{ ok: boolean, orderId?: string, approvalUrl?: string, mock?: boolean, error?: string }>}
 */
export function createPayPalCheckout({ items = [], returnUrl = "/", cancelUrl = "/" }) {
  return fetch("/api/checkout/create-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: items.map((it) => ({
        title: it.product?.title || it.title || "Product",
        price: Number(it.product?.price || it.price || 0),
        quantity: Math.max(1, Number(it.quantity || 1)),
        productId: it.product?.id || null,
        marketerId: it.marketer?.id || null,
        sellerName: it.marketer?.name || "",
      })),
      returnUrl,
      cancelUrl,
      custom: items.map((it) => `${it.marketer?.id || "guest"}:${it.product?.id || "x"}`).join(","),
    }),
  }).then((r) => r.json());
}

/**
 * Captures a PayPal order after buyer approval. Server records the sale
 * and creates pending payouts for each seller automatically.
 *
 * @param {string} orderId  the PayPal order ID
 * @param {Array}  items    cart items for sale recording
 * @returns {Promise<{ ok: boolean, captureId?: string, sales?: [], total?: string, error?: string }>}
 */
export function capturePayPalCheckout({ orderId, items = [] }) {
  return fetch("/api/checkout/capture-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId,
      items: items.map((it) => ({
        productId: it.product?.id || null,
        marketerId: it.marketer?.id || null,
        title: it.product?.title || it.title || "Product",
        price: Number(it.product?.price || it.price || 0),
        quantity: Math.max(1, Number(it.quantity || 1)),
      })),
    }),
  }).then((r) => r.json());
}
