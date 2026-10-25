/**
 * Studio videos — a ready video for every product a creator adds from an
 * AliExpress link (the owner, 2026-10-25: "I added a link from Ali — how does
 * it publish with a hook and a video, all in one click?").
 *
 * Pure core, shared by the runner (scripts/media/product-video/studio-videos.mjs,
 * Actions → "Studio videos", hourly) and the Studio's "פרסום לרשתות" screen:
 *   the cloud's approved products → the ones still without a video
 *   (studioVideoCandidates) → the store's own product video, read from the
 *   owner's affiliate account (productdetail.get: no store page, no CAPTCHA) →
 *   the premium cut (make-reel.mjs: three hooks, the labels on every frame,
 *   the caption with the disclosure) → the "reels" release → GitHub Pages
 *   (media/studio/index.json, publicIndex) → the Studio shows it with its
 *   caption, to download and post.
 *
 * Nothing is posted anywhere and the public site's reels are unchanged: the
 * video waits in the creator's own Studio, where she watches it before she
 * posts it. A product whose store has no video says so (NO_SELLER_VIDEO);
 * nothing is invented in its place.
 */

export const STUDIO_VIDEO_STATUS = Object.freeze({
  READY: "READY",
  NO_SELLER_VIDEO: "NO_SELLER_VIDEO",
  NOT_RETURNED: "NOT_RETURNED",
  FAILED: "FAILED",
});

/** How long a failed attempt waits before the next one, and how many there are. */
export const RETRY_AFTER_MS = 6 * 3600_000;
export const MAX_ATTEMPTS = 3;
/** Products per run (each one is a download and three cuts). */
export const PER_RUN = 3;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const AE_HOST = /(^|\.)aliexpress\.(com|us|ru)$/i; // www., he., s.click., a. …

/** An AliExpress address (the creator's tracked link or a store page). */
export function isAliExpressUrl(link) {
  try {
    const u = new URL(String(link || "").trim());
    return u.protocol === "https:" && AE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** The link a video was made from: a changed link makes a new video. */
export function linkKey(product = {}) {
  return String(product.affiliateUrl || "").trim().slice(0, 300);
}

/**
 * Which products get a video this run: approved, from an AliExpress link,
 * without one already (in the "reels" release or in the state), and not given
 * up on. A failure waits RETRY_AFTER_MS and stops after MAX_ATTEMPTS; a store
 * without a video is final until the link changes. Oldest first.
 *
 * @param {object[]} products  the cloud's marketplace:products
 * @param {{ state?: object, released?: Set<string>, skip?: object, now?: number, limit?: number }} opts
 */
export function studioVideoCandidates(products = [], { state = {}, released = new Set(), skip = {}, now = Date.now(), limit = PER_RUN } = {}) {
  const done = state?.videos || {};
  return (Array.isArray(products) ? products : [])
    .filter((p) => p && ID.test(String(p.id)) && ID.test(String(p.marketerId || "")) && p.status === "approved" && isAliExpressUrl(p.affiliateUrl))
    .filter((p) => !released.has(`${p.id}.mp4`) && !skip[p.id])
    .filter((p) => {
      const s = done[p.id];
      if (!s || s.link !== linkKey(p)) return true;
      if (s.status === STUDIO_VIDEO_STATUS.READY || s.status === STUDIO_VIDEO_STATUS.NO_SELLER_VIDEO) return false;
      return (s.attempts || 0) < MAX_ATTEMPTS && now - Date.parse(s.at || 0) >= RETRY_AFTER_MS;
    })
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))
    .slice(0, limit);
}

/** One product's outcome merged into the state (attempts count failures on the same link). */
export function recordOutcome(state = {}, product, outcome, now = Date.now()) {
  const videos = { ...(state.videos || {}) };
  const prev = videos[product.id];
  const sameLink = prev && prev.link === linkKey(product);
  const failed = outcome.status !== STUDIO_VIDEO_STATUS.READY && outcome.status !== STUDIO_VIDEO_STATUS.NO_SELLER_VIDEO;
  videos[product.id] = {
    productId: product.id,
    marketerId: String(product.marketerId || ""),
    link: linkKey(product),
    status: outcome.status,
    reason: outcome.reason ? String(outcome.reason).slice(0, 160) : undefined,
    video: outcome.video || undefined,
    variants: outcome.variants?.length ? outcome.variants : undefined,
    poster: outcome.poster || undefined,
    caption: outcome.caption ? String(outcome.caption).slice(0, 2200) : undefined,
    hook: outcome.hook ? String(outcome.hook).slice(0, 140) : undefined,
    attempts: failed ? (sameLink ? (prev.attempts || 0) : 0) + 1 : 0,
    at: new Date(now).toISOString(),
  };
  return { ...state, at: new Date(now).toISOString(), videos };
}

const FILE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}(-[bc])?\.mp4$/;
const POSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}-preview\.jpg$/;

/**
 * What GitHub Pages serves to the Studio (media/studio/index.json): status,
 * file names, caption and hook only. The link is the creator's own and stays
 * out; the product id and studio id are already public.
 */
export function publicIndex(state = {}) {
  const videos = Object.values(state?.videos || {})
    .filter((v) => v && ID.test(String(v.productId)) && STUDIO_VIDEO_STATUS[v.status])
    .map((v) => ({
      productId: v.productId,
      marketerId: ID.test(String(v.marketerId || "")) ? v.marketerId : "",
      status: v.status,
      ...(v.status === STUDIO_VIDEO_STATUS.READY && FILE.test(String(v.video)) ? {
        video: v.video,
        variants: (v.variants || []).filter((f) => FILE.test(String(f))),
        ...(POSTER.test(String(v.poster || "")) ? { poster: v.poster } : {}),
        caption: String(v.caption || "").slice(0, 2200),
        hook: String(v.hook || "").slice(0, 140),
      } : {}),
      at: String(v.at || ""),
    }));
  return { at: String(state?.at || ""), videos };
}

/** Where GitHub Pages serves the index; media always resolve there (byte ranges for iOS). */
export const STUDIO_VIDEOS_HOME = "https://hen63165-dotcom.github.io/likelink/media/studio/index.json";

/** The site's own address first (Netlify proxies /media/studio/*), then GitHub Pages. */
export function studioVideosUrls(base = "", origin = typeof location !== "undefined" ? location.origin : "") {
  const own = origin ? `${origin}${base}/media/studio/index.json` : "";
  return [...new Set([own, STUDIO_VIDEOS_HOME].filter(Boolean))];
}

/**
 * index.json → Map(productId → entry) with absolute media URLs. Only safe file
 * names become URLs; anything else is dropped.
 */
export function studioVideosByProduct(doc, home = STUDIO_VIDEOS_HOME) {
  const out = new Map();
  for (const v of Array.isArray(doc?.videos) ? doc.videos : []) {
    if (!v || !ID.test(String(v.productId)) || !STUDIO_VIDEO_STATUS[v.status]) continue;
    const entry = { productId: v.productId, marketerId: String(v.marketerId || ""), status: v.status, at: String(v.at || "") };
    if (v.status === STUDIO_VIDEO_STATUS.READY && FILE.test(String(v.video))) {
      entry.video = new URL(v.video, home).href;
      entry.variants = (Array.isArray(v.variants) ? v.variants : []).filter((f) => FILE.test(String(f))).map((f) => new URL(f, home).href);
      if (POSTER.test(String(v.poster || ""))) entry.poster = new URL(v.poster, home).href;
      entry.caption = String(v.caption || "").slice(0, 2200);
      entry.hook = String(v.hook || "").slice(0, 140);
    } else if (v.status === STUDIO_VIDEO_STATUS.READY) {
      entry.status = STUDIO_VIDEO_STATUS.FAILED; // "ready" without a file is not ready
    }
    out.set(entry.productId, entry);
  }
  return out;
}

/** Reads the index once; an empty map when it cannot be read (a new site, or offline). */
export async function loadStudioVideos(fetchImpl = typeof fetch === "function" ? fetch : null, urls = studioVideosUrls()) {
  if (!fetchImpl) return new Map();
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const doc = await res.json();
      if (Array.isArray(doc?.videos)) return studioVideosByProduct(doc);
    } catch { /* the SPA fallback page, or offline: try the next address */ }
  }
  return new Map();
}

/** The Studio's line for one product (Hebrew), from the index entry or its absence. */
export function studioVideoState(product, entry) {
  if (entry?.status === STUDIO_VIDEO_STATUS.READY && entry.video) {
    return { state: "ready", he: "הסרטון מוכן: צפי בו לפני שאת מפרסמת" };
  }
  if (!isAliExpressUrl(product?.affiliateUrl)) {
    return { state: "unsupported", he: "סרטון אוטומטי זמין כרגע למוצרים מ־AliExpress" };
  }
  if (entry?.status === STUDIO_VIDEO_STATUS.NO_SELLER_VIDEO) {
    return { state: "none", he: "למוצר הזה אין סרטון של המוכר בחנות, ולכן לא נוצר סרטון. הפוסטים למטה מוכנים עם התמונה" };
  }
  if (entry?.status === STUDIO_VIDEO_STATUS.NOT_RETURNED || entry?.status === STUDIO_VIDEO_STATUS.FAILED) {
    return { state: "retry", he: "הסרטון עוד לא הצליח. ננסה שוב אוטומטית בשעות הקרובות" };
  }
  return { state: "preparing", he: "הסרטון בהכנה: בדרך כלל מוכן תוך שעה־שעתיים מהפרסום בחנות" };
}
