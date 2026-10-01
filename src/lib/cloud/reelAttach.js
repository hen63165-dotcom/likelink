// Reel → product attachment (the step that makes a creator's video visible).
//
// The `product-images` bucket is private: a reel under reels/<marketerId>/ is
// served to the public ONLY when an approved product of that creator
// references its path (storage policy likelink_private.media_is_public). The
// studio saved reels to marketplace:videos but never to the product, so no
// reel was ever publicly playable. The server now attaches a creator's saved
// reel to their own approved product (videoUrl) — the security rule itself is
// unchanged. Isomorphic and pure.
import { isValidMediaPath } from "./mediaStore.js";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

/** The storage path of a media-proxy video URL (/api/og?mode=media&path=reels/…/x.mp4), or null. */
export function mediaVideoPath(url) {
  let u;
  try { u = new URL(String(url || ""), "https://likelink2.vercel.app"); } catch { return null; }
  if (u.pathname !== "/api/og" || u.searchParams.get("mode") !== "media") return null;
  const path = u.searchParams.get("path") || "";
  return isValidMediaPath(path) && /^(reels|ugc)\//.test(path) && VIDEO_EXT.test(path) ? path : null;
}

const productIdOf = (v) => String(v?.productId || v?.productTags?.[0]?.productId || "");

/**
 * Which products get which reel. Only: the writer's own marketer, the video's
 * own product (approved, same marketer), a reel stored in THAT marketer's
 * reels/ folder, and a public video record. Newest video wins.
 */
export function reelAttachments(videos = [], ownedIds = new Set(), products = []) {
  const byId = new Map((Array.isArray(products) ? products : []).filter((p) => p?.id).map((p) => [String(p.id), p]));
  const out = new Map();
  const sorted = [...(Array.isArray(videos) ? videos : [])].sort((a, b) => (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0));
  for (const v of sorted) {
    if (!v || v.public !== true) continue;
    const owner = String(v.marketerId || "");
    if (!owner || !ownedIds.has(owner)) continue;
    const product = byId.get(productIdOf(v));
    if (!product || String(product.marketerId) !== owner || product.status !== "approved") continue;
    const path = mediaVideoPath(v.videoUrl);
    if (!path || !path.startsWith(`reels/${owner}/`)) continue;
    if (out.has(String(product.id)) || product.videoUrl === v.videoUrl) continue;
    out.set(String(product.id), { productId: String(product.id), videoUrl: v.videoUrl, synthetic: v.synthetic === true });
  }
  return [...out.values()];
}

export function applyReelAttachments(products = [], attachments = [], now = Date.now()) {
  const map = new Map(attachments.map((a) => [a.productId, a]));
  return (Array.isArray(products) ? products : []).map((p) => {
    const a = p?.id ? map.get(String(p.id)) : null;
    // A first-party animation is labelled as such — never presented as real footage.
    return a ? { ...p, videoUrl: a.videoUrl, videoSynthetic: a.synthetic, videoUpdatedAt: now } : p;
  });
}
