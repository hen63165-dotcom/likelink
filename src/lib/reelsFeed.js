// The reels feed served by GitHub Pages (scripts/reels-feed.mjs writes it at
// deploy time from the luna-reels release). Every host reads the same file:
// github.io reads its own copy; the main address reads it from github.io.
// The feed's videos are never written anywhere (not the cloud key, not local
// storage): they join the public graph only, each labelled by what made it.
import { BASE } from "./basePath.js";

export const REELS_FEED_HOME = "https://hen63165-dotcom.github.io/likelink/media/reels/index.json";
/**
 * A seller video is shown only when the listed item is its subject: the video
 * must match the product it is shown with. p-live-02 is a tennis bracelet, but
 * the seller's clip is a model wearing a necklace with the bracelet as a small
 * detail on her wrist (owner, 2026-10-11). scripts/reels-feed.mjs leaves these
 * out of the feed; feedToVideos drops them too, so an older feed can't show them.
 */
export const SELLER_SKIP = Object.freeze({ "p-live-02": "the clip features a necklace; the listing is a bracelet" });

const FILE = /^[a-z0-9][a-z0-9-]{0,80}\.mp4$/;
const POSTER = /^[a-z0-9][a-z0-9-]{0,80}-(cover|preview)\.jpg$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function reelsFeedUrl(base = BASE, origin = typeof location !== "undefined" ? location.origin : "") {
  return base && origin ? `${origin}${base}/media/reels/index.json` : REELS_FEED_HOME;
}

/**
 * Where to read the feed, in order: the site's own address first (Netlify
 * proxies /media/reels/* to GitHub Pages, public/_redirects), so no
 * cross-site request can fail; then GitHub Pages itself.
 */
export function reelsFeedUrls(base = BASE, origin = typeof location !== "undefined" ? location.origin : "") {
  const own = origin ? `${origin}${base}/media/reels/index.json` : "";
  return [...new Set([own, REELS_FEED_HOME].filter(Boolean))];
}

/** index.json → marketplace:videos-shaped records (synthetic, public, product-tagged). */
export function feedToVideos(doc, feedUrl = REELS_FEED_HOME) {
  const list = Array.isArray(doc?.reels) ? doc.reels : [];
  const out = [];
  for (const e of list) {
    if (!e || !ID.test(String(e.id)) || !ID.test(String(e.productId)) || !FILE.test(String(e.video))) continue;
    let videoUrl, poster = "";
    try {
      videoUrl = new URL(e.video, feedUrl).href;
      if (POSTER.test(String(e.poster || ""))) poster = new URL(e.poster, feedUrl).href;
    } catch {
      continue;
    }
    // What made it decides how it is labelled: the engine (AI animation), the
    // seller (its own video from the product page) or a person who filmed it (real UGC).
    const look = String(e.look || "");
    if (look === "seller" && SELLER_SKIP[String(e.productId)]) continue;
    const kind = look === "seller"
      ? { synthetic: false, source: "aliexpress_seller", videoProvider: "aliexpress_seller", style: "seller_video" }
      : look === "real"
        ? { synthetic: false, humanFilmed: true, source: "owner_footage", videoProvider: "owner_footage", style: "real_ugc", ...(ID.test(String(e.marketerId || "")) ? { marketerId: String(e.marketerId) } : {}) }
        : { synthetic: true, source: "likelink_luna_reels", videoProvider: "likelink_luna_reels", style: look === "talking" ? "luna_talking" : "luna_tip" };
    out.push({
      id: String(e.id),
      videoUrl,
      poster,
      public: true,
      ...kind,
      productTags: [{ productId: String(e.productId) }],
      title: String(e.title || "").slice(0, 120),
      createdAt: Number(e.createdAt) || 0,
    });
  }
  return out;
}

async function readFeed(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const doc = await res.json();
    return Array.isArray(doc?.reels) ? doc : null;
  } catch {
    return null; // an SPA fallback page (no proxy here) or a network error
  }
}

let pending = null;
/**
 * Loads the feed once per page view; an empty list when it cannot be read.
 * Every copy is the same GitHub Pages file, so the media always resolve
 * against GitHub Pages (byte ranges for iOS, no proxy bandwidth).
 */
export function loadReelsFeed(fetchImpl = typeof fetch === "function" ? fetch : null, urls = reelsFeedUrls()) {
  if (!fetchImpl) return Promise.resolve([]);
  if (!pending) {
    pending = (async () => {
      for (const url of urls) {
        const doc = await readFeed(url, fetchImpl);
        if (doc) return feedToVideos(doc, REELS_FEED_HOME);
      }
      return [];
    })();
  }
  return pending;
}
