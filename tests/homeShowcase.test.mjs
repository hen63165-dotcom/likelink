// The home page (src/components/discover/luxe.jsx + src/lib/homeShowcase.js):
// only footage of the real product is shown large (a person's own clip, then
// the seller's video), each labelled with whose video it is; Luna's AI reels
// never become the hero or a product's image; no counters on the home page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectionOrder, footageByProduct, heroReel } from "../src/lib/homeShowcase.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const reel = (id, productId, style, createdAt = 1) => ({ id, productIds: [productId], style, createdAt });

test("only real footage is shown large: a person's clip beats the seller's video; AI reels never count", () => {
  const reels = [
    reel("v-luna-a", "p-live-01", "luna_talking"),
    reel("v-seller-02", "p-live-02", "seller_video"),
    reel("v-own-02", "p-live-02", "real_ugc"),
    reel("v-seller-05", "p-live-05", "seller_video"),
    reel("v-anim", "p-live-04", "cinematic3d"),
  ];
  const f = footageByProduct(reels);
  assert.deepEqual([...f.keys()].sort(), ["p-live-02", "p-live-05"]);
  assert.equal(f.get("p-live-02").id, "v-own-02");
  assert.equal(heroReel(reels).id, "v-own-02", "a clip a person filmed leads");
  assert.equal(heroReel(reels.filter((r) => r.style !== "real_ugc")).id, "v-seller-02");
  assert.equal(heroReel([reel("v-luna", "p-live-01", "luna_tip")]), null, "no real footage → no hero video (the hero shows a product photo)");
});

test("the collection puts products with footage first and opens on one that isn't the hero's", () => {
  const products = ["p-live-01", "p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((id) => ({ id }));
  const reels = ["p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((p) => reel(`v-seller-${p}`, p, "seller_video"));
  const order = collectionOrder(products, footageByProduct(reels), "p-live-02").map((p) => p.id);
  assert.equal(order[0], "p-live-05");
  assert.equal(order.at(-1), "p-live-01", "a product without footage comes last");
  assert.equal(order.length, 5);
  assert.deepEqual(collectionOrder([], new Map(), ""), []);
});

test("the home page names whose video it is, keeps the disclosure and shows no counters", () => {
  const luxe = read("src/components/discover/luxe.jsx");
  assert.match(luxe, /styleLabel\(reel\.style, lang\)/, "the hero names whose video it is");
  assert.match(luxe, /styleLabel\(r\.style, lang\)/, "every video tile names whose video it is");
  assert.ok(luxe.includes("#פרסומת · קישור שותפים"), "the hero carries the disclosure");
  assert.match(luxe, /קישור שותפים/);
  assert.doesNotMatch(luxe, /heCount|enCount|attention|\.views|\.clicks|TREND_/, "no counters on the home page");
  // luxury.css forces every <img> visible (display:block !important): the hero glow is a background.
  assert.doesNotMatch(luxe, /<img[^>]*lx-luxe-glow/);
  const pages = read("src/components/discover/pages.jsx");
  assert.match(pages, /<LuxeHome graph=\{graph\}/);
  assert.match(pages, /trackSiteEvent\("landing_view"/);
});
