// The reels feed served by GitHub Pages (scripts/reels-feed.mjs writes it at
// deploy time from the luna-reels release). Every host reads the same file:
// github.io reads its own copy; the main address reads it from github.io.
// The feed's videos are never written anywhere (not the cloud key, not local
// storage): they join the public graph only, each labelled by what made it.
import { BASE } from "./basePath.js";

export const REELS_FEED_HOME = "https://hen63165-dotcom.github.io/likelink/media/reels/index.json";
const FILE = /^[a-z0-9][a-z0-9-]{0,80}\.mp4$/;
const POSTER = /^[a-z0-9][a-z0-9-]{0,80}-(cover|preview)\.jpg$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function reelsFeedUrl(base = BASE, origin = typeof location !== "undefined" ? location.origin : "") {
  return base && origin ? `${origin}${base}/media/reels/index.json` : REELS_FEED_HOME;
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

let pending = null;
/** Loads the feed once per page view; an empty list when it cannot be read. */
export function loadReelsFeed(fetchImpl = typeof fetch === "function" ? fetch : null) {
  if (!fetchImpl) return Promise.resolve([]);
  if (!pending) {
    const url = reelsFeedUrl();
    pending = fetchImpl(url, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => feedToVideos(doc, url))
      .catch(() => []);
  }
  return pending;
}
