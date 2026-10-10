// The reels feed GitHub Pages serves (scripts/reels-feed.mjs → src/lib/reelsFeed.js).
// One reel per listed product, real footage first, then talking Luna; only
// reels whose details say what made them (synthetic, or filmed by a person),
// with their disclosure labels. The sellers' own videos join as real product
// footage. Nothing is written to the cloud key or local storage.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedEntry, groupAssets, pickReels, sellerReels, SELLER_LABELS } from "../scripts/reels-feed.mjs";
import { CREATIVE_CLASS } from "../src/lib/media/videoCapability.js";
import { feedToVideos, reelsFeedUrl, REELS_FEED_HOME } from "../src/lib/reelsFeed.js";
import { buildPublicGraph, REEL_STYLE_LABELS } from "../src/lib/publicDiscovery.js";
import { isPublicVideo } from "../src/lib/videoSync.js";
import { MEDIA_TRUTH } from "../src/lib/discovery/mediaTruth.js";

const snap = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys;
const labels = ["דמות וקול שנוצרו בבינה מלאכותית", "#פרסומת · קישור שותפים"];
const asset = (name, at = "2026-10-10T09:00:00Z") => ({ name, url: `https://api.github.com/x/${name}`, updated_at: at });

test("release assets group into reels (mp4 + json + preview)", () => {
  const g = groupAssets([asset("silver-925-a.mp4"), asset("silver-925-a.json"), asset("silver-925-a-preview.jpg"), asset("silver-925-a.txt"), asset("x.json"), asset("../evil.mp4")]);
  assert.equal(g.length, 1);
  assert.equal(g[0].base, "silver-925-a");
  assert.ok(g[0].jpg);
});

test("one reel per listed product: talking first, then newest; never unlisted or unlabelled", () => {
  const listed = new Set(["p-live-02", "p-live-05"]);
  const reel = (base, product, look, at, extra = {}) => ({ base, updatedAt: Date.parse(at), mp4: {}, json: {}, meta: { product: { id: product }, look, synthetic: true, labels, ...extra } });
  const picked = pickReels([
    reel("a-still-new", "p-live-02", "still", "2026-10-10T10:00:00Z"),
    reel("a-talking-old", "p-live-02", "talking", "2026-10-09T10:00:00Z"),
    reel("e-new", "p-live-05", "still", "2026-10-10T11:00:00Z"),
    reel("e-old", "p-live-05", "still", "2026-10-08T11:00:00Z"),
    reel("hidden", "p-gone", "talking", "2026-10-10T12:00:00Z"),
    reel("not-synthetic", "p-live-05", "talking", "2026-10-10T12:00:00Z", { synthetic: false }),
    reel("no-labels", "p-live-05", "talking", "2026-10-10T12:00:00Z", { labels: [] }),
  ], listed);
  assert.deepEqual(picked.map((r) => r.base).sort(), ["a-talking-old", "e-new"]);
  const entry = feedEntry(picked.find((r) => r.base === "a-talking-old"));
  assert.equal(entry.video, "a-talking-old.mp4");
  assert.equal(entry.look, "talking");
  assert.deepEqual(entry.labels, labels);
});

test("the site reads the feed from its own folder on github.io and from github.io elsewhere", () => {
  assert.equal(reelsFeedUrl("/likelink", "https://hen63165-dotcom.github.io"), REELS_FEED_HOME);
  assert.equal(reelsFeedUrl("", "https://likelink2.vercel.app"), REELS_FEED_HOME);
  assert.match(REELS_FEED_HOME, /^https:\/\/hen63165-dotcom\.github\.io\/likelink\//);
});

test("feed entries become public, synthetic, product-tagged reels labelled as AI animation", () => {
  const doc = { reels: [
    { id: "luna-silver-925-a", productId: "p-live-02", video: "silver-925-a.mp4", poster: "silver-925-a-cover.jpg", title: "כסף 925", look: "talking", createdAt: 1 },
    { id: "bad", productId: "p-live-02", video: "https://evil.example/x.mp4" },
    { id: "bad2", productId: "p-live-02", video: "../x.mp4" },
  ] };
  const videos = feedToVideos(doc, REELS_FEED_HOME);
  assert.equal(videos.length, 1);
  const [v] = videos;
  assert.equal(v.videoUrl, "https://hen63165-dotcom.github.io/likelink/media/reels/silver-925-a.mp4");
  assert.equal(v.poster, "https://hen63165-dotcom.github.io/likelink/media/reels/silver-925-a-cover.jpg");
  assert.ok(isPublicVideo(v));
  assert.equal(v.style, "luna_talking");
  assert.ok(REEL_STYLE_LABELS.luna_talking.he.includes("AI"));
  const graph = buildPublicGraph({ products: snap["marketplace:products"], marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos });
  const reel = graph.reels.find((r) => r.id === "v-luna-silver-925-a");
  assert.ok(reel, "the reel reaches the reels page");
  assert.equal(reel.state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.deepEqual(reel.productIds, ["p-live-02"]);
});

test("the sellers' own videos: one per listed product, labelled as the seller's video, never UGC", () => {
  const listed = new Set(["p-live-02", "p-live-05"]);
  const picked = sellerReels([
    asset("p-live-02.mp4"), asset("p-live-02-preview.jpg"), asset("p-live-02-b.mp4"), asset("p-live-02-c.mp4"),
    asset("p-live-05.mp4"), asset("p-gone.mp4"), asset("p-live-05.txt"), asset("../p-live-05.mp4"),
  ], listed);
  assert.deepEqual(picked.map((r) => r.productId).sort(), ["p-live-02", "p-live-05"]);
  const a = picked.find((r) => r.productId === "p-live-02").entry;
  assert.equal(a.video, "seller-p-live-02.mp4");
  assert.equal(a.poster, "", "the cover is one frame cut at deploy time, never the contact sheet");
  assert.equal(a.look, "seller");
  assert.deepEqual(a.labels, [...SELLER_LABELS]);

  const [v] = feedToVideos({ reels: [a] }, REELS_FEED_HOME);
  assert.equal(v.synthetic, false);
  assert.equal(v.style, "seller_video");
  assert.notEqual(v.humanFilmed, true, "a seller video is not UGC");
  const graph = buildPublicGraph({ products: snap["marketplace:products"], marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos: [v] });
  const reel = graph.reels.find((r) => r.id === "v-seller-p-live-02");
  assert.ok(reel, "the seller video reaches the reels page");
  assert.equal(reel.state, MEDIA_TRUTH.REAL_VIDEO);
  assert.equal(reel.creativeClass, CREATIVE_CLASS.REAL_PRODUCT_VIDEO);
  assert.match(REEL_STYLE_LABELS.seller_video.he, /המוכר/);
  assert.doesNotMatch(REEL_STYLE_LABELS.seller_video.he, /אמיתי|UGC/, "a seller video may itself be AI-made");
  // …and the generic "סרטון אמיתי" badge stays off it on the reel cards.
  const kit = readFileSync(new URL("../src/components/discover/kit.jsx", import.meta.url), "utf8");
  assert.match(kit, /state === MEDIA_TRUTH\.REAL_VIDEO && style === "seller_video"\) return null/);
  const pages = readFileSync(new URL("../src/components/discover/pages.jsx", import.meta.url), "utf8");
  for (const src of [kit, pages]) assert.doesNotMatch(src, /<MediaBadge state=\{reel\.state\}(?![^>]*style=)/, "every reel badge gets the reel's style");
});

test("a clip a person filmed is real UGC only with the engine's word for it and a known studio", () => {
  const listed = new Set(["p-live-02"]);
  const reel = (base, at, meta) => ({ base, updatedAt: Date.parse(at), mp4: {}, json: {}, meta: { product: { id: "p-live-02" }, labels: ["#פרסומת · קישור שותפים"], ...meta } });
  const picked = pickReels([
    reel("talking-new", "2026-10-10T12:00:00Z", { look: "talking", synthetic: true }),
    reel("real-old", "2026-10-09T12:00:00Z", { look: "real", synthetic: false, humanFilmed: true }),
  ], listed);
  assert.deepEqual(picked.map((r) => r.base), ["real-old"], "real footage first");
  // Not synthetic, but nobody said a person filmed it: never on the site.
  assert.deepEqual(pickReels([reel("unknown", "2026-10-10T12:00:00Z", { look: "real", synthetic: false })], listed), []);
  assert.deepEqual(pickReels([reel("no-look", "2026-10-10T12:00:00Z", { look: "still", synthetic: false, humanFilmed: true })], listed), []);

  const owner = snap["marketplace:products"].find((p) => p.id === "p-live-02").marketerId;
  const entry = feedEntry(picked[0], new Map([["p-live-02", owner]]));
  assert.equal(entry.look, "real");
  assert.equal(entry.marketerId, owner);
  assert.equal(feedEntry(picked[0]).marketerId, undefined);
  const [v] = feedToVideos({ reels: [entry] }, REELS_FEED_HOME);
  assert.equal(v.humanFilmed, true);
  assert.equal(v.style, "real_ugc");
  const graph = buildPublicGraph({ products: snap["marketplace:products"], marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos: [v] });
  const shown = graph.reels.find((r) => r.id === "v-luna-real-old");
  assert.equal(shown.state, MEDIA_TRUTH.REAL_VIDEO);
  assert.equal(shown.creativeClass, CREATIVE_CLASS.REAL_UGC);
  // Without a known studio the same clip is real footage, never UGC.
  const [anon] = feedToVideos({ reels: [{ ...entry, marketerId: undefined }] }, REELS_FEED_HOME);
  assert.notEqual(buildPublicGraph({ products: snap["marketplace:products"], marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos: [anon] }).reels[0]?.creativeClass, CREATIVE_CLASS.REAL_UGC);
});

test("feed reels join the graph only — VideoContext never stores or uploads them", () => {
  const ctx = readFileSync(new URL("../src/context/VideoContext.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ctx, /reelsFeed|loadReelsFeed/);
  const kit = readFileSync(new URL("../src/components/discover/kit.jsx", import.meta.url), "utf8");
  assert.match(kit, /videos: feed\.length \? \[\.\.\.videos, \.\.\.feed\] : videos/);
});
