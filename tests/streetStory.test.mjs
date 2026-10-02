// street_story: an original animated micro-story (setup → twist → payoff) about
// the day — never a claim about the product — labelled as computer animation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReelConcept, streetStory, STREET_STORIES, STYLE_ORDER, STYLE_CREATIVE, REEL_STYLES, creativeFor } from "../src/lib/media/reelPipeline.js";
import { FORBIDDEN_CLAIMS } from "../src/lib/discovery/distribution.js";
import { REEL_STYLE_LABELS } from "../src/lib/publicDiscovery.js";

const p = (id, category = "Accessories") => ({ id, title: `מוצר ${id}`, price: 50, category, image: `https://ae01.alicdn.com/kf/${id}.jpg`, affiliateUrl: `https://s.click.aliexpress.com/e/_${id}` });

test("street_story is a planned style with its own creative and labels", () => {
  assert.ok(STYLE_ORDER.includes("street_story"));
  assert.equal(STYLE_CREATIVE.street_story.format, "cinematic");
  assert.match(REEL_STYLES.street_story.he, /ממוחשב/);
  assert.match(REEL_STYLE_LABELS.street_story.he, /ממוחשב/);
  assert.equal(creativeFor(p("a"), "street_story").mediaType, "CINEMATIC", "never REAL_UGC");
});

test("the concept carries a three-beat story from the product's category family", () => {
  const c = buildReelConcept({ product: p("p-live-04"), creator: { name: "ALYOSTYLE" }, style: "street_story" });
  assert.ok(c.street.setup && c.street.twist && c.street.payoff);
  assert.ok(STREET_STORIES.style.includes(c.street));
  assert.ok(STREET_STORIES.general.includes(streetStory(p("x", "Tech"))));
  assert.equal(c.disclosure, "אנימציה ממוחשבת · לא צולם");
});

test("story lines make no product claims, and different products get different stories", () => {
  for (const s of [...STREET_STORIES.style, ...STREET_STORIES.general]) for (const l of Object.values(s)) {
    assert.doesNotMatch(l, FORBIDDEN_CLAIMS, l);
    assert.doesNotMatch(l, /(מבטיח|עמיד|לא נשבר|הכי טוב|כולם|מכירות|ביקורות)/, l);
  }
  const seen = new Set(["p-live-01", "p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((id) => streetStory(p(id)).setup));
  assert.ok(seen.size > 1, "not one template for the whole catalog");
});

test("the renderer draws street_story, burns in the disclosure and strips emoji from frames", () => {
  const html = readFileSync("scripts/media/reel-scene.html", "utf8");
  assert.match(html, /C\.style === "street_story"\) street\(s\)/);
  const fn = html.slice(html.indexOf("function street(t)"), html.indexOf("window.renderFrame"));
  assert.match(fn, /disclosure\(t\)/);
  assert.match(fn, /noEmoji/);
  assert.match(fn, /דמות מקורית/);
});

test("text_hook: creator-style text reel from real fields only, comment-for-link CTA, never a claim", async () => {
  const { buildReelConcept, STYLE_ORDER, STYLE_CREATIVE, COMMENT_KEYWORD } = await import("../src/lib/media/reelPipeline.js");
  const { HOOK_FORBIDDEN } = await import("../src/lib/growth/likeloop.js");
  const p = { id: "p9", title: "שרשרת יד Smyoue — ₪85", price: 85.36, category: "Accessories", image: "https://ae01.alicdn.com/kf/x.jpg" };
  const c = buildReelConcept({ product: p, creator: { name: "ALYOSTYLE" }, style: "text_hook" });
  assert.ok(STYLE_ORDER.slice(0, 2).includes("text_hook"));
  assert.ok(STYLE_CREATIVE.text_hook);
  assert.ok(!HOOK_FORBIDDEN.test(c.textHook.hook));
  assert.ok(c.textHook.reveal.some((l) => l.includes("מחיר בקטלוג")));
  assert.ok(c.textHook.cta.join(" ").includes(COMMENT_KEYWORD));
  assert.ok(c.disclosure, "the on-frame disclosure is always drawn");
  const scene = (await import("node:fs")).readFileSync(new URL("../scripts/media/reel-scene.html", import.meta.url), "utf8");
  assert.match(scene, /function textHook\(ms\)/);
  assert.match(scene, /C\.style === "text_hook"\) textHook\(s\)/);
});

test("ai_story: original AI character scenes (labelled), real product photo, no Pixar IP, no claims", async () => {
  const { buildReelConcept, STYLE_ORDER, STYLE_CREATIVE, REEL_STYLES, COMMENT_KEYWORD, aiStoryScenes, AI_IMAGE_PROVIDER } = await import("../src/lib/media/reelPipeline.js");
  const { HOOK_FORBIDDEN } = await import("../src/lib/growth/likeloop.js");
  const prod = { id: "p7", title: "חצובה Ulanzi MT-44M", price: 193.16, category: "Tech", image: "https://ae01.alicdn.com/kf/y.jpg" };
  assert.equal(STYLE_ORDER[0], "ai_story");
  assert.ok(STYLE_CREATIVE.ai_story);
  assert.match(REEL_STYLES.ai_story.he, /AI/);
  const ai = aiStoryScenes(prod);
  assert.equal(ai.provider, AI_IMAGE_PROVIDER);
  assert.equal(ai.scenes.length, 2);
  for (const s of ai.scenes) {
    assert.doesNotMatch(s.prompt, /pixar|disney|dreamworks/i, "no third-party studio IP");
    assert.match(s.prompt, /original/i);
    assert.ok(!HOOK_FORBIDDEN.test(s.caption), s.caption);
    assert.doesNotMatch(s.caption, FORBIDDEN_CLAIMS);
  }
  assert.equal(aiStoryScenes(prod).seed, ai.seed, "deterministic per product");
  const c = buildReelConcept({ product: prod, creator: { name: "ALYOSTYLE" }, style: "ai_story" });
  assert.ok(c.aiStory && c.textHook && c.disclosure);
  assert.ok(c.textHook.cta.join(" ").includes(COMMENT_KEYWORD));
  assert.equal(creativeFor(prod, "ai_story").mediaType === "REAL_UGC", false);
  const scene = readFileSync("scripts/media/reel-scene.html", "utf8");
  assert.match(scene, /function aiStory\(ms\)/);
  assert.match(scene, /C\.style === "ai_story"\) aiStory\(s\)/);
  const fn = scene.slice(scene.indexOf("function aiStory(ms)"));
  assert.match(fn.slice(0, 4000), /disclosure\(/);
  assert.match(fn.slice(0, 4000), /AI/);
});
