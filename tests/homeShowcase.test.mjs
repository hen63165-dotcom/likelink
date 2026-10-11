// The home page (src/components/discover/luxe.jsx, src/lib/homeShowcase.js,
// src/lib/looks.js): only footage of the real product plays there (a
// person's own clip, then the seller's video), each named by whose it is;
// Luna's AI reels never become the home video or a product's image; the clean
// images ship with the site and are always named as the seller's; no counters.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { collectionOrder, footageByProduct, heroProduct } from "../src/lib/homeShowcase.js";
import { HERO_LOOK, LOOKS, lookLabel, lookOf } from "../src/lib/looks.js";
import { frameArgs, plan } from "../scripts/media/look-frames.mjs";
import { loadReelsFeed, reelsFeedUrls, REELS_FEED_HOME } from "../src/lib/reelsFeed.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const reel = (id, productId, style) => ({ id, productIds: [productId], style, createdAt: 1 });
const product = (id, image = "https://ae01.alicdn.com/kf/x.jpg") => ({ id, media: { image } });

test("only real footage plays on the home page: a person's clip beats the seller's video; AI reels never count", () => {
  const f = footageByProduct([
    reel("v-luna-a", "p-live-01", "luna_talking"),
    reel("v-seller-02", "p-live-02", "seller_video"),
    reel("v-own-02", "p-live-02", "real_ugc"),
    reel("v-seller-05", "p-live-05", "seller_video"),
    reel("v-anim", "p-live-04", "cinematic3d"),
  ]);
  assert.deepEqual([...f.keys()].sort(), ["p-live-02", "p-live-05"]);
  assert.equal(f.get("p-live-02").id, "v-own-02");
});

test("the home page opens on the hero image's product, and the collection leads with clean images", () => {
  const products = ["p-live-01", "p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((id) => product(id));
  assert.equal(heroProduct(products).id, HERO_LOOK.productId);
  assert.equal(heroProduct(products.filter((p) => p.id !== HERO_LOOK.productId)).id in LOOKS, true);
  assert.equal(heroProduct([product("x", "")]), null);
  const order = collectionOrder(products).map((p) => p.id);
  assert.equal(order.at(-1), "p-live-01", "a product without a clean image comes last");
  assert.deepEqual(collectionOrder([]), []);
});

test("every clean image ships with the site, is a real JPEG and is named as the seller's", () => {
  for (const [, spec, file] of plan()) {
    const path = new URL(`../public/looks/${file}`, import.meta.url);
    assert.ok(existsSync(path), `public/looks/${file}`);
    assert.ok(statSync(path).size > 10_000, `${file} is a real image`);
    assert.deepEqual([...readFileSync(path).subarray(0, 2)], [0xff, 0xd8], `${file} is a JPEG`);
    assert.equal(spec.source, "seller_video");
  }
  assert.equal(lookOf("p-live-02", "").src, "/looks/p-live-02.jpg");
  assert.equal(lookOf("p-live-02", "/likelink").src, "/likelink/looks/p-live-02.jpg");
  assert.equal(lookOf("unknown"), null);
  assert.equal(lookLabel("seller_video"), "מתוך סרטון המוכר");
  assert.doesNotMatch(lookLabel("seller_video"), /אמיתי|UGC/);
  const args = frameArgs({ at: 2.5, crop: "1080:1350:0:285" }, "in.mp4", "out.jpg");
  assert.ok(args.includes("crop=1080:1350:0:285,scale=900:1125:flags=lanczos"));
});

test("the reels feed is read from the site's own address first, then GitHub Pages", async () => {
  assert.deepEqual(reelsFeedUrls("", "https://likelink2.vercel.app"), ["https://likelink2.vercel.app/media/reels/index.json", REELS_FEED_HOME]);
  assert.deepEqual(reelsFeedUrls("/likelink", "https://hen63165-dotcom.github.io"), [REELS_FEED_HOME]);
  assert.match(read("public/_redirects"), /^\/media\/reels\/\*\s+https:\/\/hen63165-dotcom\.github\.io\/likelink\/media\/reels\/:splat\s+200$/m);
  const asked = [];
  const doc = { reels: [{ id: "seller-p-live-02", productId: "p-live-02", video: "seller-p-live-02.mp4", poster: "seller-p-live-02-cover.jpg", look: "seller" }] };
  // The own address answers the SPA page (no proxy) → falls through to GitHub Pages; media resolve there.
  const own = "https://own.example/media/reels/index.json";
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url === own) return { ok: true, json: async () => { throw new SyntaxError("html"); } };
    return { ok: true, json: async () => doc };
  };
  const list = await loadReelsFeed(fetchImpl, [own, REELS_FEED_HOME]);
  assert.deepEqual(asked, [own, REELS_FEED_HOME]);
  assert.equal(list[0].videoUrl, "https://hen63165-dotcom.github.io/likelink/media/reels/seller-p-live-02.mp4");
});

test("the home page names whose video and image it is, keeps the disclosure and shows no counters", () => {
  const luxe = read("src/components/discover/luxe.jsx");
  assert.match(luxe, /styleLabel\(reel\.style, lang\)/, "the opening video names whose it is");
  assert.match(luxe, /styleLabel\(r\.style, lang\)/, "every video tile names whose it is");
  assert.match(luxe, /lookLabel\(/, "a clean image is named as the seller's");
  assert.match(luxe, /קישור שותפים/);
  assert.doesNotMatch(luxe, /heCount|enCount|attention|\.views|\.clicks|TREND_/, "no counters on the home page");
  assert.doesNotMatch(luxe, /luna_talking|luna_tip/, "Luna's AI reels never play on the home page");
  const kit = read("src/components/discover/kit.jsx");
  assert.match(kit, /lookLabel\(look\.source, lang\)/, "product cards name the clean image's source too");
  const pages = read("src/components/discover/pages.jsx");
  assert.match(pages, /<LuxeHome graph=\{graph\}/);
  assert.match(pages, /trackSiteEvent\("landing_view"/);
});
