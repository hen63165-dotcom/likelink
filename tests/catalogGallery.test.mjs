// scripts/catalog/gallery.mjs reads a product's own store gallery for a person
// to choose a photo: only store-CDN images, never an affiliate link (a visit
// there would count as a click), only listed products with a known store page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanImageUrl, galleryFrom, storePages } from "../scripts/catalog/gallery.mjs";

test("only store-CDN images, without their size suffix", () => {
  assert.equal(cleanImageUrl("//ae-pic-a1.aliexpress-media.com/kf/Sabc123.jpg_220x220q75.jpg_.webp"), "https://ae-pic-a1.aliexpress-media.com/kf/Sabc123.jpg");
  assert.equal(cleanImageUrl("https://ae01.alicdn.com/kf/S64b18d.jpg?x=1"), "https://ae01.alicdn.com/kf/S64b18d.jpg");
  assert.equal(cleanImageUrl("https://evil.example/kf/Sabc.jpg"), "");
  assert.equal(cleanImageUrl("https://ae-pic-a1.aliexpress-media.com/kf/../x.jpg"), "");
  const g = galleryFrom({ paths: ["https://ae01.alicdn.com/kf/B.jpg", "https://ae01.alicdn.com/kf/B.jpg_640x640.jpg"], html: '<img src="//ae01.alicdn.com/kf/C.png"> <a href="https://s.click.aliexpress.com/e/_x">' });
  assert.deepEqual(g, ["https://ae01.alicdn.com/kf/B.jpg", "https://ae01.alicdn.com/kf/C.png"], "gallery order first, no duplicates, no links");
});

test("store pages come from the listed catalog's own item pages, never the affiliate link", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8"));
  const pages = storePages(snapshot, ["p-live-03"]);
  assert.equal(pages.length, 1);
  assert.match(pages[0].itemUrl, /^https:\/\/www\.aliexpress\.(us|com)\/item\/\d+\.html$/);
  assert.doesNotMatch(read("scripts/catalog/gallery.mjs"), /affiliateUrl|s\.click\.aliexpress/, "the script never opens an affiliate link");
});

function read(f) {
  return readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
}
