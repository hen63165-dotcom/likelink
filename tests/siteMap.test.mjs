// The public menu and shop show only what the catalog really has.
//
// 2026-10-22, the owner: "everything is messy in every category". The menu
// listed every section the code can draw even with five jewellery items and
// one creator, so most rows opened a near-empty page or the same five
// products. These tests pin src/lib/siteMap.js and its wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productKind, shopKinds, visibleMenu } from "../src/lib/siteMap.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const P = (id, title, category = "Accessories") => ({ id, title, category });
const products = [
  P("r1", "טבעת כסף 925 קלאסית עם זרקון מרקיז"),
  P("b1", "צמיד טניס מואסניט Smyoue מצופה פלטינה"),
  P("b2", "צמיד טניס מואסניט ATTAGEMS מצופה זהב לבן"),
  P("h1", "שרשרת יד Smyoue מצופה 14K עם תליוני מואסניט"),
  P("e1", "עגילי Smyoue מואסניט ורודים 0.2-3 קראט"),
];
const MENU = [
  { to: "/products", type: "products", he: "חנות", en: "Shop", kinds: true, subs: [] },
  { to: "/reels", type: "reels", he: "סרטונים", en: "Videos" },
  { to: "/creators", type: "creators", he: "יוצרים", en: "Creators" },
  { to: "/collections", type: "collections", he: "אוספים", en: "Collections" },
  { to: "/trends", type: "trends", he: "טרנדים", en: "Trends" },
  { to: "/deals", type: "deals", he: "דילים", en: "Deals", sale: true },
  { to: "/size", type: "size", he: "מודד", en: "Size" },
];

test("the kind of item comes from its own name: a hand chain is a bracelet, earrings are not rings", () => {
  assert.equal(productKind(products[0]), "rings");
  assert.equal(productKind(products[3]), "bracelets", "שרשרת יד is worn on the wrist");
  assert.equal(productKind(products[4]), "earrings");
  assert.equal(productKind(P("x", "Gold earring set")), "earrings", "an English earring is never a ring");
  assert.equal(productKind(P("y", "משהו אחר", "Misc")), "");
});

test("the shop's kinds are only the ones the catalog has, with real counts", () => {
  const kinds = shopKinds(products);
  assert.deepEqual(kinds.map((k) => [k.id, k.count]), [["rings", 1], ["bracelets", 3], ["earrings", 1]]);
  assert.equal(kinds[1].to, "/products?kind=bracelets");
  assert.deepEqual(shopKinds([]), []);
});

test("the menu lists a section only when it has something to show; one creator is named", () => {
  const graph = { products, reels: [], creators: [{ slug: "alyostyle", name: "ALYOSTYLE" }], collections: [{ id: "c1" }], trends: [], deals: [{ id: "b1" }] };
  const menu = visibleMenu(MENU, graph);
  const types = menu.map((n) => n.type);
  assert.deepEqual(types, ["products", "creator", "deals", "size"], "no empty videos, one collection or no trends");
  assert.equal(menu[0].subs.map((s) => s.he).join(","), "טבעות,צמידים,עגילים");
  assert.equal(menu[1].to, "/u/alyostyle");
  assert.equal(menu[1].he, "החנות של ALYOSTYLE");
  const two = visibleMenu(MENU, { ...graph, creators: [{ slug: "a", name: "A" }, { slug: "b", name: "B" }], reels: [{ id: "v" }], collections: [{}, {}], trends: [{}] });
  assert.deepEqual(two.map((n) => n.type), ["products", "reels", "creators", "collections", "trends", "deals", "size"]);
  assert.deepEqual(visibleMenu(MENU, { ...graph, products: products.slice(0, 1) })[0].subs, [], "one kind is not a sub-menu");
  assert.equal(visibleMenu(MENU, null).length, MENU.length, "a page outside the catalog keeps the full menu");
});

test("the shell and the shop use it: menu, footer and dock; kind chips; no zero filter", () => {
  const shell = read("src/components/discover/PublicShell.jsx");
  assert.match(shell, /visibleMenu\(MENU, graph\)\.map/);
  assert.match(shell, /visibleMenu\(PUBLIC_NAV\.slice\(1\), graph\)/);
  assert.match(shell, /\{ to: "\/products", type: "products", icon: ShoppingBag, he: "חנות", en: "Shop" \}/, "the dock's second tab is the shop, not 'discover'");
  assert.match(read("src/components/discover/PublicSite.jsx"), /<PublicShell [^>]*graph=\{graph\}>/);
  const pages = read("src/components/discover/pages.jsx");
  assert.match(pages, /useQueryParam\("kind"\)/);
  assert.match(pages, /kinds\.length >= 2 \?/);
  assert.match(pages, /videoCount > 0 \|\| videoOnly \?/, "a 'with video' chip never says 0");
  assert.match(pages, /graph\.categories\.length > 1 \? <CategoryChips/, "one category is not a chip row");
});
