// The owner's own phone clips edited UGC-style (scripts/marketing/ugc-edit.mjs): the lines burned into the
// video pass the site's claim rules, one comment keyword, and the captions follow her video's timing.
import test from "node:test";
import assert from "node:assert/strict";
import { ugcProblems, captionTimes, overlayHtml } from "../scripts/marketing/ugc-edit.mjs";

const job = { id: "t", hook: "חברה ביקשה ממני קישור לסקווישי", beats: [{ at: 2.4, text: "ככה אני בודקת לפני שאני שולחת" }, { at: 5, text: "מדביקה את הקישור בכפתור הקסם" }], keyword: "קסם", endLine: "רוצה לבדוק לבד?" };

test("a clean job passes; claims, brands and a missing keyword are refused", () => {
  assert.deepEqual(ugcProblems(job), []);
  assert.ok(ugcProblems({ ...job, hook: "הכי נמכר באתר, נשארו רק 3!" }).length > 0);
  assert.ok(ugcProblems({ ...job, beats: [{ at: 3, text: "כמו של Lululemon" }] }).some((p) => p.startsWith("brand")));
  assert.ok(ugcProblems({ ...job, keyword: "" }).length > 0);
  assert.ok(ugcProblems({ ...job, keyword: "שתי מילים" }).length > 0);
});

test("the hook holds at least 2.2 s, then each beat until the next, cut at the clip's end", () => {
  const t = captionTimes(job, 9);
  assert.deepEqual(t.map((c) => c.part), ["hook", "b0", "b1"]);
  assert.equal(t[0].from, 0); assert.equal(t[0].to, 2.4);
  assert.equal(t[2].to, 9);
  assert.equal(captionTimes({ ...job, beats: [{ at: 1, text: "x" }] }, 9)[0].to, 2.2);
});

test("a product clip carries the disclosure on every frame; the end card asks for the one keyword", () => {
  const html = overlayHtml({ ...job, ad: true });
  assert.match(html.labels, /#פרסומת · קישור שותפים/);
  assert.match(html.end, /כתבי ״קסם״/);
  assert.equal(overlayHtml(job).labels, "");
});
