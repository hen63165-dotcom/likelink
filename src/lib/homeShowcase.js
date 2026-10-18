// What the home page shows large (src/components/discover/luxe.jsx).
// Only footage of the real product counts as a video there: a clip a person
// filmed (real_ugc), then the seller's own video in LikeLink2's cut
// (seller_video). Luna's AI reels stay on /reels with their labels; they
// never become the home page's opening video or a product's image.
import { cleanImage } from "./looks.js";

// The seller's model photos with its clip (the Creative Engine's lookbook) read
// best large, then photos only, then the seller's clip alone.
export const FOOTAGE_RANK = Object.freeze({ real_ugc: 3, seller_lookbook: 2, seller_photo_reel: 1.5, seller_video: 1 });
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

// A video the site serves itself (the reels feed on GitHub Pages) plays
// anywhere; a file in the cloud's Storage plays only while it is there (the
// Studio reels at reels/<studio>/… were not copied to the new cloud).
const servedBySite = (r) => !/[?&]mode=media\b/.test(String(r?.url || ""));
const score = (r) => [FOOTAGE_RANK[r.style] || 0, servedBySite(r) ? 1 : 0, Number(r.createdAt) || 0];
const better = (a, b) => {
  const x = score(a);
  const y = score(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/**
 * A creator's storefront posts: ONE per product, the product's best video —
 * footage of the real product first (FOOTAGE_RANK), Luna's labelled reels
 * after; a video the site serves before a cloud file, then the newest. Ordered
 * footage first, then the creator's own product order. LTK's unit is the post,
 * and a storefront of six products shows six posts, not every variant.
 */
export function storefrontPosts(reels = [], productIds = []) {
  const order = new Map((Array.isArray(productIds) ? productIds : []).map((id, i) => [id, i]));
  const best = new Map();
  for (const r of Array.isArray(reels) ? reels : []) {
    const id = r?.productIds?.[0];
    if (!id || !order.has(id)) continue;
    if (!best.has(id) || better(r, best.get(id))) best.set(id, r);
  }
  return [...best.values()].sort((a, b) =>
    (FOOTAGE_RANK[b.style] || 0) - (FOOTAGE_RANK[a.style] || 0) || order.get(a.productIds[0]) - order.get(b.productIds[0]));
}

/**
 * The /reels feed: every product's best post first (as on a storefront), then
 * the other videos — footage before Luna, a video the site serves before a
 * cloud file, newest first. The feed never opens on a second take of the same
 * product or on a cloud file that may be gone.
 */
export function reelsFeedOrder(reels = [], productIds = []) {
  const list = Array.isArray(reels) ? reels : [];
  const lead = storefrontPosts(list, productIds);
  const shown = new Set(lead.map((r) => r.id));
  const rest = list.filter((r) => !shown.has(r.id)).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  return [...lead, ...rest];
}

/**
 * The home page's collection: products with a clean image (the listed item is
 * the subject, no banners or text), in showcase order. Every product stays
 * on /products; this only decides what leads.
 */
export function curatedProducts(products = [], limit = 8) {
  return products.filter((p) => cleanImage(p)).sort((a, b) => showcaseRank(a.id) - showcaseRank(b.id)).slice(0, limit);
}

/**
 * "What are you looking for today?" — round pictures, one per kind of item,
 * the way LTK opens its categories. A circle exists only when the catalog has
 * that item with a clean picture (the picture is that product's own); it
 * opens the site's search for the word. No counts. Every category of the site
 * can appear (fashion, home, kids, gaming…), not only jewellery.
 */
export const SHOP_CIRCLES = Object.freeze([
  { q: "טבעת", he: "טבעות", en: "Rings", words: ["טבעת", "טבעות", " ring"] },
  { q: "צמיד", he: "צמידים", en: "Bracelets", words: ["צמיד", "bracelet"] },
  { q: "עגילים", he: "עגילים", en: "Earrings", words: ["עגיל", "earring"] },
  { q: "שרשרת", he: "שרשראות", en: "Necklaces", words: ["שרשרת", "שרשראות", "necklace"] },
  { q: "שעון", he: "שעונים", en: "Watches", words: ["שעון", "שעונים", " watch"] },
  { q: "תיק", he: "תיקים", en: "Bags", words: ["תיק ", "תיקים", " bag", "backpack"] },
  { q: "נעליים", he: "נעליים", en: "Shoes", words: ["נעל", "סניקרס", "shoe", "sneaker"] },
  { q: "שמלה", he: "שמלות", en: "Dresses", words: ["שמלה", "שמלות", " dress"] },
  { q: "איפור", he: "איפור", en: "Makeup", words: ["איפור", "שפתון", "מסקרה", "makeup", "lipstick"] },
  { q: "טיפוח", he: "טיפוח", en: "Skincare", words: ["טיפוח", "סרום", "קרם ", "skincare", "serum"] },
  { q: "מטבח", he: "מטבח", en: "Kitchen", words: ["מטבח", "kitchen"] },
  { q: "ילדים", he: "ילדים", en: "Kids", words: ["ילדים", "תינוק", "kids", "baby"] },
  { q: "גיימינג", he: "גיימינג", en: "Gaming", words: ["גיימינג", "gaming", "gamer"] },
  { q: "אוזניות", he: "אוזניות", en: "Headphones", words: ["אוזניות", "headphone", "earbud"] },
]);
export const MIN_CIRCLES = 2;

// The item's own name and category only: a description's passing word
// never makes a circle. English words start at a word ("earring" is not a ring).
const nameOf = (p) => ` ${String(p?.displayTitle || p?.title || "")} ${String(p?.category || "")} `.toLowerCase();

export function shopCircles(products = [], { limit = 8 } = {}) {
  const used = new Set();
  const out = [];
  for (const c of SHOP_CIRCLES) {
    if (out.length >= limit) break;
    const hit = products.find((p) => !used.has(p.id) && cleanImage(p) && c.words.some((w) => nameOf(p).includes(w)));
    if (!hit) continue;
    used.add(hit.id);
    out.push({ q: c.q, he: c.he, en: c.en, to: `/search?q=${encodeURIComponent(c.q)}`, image: cleanImage(hit).src, productId: hit.id });
  }
  return out.length >= MIN_CIRCLES ? out : [];
}

/** The video the home page features: footage of a curated product, showcase order first. */
export function spotlight(products = [], footage = new Map()) {
  return curatedProducts(products).find((p) => footage.has(p.id)) || null;
}
