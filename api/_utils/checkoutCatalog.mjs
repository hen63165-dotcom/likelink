// Server-authoritative cart pricing for PayPal checkout.
//
// The browser only says WHICH products and HOW MANY. Titles, unit prices and
// the owning creator always come from the stored catalog — a client-edited
// price or marketerId can never change what is charged or who is credited.
// Pure function (no I/O) so the rules are unit-tested directly.

export const CHECKOUT_CURRENCY = "ILS";
export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 20;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

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
  const lines = [];
  for (const [productId, quantity] of merged) {
    if (quantity > MAX_QTY_PER_LINE) return { ok: false, error: "invalid_quantity", productId };
    const p = catalog.get(productId);
    if (!p) return { ok: false, error: "product_not_found", productId };
    if (p.status !== "approved") return { ok: false, error: "product_not_available", productId };
    const unitPrice = round2(p.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, error: "product_not_available", productId };
    const currency = String(p.currency || CHECKOUT_CURRENCY).toUpperCase();
    if (currency !== CHECKOUT_CURRENCY) return { ok: false, error: "currency_unsupported", productId };
    lines.push({
      productId,
      marketerId: p.marketerId ? String(p.marketerId) : null,
      title: String(p.title || "Product").slice(0, 120),
      unitPrice,
      quantity,
      lineTotal: round2(unitPrice * quantity),
    });
  }
  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (!(total > 0)) return { ok: false, error: "empty_cart" };
  return { ok: true, lines, total, currency: CHECKOUT_CURRENCY };
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
