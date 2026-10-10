// Real product video reels (scripts/media/product-video/): the seller's own
// footage, an honest hook, the comment keyword and the ad disclosure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { videoUrlsInText } from "../scripts/media/product-video/find-videos.mjs";
import { KEYWORD, VARIANTS, buildCaption, creatorHooks, pickHook, variantHooks } from "../scripts/media/product-video/make-reel.mjs";
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
    assert.doesNotMatch(hook.text, /₪|\d/, `${p.id}: no price burned into the video`);
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

test("creator cut: three honest hooks per product, no prices, 'on Ali' only for AliExpress items", () => {
  for (const p of products) {
    const hooks = variantHooks(p);
    assert.equal(hooks.length, VARIANTS.length, `${p.id}: one hook per variant`);
    assert.equal(new Set(hooks.map((h) => h.text)).size, hooks.length, `${p.id}: the variants differ`);
    for (const h of hooks) {
      assert.doesNotMatch(h.text, HOOK_FORBIDDEN, `${p.id}: ${h.text}`);
      assert.doesNotMatch(h.text, /₪|\d/, `${p.id}: no price in a hook`);
    }
  }
  const notAli = { id: "x", category: "Home", affiliateUrl: "https://example-shop.test/p/1" };
  assert.ok(creatorHooks(notAli).every((h) => !/אלי/.test(h.text)), "a non-AliExpress product is never called 'from Ali'");
});

test("premium cut: five shots from usable footage, never the excluded part, full-screen around the jewelry", async () => {
  const { SHOTS, SHOT_EXCLUDE, XFADE, coverCrop, joinFilter, planShots, shotStarts, totalSeconds, usableRanges } = await import("../scripts/media/product-video/premium.mjs");
  assert.equal(totalSeconds(), Number((SHOTS.reduce((s, x) => s + x.out, 0) - XFADE * (SHOTS.length - 1)).toFixed(2)));
  assert.ok(totalSeconds() >= 10 && totalSeconds() <= 15, "a short reel that loops");
  // The diamond-tester demo on the moissanite bracelet is never used (moissanite is not diamond).
  assert.deepEqual(usableRanges(32, SHOT_EXCLUDE["p-live-03"]), [[0.6, 19.5]]);
  const samples = Array.from({ length: 64 }, (_, i) => ({ t: i / 2, sharp: i > 40 ? 99 : 10 + (i % 5), cx: 0.3 }));
  const plan = planShots(samples, 32, { exclude: SHOT_EXCLUDE["p-live-03"] });
  assert.equal(plan.length, SHOTS.length);
  for (const s of plan) {
    assert.ok(s.in >= 0.6 && s.in + s.srcLen <= 19.5 + 1e-6, `shot ${s.in}+${s.srcLen} stays out of the tester part`);
    assert.ok(s.speed > 0 && s.speed <= 1.25);
    assert.equal(s.cx, 0.3);
  }
  assert.deepEqual(plan.map((s) => s.in), [...plan.map((s) => s.in)].sort((a, b) => a - b), "shots follow the clip's order");
  // A short clip still gives five shots, none past its end.
  const short = planShots(Array.from({ length: 20 }, (_, i) => ({ t: i / 2, sharp: 5, cx: 0.5 })), 10);
  assert.equal(short.length, SHOTS.length);
  assert.ok(short.every((s) => s.in + s.srcLen <= 9.7 + 1e-6));
  // Framing: covers 1080×1920 and keeps the detail in view without leaving the frame.
  assert.deepEqual(coverCrop(1280, 720, 0.5), { sw: 3414, sh: 1920, x: 1167, y: 0 });
  assert.equal(coverCrop(1280, 720, 0).x, 0);
  assert.equal(coverCrop(1280, 720, 1).x, 3414 - 1080);
  // A glint (white flash) into the slow-motion hero shot, dissolves elsewhere.
  const join = joinFilter();
  assert.equal((join.match(/xfade=/g) || []).length, SHOTS.length - 1);
  assert.equal((join.match(/fadewhite/g) || []).length, SHOTS.filter((s) => s.sweep).length);
  assert.equal(shotStarts()[0], 0);
});

test("premium cut: the labels are on every frame; hook, name and call to action in turn", async () => {
  const { reelFilter, overlays, CTA_AT_S, HOOK_END_S, TOTAL_S } = await import("../scripts/media/product-video/make-reel.mjs");
  const f = reelFilter(5);
  assert.match(f, /\[cut\]\[6:v\]overlay=0:0\[v1\]/, "the labels image is laid over the whole reel, with no time limit");
  assert.ok(HOOK_END_S < CTA_AT_S && CTA_AT_S < TOTAL_S - 2, "the call to action has time to be read");
  const o = overlays(products[0], { text: "תסתכלי על הפרטים מקרוב" });
  assert.match(o.labels, /#פרסומת · קישור שותפים/);
  assert.match(o.labels, /צילום המוצר: המוכר/);
  assert.match(o.cta, new RegExp(KEYWORD));
  assert.doesNotMatch(Object.values(o).join(""), /₪|כוכבים|הכי נמכר|נגמר/);
});

test("clean variant: no text on the footage (the teaser goes in the caption), soft wipes, labels still on every frame", async () => {
  const { reelFilter, CLEAN_VARIANT, LAYERS } = await import("../scripts/media/product-video/make-reel.mjs");
  const { CLEAN_TRANSITIONS } = await import("../scripts/media/product-video/premium.mjs");
  assert.equal(CLEAN_VARIANT, 0, "the site plays variant a: the clean cut");
  assert.deepEqual(LAYERS.clean, ["labels", "name", "sweep"]);
  const f = reelFilter(5, { clean: true });
  assert.match(f, /\[cut\]\[6:v\]overlay=0:0\[v1\]/, "labels over the whole reel");
  assert.doesNotMatch(f, /fadewhite/, "no flash in the clean cut");
  for (const t of CLEAN_TRANSITIONS) assert.match(f, new RegExp(`transition=${t}`));
  assert.equal((f.match(/overlay=/g) || []).length, 3, "labels, the name at the end, the light sweep — nothing else");
});

test("our own footage: the same premium cut, labelled as ours, never as the seller's", async () => {
  const { overlays, buildCaption, FOOTAGE_LABEL } = await import("../scripts/media/product-video/make-reel.mjs");
  const p = products[0];
  const own = overlays(p, { text: "x" }, "owner").labels;
  assert.match(own, new RegExp(FOOTAGE_LABEL.owner));
  assert.doesNotMatch(own, /המוכר/);
  assert.match(own, /#פרסומת · קישור שותפים/);
  const caption = buildCaption(p, { text: "x" }, "owner");
  assert.match(caption, /צילום אמיתי של המוצר/);
  assert.doesNotMatch(caption, /צילום המוצר: המוכר/);
  assert.match(buildCaption(p, { text: "x" }), /צילום המוצר: המוכר/);
  const wf = readFileSync(new URL("../.github/workflows/product-video.yml", import.meta.url), "utf8");
  assert.match(wf, /FOOTAGE=owner node scripts\/media\/product-video\/make-reel\.mjs own-videos reels/);
  assert.match(wf, /clip_product: a product id/);
});
