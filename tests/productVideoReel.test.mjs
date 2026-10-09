// Real product video reels (scripts/media/product-video/): the seller's own
// footage, an honest hook, the comment keyword and the ad disclosure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { videoUrlsInText } from "../scripts/media/product-video/find-videos.mjs";
import { KEYWORD, buildCaption, pickHook } from "../scripts/media/product-video/make-reel.mjs";
import { HOOK_FORBIDDEN } from "../src/lib/growth/likeloop.js";

const products = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];

test("video finder: only store-CDN .mp4 URLs, unescaped from page data", () => {
  const html = '{"videoUrl":"https:\\/\\/video.aliexpress-media.com\\/play\\/u\\/ae_sg_item\\/1\\/p\\/1\\/e\\/6\\/t\\/10301\\/1.mp4"} <video src="//cloud.video.taobao.com/play/u/2/x.mp4?a=1"> https://evil.example.com/a.mp4 http://video.aliexpress-media.com/b.mp4';
  assert.deepEqual(videoUrlsInText(html), [
    "https://video.aliexpress-media.com/play/u/ae_sg_item/1/p/1/e/6/t/10301/1.mp4",
    "https://cloud.video.taobao.com/play/u/2/x.mp4?a=1",
    "https://video.aliexpress-media.com/b.mp4",
  ]);
});

test("reel hooks are honest: no purchase, stock, rating or popularity claims", () => {
  products.forEach((p, i) => {
    const hook = pickHook(p, i);
    assert.ok(hook && hook.text, `${p.id} has a hook`);
    assert.doesNotMatch(hook.text, HOOK_FORBIDDEN, `${p.id}: ${hook.text}`);
  });
});

test("captions: the product's own facts, the comment keyword, the ad disclosure, the footage source", () => {
  for (const [i, p] of products.entries()) {
    const c = buildCaption(p, pickHook(p, i));
    assert.ok(c.includes(p.title), "title");
    assert.ok(c.includes(`"${KEYWORD}"`), "comment keyword");
    assert.match(c, /#פרסומת · קישור שותפים/, "ad disclosure");
    assert.match(c, /צילום המוצר: המוכר/, "footage source");
    assert.doesNotMatch(c, /(קניתי|הזמנתי|ניסיתי|ביקורות|כוכבים|הכי נמכר|נגמר)/, "no invented experience or social proof");
    assert.ok((c.match(/#[^\s#·]+/g) || []).length <= 6, "a few relevant hashtags");
    assert.ok(c.length <= 2200, "Instagram caption limit");
  }
});
