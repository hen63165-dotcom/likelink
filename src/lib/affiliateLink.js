/**
 * affiliateLink — the pure logic behind the Studio screen
 * "הוספת מוצר — מדביקים קישור וממשיכים".
 *
 * Rules this module enforces (nothing here invents data):
 *   • A pasted address is validated as an absolute http(s) URL and is stored
 *     EXACTLY as received — we never rewrite, shorten or strip an affiliate
 *     link, and we never turn one into a plain link without consent.
 *   • "Already an affiliate link" vs "just a product link" is classified from
 *     the address itself (known affiliate parameters / shortener hosts). The
 *     classification is a hint for the creator, never a claim about earnings.
 *   • The only capability check for "we can create a commission link / import"
 *     is the platform's own authorized integration endpoint
 *     (/api/store?mode=growth-engine&op=affiliate-status). When it cannot be
 *     reached the state is "unknown" — never a silent "yes".
 *
 * Everything is dependency-free so it runs unchanged in the browser and in
 * `node --test`.
 */

/** The three routes offered on the add-product screen. */
export const LINK_ROUTE = Object.freeze({
  AFFILIATE: "affiliate",
  PRODUCT: "product",
  IMPORT: "import",
});

/** Known affiliate-network short links (a short link is a link with a code). */
const SHORT_LINK_HOSTS = Object.freeze([
  /(^|\.)s\.click\.aliexpress\.com$/i,
  /(^|\.)a\.lkmeplat\.com$/i,
  /(^|\.)amzn\.to$/i,
  /(^|\.)amzn\.eu$/i,
  /(^|\.)ebay\.to$/i,
  /(^|\.)etsy\.me$/i,
  /(^|\.)shp\.ee$/i,
  /(^|\.)tmn\.to$/i,
]);

/** Host suffix → network id (display hint only). */
const NETWORK_HOSTS = Object.freeze([
  ["aliexpress", /(^|\.)(aliexpress\.[a-z.]{2,10}|alicdn\.com)$/i],
  ["amazon", /(^|\.)(amazon\.[a-z.]{2,10}|amzn\.(to|eu))$/i],
  ["ebay", /(^|\.)(ebay\.[a-z.]{2,10}|ebay\.to)$/i],
  ["etsy", /(^|\.)(etsy\.(com|me))$/i],
  ["shopee", /(^|\.)(shopee\.[a-z.]{2,10}|shp\.ee)$/i],
  ["temu", /(^|\.)(temu\.com|tmn\.to)$/i],
  ["shein", /(^|\.)(shein\.[a-z.]{2,10})$/i],
  ["zara", /(^|\.)(zara\.com)$/i],
  ["asos", /(^|\.)(asos\.[a-z.]{2,10})$/i],
]);

/**
 * Query parameters that mark a URL as an affiliate/commission link.
 * Only real, widely used network parameters — nothing is guessed.
 */
const AFFILIATE_PARAMS = Object.freeze([
  "aff_trace_key", "aff_id", "aff", "affiliate_id", "affiliate", "afmc",
  "irclickid", "clickref", "click_id", "camp", "campaign_id", "mkwid",
  "s_kwcid", "tag", "pid", "ppid", "deep_link", "iframe_trace",
]);

/** Error codes returned by validateAffiliateUrl → Hebrew/English copy. */
const ERROR_COPY = Object.freeze({
  empty: { he: "הדביקי קודם את הקישור.", en: "Paste the link first." },
  parse: {
    he: "זו לא כתובת מלאה. הדביקי את הקישור בשלמותו, כולל http:// או https://.",
    en: "That is not a full address. Paste the whole link, including http:// or https://.",
  },
  protocol: {
    he: "ניתן לשמור רק כתובות http או https. כתובות אחרות אינן בטוחות.",
    en: "Only http or https addresses can be saved. Other schemes are unsafe.",
  },
  host: {
    he: "לא הצלחנו לזהות את הכתובת. בדוקי שהיא שלמה וכוללת כתובת אתר.",
    en: "The host could not be recognised. Check the address includes a domain.",
  },
});

/** The disclosure shown next to every affiliate product (IL ad law + honesty). */
export const AFFILIATE_DISCLOSURE = Object.freeze({
  he: "קישור אפילייט · #פרסומת — קנייה דרך הקישור הזה יכולה להעניק לנו עמלה, בלי עלות נוספת עבורך. המחיר והזמינות נקבעים בחנות המקורית.",
  en: "Affiliate link · #ad — buying through this link may earn us a commission, at no extra cost to you. Price and availability are set by the original store.",
});

/** Safe-network names for the UI (labels only — never a capability claim). */
const NETWORK_LABELS = Object.freeze({
  aliexpress: "AliExpress",
  amazon: "Amazon",
  ebay: "eBay",
  etsy: "Etsy",
  shopee: "Shopee",
  temu: "Temu",
  shein: "SHEIN",
  zara: "Zara",
  asos: "ASOS",
});

/** Network label for a URL or host, or null when it is simply "another store". */
export function networkOf(urlOrHost) {
  const raw = String(urlOrHost || "").trim().toLowerCase();
  if (!raw) return null;
  let host = raw;
  if (raw.includes("://")) {
    try {
      host = new URL(raw).hostname.replace(/^www\./i, "");
    } catch {
      return null;
    }
  }
  for (const [id, re] of NETWORK_HOSTS) {
    if (re.test(host)) return { id, label: NETWORK_LABELS[id] || id };
  }
  return null;
}

/**
 * Validate a pasted affiliate/product address.
 * Returns { ok, url, host, network, error } — `url` is the address exactly as
 * it should be stored (trimmed; never rewritten beyond normalising a valid
 * absolute address).
 */
export function validateAffiliateUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return { ok: false, url: "", host: "", network: null, error: "empty" };
  let u;
  try {
    u = new URL(v); // absolute only — relative forms fail here
  } catch {
    return { ok: false, url: v, host: "", network: null, error: "parse" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, url: v, host: "", network: null, error: "protocol" };
  }
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (!host || !host.includes(".")) {
    return { ok: false, url: v, host: "", network: null, error: "host" };
  }
  // The address exactly as pasted (trimmed only): re-serialising it would
  // lower-case the host, add a slash or re-encode signed affiliate parameters.
  return { ok: true, url: v, host, network: networkOf(host), error: null };
}

/**
 * Classify a VALIDATED address: does it already carry affiliate parameters
 * (or is it a known shortener), or is it a plain product link?
 * Returns { kind: "affiliate" | "product", shortLink, matchedParams }.
 */
export function classifyAffiliateUrl(url) {
  const check = validateAffiliateUrl(url);
  if (!check.ok) return { kind: null, shortLink: false, matchedParams: [] };
  const u = new URL(check.url);
  const matched = AFFILIATE_PARAMS.filter((k) => u.searchParams.has(k));
  const shortLink = SHORT_LINK_HOSTS.some((re) => re.test(u.hostname));
  return { kind: matched.length || shortLink ? "affiliate" : "product", shortLink, matchedParams: matched };
}

/** Hebrew/English text for a validation error code. */
export function linkErrorText(code, lang = "he") {
  const row = ERROR_COPY[code] || ERROR_COPY.parse;
  return lang === "he" ? row.he : row.en;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Universal Affiliate Link Manager — network catalog, link status, channels,
 * UTM helper, duplicate detection and CSV import. Everything here is pure,
 * dependency-free and honest: a network in the catalog is a LABEL the creator
 * picks, never a claim that we have an API integration with it.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * kind: "network"  → a real affiliate network (Awin, CJ, impact.com…)
 *       "store"    → a store with its own affiliate programme (AliExpress…)
 *       "brand"    → an individual brand's own programme
 *       "manual"   → any ordinary link the creator manages by hand
 */
export const AFFILIATE_NETWORKS = Object.freeze([
  { id: "aliexpress", label: "AliExpress Affiliate", kind: "store" },
  { id: "amazon", label: "Amazon Associates", kind: "store" },
  { id: "awin", label: "Awin", kind: "network" },
  { id: "impact", label: "impact.com", kind: "network" },
  { id: "cj", label: "CJ Affiliate", kind: "network" },
  { id: "rakuten", label: "Rakuten Advertising", kind: "network" },
  { id: "partnerize", label: "Partnerize", kind: "network" },
  { id: "shareasale", label: "ShareASale", kind: "network" },
  { id: "brand", label: "תוכנית שותפים של מותג · Brand programme", kind: "brand" },
  { id: "other", label: "רשת אחרת · Other network", kind: "network" },
  { id: "manual", label: "קישור ידני · Manual link", kind: "manual" },
]);

export const NETWORKS_BY_ID = Object.freeze(
  Object.fromEntries(AFFILIATE_NETWORKS.map((n) => [n.id, n]))
);

/** The creator's promotional channels — traffic sources, NOT affiliate networks. */
export const PROMO_CHANNELS = Object.freeze([
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "pinterest", label: "Pinterest" },
  { id: "website", label: "אתר · Website" },
  { id: "other", label: "אחר · Other" },
]);

/**
 * Well-known tracking/short-link hosts of the big affiliate networks. Used
 * only to PRESELECT a label for the creator — it never proves a commission
 * relationship, and the creator can always override the network by hand.
 */
const TRACKING_HOST_NETWORKS = Object.freeze([
  [/(^|\.)(awin1\.com|awin\.com)$/i, "awin"],
  [/(^|\.)imp\.i\d+\.com$/i, "impact"],
  [/(^|\.)(anrdoezrs\.net|dpbolvw\.net|tkqlhce\.com|qksrv\.net|linksynergy\.com|cj2u\.com)$/i, "cj"],
  [/(^|\.)(linkk\.im|link\.linksynergy\.com)$/i, "rakuten"],
  [/(^|\.)(prf\.hn|partnerize\.com)$/i, "partnerize"],
  [/(^|\.)(shareasale\.com|shrsl\.com)$/i, "shareasale"],
  [/(^|\.)(s\.click\.aliexpress\.com|a\.lkmeplat\.com)$/i, "aliexpress"],
  [/(^|\.)(amzn\.to|amzn\.eu)$/i, "amazon"],
]);

/**
 * Affiliate-network label for a URL — looks at the tracking host first (the
 * network that generated the link), then at the destination store. Returns a
 * catalog entry or null. A label only; no capability is implied.
 */
export function affiliateNetworkOf(rawUrl) {
  const v = validateAffiliateUrl(rawUrl);
  if (!v.ok) return null;
  let host = "";
  try {
    host = new URL(v.url).hostname;
  } catch {
    return null;
  }
  for (const [re, id] of TRACKING_HOST_NETWORKS) {
    if (re.test(host)) return NETWORKS_BY_ID[id] || null;
  }
  const store = networkOf(v.url);
  if (store) {
    const entry = NETWORKS_BY_ID[store.id];
    if (entry) return entry;
  }
  return null;
}

/** Honest per-link status — every saved link carries exactly one of these. */
export const LINK_STATUS = Object.freeze({
  /** Affiliate markers (known parameters / shortener) were found in the URL. */
  VALIDATED: "validated",
  /** The creator says it is an affiliate link but no affiliate marker exists. */
  TRACKING_UNVERIFIED: "tracking_unverified",
  /** An ordinary product URL — never claimed to carry commission tracking. */
  PRODUCT_LINK: "product_link",
  /** Not a usable http(s) address. */
  INVALID: "invalid",
});

const STATUS_COPY = Object.freeze({
  validated: {
    he: "נבדק · זוהו פרמטרי מעקב",
    en: "Checked · tracking parameters detected",
    tone: "success",
  },
  tracking_unverified: {
    he: "מעקב אפילייט לא אומת",
    en: "Affiliate tracking not verified",
    tone: "warning",
  },
  product_link: {
    he: "קישור מוצר רגיל",
    en: "Ordinary product link",
    tone: "muted",
  },
  invalid: {
    he: "כתובת לא תקינה",
    en: "Invalid address",
    tone: "danger",
  },
});

export function linkStatusLabel(status, lang = "he") {
  const row = STATUS_COPY[status] || STATUS_COPY.product_link;
  return lang === "he" ? row.he : row.en;
}

export function linkStatusTone(status) {
  return (STATUS_COPY[status] || STATUS_COPY.product_link).tone;
}

/**
 * Compute the honest status of a link the creator is saving.
 *   claimed=true  → the creator picked an affiliate network / said "affiliate"
 *   claimed=false → ordinary product link (never assume affiliate!)
 */
export function linkStatusOf(rawUrl, { claimed = false } = {}) {
  const v = validateAffiliateUrl(rawUrl);
  if (!v.ok) {
    return { status: LINK_STATUS.INVALID, error: v.error, matchedParams: [], shortLink: false, host: "" };
  }
  const c = classifyAffiliateUrl(v.url);
  if (c.kind === "affiliate") {
    return { status: LINK_STATUS.VALIDATED, error: null, ...c, host: v.host };
  }
  return {
    status: claimed ? LINK_STATUS.TRACKING_UNVERIFIED : LINK_STATUS.PRODUCT_LINK,
    error: null,
    ...c,
    host: v.host,
  };
}

/**
 * Add utm_* parameters to a URL WITHOUT removing anything already there
 * (affiliate parameters are never stripped). Empty fields are skipped, so
 * returning the original untouched is normal. Returns null for invalid URLs.
 * The stored link keeps the exact pasted original — this is only for the
 * creator's own campaign variant.
 */
export function appendUtm(rawUrl, utm = {}) {
  const v = validateAffiliateUrl(rawUrl);
  if (!v.ok) return null;
  const u = new URL(v.url);
  const map = {
    utm_source: String(utm.source || "").trim().slice(0, 100),
    utm_medium: String(utm.medium || "").trim().slice(0, 100),
    utm_campaign: String(utm.campaign || "").trim().slice(0, 100),
  };
  let changed = false;
  for (const [key, value] of Object.entries(map)) {
    if (value) {
      u.searchParams.set(key, value);
      changed = true;
    }
  }
  return changed ? u.toString() : v.url;
}

/**
 * Normalise a URL for duplicate COMPARISON only (never for storage):
 * lowercase host, drop the fragment and a trailing slash, keep the query
 * intact — affiliate parameters are part of a link's identity.
 */
export function normalizeUrlForCompare(rawUrl) {
  const v = validateAffiliateUrl(rawUrl);
  if (!v.ok) return "";
  try {
    const u = new URL(v.url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * Find an existing product whose link is the same address. Compares the
 * creator-pasted original first, then the stored link. Variants with different
 * parameters are NOT duplicates — they are legitimately different links.
 */
export function findDuplicateByUrl(products, url, excludeId = null) {
  const key = normalizeUrlForCompare(url);
  if (!key) return null;
  for (const p of products || []) {
    if (excludeId && p.id === excludeId) continue;
    if (
      normalizeUrlForCompare(p.sourceUrl) === key ||
      normalizeUrlForCompare(p.affiliateUrl) === key
    ) {
      return p;
    }
  }
  return null;
}

/** Maximum rows accepted from one CSV paste (safe client-side bulk entry). */
export const CSV_MAX_ROWS = 50;

/** Minimal CSV line splitter with quote support (no dependencies). */
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === "\t" || ch === ";") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse a pasted CSV/TSV of links into rows ready for the add-product form.
 * Recognised columns (header optional, case-insensitive):
 *   url / link / address  (REQUIRED)
 *   title / name / product
 *   network
 *   category
 *   price
 * Every row keeps its 1-based line number; invalid rows carry an `error`
 * code — nothing is dropped silently, and at most CSV_MAX_ROWS are returned.
 */
export function parseLinksCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], truncated: false, hasHeader: false };

  const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const headerLooksLikeData = first.some((h) => /^https?:\/\//.test(h));
  const hasHeader = !headerLooksLikeData && first.some((h) => /^(url|link|address)$/.test(h));
  const COL = { url: -1, title: -1, network: -1, category: -1, price: -1 };
  let start = 0;
  if (hasHeader) {
    first.forEach((h, i) => {
      if (/^(url|link|address)$/.test(h)) COL.url = i;
      else if (/^(title|name|product)$/.test(h)) COL.title = i;
      else if (/^network$/.test(h)) COL.network = i;
      else if (/^category$/.test(h)) COL.category = i;
      else if (/^price$/.test(h)) COL.price = i;
    });
    start = 1;
  } else {
    // Headerless: the first column containing a URL is the URL column.
    const probe = splitCsvLine(lines[0]);
    COL.url = probe.findIndex((c) => /^https?:\/\//.test(c));
    COL.title = COL.url === 0 ? 1 : 0;
  }

  const rows = [];
  const truncated = lines.length - start > CSV_MAX_ROWS;
  for (let li = start; li < lines.length && rows.length < CSV_MAX_ROWS; li += 1) {
    const cells = splitCsvLine(lines[li]);
    const url = COL.url >= 0 ? cells[COL.url] || "" : "";
    const check = validateAffiliateUrl(url);
    rows.push({
      line: li + 1,
      url: check.ok ? check.url : String(url || "").trim(),
      title: COL.title >= 0 ? String(cells[COL.title] || "").trim().slice(0, 120) : "",
      network: COL.network >= 0 ? String(cells[COL.network] || "").trim().toLowerCase().slice(0, 40) : "",
      category: COL.category >= 0 ? String(cells[COL.category] || "").trim() : "",
      price: COL.price >= 0 ? String(cells[COL.price] || "").trim() : "",
      error: check.ok ? null : check.error,
    });
  }
  return { rows, truncated, hasHeader };
}

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ask the platform's own server whether the authorized AliExpress Affiliate
 * integration is configured. This is the ONLY source of truth for the
 * "can we create a commission link / import products" routes.
 *
 *  state: "configured"     → the authorized integration answered and is ready
 *        "not_configured"  → answered, credentials missing
 *        "unknown"         → the server could not be reached (offline/dev)
 */
export async function fetchAffiliateIntegration({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const out = { state: "unknown", provider: "aliexpress_affiliate_api", last: null, error: null };
  if (typeof fetchImpl !== "function") return out;
  try {
    const res = await fetchImpl("/api/store?mode=growth-engine&op=affiliate-status", {
      headers: { accept: "application/json" },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const data = res && typeof res.json === "function" ? await res.json() : null;
    if (!res || !res.ok || !data || data.ok !== true) {
      out.error = "bad_response";
      return out;
    }
    out.provider = data.provider || out.provider;
    out.last = data.last || null;
    out.state = data.configured === true ? "configured" : "not_configured";
    return out;
  } catch {
    out.error = "unreachable";
    return out;
  }
}

/**
 * Honest, static guidance for creating a commission link inside a network.
 * The creator always creates the link in their OWN affiliate account and
 * pastes the result here — we never fabricate one for them.
 */
export function networkGuide(network, lang = "he") {
  const label = network?.label || null;
  if (lang === "en") {
    return [
      label
        ? `Open your ${label} affiliate account and create a new tracking link for this product.`
        : "Open your affiliate network account (the programme you joined) and create a tracking link for this product.",
      "Copy the full link it generates — it usually carries your own ID as parameters.",
      "Paste that link here: it is saved exactly as you pasted it.",
    ];
  }
  return [
    label
      ? `פתחי את חשבון השותפים שלך ב־${label} וצרי קישור מעקב חדש למוצר הזה.`
      : "פתחי את חשבון השותפים שלך ברשת שבה הצטרפת (תוכנית שותפים) וצרי קישור מעקב חדש למוצר הזה.",
    "העתקי את הקישור המלא שהיא מייצרת — לרוב הוא מכיל את המזהה שלך כפרמטרים.",
    "הדביקי אותו כאן — הוא יישמר בדיוק כפי שהדבקת.",
  ];
}


