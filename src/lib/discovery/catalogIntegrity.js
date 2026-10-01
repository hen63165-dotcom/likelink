// Catalog integrity — can this product be promoted honestly?
//
// Two checks found on the live catalog (2026-10-01):
//  • the same affiliate link reused by several DIFFERENT products (22 seed
//    products shared two links that open the AliExpress home page, not the
//    product) — promoting them sends buyers to the wrong place;
//  • a stock photo (Unsplash, Pexels…) used as the product image — showing it
//    as "the product" is misleading.
// Isomorphic: used by the distribution engine, brand pulse and the UGC jobs.

export const IMAGE_PROVENANCE = Object.freeze({
  MERCHANT: "merchant_photo", // the store's own product photo (e.g. alicdn.com)
  OWN: "own_upload",          // uploaded by the creator to LikeLink storage
  STOCK: "stock_photo",       // generic stock image — not the product
  UNKNOWN: "unknown",
  NONE: "none",
});

const STOCK_HOST = /(^|\.)(unsplash\.com|pexels\.com|pixabay\.com|shutterstock\.com|istockphoto\.com|gettyimages\.com|freepik\.com|stock\.adobe\.com|picsum\.photos|placehold\.co|placeholder\.com)$/i;
const MERCHANT_HOST = /(^|\.)(alicdn\.com|aliexpress-media\.com|aliexpress\.com|media-amazon\.com|ssl-images-amazon\.com|ebayimg\.com|kwcdn\.com|ltwebstatic\.com|shopify\.com|cdn\.shopify\.com)$/i;

export function imageProvenance(url) {
  const raw = String(url || "").trim();
  if (!raw) return IMAGE_PROVENANCE.NONE;
  let u;
  try { u = new URL(raw, "https://likelink2.vercel.app"); } catch { return IMAGE_PROVENANCE.UNKNOWN; }
  if (u.pathname === "/api/og" && u.searchParams.get("mode") === "media") return IMAGE_PROVENANCE.OWN;
  if (/\.supabase\.co$/i.test(u.hostname) && u.pathname.includes("/storage/")) return IMAGE_PROVENANCE.OWN;
  if (STOCK_HOST.test(u.hostname)) return IMAGE_PROVENANCE.STOCK;
  if (MERCHANT_HOST.test(u.hostname)) return IMAGE_PROVENANCE.MERCHANT;
  return IMAGE_PROVENANCE.UNKNOWN;
}

/** True when the image is a real photo of THIS product (store photo or the creator's upload). */
export const isRealProductPhoto = (url) => [IMAGE_PROVENANCE.MERCHANT, IMAGE_PROVENANCE.OWN].includes(imageProvenance(url));

/** affiliateUrl → ids of the DIFFERENT products that share it (only links used more than once). */
export function sharedAffiliateLinks(products = []) {
  const byUrl = new Map();
  for (const p of products || []) {
    const url = String(p?.affiliateUrl || "").trim();
    if (!/^https?:\/\//i.test(url) || !p?.id) continue;
    if (!byUrl.has(url)) byUrl.set(url, new Set());
    byUrl.get(url).add(String(p.id));
  }
  const out = new Map();
  for (const [url, ids] of byUrl) if (ids.size > 1) out.set(url, [...ids]);
  return out;
}

/**
 * Issues of one product, given the whole catalog. `blocking` = must not be
 * promoted at all; `visual` = text posts are fine but no image/video may claim
 * to show the product.
 */
export function catalogIssues(product, products = [], shared = sharedAffiliateLinks(products)) {
  const issues = [];
  const url = String(product?.affiliateUrl || "").trim();
  const sharedIds = shared.get(url);
  if (sharedIds && sharedIds.length > 1) {
    issues.push({ code: "shared_affiliate_link", blocking: true, he: `אותו קישור שותפים משמש ${sharedIds.length} מוצרים שונים — כנראה שהוא לא מוביל לדף של המוצר הזה. צריך קישור שותפים לדף המוצר עצמו.` });
  }
  const prov = imageProvenance(product?.image);
  if (prov === IMAGE_PROVENANCE.STOCK) issues.push({ code: "stock_image", blocking: false, visual: true, he: "התמונה היא תמונת אווירה ממאגר תמונות, לא תמונת המוצר. צריך תמונה אמיתית של המוצר (מדף המוצר בחנות או צילום שלך)." });
  if (prov === IMAGE_PROVENANCE.NONE) issues.push({ code: "no_image", blocking: false, visual: true, he: "אין תמונת מוצר." });
  return issues;
}

/** May this product be promoted (on the site feed or in a distribution plan)? */
export function isPromotable(product, products = [], shared = sharedAffiliateLinks(products)) {
  return !catalogIssues(product, products, shared).some((i) => i.blocking);
}
