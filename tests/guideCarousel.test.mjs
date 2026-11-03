// The saved-post carousel (scripts/marketing/guide-carousel.mjs): every slide
// is Luna's guide as the site shows it at /guide, and the caption keeps the
// site's rules (the disclosure for the affiliate examples, no invented claims).
import test from "node:test";
import assert from "node:assert/strict";
import { slides, caption } from "../scripts/marketing/guide-carousel.mjs";
import { GUIDE, GUIDE_PATH } from "../src/lib/guide.js";

test("the carousel is the guide: a cover, one slide per check in the site's words, and the closing slide", () => {
  const list = slides();
  assert.equal(list.length, GUIDE.checks.length + 2);
  assert.equal(list.length, 10, "Instagram's carousel sweet spot: 10 slides");
  assert.equal(list[0].title, GUIDE.title.he);
  GUIDE.checks.forEach((c, i) => {
    assert.equal(list[i + 1].title, c.title.he);
    assert.equal(list[i + 1].body, c.body.he, "the slide says exactly what /guide says");
  });
  const end = list.at(-1);
  assert.ok(end.link.endsWith(GUIDE_PATH) && !/likelink\.(com|to)/.test(end.link));
  assert.match(end.disclosure, /#פרסומת/);
});

test("the caption asks for the save and the send, names the disclosure and promises nothing", () => {
  const text = caption();
  assert.match(text, /שמרי/);
  assert.match(text, /שלחי לחברה/);
  assert.match(text, /#פרסומת/);
  assert.match(text, /בתגובה הראשונה/);
  assert.doesNotMatch(text, /רוצה" בתגובות|הכי נמכר|ביקורות|כוכבים|מובטח|ויראלי|רק היום|נשארו|₪|\$|הכנסה|להרוויח/);
  assert.ok(text.length <= 2200, "Instagram's caption limit");
});
