// The WhatsApp group kit (src/lib/growth/whatsappKit.js; the owner, 2026-11-19: posts that look exactly like
// the Israeli deals groups' — a photo collage, a few lines, "לרכישה 👇" and a link). True and legal: listed
// products only, no brand name, the radar's HOT ones first, the disclosure in every post, a store price only
// with its source and date, and no program posting into WhatsApp (the page hands each post to the share sheet).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WA_AD, WA_BUY, kitOf, pickKit, waEligible, waPost } from "../src/lib/growth/whatsappKit.js";
import { kitPage } from "../scripts/marketing/whatsapp-kit.mjs";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const P = (id, extra = {}) => ({
  id, status: "approved", title: `מוצר ${id}`, affiliateUrl: "https://s.click.aliexpress.com/e/_abc", image: "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg",
  images: ["https://ae-pic-a1.aliexpress-media.com/kf/a.jpg", "https://ae-pic-a1.aliexpress-media.com/kf/b.jpg", "http://x/c.jpg"], kind: "clothing", ...extra,
});

test("only listed, own-link, real-photo items without a brand name reach the group", () => {
  assert.equal(waEligible(P("a")), true);
  assert.equal(waEligible(P("b", { title: "סט יוגה של Alo" })), false, "a brand name never");
  assert.equal(waEligible(P("c", { storeTitle: "UGG mini boots" })), false, "nor in the store's own title");
  assert.equal(waEligible(P("d", { affiliateUrl: "https://www.aliexpress.com/item/1.html" })), false, "her own tracked link only");
  assert.equal(waEligible(P("e", { status: "archived" })), false);
  assert.equal(waEligible(P("f", { imageProvenance: "stock_photo" })), false);
});

test("the group gets the looks only; the claim filter keeps what a photo shows", () => {
  const kit = kitOf({ products: [P("look1"), P("home1", { kind: "home" })], keepIds: ["home1", "look1"], now: NOW });
  assert.deepEqual(kit.posts.map((x) => x.id), ["look1"], "מועדון הדיופים: fashion, beauty, bags, shoes, jewellery");
  const warm = waPost(P("w", { storeTitle: "נעלי בית פרוותיות לנשים, חמות ונעימות לחורף, סוליה רכה, עם פפיון, 100% כותנה" }), { now: NOW });
  assert.match(warm.text, /\nעם פפיון\n/);
  assert.doesNotMatch(warm.text, /חמות|רכה|כותנה|100%/);
});

test("the looks first (HOT, then newly added), then the radar's other HOT products", () => {
  const products = [
    P("old", { createdAt: NOW - 10 * 86_400_000, importSource: "aliexpress-deals" }),
    P("new1", { createdAt: NOW - 3_600_000, importSource: "aliexpress-trend-board" }),
    P("newHome", { kind: "home", createdAt: NOW - 3_600_000, importSource: "aliexpress-trend-board" }),
    P("hot1"), P("hot2"), P("hotPet", { kind: "pets" }),
  ];
  const picks = pickKit({ products, keepIds: ["hotPet", "hot2", "missing", "hot1"], now: NOW });
  assert.deepEqual(picks.map((x) => [x.product.id, x.why]), [["hot2", "hot"], ["hot1", "hot"], ["new1", "new"], ["hotPet", "hot"], ["newHome", "new"]]);
});

test("a post in the groups' format: hook, the seller's words, tip, dated store price, buy line, link, disclosure", () => {
  const post = waPost(P("ae-1", { title: "טייץ יוגה מתרחב לנשים בגזרה גבוהה", storeTitle: "טייץ יוגה מתרחב לנשים, מותן גבוה, שליטה בבטן, מכנסיים מתרחבים", price: 24.39, priceSource: "aliexpress_api", priceCheckedAt: "2026-11-19T06:00:00Z" }), { now: NOW });
  const lines = post.text.split("\n");
  assert.match(lines[0], /טייץ יוגה מתרחב/, "the hook names the item");
  assert.ok(lines.includes("מותן גבוה, מכנסיים מתרחבים"), "what the photos show, in the store's own words");
  assert.doesNotMatch(post.text, /שליטה בבטן|לפי תיאור המוכר/, "a seller's claim (tummy control) is left out");
  assert.ok(lines.includes(WA_BUY));
  assert.equal(lines[lines.indexOf(WA_BUY) + 1], "https://likelink2.vercel.app/p/ae-1?utm_source=whatsapp&utm_medium=group");
  assert.equal(lines.at(-1), WA_AD, "the disclosure on its own line in every post");
  assert.match(post.text, /מחיר בחנות: מ־₪24\.39 \(נבדק ב־19\.11\)/);
  assert.equal(post.images.length, 2, "https photos only, at most four");
  const noSource = waPost(P("ae-2", { price: 50 }), { now: NOW });
  assert.match(noSource.text, /המחיר המעודכן מופיע בחנות/);
  assert.doesNotMatch(noSource.text, /₪/, "a hand-entered price is never printed");
  assert.doesNotMatch(post.text, /מקורי|1:1|אחד לאחד|רפליקה|העתק|זהה ל/);
  // 19.11: posts printed "נבדק ב־26.10" — a store price older than a week is not printed.
  const stale = waPost(P("ae-3", { price: 11.19, priceSource: "aliexpress_api", priceCheckedAt: "2026-10-26T06:00:00Z" }), { now: NOW });
  assert.match(stale.text, /המחיר המעודכן מופיע בחנות/);
  assert.doesNotMatch(stale.text, /₪|26\.10/);
});

test("no hook says 'הזה' after a name that may be plural or feminine", () => {
  for (let i = 0; i < 4; i++) {
    const hook = waPost(P("ae-4", { title: "גרביים לגברים גרבי חורף עבות" }), { now: NOW, i }).text.split("\n")[0];
    assert.doesNotMatch(hook, /הזה|הזאת/);
  }
});

test("the page sends through the share sheet, escapes the text and is never indexed", () => {
  const kit = kitOf({ products: [P("x<y", { title: "<b>טייץ</b>" })], now: NOW });
  const html = kitPage({ day: kit.day, posts: kit.posts.map((p) => ({ ...p, file: "x.jpg" })) });
  assert.match(html, /noindex/);
  assert.match(html, /navigator\.share\(\{ files: \[file\], text: text \}\)/);
  assert.ok(!html.includes("<b>טייץ</b>"));
  const deploy = readFileSync(".github/workflows/deploy-frontend.yml", "utf8");
  assert.match(deploy, /node scripts\/marketing\/whatsapp-kit\.mjs dist/);
});
