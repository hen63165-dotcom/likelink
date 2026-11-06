// The gift finder on /hanukkah-gifts (src/lib/giftFinder.js): who it is for +
// a budget → the listed products that fit. A budget counts only a price the
// store itself sent, and the choice stays in the address so it can be shared.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIFT_FOR, GIFT_BUDGETS, giftMatches, parseFinder, finderQuery, giftGroups, storePrice } from "../src/lib/giftFinder.js";
import { saleSeason } from "../src/lib/saleSeason.js";

const P = (id, kind, price, src = "aliexpress_api") => ({ id, kind, price, priceSource: src, title: id });
const products = [
  P("toy-cheap", "kids", 8.5),
  P("toy-mid", "kids", 19),
  P("toy-hand", "kids", 5, "catalog"),
  P("ring", "rings", 14.79),
  P("hair", "hair", 5.29),
  P("pan", "kitchen", 30),
];

test("for: the item's own kind; budget: only the store's own price", () => {
  assert.deepEqual(giftMatches(products, { forId: "kids" }).map((p) => p.id), ["toy-cheap", "toy-mid", "toy-hand"], "cheapest store price first, unknown last");
  assert.deepEqual(giftMatches(products, { forId: "kids", max: 10 }).map((p) => p.id), ["toy-cheap"], "a hand-entered price never passes a budget");
  assert.deepEqual(giftMatches(products, { forId: "her", max: 20 }).map((p) => p.id), ["hair", "ring"]);
  assert.deepEqual(giftMatches(products, { forId: "home" }).map((p) => p.id), ["pan"]);
  assert.equal(giftMatches(products, {}).length, products.length);
  assert.equal(storePrice(P("x", "kids", 9, "catalog")), 0);
});

test("the address carries the choice, and anything unknown is dropped", () => {
  assert.deepEqual(parseFinder("?for=kids&max=20"), { forId: "kids", max: 20 });
  assert.deepEqual(parseFinder("?for=boss&max=7"), { forId: "", max: 0 });
  assert.equal(finderQuery({ forId: "her", max: 50 }), "?for=her&max=50");
  assert.equal(finderQuery({}), "");
  for (const b of GIFT_BUDGETS) assert.deepEqual(parseFinder(finderQuery({ max: b.max })).max, b.max);
});

test("no chip opens an empty list, and the finder is on the Hanukkah page", () => {
  assert.deepEqual(giftGroups(products).map((g) => g.id), ["kids", "her", "home"], "no pets in the catalog: no pets chip");
  assert.equal(saleSeason("hanukkah-gifts").finder, true);
  assert.ok(GIFT_FOR.every((g) => g.he && g.en && g.kinds.length));
  const pages = readFileSync(new URL("../src/components/discover/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /season\.finder \? <GiftFinder graph=\{graph\} path=\{salePath\(season\.id\)\} \/> : null/);
  const luxe = readFileSync(new URL("../src/components/discover/luxe.jsx", import.meta.url), "utf8");
  assert.match(luxe, /<SeasonStrip \/>\s*<Hero/, "the home page links the season above the hero");
});
