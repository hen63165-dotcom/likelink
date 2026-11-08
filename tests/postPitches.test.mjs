// The few lines a Telegram post says about a product (src/lib/growth/postPitches.js)
// and the album it goes out with (api/autopilot.mjs). The owner, 2026-11-08:
// "at that level" — an album of the item's photos and warm, specific lines.
import test from "node:test";
import assert from "node:assert/strict";
import { PITCHES, pitchFor } from "../src/lib/growth/postPitches.js";
import { HOOK_FORBIDDEN } from "../src/lib/growth/likeloop.js";
import { DROP_FORBIDDEN } from "../src/lib/growth/dailyDrop.js";
import { hasBrandName } from "../src/lib/growth/deals.js";
import { renderTemplate, telegramAlbum } from "../api/autopilot.mjs";
import { defaultTemplate } from "../src/lib/autoPilot.js";

test("every written line passes the site's claim rules and names no brand", () => {
  for (const [id, p] of Object.entries(PITCHES)) {
    assert.match(id, /^\d{6,20}$/);
    for (const s of [p.title, p.text]) {
      assert.ok(s && s.length < 400, id);
      assert.doesNotMatch(s, HOOK_FORBIDDEN, `${id}: ${s}`);
      assert.doesNotMatch(s, DROP_FORBIDDEN, `${id}: ${s}`);
      assert.equal(hasBrandName(s), false, `${id}: ${s}`);
    }
  }
});

test("a product finds its words by the AliExpress id or the catalog id", () => {
  assert.equal(pitchFor({ id: "ae-1005012613833998" }).title, "מעמד טלפון לרכב");
  assert.equal(pitchFor({ aliexpressId: "1005012613833998" }).title, "מעמד טלפון לרכב");
  assert.equal(pitchFor({ id: "p-live-01" }), null);
});

test("the default template uses the written words, and a product without them loses the empty line", () => {
  const tpl = defaultTemplate();
  assert.match(tpl, /\{pitch\}/);
  const withPitch = renderTemplate(tpl, { id: "ae-1005012613833998", title: "store words" }, "https://x/p/1");
  assert.match(withPitch, /^#פרסומת · קישור שותפים\n🛍️ מעמד טלפון לרכב\nנתפס בפתח המזגן/);
  const plain = renderTemplate(tpl, { id: "p-live-01", title: "טבעת" }, "https://x/p/2");
  assert.doesNotMatch(plain, /\n\n/);
  assert.match(plain, /🛍️ טבעת\nתמונות/);
});

test("an album is the store's own photos, main first, at most five, never stock or generated", () => {
  const cdn = (n) => `https://ae-pic-a1.aliexpress-media.com/kf/S${n}.jpg`;
  const p = { image: cdn(1), images: [cdn(1), cdn(2), "https://images.unsplash.com/x.jpg", "http://ae-pic-a1.aliexpress-media.com/kf/S3.jpg", cdn(4), cdn(5), cdn(6), cdn(7)] };
  assert.deepEqual(telegramAlbum(p), [cdn(1), cdn(2), cdn(4), cdn(5), cdn(6)]);
  assert.deepEqual(telegramAlbum({ image: cdn(1) }), [], "one photo is not an album");
  assert.deepEqual(telegramAlbum({ image: cdn(9), ugcImage: cdn(9), images: [cdn(9), cdn(8)] }), [], "the generated picture never leads an album");
});

test("a template saved before {pitch} existed still shows the words under the name", () => {
  const old = "#פרסומת · קישור שותפים\n🛍️ {name}\nתמונות, מה לבדוק לפני שקונים, והקישור לחנות 👇\n{link}";
  const out = renderTemplate(old, { id: "ae-1005012986704439" }, "https://x/p/3");
  assert.match(out, /🛍️ רצועה נשלפת לכלב\nארוכה כשהכלב/);
  assert.equal(renderTemplate(old, { id: "p-live-01", title: "טבעת" }, "https://x/p/4"), old.replace("{name}", "טבעת").replace("{link}", "https://x/p/4"));
});
