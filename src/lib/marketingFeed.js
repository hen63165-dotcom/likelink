/**
 * Likelink creator marketing toolkit.
 *
 * Pure ESM (no Node built-ins, no browser globals) so it can be reused by the
 * React campaign studio, the CLI, and any serverless job alike. It turns a
 * raw Likelink product + creator into ready-to-paste Hebrew marketing assets:
 *
 *   - a tracked product-URL (`/<r>?u=...&ref=...`) so every click is attributed
 *   - a WhatsApp share message with the tracking link
 *   - a social-media (Instagram / Facebook) ad caption
 *   - a small performance report built from the creator's real clicks/sales
 *
 * The tracking link follows the platform forwarder convention already used by
 * the seed data and `findProductsNeedingTracking` in src/utils/helpers.js.
 */

export const DEFAULT_BASE_URL = "https://www.likelink.com";
export const CURRENCY_SYMBOLS = { ILS: "₪", USD: "$", EUR: "€", GBP: "£" };
export const DEFAULT_CURRENCY = "ILS";

/** Escape a value for the WhatsApp / URL-safe text we paste into messages. */
export function toText(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

/** Coerce a value to a finite number without throwing. */
export function toNumber(value, fb = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fb;
}

/** Format a price as e.g. `₪249.00` (Hebrew default, matching money()). */
export function formatPrice(price, currency = DEFAULT_CURRENCY) {
  const n = toNumber(price, 0);
  const sym = CURRENCY_SYMBOLS[currency] || CURRENCY_SYMBOLS[DEFAULT_CURRENCY];
  return `${sym}${n.toFixed(2)}`;
}

/** True only for absolute http(s) URLs. Safe in Node and browsers. */
export function isAbsoluteHttpUrl(value) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Product's direct landing page on Likelink (the deep-link the app resolves via
 * `?product=<id>`). Reuses the same URL shape as the Google Merchant feed.
 */
export function productPageUrl(baseUrl = DEFAULT_BASE_URL, id) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/?product=${encodeURIComponent(String(id ?? ""))}`;
}

/**
 * Platform click-tracking forwarder link. Every click routed through `/r` is
 * attributed to the creator via their tracking id, then forwarded to the real
 * destination. This is the link we put in WhatsApp/social messages.
 */
export function buildTrackingLink(baseUrl = DEFAULT_BASE_URL, destinationUrl, trackingId) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const dest = encodeURIComponent(String(destinationUrl || ""));
  const ref = encodeURIComponent(String(trackingId || ""));
  return `${base}/r?u=${dest}&ref=${ref}`;
}

/** Build the WhatsApp "click to chat" URL for a prefilled message. */
export function whatsAppChatUrl(message) {
  const text = encodeURIComponent(String(message || ""));
  return `https://wa.me/?text=${text}`;
}

/**
 * A natural-sounding, creator-branded Hebrew WhatsApp message for one product.
 * Uses the tracking link so taps are measured, and ends with discoverability
 * hashtags that are short enough to stay well under WhatsApp's 2000-char limit.
 */
export function whatsAppMessage({ productName, price, creatorName, trackingLink, hashtag = "קניות" }) {
  const product = toText(productName, "מוצר מגניב");
  const priceStr = toText(price, "");
  const creator = toText(creatorName, "חברת ליקוולינק");
  const link = toText(trackingLink, "");
  return [
    `✨ מומלץ על-ידי ${creator} באפליקציית ליקוולינק 🛍️`,
    "",
    `${product} — ${priceStr}`,
    "קישור אישי שלי — כל לחיצה מגיעה אליכם ישירות, בלי תוויות נוספות:",
    link,
    "",
    `#${hashtag} #קניות #ליקוולינק`,
  ].join("\n");
}

/**
 * A concise Hebrew Instagram / Facebook ad caption: hook + product + price +
 * tracked link + hashtags. Designed for creators who paste it directly.
 */
export function socialCaption({ productName, price, creatorName, trackingLink }) {
  const product = toText(productName, "מוצר שבאמת מומלץ");
  const priceStr = toText(price, "");
  const creator = toText(creatorName, "אני");
  const link = toText(trackingLink, "");
  return `🎁 מצאתי את זה בליקוולינק!\n✨ ${product} של ${creator} — רק ${priceStr}\nקישור אישי שלי: ${link}\n#סטייל #קניות #ליקוולינק #המלצה #מומלץ`.trim();
}
/** One campaign "kit" for a single approved product. */
export function buildCampaign(product, marketer, opts = {}) {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL;
  const currency = opts.currency || DEFAULT_CURRENCY;
  const creatorName = toText(marketer?.name, "חברת ליקוולינק");
  const trackingId = toText(marketer?.trackingId, "");

  const landingUrl = productPageUrl(baseUrl, product.id);
  // Wrap the landing page in the platform forwarder so clicks are attributed.
  const trackingLink = buildTrackingLink(baseUrl, landingUrl, trackingId);
  const priceStr = formatPrice(product.price, currency);

  const message = whatsAppMessage({
    productName: product.title,
    price: priceStr,
    creatorName,
    trackingLink,
  });
  const caption = socialCaption({
    productName: product.title,
    price: priceStr,
    creatorName,
    trackingLink,
  });

  return {
    productId: product.id,
    productName: toText(product.title),
    price: priceStr,
    currency,
    landingUrl,
    trackingLink,
    trackingId,
    imageUrl: isAbsoluteHttpUrl(product.image) ? String(product.image) : "",
    category: product.category,
    whatsAppMessage: message,
    socialCaption: caption,
    whatsAppChatUrl: whatsAppChatUrl(message),
  };
}

/**
 * Aggregate performance report from a creator's real product clicks + sales.
 * (The numbers are live-synced via the same Supabase/localStorage feed.)
 */
export function buildCampaignReport({ products = [], sales = [] }) {
  const approved = (products || []).filter((p) => p && p.status === "approved");
  const totalClicks = approved.reduce((s, p) => s + toNumber(p.clicks, 0), 0);
  const totalSales = (sales || []).length;
  const totalRevenue = (sales || []).reduce((s, x) => s + toNumber(x.saleAmount, 0), 0);
  const totalCommission = (sales || []).reduce((s, x) => s + toNumber(x.commissionAmount, 0), 0);

  const perProduct = approved.map((p) => {
    const pSales = (sales || []).filter((s) => s.productId === p.id);
    const rev = pSales.reduce((s, x) => s + toNumber(x.saleAmount, 0), 0);
    const com = pSales.reduce((s, x) => s + toNumber(x.commissionAmount, 0), 0);
    return {
      id: p.id,
      title: toText(p.title),
      image: isAbsoluteHttpUrl(p.image) ? String(p.image) : "",
      clicks: toNumber(p.clicks, 0),
      sales: pSales.length,
      revenue: rev,
      commission: com,
    };
  }).sort((a, b) => b.clicks - a.clicks || b.commission - a.commission);

  return {
    products: approved.length,
    totalClicks,
    totalSales,
    totalRevenue,
    totalCommission,
    perProduct,
  };
}

export default buildCampaign;


