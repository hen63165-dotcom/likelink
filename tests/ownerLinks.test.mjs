// Owner links → products: only the owner's own Link Generator link, a store
// PRODUCT page, a store-CDN photo and a real price make a product. Nothing is
// invented; a link or store item that exists already is never duplicated.
import test from "node:test";
import assert from "node:assert/strict";
import { validateOwnerLink, cleanStoreTitle, categoryFromTitle } from "../src/lib/cloud/catalogResolver.js";
import { parseLinks, parsePrice } from "../scripts/catalog/add-owner-links.mjs";

const M = [{ id: "own1" }];
const ok = { affiliateUrl: "https://s.click.aliexpress.com/e/_c3se485j", itemUrl: "https://www.aliexpress.com/item/1005006123456789.html", image: "https://ae01.alicdn.com/kf/S1.jpg", storeTitle: "925 Silver Ring Zircon - AliExpress 1509", price: 23.5, currency: "ILS" };

test("a valid owner link becomes a product with the store's own fields", () => {
  const v = validateOwnerLink(ok, [], M, "own1");
  assert.equal(v.ok, true);
  assert.equal(v.title, "925 Silver Ring Zircon");
  assert.equal(v.itemId, "1005006123456789");
  assert.equal(categoryFromTitle(v.title), "Accessories");
});

test("refused: someone else's link, a non-product page, a stock photo, no price, no title, unknown studio", () => {
  const e = (over, owner = "own1") => validateOwnerLink({ ...ok, ...over }, [], M, owner).error;
  assert.equal(e({ affiliateUrl: "https://www.aliexpress.com/item/1.html" }), "not_an_owner_affiliate_link");
  assert.equal(e({ itemUrl: "https://www.aliexpress.com/" }), "not_a_product_page");
  assert.equal(e({ image: "https://images.unsplash.com/photo-1" }), "image_not_merchant_photo");
  assert.equal(e({ price: 0 }), "price_missing");
  assert.equal(e({ currency: "EUR" }), "price_missing");
  assert.equal(e({ storeTitle: "AliExpress" }), "title_missing");
  assert.equal(e({}, "nobody"), "owner_studio_not_found");
});

test("idempotent: the same link or the same store item is reported, never added twice", () => {
  assert.equal(validateOwnerLink(ok, [{ id: "x", affiliateUrl: ok.affiliateUrl }], M, "own1").existing.id, "x");
  assert.equal(validateOwnerLink(ok, [{ id: "y", imageSource: { itemId: "1005006123456789" } }], M, "own1").existing.id, "y");
});

test("pasted links in any form; store price text", () => {
  assert.deepEqual(parseLinks("https://s.click.aliexpress.com/e/_c3se485jhttps://s.click.aliexpress.com/e/_c3Y5RXSD, x"), ["https://s.click.aliexpress.com/e/_c3se485j", "https://s.click.aliexpress.com/e/_c3Y5RXSD"]);
  assert.deepEqual(parsePrice("₪ 1,234.50"), { price: 1234.5, currency: "ILS" });
  assert.deepEqual(parsePrice("US $3.99"), { price: 3.99, currency: "USD" });
  assert.equal(parsePrice("no price"), null);
  assert.equal(cleanStoreTitle("Ring | AliExpress"), "Ring");
});
