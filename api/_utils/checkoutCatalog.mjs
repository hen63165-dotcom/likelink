// Server-authoritative cart pricing for PayPal checkout.
//
// The browser only says WHICH products and HOW MANY. Titles, unit prices and
// the owning creator always come from the stored catalog — a client-edited
// price or marketerId can never change what is charged or who is credited.
// Pure function (no I/O) so the rules are unit-tested directly.

export const CHECKOUT_CURRENCY = "ILS";
export const SUPPORTED_CURRENCIES = Object.freeze(["ILS", "USD", "EUR"]);
export const REFERRAL_COMMISSION_RATE_PERCENT = 10;
export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 20;

export function calculateReferralCommission(platformFee, hasReferral) {
  const fee = Number(platformFee);
  if (!hasReferral || !Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round((fee * (REFERRAL_COMMISSION_RATE_PERCENT / 100) + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Array<{productId:string, quantity?:number}>} items  client cart
 * @param {Array<object>} products                              stored catalog
 * @returns {{ok:true, lines:Array, total:number, currency:string} | {ok:false, error:string, productId?:string}}
 */
export function priceCart(items, products) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "empty_cart" };
  if (items.length > MAX_LINES) return { ok: false, error: "cart_too_large" };
  const catalog = new Map((Array.isArray(products) ? products : []).filter((p) => p && p.id != null).map((p) => [String(p.id), p]));
  const merged = new Map();
  for (const it of items) {
    const productId = String(it?.productId || "").trim();
    if (!productId) return { ok: false, error: "product_id_required" };
    const qty = Math.floor(Number(it?.quantity ?? 1));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) return { ok: false, error: "invalid_quantity", productId };
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }
  for (const [productId, quantity] of merged) {
    if (quantity > MAX_QTY_PER_LINE) return { ok: false, error: "invalid_quantity", productId };
    const p = catalog.get(productId);
    if (!p) return { ok: false, error: "product_not_found", productId };
    if (p.status !== "approved") return { ok: false, error: "product_not_available", productId };
    const commerceType = String(p.commerceType || p.commerce_type || "").trim().toLowerCase();
    if (!commerceType) return { ok: false, error: "product_type_required", productId };
    if (commerceType === "affiliate") return { ok: false, error: "affiliate_checkout_external", productId };
    if (commerceType !== "physical" && commerceType !== "digital") {
      return { ok: false, error: "product_type_unsupported", productId };
    }
    const currency = String(p.currency || CHECKOUT_CURRENCY).toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency)) return { ok: false, error: "currency_unsupported", productId };
    if (currency !== CHECKOUT_CURRENCY) return { ok: false, error: "currency_unsupported", productId };
    if (commerceType === "physical") {
      const stock = Number(p.stockQuantity);
      if (p.inventoryVerified !== true || !Number.isInteger(stock) || stock < quantity) {
        return { ok: false, error: "inventory_unverified", productId };
      }
    }
    return { ok: false, error: "fulfillment_unconfigured", productId };
  }
  return { ok: false, error: "empty_cart" };
}

/** Does the capture PayPal returned match the stored order record exactly? */
export function captureMatchesOrder(capture, record) {
  const unit = capture?.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const value = Number(cap?.amount?.value);
  const currency = String(cap?.amount?.currency_code || "").toUpperCase();
  if (!record || !Number.isFinite(value)) return false;
  if (currency !== String(record.currency || CHECKOUT_CURRENCY).toUpperCase()) return false;
  if (Math.abs(value - Number(record.total)) > 0.005) return false;
  // PayPal echoes custom_id on the capture (and sometimes on the unit).
  const customId = cap?.custom_id || unit?.custom_id;
  if (record.checkoutId && customId && String(customId) !== String(record.checkoutId)) return false;
  return true;
}
