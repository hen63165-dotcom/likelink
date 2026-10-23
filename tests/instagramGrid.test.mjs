// "האינסטגרם של LikeLink2": nine posts in one look (the owner's example,
// 2026-10-22: @ravitrecommends — one character style, a name tag, one hook
// bar, tips before products). These tests pin the truth rules on top of the
// look: real product photos, the ad disclosure first on product posts, the AI
// label on the character, copy that passes the rules, nothing posted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TAG, BRAND_TAG, GRID_ORDER, gridIsClean, instagramGrid, tipChecks } from "../src/lib/growth/instagramGrid.js";
import { DROP_AD } from "../src/lib/growth/dailyDrop.js";
import { isGuidePost } from "../scripts/instagram/comment-bot.mjs";
import { postHtml } from "../scripts/marketing/instagram-grid.mjs";

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
