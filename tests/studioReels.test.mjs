// The Studio's "סרטון קצר לכל מוצר" screen (src/components/studio/UGCCampaignStudio.jsx).
// The owner, 2026-10-28, on her iPhone: "nothing really works — no response
// even though it said ready". What happened:
//   - entering the screen rendered and uploaded a reel for all 40 products by
//     itself (78 MB per visit), and pushed older reels out of the shared list;
//   - every card got a <video> at once, and each played the cloud copy before
//     the server had linked it to its product (until then it is not public),
//     so iPhone Safari showed the cannot-play icon and never retried;
//   - "CLOUD READY" was shown on an upload alone; "צור / רענן" did nothing
//     once a render existed; the reel was one photo, 3 seconds.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/studio/UGCCampaignStudio.jsx", import.meta.url), "utf8");
const code = src.replace(/^\s*\/\/.*$/gm, "");

test("nothing renders or uploads by itself: only a button starts it", () => {
  assert.doesNotMatch(code, /useEffect\(\(\) => \{[^}]*renderAll\(/s, "no effect starts the batch");
  assert.doesNotMatch(code, /startedRef/);
  assert.match(code, /window\.confirm\(/, "the batch asks first and names how many");
  assert.match(code, /!savedReelOf\(p\)/, "the batch skips products that already have a saved reel");
});

test("one video player at a time, and the phone plays its own recording first", () => {
  assert.equal((code.match(/<video\b/g) || []).length, 1);
  assert.match(code, /playing === product\.id/);
  assert.match(code, /localUrl/);
  assert.match(code, /onError=\{/, "a video that does not load says so");
});

test("available only when the cloud serves it back; no English status claims", () => {
  assert.doesNotMatch(code, /CLOUD READY|LOCAL PREVIEW|READY TO GENERATE/);
  assert.match(code, /async function cloudCopyServes/);
  assert.match(code, /Range: "bytes=0-1"/, "the check reads two bytes, never the whole file");
  assert.match(code, /status: serves \? "ready" : "saved"/);
});

test("the card's button really makes the reel again, with progress", () => {
  assert.match(code, /renderOne\(product, activeStyle, \{ force: true \}\)/);
  assert.match(code, /status: "rendering", progress: 0/);
});

test("the reel uses the product's store gallery and is never called UGC", () => {
  assert.match(code, /Array\.isArray\(p\?\.images\)/);
  assert.doesNotMatch(code, /label: "UGC"/);
  assert.match(code, /לא צילום של אדם ולא UGC אמיתי/);
});
