// One product → many discovery surfaces, from ONE canonical source of truth.
//
// Every derivative (product page SEO, JSON-LD, Open Graph, share asset, content
// drafts, tracking link, Merchant evaluation, channel payloads) is computed
// from `canonicalProduct()` and carries its provenance: which product
// fingerprint it was built from. Only fields that really exist on the product
// are used — no invented features, prices, reviews, endorsements or claims.
import {
  DEFAULT_BASE_URL, isAbsoluteHttpUrl, isDirectMerchantProduct, toNumber, toText,
} from "../googleFeed.js";
import { isPublicCatalogProduct } from "../cloud/catalog.js";

export const ORIGIN = DEFAULT_BASE_URL;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

function clip(text, max) {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** FNV-1a 32-bit → base36. Deterministic, dependency-free, browser-safe. */
export function stableHash(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The single source of truth every surface is derived from. */
export function canonicalProduct(product = {}, marketer = null, origin = ORIGIN) {
  const base = String(origin || ORIGIN).replace(/\/+$/, "");
  const price = toNumber(product.price, 0);
  const canonical = {
    id: String(product.id || ""),
    title: clean(product.title),
    description: clean(product.description),
    price: price > 0 ? price : null,
    currency: toText(product.currency, "ILS"),
    image: isAbsoluteHttpUrl(product.image) ? String(product.image).trim() : "",
    category: clean(product.category),
    brand: clean(product.brand),
    affiliateUrl: isAbsoluteHttpUrl(product.affiliateUrl) ? String(product.affiliateUrl).trim() : "",
    status: String(product.status || ""),
    updatedAt: Number(product.updatedAt || product.createdAt || 0) || null,
    creator: marketer
      ? { id: String(marketer.id), name: clean(marketer.name), slug: clean(marketer.slug || marketer.id) }
      : null,
    origin: base,
  };
  canonical.fingerprint = stableHash({
    id: canonical.id, title: canonical.title, description: canonical.description, price: canonical.price,
    currency: canonical.currency, image: canonical.image, category: canonical.category,
    affiliateUrl: canonical.affiliateUrl, status: canonical.status, creator: canonical.creator,
  });
  return canonical;
}

export function productPageUrl(c) {
  return `${c.origin}/p/${encodeURIComponent(c.id)}`;
}

export function creatorPageUrl(c) {
  return c.creator?.slug ? `${c.origin}/u/${encodeURIComponent(c.creator.slug)}` : "";
}

/** Tracked outbound link — /r resolves the STORED affiliateUrl by pid and logs a real click. */
export function trackingLink(c, source = "luna") {
  if (!c.affiliateUrl) return "";
  const params = new URLSearchParams({ pid: c.id, src: source });
  if (c.creator?.id) params.set("mid", c.creator.id);
  return `${c.origin}/r?${params.toString()}`;
}

const formatPrice = (c) => (c.price ? `₪${Number.isInteger(c.price) ? c.price : c.price.toFixed(2)}` : "");

/**
 * Product page SEO, built from real fields only. Used by api/og.mjs to render
 * /p/:id and by the engine to audit it — the audit checks what is served.
 */
export function buildProductSeo(c) {
  const url = productPageUrl(c);
  const title = clip(c.title ? `${c.title}${c.creator?.name ? ` · ${c.creator.name}` : ""}` : "LikeLink", 70);
  const facts = [
    c.price ? `מחיר ${formatPrice(c)}` : "",
    c.creator?.name ? `מומלץ על ידי ${c.creator.name}` : "",
  ].filter(Boolean).join(" · ");
  const lead = c.description || c.title;
  const description = clip(facts ? `${clip(lead, 160 - facts.length - 3)} · ${facts}` : lead, 160);
  const jsonLd = c.title
    ? {
      "@context": "https://schema.org",
      "@type": "Product",
      name: c.title,
      ...(c.description ? { description: c.description } : {}),
      ...(c.image ? { image: c.image } : {}),
      url,
      ...(c.category ? { category: c.category } : {}),
      ...(c.brand || c.creator?.name ? { brand: { "@type": "Brand", name: c.brand || c.creator.name } } : {}),
      ...(c.price
        ? { offers: { "@type": "Offer", priceCurrency: c.currency, price: String(c.price), availability: "https://schema.org/InStock", url } }
        : {}),
    }
    : null;
  return {
    title,
    description,
    canonical: url,
    robots: c.status === "approved" && c.creator ? "index,follow" : "noindex,nofollow",
    og: { title, description, image: c.image || `${c.origin}/icons/icon-512.webp`, url, type: "product" },
    jsonLd,
    provenance: { productId: c.id, fingerprint: c.fingerprint },
  };
}

/** Explainable SEO checks over the SEO that /p/:id actually serves. */
export function auditSeo(c, seo, { duplicateTitle = false, inSitemap = false } = {}) {
  const checks = [
    { id: "title", he: "כותרת עמוד", ok: seo.title.length >= 15 && seo.title.length <= 70, evidence: `${seo.title.length} תווים` },
    { id: "description", he: "תיאור העמוד בתוצאות החיפוש", ok: seo.description.length >= 50 && seo.description.length <= 160, evidence: `${seo.description.length} תווים` },
    { id: "canonical", he: "כתובת קנונית", ok: seo.canonical.startsWith(`${c.origin}/p/`), evidence: seo.canonical },
    { id: "indexable", he: "פתוח לאינדוקס", ok: seo.robots === "index,follow", evidence: seo.robots },
    { id: "structured_data", he: "נתונים מובנים (Product)", ok: Boolean(seo.jsonLd && seo.jsonLd.name && seo.jsonLd.image && seo.jsonLd.offers), evidence: seo.jsonLd ? Object.keys(seo.jsonLd).filter((k) => !k.startsWith("@")).join(", ") : "אין" },
    { id: "open_graph", he: "תצוגה בשיתוף (Open Graph)", ok: Boolean(c.image && seo.og.title && seo.og.description), evidence: c.image ? "תמונת מוצר אמיתית" : "אין תמונת מוצר — תמונת ברירת מחדל" },
    { id: "unique_title", he: "כותרת ייחודית", ok: !duplicateTitle, evidence: duplicateTitle ? "כותרת זהה למוצר אחר" : "ייחודית בקטלוג" },
    { id: "sitemap", he: "כלול ב-sitemap", ok: Boolean(inSitemap), evidence: inSitemap ? "/sitemap.xml" : "לא כלול" },
    { id: "internal_link", he: "קישור פנימי מעמוד היוצר", ok: Boolean(c.creator?.slug), evidence: c.creator?.slug ? creatorPageUrl(c) : "אין עמוד יוצר" },
  ];
  return { checks, passed: checks.filter((x) => x.ok).length, total: checks.length };
}

/**
 * Google Merchant evaluation — the SAME rule chain as collectFeedItems()
 * (src/lib/googleFeed.js), reported with the first real blocking reason.
 */
export function merchantStatus(product = {}, marketers = [], origin = ORIGIN) {
  const reasons = [];
  if (product.status !== "approved") reasons.push({ id: "not_approved", he: "המוצר לא אושר לפרסום" });
  if (!isDirectMerchantProduct(product, origin)) {
    reasons.push({
      id: "not_direct_checkout",
      he: "מוצר שותפים — הרכישה מתבצעת באתר חיצוני. Google Merchant מקבל רק מוצרים שנמכרים ישירות באתר",
    });
  }
  const known = (marketers || []).some((m) => m && m.id === product.marketerId);
  if (!product.marketerId || !known) reasons.push({ id: "no_attribution", he: "המוצר לא משויך ליוצר מאומת" });
  if (!toText(product.title)) reasons.push({ id: "no_title", he: "חסרה כותרת" });
  if (!(toNumber(product.price, 0) > 0)) reasons.push({ id: "no_price", he: "חסר מחיר" });
  if (!toText(product.description)) reasons.push({ id: "no_description", he: "חסר תיאור" });
  if (!isAbsoluteHttpUrl(product.image)) reasons.push({ id: "no_image", he: "חסרה תמונה" });
  return {
    eligible: reasons.length === 0,
    reasons,
    requiresOwner: reasons.some((r) => r.id === "not_direct_checkout"),
  };
}

/** Content drafts from real fields only — every item is labelled a draft. */
export function buildContentDrafts(c) {
  if (!c.title) return null;
  const price = formatPrice(c);
  const creator = c.creator?.name || "";
  const excerpt = clip(c.description, 140);
  return {
    status: "DRAFT",
    he: {
      hook: price ? `${c.title} — ${price}` : c.title,
      story: excerpt || c.title,
      creatorAngle: creator ? `הבחירה של ${creator}: ${c.title}` : "",
      social: [c.title, excerpt, price ? `מחיר: ${price}` : "", "לפרטים ולרכישה בלינק 👇"].filter(Boolean).join("\n"),
      seo: clip(`${c.title}${c.category ? ` · ${c.category}` : ""}${excerpt ? ` — ${excerpt}` : ""}`, 160),
      reelConcept: c.image
        ? `רילס מתמונת המוצר: פתיחה על "${c.title}", ${price ? `מחיר ${price}, ` : ""}סיום עם הלינק. דורש יצירת סרטון אמיתי בסטודיו הווידאו.`
        : "",
    },
    en: {
      hook: price ? `${c.title} — ${price}` : c.title,
      social: [c.title, price ? `Price: ${price}` : "", "Details and purchase at the link 👇"].filter(Boolean).join("\n"),
    },
    provenance: { productId: c.id, fingerprint: c.fingerprint, fields: ["title", "description", "price", "category", "creator"].filter((f) => (f === "creator" ? c.creator : c[f])) },
  };
}

/**
 * Share asset: a ready-to-use message + tracked link + share intents. Share
 * intents (WhatsApp / Telegram share URLs) are user-initiated — nothing is
 * posted on anyone's behalf.
 */
export function buildShareAsset(c, drafts = buildContentDrafts(c)) {
  if (!c.title) return null;
  const link = productPageUrl(c);
  const text = drafts ? `${drafts.he.social.replace(/\n?לפרטים ולרכישה בלינק 👇$/, "")}\n${link}` : `${c.title}\n${link}`;
  return {
    text,
    url: link,
    image: c.image || "",
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    telegramUrl: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(c.title)}`,
    provenance: { productId: c.id, fingerprint: c.fingerprint },
  };
}

/** Publish once → a payload per channel, all from the same canonical object. */
export function buildChannelPayloads(c, share, channels = []) {
  if (!share) return [];
  return (channels || []).map((ch) => {
    let payload;
    if (ch.provider === "web") payload = { url: share.url, title: c.title, image: share.image };
    else if (ch.provider === "telegram") payload = { text: share.text, disable_web_page_preview: false };
    else if (ch.provider === "webhook") payload = { type: "product", id: c.id, title: c.title, url: share.url, image: share.image, price: c.price, currency: c.currency };
    else payload = { text: share.text, url: share.url };
    return { provider: ch.provider, state: ch.state, payload, provenance: { productId: c.id, fingerprint: c.fingerprint } };
  });
}

export function isPublicProduct(product, marketers) {
  return isPublicCatalogProduct(product, marketers);
}
