// The daily drop (src/lib/growth/dailyDrop.js + scripts/marketing/daily-drop.mjs):
// sales copy that stays true. The disclosure opens every post, no urgency,
// prices or invented proof, a trend only when it really matches the product,
// and "we filmed it" only for footage a person filmed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DROP_AD, DROP_FORBIDDEN, buildDrop, dropHooks, pickProduct, safeCopy } from "../src/lib/growth/dailyDrop.js";
import { dropPage } from "../scripts/marketing/daily-drop.mjs";
import { listedFromSnapshot } from "../scripts/prerender-products.mjs";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

const snap = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8"));
const products = listedFromSnapshot(snap).products.map((x) => x.product);
const reels = [
  { id: "seller-p-live-02", productId: "p-live-02", video: "seller-p-live-02.mp4", look: "seller", labels: ["צילום המוצר: המוכר"] },
  { id: "seller-p-live-05", productId: "p-live-05", video: "seller-p-live-05.mp4", look: "seller", labels: ["צילום המוצר: המוכר"] },
  { id: "luna-ring-size-a", productId: "p-live-01", video: "ring-size-a.mp4", look: "talking", labels: ["דמות וקול שנוצרו בבינה מלאכותית"] },
];
const DAY = 86_400_000;

test("urgency, prices and invented proof never pass", () => {
  for (const bad of ["רק היום!", "נשארו אחרונים", "מבצע מטורף", "ב־₪49 בלבד", "50% הנחה", "הכי זול ברשת", "קניתי ואני מתה על זה"]) assert.equal(safeCopy(bad), false, bad);
  assert.equal(safeCopy("עצרי שנייה. תסתכלי על זה מקרוב"), true);
  assert.ok(DROP_FORBIDDEN instanceof RegExp);
});

test("every post opens with the disclosure, carries its own tracked link and names who made the video", () => {
  const pick = pickProduct({ products, reels, now: Date.UTC(2026, 9, 10) });
  const d = buildDrop({ ...pick, now: Date.UTC(2026, 9, 10) });
  const p = d.posts;
  for (const text of [p.tiktok.caption, p.instagram.caption, p.shorts.description, p.whatsapp.text, p.telegram.text, p.facebook.text]) {
    assert.ok(text.startsWith(DROP_AD), `disclosure first: ${text.slice(0, 40)}`);
    assert.ok(safeCopy(text.replace(/https?:\/\/\S+/g, "")), "the whole post passes the rules");
  }
  for (const [net, text] of [["whatsapp", p.whatsapp.text], ["telegram", p.telegram.text], ["facebook", p.facebook.text], ["youtube", p.shorts.description]]) {
    const link = `${PRODUCTION_ORIGIN}/p/${d.product.id}?utm_source=${net}&utm_medium=social&utm_campaign=daily_drop_20261010`;
    assert.ok(text.includes(link), `${net} carries ${link}`);
  }
  assert.match(p.tiktok.bioLink, /utm_source=tiktok/);
  assert.match(p.instagram.caption, /צילום המוצר: המוכר|דמות AI|צילום אמיתי/);
  assert.ok(d.hooks.length >= 3 && d.hooks.every(safeCopy));
});

test("a trend is used only when it really matches a product", () => {
  const none = pickProduct({ products, reels, trends: [{ term: "מכבי תל אביב", source: "google_trends_rss_IL" }], now: 0 });
  assert.notEqual(none.reason, "trend");
  const d0 = buildDrop({ ...none, now: 0 });
  assert.ok(!d0.hooks.some((h) => /מכבי/.test(h)) && !d0.hashtags.some((t) => /מכבי/.test(t)));
  const hit = pickProduct({ products, reels, trends: [{ term: "עגילים", source: "google_trends_rss_IL", observedAt: "2026-10-10" }], now: 0 });
  assert.equal(hit.reason, "trend");
  assert.equal(hit.product.id, "p-live-05");
  const d = buildDrop({ ...hit, now: 0 });
  assert.match(d.hooks[0], /עגילים/);
  assert.equal(d.hashtags[0], "#עגילים");
  assert.equal(d.trend.source, "google_trends_rss_IL");
});

test("'we filmed it ourselves' only for footage a person filmed; Luna is named as AI", () => {
  const product = products.find((p) => p.id === "p-live-01");
  assert.ok(dropHooks(product, { reel: { look: "real" } }).some((h) => /צילמנו/.test(h)));
  assert.ok(!dropHooks(product, { reel: { look: "seller" } }).some((h) => /צילמנו/.test(h)));
  const luna = buildDrop({ product, reel: reels[2], now: 0 });
  assert.match(luna.posts.tiktok.caption, /דמות AI/);
});

test("every product with a video gets its day; the page is unlisted and escapes text", () => {
  const seen = new Set(Array.from({ length: 6 }, (_, i) => pickProduct({ products, reels, now: i * DAY }).product.id));
  assert.deepEqual([...seen].sort(), ["p-live-01", "p-live-02", "p-live-05"]);
  const evil = { ...products[0], title: '<script>alert(1)</script>' };
  const html = dropPage(buildDrop({ product: evil, reel: reels[0], now: 0 }));
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch(html, /<script>alert/);
  const wf = readFileSync(new URL("../.github/workflows/deploy-frontend.yml", import.meta.url), "utf8");
  assert.match(wf, /cron: "40 3 \* \* \*"/);
  assert.ok(wf.indexOf("scripts/reels-feed.mjs") < wf.indexOf("scripts/marketing/daily-drop.mjs"), "the drop reads the fresh reels feed");
});
