/**
 * Google Merchant Center product-feed builder for Likelink.
 *
 * Generates a valid RSS 2.0 XML feed using the Google Shopping namespace
 * (`http://base.google.com/ns/1.0`). It is deliberately written as pure ESM
 * with no Node built-ins and no browser globals, so the exact same code runs
 * in three places:
 *
 *   1. The in-app Admin button (browser bundle)   -> immediate manual download
 *   2. The `/api/google-feed` serverless endpoint (Vercel + Netlify) -> direct
 *      URL that Google Merchant Center polls for a scheduled update
 *   3. The CLI script `scripts/generate-google-feed.mjs` (Node) -> local file
 *
 * Google Merchant Center expects at a minimum: g:id, g:title, g:description,
 * g:link, g:image_link, g:price, g:availability and g:brand. We also emit the
 * optional g:condition and g:product_type to avoid "missing attribute" warnings.
 */

const G_NS = "http://base.google.com/ns/1.0";

export const DEFAULT_BRAND = "Likelink";
export const DEFAULT_CURRENCY = "ILS"; // Likelink prices are in Israeli New Shekels
export const DEFAULT_BASE_URL = "https://www.likelink.com";

/* ---------------------------------------------------------------------------
 * Small helpers (safe in Node + browser)
 * ------------------------------------------------------------------------- */

/** Escape a value for use as XML text content / attribute. */
export function escapeXml(value) {
  const s = value == null ? "" : String(value);
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[c]);
}

/** Coerce a value to a finite number without ever throwing. */
export function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** A trimmed non-empty string or a fallback. */
export function toText(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

/** True only for absolute http(s) URLs. Works in Node and browsers. */
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
 * Resolve a product's direct landing page on Likelink. Because the app renders
 * products inside the single-page feed, we deep-link with `?product=<id>`; the
 * app opens that product on load (see FeedView). Returns a full absolute URL.
 */
export function productPageUrl(baseUrl = DEFAULT_BASE_URL, id) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/?product=${encodeURIComponent(String(id ?? ""))}`;
}

/** Map a Likelink product status to a Google `availability` value. */
export function availabilityFor(status) {
  // Only products the admin approved are sellable on the platform.
  return status === "approved" ? "in stock" : "out of stock";
}

/** Format a numeric price as e.g. `249.00 ILS` (Google requires ISO currency). */
export function formatPrice(price, currency = DEFAULT_CURRENCY) {
  const n = toNumber(price, 0);
  const code = String(currency || DEFAULT_CURRENCY).trim().toUpperCase() || "ILS";
  return `${n.toFixed(2)} ${code}`;
}

/** Wrap a value in a Google-namespaced XML element. */
function wrap(name, value) {
  return `<g:${name}>${escapeXml(value)}</g:${name}>`;
}

/* ---------------------------------------------------------------------------
 * Item shaping
 * ------------------------------------------------------------------------- */

/**
 * Build the ordered list of Google feed items. Only products the admin approved
 * (status === "approved") with a title and a link are included; the rest would
 * trigger Merchant Center errors, so they are filtered out here.
 */
export function collectFeedItems({
  products = [],
  marketers = [],
  baseUrl = DEFAULT_BASE_URL,
  currency = DEFAULT_CURRENCY,
  brand = DEFAULT_BRAND,
}) {
  const byMarketer = new Map((marketers || []).map((m) => [m && m.id, m]));

  return (products || [])
    .filter((p) => p && p.status === "approved")
    .filter((p) => toText(p.title))
    // Google Shopping hard requirements — anything missing gets the ITEM
    // disapproved and pollutes the account's diagnostics. We only ship items
    // Google will accept, so the feed is always clean:
    .filter((p) => toNumber(p.price, 0) > 0)      // price must be > 0
    .filter((p) => toText(p.description))         // description is required
    .filter((p) => isAbsoluteHttpUrl(p.image))    // image_link is required
    .map((p) => {
      const m = byMarketer.get(p.marketerId);
      return {
        id: toText(p.id, p.id),
        title: toText(p.title),
        description: toText(p.description),
        // Always point to OUR landing page (Google crawls this), not the
        // retailer's affiliate URL (which varies and is not crawlable).
        link: productPageUrl(baseUrl, p.id),
        image: isAbsoluteHttpUrl(p.image) ? p.image.trim() : "",
        price: formatPrice(p.price, currency),
        availability: availabilityFor(p.status),
        brand: toText(brand, DEFAULT_BRAND),
        condition: "new",
        product_type: toText(m && m.name ? `${p.category} > ${m.name}` : p.category),
      };
    })
    // De-duplicate on id so Merchant Center never sees two rows for one product.
    .filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index);
}

/* ---------------------------------------------------------------------------
 * XML assembly
 * ------------------------------------------------------------------------- */

function itemToXml(item) {
  const lines = ["  <item>"];
  lines.push(`    ${wrap("id", item.id)}`);
  lines.push(`    ${wrap("title", item.title)}`);
  lines.push(`    ${wrap("description", item.description)}`);
  lines.push(`    ${wrap("link", item.link)}`);
  if (item.image) lines.push(`    ${wrap("image_link", item.image)}`);
  lines.push(`    ${wrap("price", item.price)}`);
  lines.push(`    ${wrap("availability", item.availability)}`);
  lines.push(`    ${wrap("brand", item.brand)}`);
  lines.push(`    ${wrap("condition", item.condition)}`);
  if (item.product_type) lines.push(`    ${wrap("product_type", item.product_type)}`);
  lines.push("  </item>");
  return lines.join("\n");
}

/**
 * Build the full `google-feed.xml` document from raw Likelink data.
 *
 * @param {Object} params
 * @param {Array}  params.products   Raw Likelink products
 * @param {Array}  params.marketers  Raw Likelink marketers (for product_type)
 * @param {string} [params.baseUrl]  Public origin, e.g. "https://www.likelink.com"
 * @param {string} [params.currency] ISO currency code, default "ILS"
 * @param {string} [params.brand]    Brand for every item, default "Likelink"
 * @param {string} [params.title]    Channel <title>, default "Likelink - Google Merchant Feed"
 * @param {string} [params.link]     Channel <link>
 * @returns {string} the XML document string
 */
export function buildGoogleFeed({
  products = [],
  marketers = [],
  baseUrl = DEFAULT_BASE_URL,
  currency = DEFAULT_CURRENCY,
  brand = DEFAULT_BRAND,
  title = "Likelink - Google Merchant Feed",
  link,
} = {}) {
  const items = collectFeedItems({ products, marketers, baseUrl, currency, brand });
  const channel = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:g="${G_NS}">`,
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(link || baseUrl)}</link>`,
    `    <description>${escapeXml("Likelink curated product picks from independent creators.")}</description>`,
    ...items.map((item) => itemToXml(item)),
    "  </channel>",
    "</rss>",
    "",
  ];
  return channel.join("\n");
}

/** Convenience string for the published endpoint's default file name. */
export const FEED_FILE_NAME = "google-feed.xml";

export default buildGoogleFeed;

