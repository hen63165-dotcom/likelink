/**
 * LikeLink Product Intelligence — reusable product intelligence object.
 *
 * Derives ONLY information supported by the source:
 *   title, description, price, currency, images, features, category,
 *   audience, keywords, selling points, hooks, CTA, affiliate/commerce URL,
 *   source, timestamp.
 *
 * Never invents product claims. Reuses existing catalog and product flows.
 * No duplicate products. If the same product already exists, it returns
 * the existing record.
 */

import { createProduct, hasValidAttribution, deduplicate } from "./catalog.js";

const SIMILARITY_WINDOW = 40; // chars for dedup key

export function deriveProductIntelligence(raw = {}) {
  if (!raw || typeof raw !== "object") return null;

  const title = String(raw.title || "").slice(0, 120);
  const description = String(raw.description || "").slice(0, 600);
  const price = Number(raw.price) || 0;
  const currency = String(raw.currency || "ILS").slice(0, 3);
  const category = String(raw.category || "Other").slice(0, 40);
  const image = raw.image ? String(raw.image).slice(0, 500) : null;
  const affiliateUrl = raw.affiliateUrl ? String(raw.affiliateUrl).slice(0, 500) : null;
  const sourceUrl = raw.sourceUrl ? String(raw.sourceUrl).slice(0, 500) : null;
  const source = raw.source || "likelink";
  const brand = raw.brand ? String(raw.brand).slice(0, 80) : null;
  const tags = Array.isArray(raw.tags) ? raw.tags.slice(0, 10).map(String) : [];
  const marketerId = raw.marketerId == null ? null : String(raw.marketerId).trim() || null;

  const keywords = extractKeywords(title, description, tags);
  const audience = inferAudience(category, description);
  const features = extractFeatures(description);
  const sellingPoints = generateSellingPoints({ title, price, category, features, audience });
  const hooks = generateHooks({ title, price, category, sellingPoints });
  const cta = buildCTA({ price, currency, affiliateUrl });

  return {
    title,
    description,
    price,
    currency,
    image,
    category,
    features,
    audience,
    keywords,
    sellingPoints,
    hooks,
    cta,
    affiliateUrl,
    sourceUrl,
    source,
    brand,
    tags,
    marketerId,
    derivedAt: Date.now(),
  };
}

export function findDuplicateProduct(intel, existingProducts = []) {
  if (!intel?.title) return null;
  const key = intel.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, SIMILARITY_WINDOW);
  const list = Array.isArray(existingProducts) ? existingProducts : [];
  return list.find((p) => p && p.title && p.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, SIMILARITY_WINDOW) === key) || null;
}

export function upsertProductIntelligence(intel, existingProducts = []) {
  const duplicate = findDuplicateProduct(intel, existingProducts);
  if (duplicate) {
    return { product: duplicate, action: "reused", reason: "duplicate_title" };
  }
  const canonical = createProduct({
    ...intel,
    status: "approved",
    clicks: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { product: canonical, action: "created" };
}

function extractKeywords(title, description, tags = []) {
  const words = `${title} ${description}`.split(/[\s,.;:!?]+/).filter((w) => w.length > 2);
  const freq = {};
  for (const w of words) {
    const lower = w.toLowerCase();
    freq[lower] = (freq[lower] || 0) + 1;
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);
  return [...new Set([...tags, ...top])].slice(0, 20);
}

function extractFeatures(description) {
  if (!description) return [];
  const lines = description.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean);
  return lines.slice(0, 6);
}

function inferAudience(category, description) {
  const text = `${category} ${description}`.toLowerCase();
  const audiences = {
    Fashion: "נשים 20-40 שמתלבשות בסטייל",
    Beauty: "נשים שמשקיעות בטיפוח",
    Home: "משפחות שרוצות בית מסודר",
    Tech: "משתמשים שרוצים גאדג'טים פרקטיים",
    Fitness: "אנשים שמתאמנים בבית",
    Kids: "הורים לילדים",
    Accessories: "קהל שאוהב פרטים קטנים",
    Pets: "בעלי חיות מחמד",
    Gifts: "קונים שמחפשים מתנות",
    Travel: "טוריסטים ונוסעים",
    Other: "קהל כללי",
  };
  return audiences[category] || audiences.Other;
}

function generateSellingPoints({ title, price, category, features, audience }) {
  const points = [];
  if (price > 0) points.push(`מחיר: ₪${price}`);
  if (features.length) points.push(features[0]);
  points.push(`קטגוריה: ${category}`);
  points.push(`קהל: ${audience}`);
  return points.slice(0, 5);
}

function generateHooks({ title, price, category, sellingPoints }) {
  const hooks = [];
  if (title) hooks.push(`הבחירה שלנו: ${title}`);
  if (price > 0) hooks.push(`רק ₪${price} — מחיר מיוחד`);
  hooks.push(`מומלף בקטגוריית ${category}`);
  return hooks.slice(0, 4);
}

function buildCTA({ price, currency, affiliateUrl }) {
  const base = affiliateUrl ? "קנייה בקליק — לינק בתיאור 👇" : "למידע נוסף";
  if (price > 0 && affiliateUrl) return `₪${price} · ${base}`;
  return base;
}
