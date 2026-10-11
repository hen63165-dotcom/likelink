// What the home page shows large (src/components/discover/luxe.jsx).
// Only footage of the real product counts as a video there: a clip a person
// filmed (real_ugc), then the seller's own video in LikeLink2's cut
// (seller_video). Luna's AI reels stay on /reels with their labels; they
// never become the home page's opening video or a product's image.
import { HERO_LOOK, LOOKS } from "./looks.js";

export const FOOTAGE_RANK = Object.freeze({ real_ugc: 2, seller_video: 1 });
// The cuts that read best large go first in the collection.
export const SHOWCASE = Object.freeze(["p-live-02", "p-live-05", "p-live-04", "p-live-03"]);

export function showcaseRank(id) {
  const i = SHOWCASE.indexOf(id);
  return i < 0 ? SHOWCASE.length : i;
}

/** Product id → its best real footage (graph.reels entries). */
export function footageByProduct(reels = []) {
  const best = new Map();
  for (const r of Array.isArray(reels) ? reels : []) {
    const rank = FOOTAGE_RANK[r?.style] || 0;
    const id = r?.productIds?.[0];
    if (!rank || !id) continue;
    if (!best.has(id) || rank > FOOTAGE_RANK[best.get(id).style]) best.set(id, r);
  }
  return best;
}

/** The product the home page opens on: the hero image's product, else one with a clean image, else one with a photo. */
export function heroProduct(products = []) {
  return products.find((p) => p.id === HERO_LOOK.productId) || products.find((p) => LOOKS[p.id]) || products.find((p) => p.media?.image) || null;
}

/** The collection: products with a clean image first (showcase order), then the rest. */
export function collectionOrder(products = [], limit = 10) {
  return [...products]
    .sort((a, b) => (Number(Boolean(LOOKS[b.id])) - Number(Boolean(LOOKS[a.id]))) || (showcaseRank(a.id) - showcaseRank(b.id)))
    .slice(0, limit);
}
