// The gift finder on the season pages (/hanukkah-gifts): who the gift is for
// and a budget → the listed products that fit. The owner, 2026-11-06: "that
// people want to stay on my site". A shopper picks two chips and sees real
// products, and the choice is in the address (?for=kids&max=20), so it can be
// sent to a friend.
//
// Truth rules:
//   - "for" is the item's own kind (productKind: the import's kind, else its
//     own name/category), never a guess about who would like it;
//   - a budget counts only a price the store itself sent (priceSource
//     "aliexpress_api"); a product without one shows only under "any budget";
//   - the price is the store's "from" price at the last check, and the card
//     says so (PriceLine).
import { productKind } from "./siteMap.js";

export const GIFT_FOR = Object.freeze([
  { id: "kids", he: "לילדים", en: "For kids", kinds: Object.freeze(["kids"]) },
  { id: "her", he: "לה", en: "For her", kinds: Object.freeze(["earrings", "rings", "necklaces", "bracelets", "hair", "makeup", "skincare", "bags", "watches"]) },
  { id: "home", he: "לבית", en: "For the home", kinds: Object.freeze(["home", "kitchen"]) },
  { id: "pets", he: "לחיית המחמד", en: "For a pet", kinds: Object.freeze(["pets"]) },
]);

export const GIFT_BUDGETS = Object.freeze([
  { max: 0, he: "כל תקציב", en: "Any budget" },
  { max: 10, he: "עד ₪10", en: "Up to ₪10" },
  { max: 20, he: "עד ₪20", en: "Up to ₪20" },
  { max: 50, he: "עד ₪50", en: "Up to ₪50" },
]);

/** The store's own price, or 0 when the store did not send one. */
export const storePrice = (p) => (p?.priceSource === "aliexpress_api" && Number(p?.price) > 0 ? Number(p.price) : 0);

/** The listed products that fit, cheapest store price first (unknown prices last). */
export function giftMatches(products = [], { forId = "", max = 0 } = {}) {
  const group = GIFT_FOR.find((g) => g.id === forId) || null;
  const list = (Array.isArray(products) ? products : []).filter((p) => {
    if (!p) return false;
    if (group && !group.kinds.includes(productKind(p))) return false;
    if (max > 0) {
      const price = storePrice(p);
      if (!(price > 0 && price <= max)) return false;
    }
    return true;
  });
  return list.sort((a, b) => (storePrice(a) || Infinity) - (storePrice(b) || Infinity));
}

/** The finder's choice from a query string; anything unknown is dropped. */
export function parseFinder(search = "") {
  let params;
  try { params = new URLSearchParams(String(search)); } catch { return { forId: "", max: 0 }; }
  const forId = GIFT_FOR.some((g) => g.id === params.get("for")) ? params.get("for") : "";
  const n = Number(params.get("max"));
  const max = GIFT_BUDGETS.some((b) => b.max === n) ? n : 0;
  return { forId, max };
}

/** The query string for a choice ("" when nothing is chosen). */
export function finderQuery({ forId = "", max = 0 } = {}) {
  const params = new URLSearchParams();
  if (forId) params.set("for", forId);
  if (max) params.set("max", String(max));
  const q = params.toString();
  return q ? `?${q}` : "";
}

/** The "for" groups that have at least one product, so no chip opens an empty list. */
export function giftGroups(products = []) {
  return GIFT_FOR.filter((g) => giftMatches(products, { forId: g.id }).length > 0);
}
