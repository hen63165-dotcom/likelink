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
