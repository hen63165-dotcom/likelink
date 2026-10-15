// The home page (src/components/discover/luxe.jsx, src/lib/homeShowcase.js,
// src/lib/looks.js): only footage of the real product plays there (a
// person's own clip, then the seller's video), each named by whose it is;
// Luna's AI reels never become the home video or a product's image; the clean
// images ship with the site and are always named as the seller's; no counters.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { curatedProducts, footageByProduct, spotlight } from "../src/lib/homeShowcase.js";
import { CLEAN_STORE_PHOTOS, cleanImage, LOOKS, lookLabel, lookOf } from "../src/lib/looks.js";
import { feedToVideos, SELLER_SKIP } from "../src/lib/reelsFeed.js";
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

test("every image matches its product: the home page shows only products with a clean image of the item itself", () => {
  const products = ["p-live-01", "p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((id) => product(id));
  const ids = curatedProducts(products).map((p) => p.id);
  assert.ok(!ids.includes("p-live-02"), "p-live-02's seller clip shows a necklace; its bracelet has no clean image yet");
  assert.ok(ids.includes("p-live-01") && CLEAN_STORE_PHOTOS.includes("p-live-01"), "a store photo checked by eye counts");
  assert.ok(!("p-live-02" in LOOKS));
  assert.equal(cleanImage(product("p-live-02")), null);
  assert.equal(cleanImage(product("p-live-01")).source, "", "a store photo is the store's, not a video frame");
  assert.deepEqual(curatedProducts([]), []);
  const footage = footageByProduct([reel("v-seller-p-live-05", "p-live-05", "seller_video"), reel("v-seller-p-live-02", "p-live-02", "seller_video")]);
  assert.equal(spotlight(products, footage).id, "p-live-05", "the featured video is footage of a product whose image matches");
});

test("a seller video that doesn't show the listed item never reaches the site, even from an older feed", () => {
  assert.ok(SELLER_SKIP["p-live-02"]);
  const list = feedToVideos({ reels: [
    { id: "seller-p-live-02", productId: "p-live-02", video: "seller-p-live-02.mp4", look: "seller" },
    { id: "seller-p-live-05", productId: "p-live-05", video: "seller-p-live-05.mp4", look: "seller" },
    { id: "luna-silver-925", productId: "p-live-02", video: "silver-925.mp4", look: "talking" },
  ] });
  assert.deepEqual(list.map((v) => v.id), ["seller-p-live-05", "luna-silver-925"], "Luna's labelled tip reel stays; the mismatched seller clip goes");
});

test("every clean image ships with the site, is a real JPEG and is named as the seller's", () => {
  for (const [, spec, file] of plan()) {
    const path = new URL(`../public/looks/${file}`, import.meta.url);
    assert.ok(existsSync(path), `public/looks/${file}`);
    assert.ok(statSync(path).size > 10_000, `${file} is a real image`);
    assert.deepEqual([...readFileSync(path).subarray(0, 2)], [0xff, 0xd8], `${file} is a JPEG`);
    assert.equal(spec.source, "seller_video");
  }
  assert.equal(lookOf("p-live-05", "").src, "/looks/p-live-05.jpg");
  assert.equal(lookOf("p-live-05", "/likelink").src, "/likelink/looks/p-live-05.jpg");
  assert.equal(lookOf("unknown"), null);
  assert.equal(lookLabel("seller_video"), "מתוך סרטון המוכר");
  assert.doesNotMatch(lookLabel("seller_video"), /אמיתי|UGC/);
  const args = frameArgs({ at: 2.5, crop: "1080:1350:0:285" }, "in.mp4", "out.jpg");
  assert.ok(args.includes("crop=1080:1350:0:285,scale=900:1125:flags=lanczos"));
  assert.ok(frameArgs({ at: 0.2, crop: "1000:1250:50:300", sharpen: true }, "in.mp4", "out.jpg").includes("crop=1000:1250:50:300,scale=900:1125:flags=lanczos,unsharp=5:5:0.6"));
});

test("the reels feed is read from the site's own address first, then GitHub Pages", async () => {
  assert.deepEqual(reelsFeedUrls("", "https://likelink2.vercel.app"), ["https://likelink2.vercel.app/media/reels/index.json", REELS_FEED_HOME]);
  assert.deepEqual(reelsFeedUrls("/likelink", "https://hen63165-dotcom.github.io"), [REELS_FEED_HOME]);
  assert.match(read("public/_redirects"), /^\/media\/reels\/\*\s+https:\/\/hen63165-dotcom\.github\.io\/likelink\/media\/reels\/:splat\s+200$/m);
  const asked = [];
  const doc = { reels: [{ id: "seller-p-live-05", productId: "p-live-05", video: "seller-p-live-05.mp4", poster: "seller-p-live-05-cover.jpg", look: "seller" }] };
  // The own address answers the SPA page (no proxy) → falls through to GitHub Pages; media resolve there.
  const own = "https://own.example/media/reels/index.json";
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url === own) return { ok: true, json: async () => { throw new SyntaxError("html"); } };
    return { ok: true, json: async () => doc };
  };
  const list = await loadReelsFeed(fetchImpl, [own, REELS_FEED_HOME]);
  assert.deepEqual(asked, [own, REELS_FEED_HOME]);
  assert.equal(list[0].videoUrl, "https://hen63165-dotcom.github.io/likelink/media/reels/seller-p-live-05.mp4");
});

test("the home page names whose video and image it is, keeps the disclosure and shows no counters", () => {
  const luxe = read("src/components/discover/luxe.jsx");
  assert.match(luxe, /styleLabel\(reel\.style, lang\)/, "the featured video names whose it is");
  // Every video tile is a shared ReelCard post, which names whose video it is under the footage.
  assert.match(luxe, /<ReelCard key=\{r\.id\} reel=\{r\} graph=\{graph\} shoppable/, "every video tile is a shoppable post");
  assert.match(read("src/components/discover/kit.jsx"), /const source = REEL_STYLE_LABELS\[reel\.style\]\?\.\[lang\]/, "every video tile names whose it is");
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

test("the phone mockups show whose video it is on the footage and the product only under it", () => {
  const luxe = read("src/components/discover/luxe.jsx");
  const phoneVideo = luxe.slice(luxe.indexOf("function PhoneVideo"), luxe.indexOf("/* ------------------------------------------------------------------- hero"));
  const onFootage = phoneVideo.slice(phoneVideo.indexOf('<span className="lx-phone-video">'), phoneVideo.indexOf('<span className="lx-phone-product">'));
  assert.ok(onFootage.length > 0);
  assert.match(onFootage, /styleLabel\(reel\.style, lang\)/, "whose video it is");
  assert.doesNotMatch(onFootage, /displayTitle|creator|\.name\b/, "no product or creator name printed over the footage");
  assert.match(phoneVideo.slice(phoneVideo.indexOf('<span className="lx-phone-product">')), /product\.displayTitle/, "the product sits under the video");
  // The screens are drawn from the same real records: curated images only, no counters.
  assert.match(luxe, /function CreatorScreen[\s\S]*cleanImage\(p\)\?\.src/);
  assert.match(luxe, /function FindScreen[\s\S]*cleanImage\(p\)\.src/);
});

test("the header is LTK's: search, sign-up and log-in into the Studio's form, and a menu that says buying needs no account", () => {
  const shell = read("src/components/discover/PublicShell.jsx");
  assert.match(shell, /export const STUDIO_SIGNUP = "\/studio\?auth=signup"/);
  assert.match(shell, /export const STUDIO_LOGIN = "\/studio\?auth=login"/);
  assert.match(shell, /<Go to=\{STUDIO_LOGIN\} className="lx-top-btn lx-top-btn-dark"/);
  assert.match(shell, /<HeaderSearch navigate=\{navigate\} \/>/);
  assert.match(shell, /כדי לקנות לא צריך להירשם/, "sign-up is for the creators' Studio, never a condition for buying");
  assert.match(shell, /\{ to: "\/deals", type: "deals", he: "דילים", en: "Deals", sale: true \}/);
  assert.match(shell, /<Go to="\/join" onClick=\{onClose\} className="lx-dd-cta">/);
  const entrance = read("src/components/studio/StudioEntrance.jsx");
  assert.match(entrance, /get\("auth"\) === "login" \? "login" : "signup"/, "log-in opens the form on the sign-in tab");
  assert.match(entrance, /initialMode=\{authMode\}/);
  assert.match(read("src/components/sell/AuthGate.jsx"), /useState\(initialMode === "login" \? "login" : "signup"\)/);
});
