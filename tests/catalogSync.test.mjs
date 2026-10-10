// AliExpress catalog sync (scripts/catalog/sync-aliexpress.mjs): only what the
// store's official API reports is written — shekel prices with their date, a
// real list price only when higher, the store's own gallery and the seller's
// own video. No key → nothing is asked or changed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aliItemId, applyFacts, storeFacts, sync } from "../scripts/catalog/sync-aliexpress.mjs";
import { classifyMediaRecord, MEDIA_TRUTH } from "../src/lib/discovery/mediaTruth.js";

const products = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];
const NOW = Date.parse("2026-10-10T05:10:00Z");
const api = (over = {}) => ({
  product_id: 1005004921269497, target_sale_price: "212.5", target_sale_price_currency: "ILS", target_original_price: "354.17", target_original_price_currency: "ILS",
  product_main_image_url: "https://ae-pic-a1.aliexpress-media.com/kf/main.jpg",
  product_small_image_urls: { string: ["https://ae-pic-a1.aliexpress-media.com/kf/main.jpg", "http://ae-pic-a1.aliexpress-media.com/kf/clean.jpg"] },
  product_video_url: "https://video.aliexpress-media.com/play/u/ae_sg_item/1/p/1/e/6/t/10301/1100.mp4",
  lastest_volume: 999, evaluate_rate: "99.9%",
  ...over,
});

test("each catalog product maps to the store item its buy link opens", () => {
  // Verified live: s.click links redirect to these /item/<id>.html pages (aliexpress.us ids are + 2^51).
  assert.deepEqual(products.slice(0, 4).map(aliItemId), ["1005012172715734", "1005003988491408", "1005004921269497", "1005009615326128"]);
  assert.equal(aliItemId({ imageSource: { itemUrl: "https://www.aliexpress.com/item/1005008160126482.html" } }), "1005008160126482");
  assert.equal(aliItemId({}), "");
});

test("store facts: ILS only, a list price only when higher, the store's gallery and video; no sales/rating copied", () => {
  const f = storeFacts(api(), NOW);
  assert.equal(f.price, 212.5);
  assert.equal(f.originalPrice, 354.17);
  assert.equal(f.priceSource, "aliexpress_api");
  assert.equal(f.priceCheckedAt, "2026-10-10T05:10:00.000Z");
  assert.deepEqual(f.images, ["https://ae-pic-a1.aliexpress-media.com/kf/main.jpg", "https://ae-pic-a1.aliexpress-media.com/kf/clean.jpg"]);
  assert.match(f.sellerVideo, /\.mp4$/);
  assert.equal(JSON.stringify(f).includes("999"), false, "the store's sales count is not copied");
  assert.equal(storeFacts(api({ target_sale_price_currency: "USD" }), NOW), null, "never a dollar price labelled as shekels");
  assert.equal(storeFacts(api({ target_sale_price: "0" }), NOW), null);
  assert.equal(storeFacts(api({ target_original_price: "200" }), NOW).originalPrice, undefined, "no invented discount");
});

test("applying facts keeps the old photo unless a cleaner gallery photo was found, and marks the seller video as real", () => {
  const p = products[2];
  const f = storeFacts(api(), NOW);
  const kept = applyFacts(p, f, { now: NOW });
  assert.equal(kept.image, p.image);
  assert.equal(kept.price, 212.5);
  const cleaner = applyFacts(p, f, { cleanest: "https://ae-pic-a1.aliexpress-media.com/kf/clean.jpg", now: NOW });
  assert.equal(cleaner.image, "https://ae-pic-a1.aliexpress-media.com/kf/clean.jpg");
  assert.equal(cleaner.imageSource.previous, p.image);
  assert.equal(applyFacts(p, f, { cleanest: "https://evil.example/x.jpg", now: NOW }).image, p.image, "only a photo from the store's own gallery");
  const truth = classifyMediaRecord({ videoUrl: cleaner.videoUrl, videoStatus: cleaner.videoStatus, videoProvider: cleaner.videoProvider, synthetic: cleaner.videoSynthetic });
  assert.equal(truth.state, MEDIA_TRUTH.REAL_VIDEO);
});

test("without the AliExpress keys nothing is asked and nothing changes", async () => {
  const r = await sync({ env: {}, write: true, now: NOW });
  assert.equal(r.outcome, "REQUIRES_CONNECTION");
  assert.deepEqual(r.missing, ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"]);
});
