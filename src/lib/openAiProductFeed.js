/**
 * OpenAI Agentic Commerce discovery feed for LikeLink.
 *
 * Emits JSONL using OpenAI's stable file-upload schema. Rows are fail-closed:
 * only approved, creator-attributed products with a real brand, seller name,
 * positive price and public image are included. Unknown stock is explicitly
 * "unknown"; we never invent ratings, brands, sellers or availability.
 */
const text = (value) => String(value ?? "").trim();
const httpUrl = (value) => {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? raw : "";
  } catch { return ""; }
};
const priceNumber = (value) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const stockState = (p) => {
  const raw = text(p?.availability || p?.stockStatus || p?.inventoryStatus).toLowerCase();
  if (["in_stock", "instock", "in stock", "available"].includes(raw)) return "in_stock";
  if (["out_of_stock", "outofstock", "out of stock", "sold_out"].includes(raw)) return "out_of_stock";
  if (["pre_order", "preorder"].includes(raw)) return "pre_order";
  if (["backorder", "back_order"].includes(raw)) return "backorder";
  if (p?.inStock === true || p?.available === true) return "in_stock";
  if (p?.inStock === false || p?.available === false) return "out_of_stock";
  return "unknown";
};
const validImageList = (p) => {
  const values = Array.isArray(p?.additionalImages) ? p.additionalImages : Array.isArray(p?.images) ? p.images : [];
  return [...new Set(values.map(httpUrl).filter(Boolean))].filter((url) => url !== httpUrl(p?.image));
};

/**
 * @returns {{ rows: object[], skipped: object }} Rows ready for JSONL + skip counts.
 */
export function collectOpenAIProducts({ products = [], marketers = [], baseUrl = "https://likelink2.vercel.app", currency = "ILS", targetCountry = "IL" } = {}) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const byMarketer = new Map((Array.isArray(marketers) ? marketers : []).filter(Boolean).map((m) => [m.id, m]));
  const skipped = { notApproved: 0, missingCreator: 0, missingBrand: 0, missingSeller: 0, missingPrice: 0, missingImage: 0, duplicates: 0 };
  const seen = new Set();
  const rows = [];
  for (const p of Array.isArray(products) ? products : []) {
    if (!p || p.status !== "approved" || !text(p.id)) { skipped.notApproved++; continue; }
    const owner = byMarketer.get(p.marketerId);
    if (!owner) { skipped.missingCreator++; continue; }
    const brand = text(p.brand || p.brandName || p.manufacturer);
    if (!brand) { skipped.missingBrand++; continue; }
    const seller = text(p.sellerName || p.merchantName || p.vendorName || p.seller?.name || p.merchant?.name);
    if (!seller) { skipped.missingSeller++; continue; }
    const price = priceNumber(p.price);
    if (!price) { skipped.missingPrice++; continue; }
    const image = httpUrl(p.image || p.imageUrl);
    if (!image) { skipped.missingImage++; continue; }
    const itemId = text(p.id);
    if (seen.has(itemId)) { skipped.duplicates++; continue; }
    seen.add(itemId);
    const row = {
      item_id: itemId,
      title: text(p.title || p.name).slice(0, 150),
      description: text(p.description).slice(0, 5000),
      url: `${base}/p/${encodeURIComponent(itemId)}`,
      brand,
      seller_name: seller,
      image_url: image,
      availability: stockState(p),
      price: `${price.toFixed(2)} ${text(p.currency || currency).toUpperCase()}`,
      target_countries: [targetCountry],
      store_country: targetCountry,
      is_eligible_search: true,
      is_eligible_ads: false,
      condition: "new",
    };
    if (!row.title || !row.description) { skipped.notApproved++; continue; }
    const extraImages = validImageList(p);
    if (extraImages.length) row.additional_image_urls = extraImages;
    const sellerUrl = httpUrl(p.sellerUrl || p.merchantUrl || owner.storeUrl);
    if (sellerUrl) row.seller_url = sellerUrl;
    const rating = Number(p.rating || p.starRating);
    const count = Number(p.reviewCount || p.reviewsCount);
    if (Number.isFinite(rating) && rating > 0 && rating <= 5 && Number.isInteger(count) && count > 0) {
      row.star_rating = rating.toFixed(2);
      row.review_count = count;
    }
    rows.push(row);
  }
  return { rows, skipped };
}

export function buildOpenAIJsonl(options = {}) {
  const { rows, skipped } = collectOpenAIProducts(options);
  return { body: rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), count: rows.length, skipped };
}
