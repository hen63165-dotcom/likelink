// Instagram comment → private message bot (scripts/instagram/comment-bot.mjs).
// Pins who gets a message and what it says: only people who asked for the link
// in a comment, once, within Instagram's 7-day private-reply window, with the
// product's own link and the ad disclosure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_PER_RUN, asksForLink, plan, privateMessage, productForCaption } from "../scripts/instagram/comment-bot.mjs";

const products = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];
const p = products.find((x) => x.id === "p-live-02");
const now = Date.parse("2026-10-09T12:00:00Z");
const iso = (hoursAgo) => new Date(now - hoursAgo * 3_600_000).toISOString();

test("asksForLink: the keyword as a word, not a refusal", () => {
  for (const t of ["רוצה", "רוצההה!!", "אני רוצה 😍", "לינק בבקשה", "Link pls", "קישור?"]) assert.ok(asksForLink(t), t);
  for (const t of ["לא רוצה", "יפה מאוד", "", "רוצהלי", "מרוצה מאוד"]) assert.ok(!asksForLink(t), t);
});

test("productForCaption: the post's caption names the product by its exact title", () => {
  assert.equal(productForCaption(`מחפשת תכשיט?\n\n${p.title}\nעוד טקסט`, products)?.id, "p-live-02");
  assert.equal(productForCaption("סתם פוסט בלי מוצר", products), null);
});

test("privateMessage: the product's own link and the ad disclosure", () => {
  const m = privateMessage(p);
  assert.ok(m.includes(p.affiliateUrl));
  assert.match(m, /#פרסומת · קישור שותפים/);
  assert.doesNotMatch(m, /(קניתי|ניסיתי|הכי נמכר|נגמר|מבצע)/);
});

test("plan: only fresh link requests from other people, each answered once", () => {
  const media = [{
    id: "m1",
    caption: `hook\n\n${p.title}`,
    comments: [
      { id: "c1", text: "רוצה", username: "dana", timestamp: iso(2) },
      { id: "c2", text: "רוצה", username: "noa", timestamp: iso(3), replies: [{ username: "MyShop" }] }, // already handled
      { id: "c3", text: "וואו יפה", username: "eli", timestamp: iso(1) }, // not a request
      { id: "c4", text: "רוצה", username: "late", timestamp: iso(24 * 8) }, // outside the 7-day window
      { id: "c5", text: "רוצה", username: "myshop", timestamp: iso(1) }, // the account itself
    ],
  }, { id: "m2", caption: "פוסט בלי מוצר", comments: [{ id: "c9", text: "רוצה", username: "x", timestamp: iso(1) }] }];
  const todo = plan({ media, products, ownUsername: "myshop", now });
  assert.deepEqual(todo.map((t) => t.commentId), ["c1"]);
  assert.equal(todo[0].productId, "p-live-02");
});

test("plan: a burst is capped per run", () => {
  const comments = Array.from({ length: MAX_PER_RUN + 10 }, (_, i) => ({ id: `c${i}`, text: "רוצה", username: `u${i}`, timestamp: iso(1) }));
  assert.equal(plan({ media: [{ id: "m", caption: p.title, comments }], products, ownUsername: "me", now }).length, MAX_PER_RUN);
});

test("a guide post answers 'מדריך' with the site's free guide, and only on guide posts", async () => {
  const { isGuidePost } = await import("../scripts/instagram/comment-bot.mjs");
  const now = Date.parse("2026-10-10T12:00:00Z");
  const at = new Date(now - 3_600_000).toISOString();
  const caption = 'רוצה את המדריך המלא?\n👇 כתבי "מדריך" בתגובות ואשלח לך את המדריך החינמי בפרטי';
  assert.ok(isGuidePost(caption));
  const media = [
    { id: "g1", caption, comments: [
      { id: "c1", text: "מדריך!!", username: "a", timestamp: at },
      { id: "c2", text: "לא צריכה", username: "b", timestamp: at },
      { id: "c3", text: "מדריך", username: "c", timestamp: at, replies: [{ username: "me" }] },
    ] },
    { id: "p1", caption: products[0].title, comments: [{ id: "c4", text: "מדריך", username: "d", timestamp: at }] },
  ];
  const todo = plan({ media, products, ownUsername: "me", now, origin: "https://hen63165-dotcom.github.io/likelink" });
  assert.deepEqual(todo.map((t) => t.commentId), ["c1"], "only the guide post; a product post does not answer 'מדריך'");
  assert.equal(todo[0].productId, "guide");
  assert.match(todo[0].message, /^היי! הנה המדריך החינמי/);
  assert.match(todo[0].message, /https:\/\/hen63165-dotcom\.github\.io\/likelink\/guide\?utm_source=instagram&utm_medium=dm&utm_campaign=guide/);
  assert.match(todo[0].message, /#פרסומת/);
});
