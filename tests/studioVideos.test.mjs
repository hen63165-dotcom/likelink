// Studio videos (the owner, 2026-10-25: "I added a link from Ali — how does it
// publish with a hook and a video, all in one click?"): every product published
// from an AliExpress link gets a ready video in the creator's own Studio, made
// from the store's own video. Nothing is posted, nothing is invented.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_ATTEMPTS, PER_RUN, RETRY_AFTER_MS, STUDIO_VIDEO_STATUS as S, isAliExpressUrl, linkKey, publicIndex,
  recordOutcome, studioVideoCandidates, studioVideoState, studioVideosByProduct, STUDIO_VIDEOS_HOME,
} from "../src/lib/growth/studioVideos.js";
import { storeVideo } from "../scripts/media/product-video/studio-videos.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-25T12:00:00Z");
const product = (id, over = {}) => ({ id, marketerId: "m1", status: "approved", title: "מצלמה", affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, createdAt: 1000, ...over });

test("only approved products from their own AliExpress link, without a video yet, newest first, a few per run", () => {
  const list = [
    product("new2", { createdAt: 3000 }),
    product("draft", { status: "draft" }),
    product("other", { affiliateUrl: "https://www.amazon.com/dp/B0" }),
    product("http", { affiliateUrl: "http://s.click.aliexpress.com/e/_x" }),
    product("noowner", { marketerId: "" }),
    product("has", {}),
    product("p-live-02", {}),
    product("new1", { createdAt: 2000 }),
    product("bad id!", {}),
  ];
  const got = studioVideoCandidates(list, { released: new Set(["has.mp4"]), skip: { "p-live-02": "another item" }, now: NOW });
  assert.deepEqual(got.map((p) => p.id), ["new2", "new1"], "the product she just added first");
  const many = Array.from({ length: 9 }, (_, i) => product(`p${i}`, { createdAt: i }));
  assert.deepEqual(studioVideoCandidates(many, { now: NOW }).map((p) => p.id), ["p8", "p7", "p6"].slice(0, PER_RUN));
  // 2026-10-25, the first run: seed products sharing one link (it opens the store's home page) are never promoted.
  const seeds = [product("s1", { affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }), product("s2", { affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }), product("own")];
  assert.deepEqual(studioVideoCandidates(seeds, { now: NOW }).map((p) => p.id), ["own"]);
  assert.ok(isAliExpressUrl("https://he.aliexpress.com/item/1.html") && isAliExpressUrl("https://s.click.aliexpress.com/e/_x"));
  assert.ok(!isAliExpressUrl("https://aliexpress.com.evil.example/item/1.html") && !isAliExpressUrl("javascript:alert(1)"));
});

test("a ready video or a store without one is final until the link changes; a failure retries after a wait, a few times", () => {
  const p = product("cam");
  let state = recordOutcome({}, p, { status: S.READY, video: "cam.mp4" }, NOW);
  assert.equal(studioVideoCandidates([p], { state, now: NOW + 99 * RETRY_AFTER_MS }).length, 0);
  assert.equal(studioVideoCandidates([{ ...p, affiliateUrl: "https://s.click.aliexpress.com/e/_new" }], { state, now: NOW }).length, 1, "a new link → a new video");
  state = recordOutcome({}, p, { status: S.NO_SELLER_VIDEO }, NOW);
  assert.equal(studioVideoCandidates([p], { state, now: NOW + 99 * RETRY_AFTER_MS }).length, 0);

  state = {};
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    state = recordOutcome(state, p, { status: S.FAILED, reason: "x" }, NOW + (i - 1) * RETRY_AFTER_MS);
    assert.equal(state.videos.cam.attempts, i);
  }
  assert.equal(studioVideoCandidates([p], { state, now: NOW + 99 * RETRY_AFTER_MS }).length, 0, "given up after MAX_ATTEMPTS");
  const once = recordOutcome({}, p, { status: S.NOT_RETURNED }, NOW);
  assert.equal(studioVideoCandidates([p], { state: once, now: NOW + RETRY_AFTER_MS - 1 }).length, 0, "waits");
  assert.equal(studioVideoCandidates([p], { state: once, now: NOW + RETRY_AFTER_MS }).length, 1, "then tries again");
  assert.equal(linkKey(p), p.affiliateUrl);
});

test("GitHub Pages gets status, files, caption and hook — never the creator's link", () => {
  const p = product("cam");
  let state = recordOutcome({}, p, { status: S.READY, video: "cam.mp4", variants: ["cam-b.mp4", "../x.mp4"], poster: "cam-preview.jpg", caption: "#פרסומת · קישור שותפים\nמצלמה", hook: "מצאתי" }, NOW);
  state = recordOutcome(state, product("none"), { status: S.NO_SELLER_VIDEO, video: "none.mp4", caption: "x" }, NOW);
  const index = publicIndex(state);
  assert.doesNotMatch(JSON.stringify(index), /s\.click|affiliateUrl|"link"/);
  const cam = index.videos.find((v) => v.productId === "cam");
  assert.deepEqual(cam.variants, ["cam-b.mp4"]);
  const none = index.videos.find((v) => v.productId === "none");
  assert.equal(none.video, undefined, "a file is only listed for a READY video");

  const map = studioVideosByProduct({ videos: [...index.videos, { productId: "ghost", status: "READY", video: "https://evil.example/a.mp4" }, { productId: "bad id", status: "READY", video: "a.mp4" }] });
  assert.equal(map.get("cam").video, new URL("cam.mp4", STUDIO_VIDEOS_HOME).href);
  assert.match(map.get("cam").video, /^https:\/\/hen63165-dotcom\.github\.io\/likelink\/media\/studio\/cam\.mp4$/);
  assert.equal(map.get("ghost").status, S.FAILED, "READY without a safe file is not ready");
  assert.ok(!map.has("bad id"));
});

test("the Studio's words: watch before posting, the store's own video, and never 'published'", () => {
  const p = product("cam");
  const lines = [
    studioVideoState(p, { status: S.READY, video: "https://x/cam.mp4" }),
    studioVideoState(p, null),
    studioVideoState(p, { status: S.NO_SELLER_VIDEO }),
    studioVideoState(p, { status: S.FAILED }),
    studioVideoState({ ...p, affiliateUrl: "https://www.amazon.com/dp/B0" }, null),
  ];
  assert.deepEqual(lines.map((l) => l.state), ["ready", "preparing", "none", "retry", "unsupported"]);
  assert.match(lines[0].he, /לפני שאת מפרסמת/);
  for (const l of lines) assert.doesNotMatch(l.he, /פורסם|הועלה לרשת|ויראלי|מובטח/);
  const ui = read("src/components/studio/ShareCenter.jsx");
  assert.match(ui, /צילום המוצר: המוכר/, "the video says whose footage it is");
  assert.match(ui, /own\.marketerId === marketer\.id/, "a creator sees only her own products' videos");
});

test("the store's video comes from the owner's affiliate account (official API), and a store without one says so", async () => {
  const env = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
  const answer = (product, code = 200) => async () => ({
    ok: true, status: 200,
    json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: code, result: { products: { product: product ? [product] : [] } } } } }),
  });
  const link = { affiliateUrl: "https://www.aliexpress.com/item/1005004921269497.html" };
  const id = "1005004921269497";
  assert.equal((await storeVideo(link, { env, fetchImpl: answer({ product_id: id, product_title: "מצלמה" }) })).status, S.NO_SELLER_VIDEO);
  const found = await storeVideo(link, { env, fetchImpl: answer({ product_id: id, product_title: "מצלמה", product_video_url: "//video.aliexpress-media.com/play/u/a.mp4" }) });
  assert.equal(found.status, "FOUND");
  assert.equal(found.video, "https://video.aliexpress-media.com/play/u/a.mp4");
  assert.equal((await storeVideo(link, { env, fetchImpl: answer({ product_id: id, product_video_url: "https://evil.example/a.mp4" }) })).status, S.NO_SELLER_VIDEO, "only the store's own video host");
  assert.equal((await storeVideo(link, { env, fetchImpl: answer(null, 405) })).status, S.NOT_RETURNED);
});

test("wiring: hourly, read-only on the cloud, the AliExpress secrets only where the store is asked, nothing posted", () => {
  const wf = read(".github/workflows/studio-videos.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron: "23 \* \* \* \*"/);
  assert.equal((wf.match(/secrets\.ALIEXPRESS_/g) || []).length, 3, "only the fetch step holds the store credentials");
  assert.doesNotMatch(wf, /IG_ACCESS_TOKEN|TELEGRAM|SUPABASE_SERVICE_ROLE|AUTOPILOT_SECRET|PAID_GENERATION/);
  assert.match(wf, /make-reel\.mjs studio\/videos reels/);
  const runner = read("scripts/media/product-video/studio-videos.mjs");
  assert.match(runner, /CLOUD\.anonKey/, "the cloud is read with the public key, like any visitor");
  assert.doesNotMatch(runner, /SERVICE_ROLE|method: "POST", headers: \{ apikey/);
  assert.match(runner, /rmSync\(join\(dir, STATE\)/, "the state (with the links) never reaches GitHub Pages");
  assert.match(read(".github/workflows/deploy-frontend.yml"), /workflows: \[[^\]]*"Studio videos"/);
  assert.match(read(".github/workflows/deploy-frontend.yml"), /studio-videos\.mjs feed dist/);
  assert.match(read("public/_redirects"), /^\/media\/studio\/\*\s+https:\/\/hen63165-dotcom\.github\.io\/likelink\/media\/studio\/:splat\s+200$/m);
  assert.match(read("scripts/media/product-video/make-reel.mjs"), /PRODUCTS_FILE/);
});
