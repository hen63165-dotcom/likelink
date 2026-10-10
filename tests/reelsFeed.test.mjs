// The reels feed GitHub Pages serves (scripts/reels-feed.mjs → src/lib/reelsFeed.js).
// One reel per listed product, talking Luna first; only synthetic reels with
// their disclosure labels; on the site they are labelled AI animation and are
// never written to the cloud key or local storage.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedEntry, groupAssets, pickReels } from "../scripts/reels-feed.mjs";
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
    { id: "luna-silver-925-a", productId: "p-live-02", video: "silver-925-a.mp4", poster: "silver-925-a-preview.jpg", title: "כסף 925", look: "talking", createdAt: 1 },
    { id: "bad", productId: "p-live-02", video: "https://evil.example/x.mp4" },
    { id: "bad2", productId: "p-live-02", video: "../x.mp4" },
  ] };
  const videos = feedToVideos(doc, REELS_FEED_HOME);
  assert.equal(videos.length, 1);
  const [v] = videos;
  assert.equal(v.videoUrl, "https://hen63165-dotcom.github.io/likelink/media/reels/silver-925-a.mp4");
  assert.ok(isPublicVideo(v));
  assert.equal(v.style, "luna_talking");
  assert.ok(REEL_STYLE_LABELS.luna_talking.he.includes("AI"));
  const graph = buildPublicGraph({ products: snap["marketplace:products"], marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos });
  const reel = graph.reels.find((r) => r.id === "v-luna-silver-925-a");
  assert.ok(reel, "the reel reaches the reels page");
  assert.equal(reel.state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.deepEqual(reel.productIds, ["p-live-02"]);
});

test("feed reels join the graph only — VideoContext never stores or uploads them", () => {
  const ctx = readFileSync(new URL("../src/context/VideoContext.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ctx, /reelsFeed|loadReelsFeed/);
  const kit = readFileSync(new URL("../src/components/discover/kit.jsx", import.meta.url), "utf8");
  assert.match(kit, /videos: feed\.length \? \[\.\.\.videos, \.\.\.feed\] : videos/);
});
