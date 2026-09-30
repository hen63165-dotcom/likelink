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
  // How the sale happens: a direct checkout on the site, or an affiliate
  // hand-off to an external merchant (which requires a disclosure).
  canonical.saleModel = isDirectMerchantProduct(product, base) ? "direct" : (canonical.affiliateUrl ? "affiliate" : "none");
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
  // Merchant Readiness Score — weights over the real feed requirements only.
  const WEIGHTS = { not_approved: 10, no_attribution: 10, no_title: 10, no_price: 15, no_description: 10, no_image: 15, not_direct_checkout: 30 };
  const lost = reasons.reduce((sum, r) => sum + (WEIGHTS[r.id] || 0), 0);
  return {
    eligible: reasons.length === 0,
    reasons,
    requiresOwner: reasons.some((r) => r.id === "not_direct_checkout"),
    readiness: {
      score: Math.max(0, 100 - lost),
      met: Object.keys(WEIGHTS).filter((k) => !reasons.some((r) => r.id === k)),
      missing: reasons.map((r) => r.id),
      remediation: reasons.map((r) => ({
        not_approved: "לאשר את המוצר בסטודיו",
        no_attribution: "לשייך את המוצר ליוצר מאומת",
        no_title: "להוסיף כותרת למוצר",
        no_price: "להוסיף מחיר",
        no_description: "להוסיף תיאור",
        no_image: "להוסיף תמונת מוצר",
        not_direct_checkout: "להפעיל מכירה ישירה באתר (החלטת בעלים) — אחרת המוצר נשאר מוצר שותפים",
      }[r.id] || r.he)),
    },
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
/** Share-pack format — v2 adds the affiliate disclosure (stored packs of an older format are rebuilt). */
export const SHARE_FORMAT = 2;
export const AFFILIATE_DISCLOSURE_HE = "גילוי נאות: קישור שותפים — היוצרת עשויה לקבל עמלה על רכישה, בלי עלות נוספת לך.";
export const AFFILIATE_DISCLOSURE_SHORT = "גילוי נאות: קישור שותפים";

/** The sale model of a raw catalog product (for UI that has no canonical object). */
export function saleModelOf(product = {}, origin = ORIGIN) {
  if (isDirectMerchantProduct(product, origin)) return "direct";
  return isAbsoluteHttpUrl(product.affiliateUrl) ? "affiliate" : "none";
}

export function buildShareAsset(c, drafts = buildContentDrafts(c)) {
  if (!c.title) return null;
  const link = productPageUrl(c);
  const disclosure = c.saleModel === "affiliate" ? `\n${AFFILIATE_DISCLOSURE_SHORT}` : "";
  const text = drafts ? `${drafts.he.social.replace(/\n?לפרטים ולרכישה בלינק 👇$/, "")}\n${link}` : `${c.title}\n${link}`;
  const shared = text + disclosure;
  return {
    text: shared,
    url: link,
    image: c.image || "",
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(shared)}`,
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

/**
 * A second share variant (price-first framing) for a first-party A/B test.
 * Each variant has its own tracking source, so /r attributes real clicks.
 */
export function buildShareVariants(c, share) {
  if (!share) return [];
  const link = productPageUrl(c);
  const disclosure = c.saleModel === "affiliate" ? `\n${AFFILIATE_DISCLOSURE_SHORT}` : "";
  const b = [formatPrice(c) ? `${formatPrice(c)} · ${c.title}` : c.title, c.creator?.name ? `המלצה של ${c.creator.name}` : "", link].filter(Boolean).join("\n") + disclosure;
  return [
    { id: "a", he: "גרסה א׳ — הסיפור", text: share.text, trackingLink: trackingLink(c, "luna_share_a") },
    { id: "b", he: "גרסה ב׳ — המחיר קודם", text: b, trackingLink: trackingLink(c, "luna_share_b") },
  ];
}

/**
 * The native commerce route: how a real product reaches a buyer, from real
 * records only. Price/availability at the merchant are never claimed — the
 * catalog price is labelled as such and stock is UNVERIFIED.
 */
export function commerceRoute(c, { clicks = [], sales = [] } = {}) {
  let host = "";
  try { host = c.affiliateUrl ? new URL(c.affiliateUrl).hostname.replace(/^www\./, "") : ""; } catch { host = ""; }
  const outbound = (clicks || []).filter((x) => x && String(x.productId) === c.id && x.type === "outbound_click");
  const bySource = {};
  for (const x of outbound) { const k = String(x.source || "affiliate"); bySource[k] = (bySource[k] || 0) + 1; }
  const own = (sales || []).filter((x) => x && String(x.productId) === c.id);
  const verified = own.filter((x) => x.source === "paypal_checkout" && x.captureId).length;
  return {
    productId: c.id,
    model: c.saleModel,
    merchant: host ? { host } : null,
    creator: c.creator ? { id: c.creator.id, name: c.creator.name, slug: c.creator.slug } : null,
    canonicalPage: productPageUrl(c),
    trackedRoute: trackingLink(c, "luna_route") || null,
    disclosure: c.saleModel === "affiliate" ? { required: true, he: AFFILIATE_DISCLOSURE_HE } : { required: false, he: null },
    price: c.price ? { amount: c.price, currency: c.currency, source: "catalog", verifiedAtMerchant: false } : null,
    availability: { listed: c.status === "approved", merchantStock: "UNVERIFIED" },
    tracking: { outboundClicks: outbound.length, bySource },
    conversion: { verified, selfReported: own.length - verified, evidence: verified ? "PayPal capture" : own.length ? "self-reported, signed" : "none" },
  };
}

/** Real connections between public products (no new pages): same creator, same category, shared collections. */
export function productConnections(c, { products = [], marketers = [], collections = [], limit = 6 } = {}) {
  const pool = (products || []).filter((p) => p && String(p.id) !== c.id && isPublicProduct(p, marketers));
  const sameCreator = c.creator ? pool.filter((p) => String(p.marketerId) === c.creator.id).map((p) => String(p.id)).slice(0, limit) : [];
  const cat = String(c.category || "").toLowerCase();
  const sameCategory = cat ? pool.filter((p) => String(p.category || "").toLowerCase() === cat).map((p) => String(p.id)).slice(0, limit) : [];
  const inCollections = (collections || []).filter((col) => Array.isArray(col?.productIds) && col.productIds.map(String).includes(c.id));
  const viaCollections = [...new Set(inCollections.flatMap((col) => col.productIds.map(String)).filter((id) => id !== c.id))].slice(0, limit);
  return { sameCreator, sameCategory, viaCollections, collections: inCollections.map((col) => String(col.id)) };
}

const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);

/**
 * The crawler-served /p/:id body — the same real content a person sees
 * (title, description, price, creator, disclosure), escaped. No extra
 * crawler-only links (no cloaking).
 */
export function renderProductBody(c) {
  const parts = [
    `<h1 style="font-size:22px;margin:0 0 8px">${esc(c.title)}</h1>`,
    c.price ? `<p style="font-size:20px;font-weight:700;margin:0 0 8px">${esc(formatPrice(c))}</p>` : "",
    c.description ? `<p style="margin:0 0 12px;line-height:1.6">${esc(clip(c.description, 400))}</p>` : "",
    c.creator ? `<p style="margin:0 0 12px">מומלץ על ידי <a href="${esc(creatorPageUrl(c))}">${esc(c.creator.name)}</a></p>` : "",
    c.saleModel === "affiliate" ? `<p style="font-size:12px;opacity:.8;margin:0">${esc(AFFILIATE_DISCLOSURE_HE)}</p>` : "",
  ];
  return parts.filter(Boolean).join("");
}

export function isPublicProduct(product, marketers) {
  return isPublicCatalogProduct(product, marketers);
}
