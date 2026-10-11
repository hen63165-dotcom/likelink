// What the home page shows large (src/components/discover/luxe.jsx).
// Only footage of the real product counts as a video there: a clip a person
// filmed (real_ugc), then the seller's own video in LikeLink2's cut
// (seller_video). Luna's AI reels stay on /reels with their labels; they
// never become the home page's opening video or a product's image.
import { cleanImage } from "./looks.js";

export const FOOTAGE_RANK = Object.freeze({ real_ugc: 2, seller_video: 1 });
// The cuts that read best large go first in the collection.
export const SHOWCASE = Object.freeze(["p-live-05", "p-live-04", "p-live-01", "p-live-03"]);

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

/**
 * The home page's collection: products with a clean image (the listed item is
 * the subject, no banners or text), in showcase order. Every product stays
 * on /products; this only decides what leads.
 */
export function curatedProducts(products = [], limit = 8) {
  return products.filter((p) => cleanImage(p)).sort((a, b) => showcaseRank(a.id) - showcaseRank(b.id)).slice(0, limit);
}

/** The video the home page features: footage of a curated product, showcase order first. */
export function spotlight(products = [], footage = new Map()) {
  return curatedProducts(products).find((p) => footage.has(p.id)) || null;
}
