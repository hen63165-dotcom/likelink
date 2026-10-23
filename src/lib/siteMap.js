// What the public site offers, from what it really has.
//
// 2026-10-22, the owner: "everything is messy in every category". The menu
// listed every section the code can draw (discover, creators, collections,
// trends, deals…) even when the catalog had five jewellery items and one
// creator, so most rows opened a near-empty page or the same five products
// again. Now the menu shows a section only when it has something to show,
// the shop is split by the kind of item a shopper looks for (rings,
// bracelets…), and a single creator's shop is named instead of a list of one.
import { SHOP_CIRCLES, circleOf } from "./homeShowcase.js";

const kindId = (c) => c.en.toLowerCase();

/** The kind of item ("rings", "bracelets"…) from the product's own name/category, or "". */
export function productKind(product) {
  const c = circleOf(product);
  return c ? kindId(c) : "";
}

/** Every kind the catalog really has, in the shop's order, with how many items. */
export function shopKinds(products = []) {
  const counts = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    const k = productKind(p);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return SHOP_CIRCLES.filter((c) => counts.has(kindId(c))).map((c) => ({
    id: kindId(c),
    he: c.he,
    en: c.en,
    count: counts.get(kindId(c)),
    to: `/products?kind=${kindId(c)}`,
  }));
}

// A section is listed only when it has enough to be worth a visit.
const HAS = {
  reels: (g) => (g.reels || []).length > 0,
  creators: (g) => (g.creators || []).length > 0,
  collections: (g) => (g.collections || []).length >= 2,
  trends: (g) => (g.trends || []).length > 0,
  deals: (g) => (g.deals || []).length > 0,
};

/**
 * The menu the visitor sees: the shop with its kinds under it, then only the
 * sections that have content. With one creator, "יוצרים" becomes that
 * creator's shop. Without a graph (pages outside the catalog) the full menu
 * stays, minus the kinds.
 */
export function visibleMenu(menu = [], graph = null) {
  if (!graph) return menu.map((n) => (n.kinds ? { ...n, subs: n.subs || [] } : n));
  const kinds = shopKinds(graph.products);
  const out = [];
  for (const n of menu) {
    if (n.kinds) {
      out.push({ ...n, subs: kinds.length >= 2 ? kinds.map((k) => ({ to: k.to, type: `kind:${k.id}`, he: k.he, en: k.en })) : [] });
      continue;
    }
    const has = HAS[n.type];
    if (has && !has(graph)) continue;
    if (n.type === "creators" && graph.creators.length === 1) {
      const c = graph.creators[0];
      out.push({ to: `/u/${c.slug}`, type: "creator", he: `החנות של ${c.name}`, en: `${c.name}'s shop` });
      continue;
    }
    out.push(n);
  }
  return out;
}
