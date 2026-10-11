// Which footage the home page shows large (src/components/discover/luxe.jsx).
// Only footage of the real product counts: a clip a person filmed
// (real_ugc), then the seller's own video in LikeLink2's cut (seller_video).
// Luna's AI reels stay on /reels with their labels; they never become the
// hero or a product's image.

export const FOOTAGE_RANK = Object.freeze({ real_ugc: 2, seller_video: 1 });
// The cuts that read best large (a person wearing the piece, close-ups on a
// plain background) go first: the hero, then the collection's feature.
export const SHOWCASE = Object.freeze(["p-live-02", "p-live-05", "p-live-04", "p-live-03"]);
// Where the piece sits in a seller frame (the cover is a 9:16 frame shown at 4:5).
export const FOCUS = Object.freeze({ "p-live-02": "50% 88%" });

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

/** The hero video: person-filmed footage first, then the showcase order, then the newest. */
export function heroReel(reels = []) {
  return [...footageByProduct(reels).values()].sort(
    (a, b) => (FOOTAGE_RANK[b.style] - FOOTAGE_RANK[a.style]) || (showcaseRank(a.productIds[0]) - showcaseRank(b.productIds[0])) || ((Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
  )[0] || null;
}

/**
 * The collection, in order: products with footage first (showcase order),
 * then the rest; the first one with footage that isn't the hero's leads (it
 * plays as the large tile).
 */
export function collectionOrder(products = [], footage = new Map(), heroProductId = "", limit = 9) {
  const items = [...products].sort((a, b) => (Number(footage.has(b.id)) - Number(footage.has(a.id))) || (showcaseRank(a.id) - showcaseRank(b.id))).slice(0, limit);
  const lead = items.findIndex((p) => footage.has(p.id) && p.id !== heroProductId);
  if (lead > 0) items.unshift(items.splice(lead, 1)[0]);
  return items;
}
