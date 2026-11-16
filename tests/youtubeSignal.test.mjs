// YouTube as an early signal (src/lib/growth/youtubeSignal.js; the owner, 2026-11-16: "כן ליוטיוב"):
// only the official Data API with her own key, a 7-day window, and BUZZ hides a product.
import test from "node:test";
import assert from "node:assert/strict";
import { YT, ytIdsOf, ytSearchUrl, ytSignal, ytVideosUrl, ytViewsOf } from "../src/lib/growth/youtubeSignal.js";

test("youtube: the official API, the exact phrase, the last 7 days", () => {
  const u = new URL(ytSearchUrl("cloud night", { key: "k", now: Date.parse("2026-11-16T05:00:00Z") }));
  assert.equal(u.origin + u.pathname, "https://www.googleapis.com/youtube/v3/search");
  assert.equal(u.searchParams.get("q"), '"cloud night"');
  assert.equal(u.searchParams.get("publishedAfter"), "2026-11-09T05:00:00Z");
  assert.equal(u.searchParams.get("type"), "video");
  assert.match(ytVideosUrl(["abc123", "def456"], { key: "k" }), /videos\?part=statistics&id=abc123%2Cdef456/);
});

test("youtube: NONE, EARLY or BUZZ from measured numbers only", () => {
  assert.deepEqual(ytIdsOf({ items: [{ id: { videoId: "abc123" } }, { id: {} }] }), ["abc123"]);
  assert.equal(ytIdsOf({ error: {} }), null);
  assert.equal(ytViewsOf({ items: [{ statistics: { viewCount: "1200" } }, { statistics: { viewCount: "300" } }] }), 1500);
  assert.equal(ytSignal({ videos: 0, views: 0 }).level, "NONE");
  assert.equal(ytSignal({ videos: 3, views: 5000 }).level, "EARLY");
  assert.equal(ytSignal({ videos: YT.buzzVideos, views: 10 }).level, "BUZZ");
  assert.equal(ytSignal({ videos: 2, views: YT.buzzViews }).level, "BUZZ");
  assert.equal(ytSignal({ videos: null, views: 0 }), null);
});
