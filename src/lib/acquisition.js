/* ============================================================
   LikeLink2 — Acquisition helpers (pure, honest, testable).
   ------------------------------------------------------------
   Everything here is a *builder*: share URLs, tracked links,
   event payloads and catalog grouping. Nothing here fabricates
   traffic, engagement or popularity — it only prepares real
   distribution links and real measurement payloads.
   ============================================================ */

/** Event types accepted by the existing /api/store?mode=record-click router. */
export const SITE_EVENT_TYPES = Object.freeze([
  "landing_view",
  "content_view",
  "cta_click",
  "share_started",
  "share_completed",
  "share_target",
  "creator_landing_view",
  "creator_cta_click",
  "creator_signup_started",
  "studio_opened",
  "creator_lead",
  "merchant_lead",
  "merchant_landing_view",
  "merchant_cta_click",
  "merchant_signup_started",
  "referral_visit",
]);

/** Build a canonical public URL for a path (never a legacy host). */
export function publicUrl(path, origin) {
  const base = String(origin || "https://likelink2.vercel.app").replace(/\/+$/, "");
  const p = String(path || "/");
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

/**
 * Append attribution params to a public URL. Only the params we actually
 * know are added — never invented ids.
 */
export function withAttribution(url, attribution = {}) {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(attribution)) {
      if (v === undefined || v === null || v === "") continue;
      u.searchParams.set(k, String(v).slice(0, 120));
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Standard UTM set for a channel/asset — real values only. */
export function utmFor({ source, medium = "social", campaign, content } = {}) {
  const out = {};
  if (source) out.utm_source = source;
  if (medium) out.utm_medium = medium;
  if (campaign) out.utm_campaign = campaign;
  if (content) out.utm_content = content;
  return out;
}

/**
 * Share targets. `build` returns the network's share URL.
 * Networks are DISTRIBUTION CHANNELS, never dependencies.
 */
export const SHARE_TARGETS = Object.freeze({
  whatsapp: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  telegram: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  x: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  facebook: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  email: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
});

/** Ordered share buttons for the RTL Hebrew UI (native share is separate). */
export const SHARE_ORDER = Object.freeze(["whatsapp", "telegram", "x", "facebook", "email"]);


/**
 * Payload for the existing site-event endpoint. Returns null when the event
 * is not a real, trackable thing (so we never send noise).
 */
export function buildSiteEventPayload(type, { page, ref, utm, productId, marketerId, storyId, target } = {}) {
  if (!SITE_EVENT_TYPES.includes(type)) return null;
  const payload = {
    type,
    siteEvent: true,
    page: page ? String(page).slice(0, 200) : null,
    ref: ref ? String(ref).slice(0, 120) : null,
    productId: productId ? String(productId).slice(0, 80) : null,
    marketerId: marketerId ? String(marketerId).slice(0, 80) : null,
    storyId: storyId ? String(storyId).slice(0, 80) : null,
    target: target ? String(target).slice(0, 24) : null,
  };
  if (utm && typeof utm === "object") {
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
      if (utm[k]) payload[k] = String(utm[k]).slice(0, 120);
    }
  }
  return payload;
}

/** Read UTM + ref attribution from a query string (real values only). */
export function attributionFromSearch(search) {
  let params;
  try { params = new URLSearchParams(String(search || "")); } catch { return {}; }
  const out = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref", "referral_id", "creator_id", "story_id"]) {
    const v = params.get(k);
    if (v) out[k] = String(v).slice(0, 120);
  }
  return out;
}

/** Public url for a product (single source of truth for canonical links). */
export function productPath(productId) {
  return `/p/${encodeURIComponent(String(productId || ""))}`;
}

/** Public url for a creator profile. */
export function creatorPath(slug) {
  return `/u/${encodeURIComponent(String(slug || ""))}`;
}

/** Public url for a Google-Web-Story discovery asset (real product needed). */
export function storyPath(productId) {
  return `/story/${encodeURIComponent(String(productId || ""))}`;
}

/** Public url for a category discovery page. */
export function categoryPath(category) {
  return `/discover/${encodeURIComponent(String(category || ""))}`;
}

export function buildShareLink(target, url, text = "") {
  const fn = SHARE_TARGETS[target];
  if (!fn) return null;
  try { return fn(url, text); } catch { return null; }
}

/** Machine key for the attribution `share_target` event. */
export function shareTargetKey(target) {
  return `share_${String(target || "unknown").slice(0, 24)}`;
}

/**
 * Group real, publicly eligible products by category. Returns only
 * categories that actually contain products (never invented ones).
 */
export function groupByCategory(products = []) {
  const map = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    if (!p || !p.id) continue;
    const raw = String(p.category || "").trim();
    const key = raw || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()]
    .map(([category, items]) => ({
      category,
      count: items.length,
      products: items.slice().sort((a, b) => (b.clicks || 0) - (a.clicks || 0)),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/** Categories that are worth an indexable page (real content only). */
export function indexableCategories(products = [], minProducts = 1) {
  return groupByCategory(products).filter((c) => c.count >= minProducts && c.category !== "Other");
}

/**
 * Compact Hebrew/English hook for a share card, from real product data.
 * Never adds claims the data does not support.
 */
export function shareCopy(item = {}, lang = "he") {
  const title = String(item.title || item.name || "").trim();
  const price = Number(item.price) || 0;
  if (lang === "he") {
    const priceBit = price > 0 ? ` ב־${Math.round(price)} ₪` : "";
    return title ? `${title}${priceBit} — מצאתי בלייקלינק` : "מצאתי משהו שווה בלייקלינק";
  }
  const priceBit = price > 0 ? ` for ₪${Math.round(price)}` : "";
  return title ? `${title}${priceBit} — found on LikeLink` : "Found something worth sharing on LikeLink";
}

/**
 * Honest funnel report builder: every metric carries an explicit state.
 *   REAL                 — measured first-party value > 0
 *   NO_DATA_YET          — the pipeline exists and is wired, nothing measured
 *   WAITING_FOR_CONNECTION — an external system must be connected first
 */
export function buildFunnelMetrics(raw = {}, { connected = {} } = {}) {
  const metric = (key, he, en, value, opts = {}) => {
    const num = Number(value);
    const has = Number.isFinite(num) && num > 0;
    const needsConnection = Boolean(opts.needsConnection);
    return {
      key,
      he,
      en,
      value: has ? num : 0,
      state: has ? "REAL" : needsConnection && !connected[opts.needsConnection] ? "WAITING_FOR_CONNECTION" : "NO_DATA_YET",
      connection: needsConnection ? opts.needsConnection : null,
    };
  };
  return [
    metric("visitors", "מבקרים", "Visitors", raw.visitors),
    metric("contentViews", "צפיות בתוכן", "Content views", raw.contentViews),
    metric("productViews", "צפיות במוצרים", "Product views", raw.productViews),
    metric("ctaClicks", "לחיצות CTA", "CTA clicks", raw.ctaClicks),
    metric("outboundClicks", "יציאות לשותף", "Outbound clicks", raw.outboundClicks),
    metric("shares", "שיתופים", "Shares", raw.shares),
    metric("referrals", "הפניות", "Referrals", raw.referrals),
    metric("creatorLeads", "לידי יוצרים", "Creator leads", raw.creatorLeads),
    metric("merchantLeads", "לידי סוחרים", "Merchant leads", raw.merchantLeads),
    metric("purchases", "רכישות", "Purchases", raw.purchases, { needsConnection: "commerce" }),
    metric("commissions", "עמלות", "Commissions", raw.commissions, { needsConnection: "affiliate" }),
  ];
}

