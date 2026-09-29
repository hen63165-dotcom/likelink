// Truthful creative media state: an ad creative never claims to be rendering
// or watchable unless a real render job or a real playable video exists.
//
// Ad creatives are copy + the product's real photos; no renderer produces
// their video, and `renderStatus: "pending"` is only a creation-time default.
// The Creative Studio once showed "ממתין לרינדור" (waiting for render) for
// every motion creative although nothing was ever going to render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  generateCreative,
  creativeMediaState,
  creativeVideoUrl,
  CREATIVE_MEDIA_STATE,
  CREATIVE_MEDIA_STATE_LABELS_HE,
} from "../src/lib/ads/creativeStudio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const product = { id: "p1", title: "צמיד", price: 49, image: "https://images.unsplash.com/photo-1" };

test("freshly generated creatives are never 'rendering' or 'playable'", () => {
  for (const type of ["ugc", "cinematic_3d", "cinematic_motion", "product_demo", "lifestyle"]) {
    for (const placement of ["feed_sponsored", "story_sponsored", "studio_sponsored"]) {
      const creative = generateCreative(product, type, placement, {});
      const state = creativeMediaState(creative);
      assert.notEqual(state, CREATIVE_MEDIA_STATE.RENDERING, `${type}/${placement} has no render job`);
      assert.notEqual(state, CREATIVE_MEDIA_STATE.PLAYABLE, `${type}/${placement} has no video`);
      assert.equal(creativeVideoUrl(creative), "");
      const motion = ["video", "reel", "story"].includes(creative.format);
      assert.equal(state, motion ? CREATIVE_MEDIA_STATE.READY_TO_ANIMATE : CREATIVE_MEDIA_STATE.STATIC);
    }
  }
});

test("a stored renderStatus flag alone never changes the state", () => {
  const creative = { format: "video", renderStatus: "pending", status: "pending_render", assets: { video: null } };
  assert.equal(creativeMediaState(creative), CREATIVE_MEDIA_STATE.READY_TO_ANIMATE);
  assert.equal(creativeMediaState({ ...creative, renderStatus: "ready" }), CREATIVE_MEDIA_STATE.READY_TO_ANIMATE);
});

test("rendering needs a real active job; playable needs a real video URL", () => {
  const base = { format: "reel", assets: { video: null } };
  assert.equal(creativeMediaState({ ...base, renderJob: { state: "running" } }), CREATIVE_MEDIA_STATE.READY_TO_ANIMATE, "a job without id is not real");
  assert.equal(creativeMediaState({ ...base, renderJob: { id: "job_1", state: "failed" } }), CREATIVE_MEDIA_STATE.READY_TO_ANIMATE);
  assert.equal(creativeMediaState({ ...base, renderJob: { id: "job_1", state: "running" } }), CREATIVE_MEDIA_STATE.RENDERING);
  assert.equal(creativeMediaState({ ...base, assets: { video: "data:image/svg+xml;base64,AAA" } }), CREATIVE_MEDIA_STATE.READY_TO_ANIMATE, "an SVG data URL is not a video");
  assert.equal(creativeMediaState({ ...base, assets: { video: "https://cdn.example/v.mp4" } }), CREATIVE_MEDIA_STATE.PLAYABLE);
});

test("labels are Hebrew and the studio no longer claims a render is pending", () => {
  for (const label of Object.values(CREATIVE_MEDIA_STATE_LABELS_HE)) {
    assert.match(label, /[֐-׿]/);
    assert.doesNotMatch(label, /[A-Za-z]/);
  }
  const studio = readFileSync(path.join(ROOT, "src/components/ads/CreativeStudio.jsx"), "utf8");
  assert.doesNotMatch(studio, /ממתין לרינדור/);
  assert.doesNotMatch(studio, /renderStatus ===/, "the card must derive state via creativeMediaState()");
  assert.match(studio, /creativeMediaState\(creative\)/);
});
