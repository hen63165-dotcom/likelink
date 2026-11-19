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

test("the radar's HOT products come first, then the newly added ones", () => {
  const products = [
    P("old", { createdAt: NOW - 10 * 86_400_000, importSource: "aliexpress-deals" }),
    P("new1", { createdAt: NOW - 3_600_000, importSource: "aliexpress-trend-board" }),
    P("hot1"), P("hot2"),
  ];
  const picks = pickKit({ products, keepIds: ["hot2", "missing", "hot1"], now: NOW });
  assert.deepEqual(picks.map((x) => [x.product.id, x.why]), [["hot2", "hot"], ["hot1", "hot"], ["new1", "new"]]);
});

test("a post: the disclosure first, the buy line, a tracked link, a dated store price only from the store", () => {
  const post = waPost(P("ae-1", { price: 24.39, priceSource: "aliexpress_api", priceCheckedAt: "2026-11-19T06:00:00Z" }), { now: NOW });
  const lines = post.text.split("\n");
  assert.equal(lines[0], WA_AD);
  assert.ok(lines.includes(WA_BUY));
  assert.equal(lines.at(-1), "https://likelink2.vercel.app/p/ae-1?utm_source=whatsapp&utm_medium=group&utm_campaign=wa_20261119");
  assert.match(post.text, /מחיר בחנות: מ־₪24\.39 \(נבדק ב־19\.11\)/);
  assert.equal(post.images.length, 2, "https photos only, at most four");
  const noSource = waPost(P("ae-2", { price: 50 }), { now: NOW });
  assert.match(noSource.text, /המחיר המעודכן מופיע בחנות/);
  assert.doesNotMatch(noSource.text, /₪/, "a hand-entered price is never printed");
  assert.doesNotMatch(post.text, /מקורי|1:1|אחד לאחד|רפליקה|העתק|זהה ל/);
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
