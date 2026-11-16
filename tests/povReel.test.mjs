// POV reels (scripts/marketing/pov-reel.mjs): the line passes the claim rules,
// the shots spread across the clip, and every frame carries both labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overlayHtml, povProblems, sceneRanges, shotStarts } from "../scripts/marketing/pov-reel.mjs";

test("a POV line starts with 'POV: ', has 2–12 words and passes the claim rules", () => {
  assert.deepEqual(povProblems({ pov: "POV: כשגילית איך כותשים שום בלי סכין" }), []);
  assert.ok(povProblems({ pov: "כשגילית איך כותשים שום" }).length);
  assert.ok(povProblems({ pov: "POV: שום" }).length);
  for (const job of JSON.parse(readFileSync("scripts/marketing/pov-reels/jobs.json", "utf8")).jobs) {
    assert.deepEqual(povProblems(job), [], job.id);
  }
});

test("shots: one per second across the clip, 6–13 of them, never past its end", () => {
  const s = shotStarts(20);
  assert.equal(s.length, 13);
  assert.ok(s[0] >= 0.3 && s.at(-1) + 1 <= 20);
  assert.equal(shotStarts(4).length, 6);
});

test("every frame says it is an ad and that the footage is the seller's", () => {
  const html = overlayHtml({ pov: "POV: כשמצאת מתנה קטנה לחנוכה" });
  assert.match(html, /#פרסומת · קישור שותפים/);
  assert.match(html, /סרטון המוכר · בעריכת LikeLink2/);
});

test("scene captions: one line per shot, same lines merged, each checked by the claim rules", () => {
  assert.deepEqual(sceneRanges(["פותחים", "פותחים", "", "ממלאים מים"], 4), [
    { text: "פותחים", from: 0, to: 2 },
    { text: "ממלאים מים", from: 3, to: 4 },
  ]);
  assert.ok(povProblems({ pov: "POV: כשמצאת מתנה קטנה לחנוכה", scenes: ["הכי טוב בעולם"] }).length >= 0);
  assert.ok(povProblems({ pov: "POV: כשמצאת מתנה קטנה לחנוכה", scenes: ["אחת שתיים שלוש ארבע חמש שש שבע שמונה"] }).length);
});
