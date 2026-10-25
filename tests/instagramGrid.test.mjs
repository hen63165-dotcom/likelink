// "האינסטגרם של LikeLink2": nine posts in one look (the owner's example,
// 2026-10-22: @ravitrecommends — one character style, a name tag, one hook
// bar, tips before products). These tests pin the truth rules on top of the
// look: real product photos, the ad disclosure first on product posts, the AI
// label on the character, copy that passes the rules, nothing posted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TAG, BRAND_TAG, GRID_ORDER, gridIsClean, instagramGrid, STORY_STEPS, storyCards, tipChecks } from "../src/lib/growth/instagramGrid.js";
import { DROP_AD } from "../src/lib/growth/dailyDrop.js";
import { isGuidePost } from "../scripts/instagram/comment-bot.mjs";
import { gridPage, postHtml } from "../scripts/marketing/instagram-grid.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const P = (id, title, description = "") => ({ id, title, description, category: "Accessories" });
const products = [
  P("r1", "טבעת כסף 925 קלאסית עם זרקון מרקיז", "טבעת מכסף 925."),
  P("b1", "צמיד טניס מואסניט מצופה פלטינה"),
  P("b2", "צמיד טניס מואסניט מצופה זהב לבן"),
  P("h1", "שרשרת יד מצופה 14K עם תליוני מואסניט"),
  P("e1", "עגילי מואסניט ורודים"),
];
const imageOf = (p) => `https://ae-pic-a1.aliexpress-media.com/kf/${p.id}.jpg`;

test("nine posts in grid order: a tip opens each row, products have their own photo", () => {
  const posts = instagramGrid({ products, imageOf, presenter: ["face-1.png", "face-2.png"] });
  assert.equal(posts.length, 9);
  assert.deepEqual(posts.map((p) => p.kind), [...GRID_ORDER]);
  for (const p of posts.filter((x) => x.kind === "product")) assert.equal(p.image, imageOf({ id: p.productId }), "a product post shows that product's own photo");
  const tips = posts.filter((x) => x.kind === "tip");
  assert.deepEqual([...new Set(tips.map((t) => t.image))], ["face-1.png", "face-2.png"], "the character's frames take turns");
  assert.ok(tips.every((t) => !t.inset || t.inset === imageOf({ id: t.insetProductId })), "a tip's small picture is a product the tip talks about");
});

test("every post: the name tag; product posts open with the disclosure; the character is labelled AI", () => {
  const posts = instagramGrid({ products, imageOf, presenter: "face.png" });
  assert.ok(gridIsClean(posts), "no price, urgency or superlative on a picture or in a caption");
  for (const p of posts) {
    assert.ok(p.tags.includes(BRAND_TAG));
    if (p.kind === "product") {
      assert.ok(p.caption.startsWith(DROP_AD));
      assert.ok(p.tags.includes("#פרסומת"));
      assert.match(p.caption, /כתבי "רוצה"/, "the comment bot answers 'רוצה' with the link");
    } else {
      assert.ok(p.tags.includes(AI_TAG));
      assert.match(p.caption, /דמות AI/);
    }
    if (p.kind === "tip") assert.ok(isGuidePost(p.caption), "the comment bot answers 'מדריך' with the guide");
  }
});

test("a store title with a price or 'sale' never reaches a post; no picture, no post", () => {
  const loud = [P("x", "Hot SALE 50% טבעת ₪9.99 הכי טוב", "מבצע רק היום")];
  const posts = instagramGrid({ products: loud, imageOf, presenter: "" });
  assert.equal(posts.length, 1);
  assert.ok(gridIsClean(posts));
  assert.doesNotMatch(posts[0].caption + posts[0].sub, /₪|50%|מבצע|הכי טוב/);
  assert.deepEqual(instagramGrid({ products, imageOf: () => "", presenter: "" }), [], "never a post without a real picture");
  assert.ok(tipChecks(products).length >= 3);
});

test("the picture carries the tag, the labels and the hook bar; the page is built on every deploy", () => {
  const [post] = instagramGrid({ products, imageOf, presenter: "face.png" });
  const html = postHtml(post);
  assert.match(html, /LikeLink2 ממליצה/);
  assert.match(html, /דמות AI/);
  assert.match(html, /class="hook"/);
  const wf = read(".github/workflows/deploy-frontend.yml");
  assert.match(wf, /node scripts\/marketing\/instagram-grid\.mjs dist/);
  assert.doesNotMatch(read("scripts/marketing/instagram-grid.mjs"), /graph\.facebook\.com|media_publish/, "nothing is posted from here");
});

test("Luna's stories (2026-10-23, the owner's example): a reel to post, then the story's link sticker to the product page", () => {
  const caption = `${DROP_AD}\nהחתונה הערב, והיד נראית ריקה?\n\n👇 כתבי "רוצה" בתגובות ואשלח לך את הקישור בפרטי\n🎬 דמות וקול שנוצרו בבינה מלאכותית`;
  const ok = { id: "story-wedding-a", productId: "p-live-03", video: "story-wedding-a.mp4", title: "החתונה הערב", seconds: 27, caption };
  const cards = storyCards([ok, { ...ok, id: "no-ad", caption: caption.replace(DROP_AD, "") }, { ...ok, id: "loud", caption: `${caption}\nרק היום!` }, { ...ok, id: "x", productId: "" }]);
  assert.deepEqual(cards.map((c) => c.id), ["story-wedding-a"], "only a story with the disclosure first, clean copy and a product");
  assert.match(cards[0].link, /\/p\/p-live-03\?utm_source=instagram&utm_medium=story/);
  assert.ok(STORY_STEPS.some((s) => /תווית AI/.test(s)) && STORY_STEPS.some((s) => /קישור/.test(s)));
  const html = gridPage([], {}, { stories: cards });
  assert.match(html, /הסטוריז של לונה/);
  assert.match(html, /media\/stories\/story-wedding-a\.mp4/);
  assert.doesNotMatch(gridPage([], {}, {}), /הסטוריז של לונה/, "no stories, no section");
  assert.match(read("scripts/reels-feed.mjs"), /storyReels\(withMeta, listed\)/, "the deploy copies the stories next to the site");
});

test("the luxe sets (2026-10-23, 'the white pictures are awful'): the seller's photo on our backdrop, said so on the post", () => {
  const sets = JSON.parse(read("public/sets/index.json"));
  const listed = JSON.parse(read("public/snapshot/kv.json")).keys["marketplace:products"].filter((p) => p.status === "approved").map((p) => p.id);
  assert.match(sets.label, /תמונת המוכר/);
  assert.match(sets.label, /רקע: LikeLink2/, "the background is ours and the post says so");
  for (const [id, set] of Object.entries(sets.sets)) {
    assert.ok(listed.includes(id), `${id} is a listed product`);
    assert.ok(readFileSync(new URL(`../public/sets/${set.file}`, import.meta.url)).length > 10_000, `${set.file} exists`);
    // A set that is not on our backdrop (a still of the seller's video) says what it is, whose it is and that we edited it.
    if (set.label) assert.match(set.label, /המוכר.*LikeLink2/, `${id}: its own label names the seller and LikeLink2`);
  }
  assert.match(read("scripts/marketing/instagram-grid.mjs"), /note: set\.label \|\| sets\.label/, "the post carries the set's own label when it has one");
  const posts = instagramGrid({ products, imageOf: (p) => (["e1", "r1"].includes(p.id) ? { src: `../sets/${p.id}.jpg`, note: sets.label } : imageOf(p)), presenter: "face.png" });
  const e1 = posts.find((p) => p.productId === "e1");
  assert.equal(e1.image, "../sets/e1.jpg");
  assert.equal(e1.imageNote, sets.label);
  const setTips = posts.filter((p) => p.insetProductId === "r1");
  assert.ok(setTips.length, "a tip shows the set as its small picture");
  for (const tip of setTips) assert.equal(tip.imageNote, `בתמונה הקטנה: ${sets.label}`, "a tip's small picture keeps the set's label");
  assert.match(gridPage(posts), /המאסטר/);
});
