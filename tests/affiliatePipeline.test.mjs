import test from "node:test";
import assert from "node:assert/strict";

import {
  ingestProducts,
  normalizeProduct,
  validateProduct,
  qualityFilter,
  findNewProducts,
  buildHookEngine,
  isProductStale,
  isValidAffiliateUrl,
} from "../src/lib/cloud/affiliatePipeline.js";
import { LIVE_PRODUCTS, bootstrapProducts, createProduct } from "../src/lib/cloud/catalog.js";

const OWNER = "msd6go4kff49s5";
const MARKETERS = [{ id: OWNER, name: "ALYOSTYLE", slug: "alyostyle" }];

test("ingestProducts returns candidates from LIVE_PRODUCTS + bootstrap", () => {
  const result = ingestProducts({ marketerId: OWNER });
  assert.equal(result.ok, true);
  assert.equal(result.owner, OWNER);
  assert.ok(result.candidates.length > 0);
  const ids = result.candidates.map((p) => p.id);
  assert.ok(ids.includes("p1_silver_ring_live"), "LIVE_PRODUCTS should be ingested");
  assert.ok(ids.includes("p1"), "bootstrap products should be ingested");
});

test("ingestProducts fails without owner", () => {
  const result = ingestProducts({ marketerId: "" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_owner_id");
});

test("validateProduct rejects products missing affiliate URL", () => {
  const bad = createProduct({ id: "x1", title: "Test", price: 10, category: "Fashion", marketerId: OWNER });
  const v = validateProduct(bad, { marketerExists: true, marketers: MARKETERS });
  assert.equal(v.valid, false);
  assert.ok(v.reason.includes("hasAffiliateUrl"));
});

test("validateProduct accepts products with all real fields", () => {
  const good = createProduct({
    id: "x2", title: "Test Product", price: 99, category: "Fashion",
    image: "https://images.unsplash.com/photo-test.jpg",
    affiliateUrl: "https://s.click.aliexpress.com/e/_test",
    marketerId: OWNER,
  });
  const v = validateProduct(good, { marketerExists: true, marketers: MARKETERS });
  assert.equal(v.valid, true);
  assert.equal(v.reason, null);
});

test("qualityFilter rejects non-approved products", () => {
  const p = createProduct({ id: "x3", title: "Test", price: 10, category: "Fashion", affiliateUrl: "https://example.com", image: "https://img.com/x.jpg", marketerId: OWNER });
  p.status = "pending";
  const q = qualityFilter(p, { marketers: MARKETERS });
  assert.equal(q.eligible, false);
  assert.ok(q.reasons.some((r) => r.includes("pending")));
});

test("qualityFilter accepts approved products with valid attribution", () => {
  const p = createProduct({ id: "x4", title: "Test", price: 10, category: "Fashion", affiliateUrl: "https://example.com", image: "https://img.com/x.jpg", marketerId: OWNER });
  const q = qualityFilter(p, { marketers: MARKETERS });
  assert.equal(q.eligible, true);
});

test("findNewProducts correctly identifies duplicates by title", () => {
  const existing = [{ id: "p-live-01", title: "טבעת כסף 925 קלאסית עם זרקון מרקיז" }];
  const candidates = [
    { id: "p1_different_id", title: "טבעת כסף 925 קלאסית עם זרקון מרקיז" },
    { id: "p2_new", title: "מוצר חדש שונה" },
  ];
  const { newProducts, duplicates } = findNewProducts(candidates, existing);
  assert.equal(newProducts.length, 1);
  assert.equal(newProducts[0].id, "p2_new");
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].reason, "title_match");
});

test("findNewProducts correctly identifies duplicates by ID", () => {
  const existing = [{ id: "p1", title: "Product One" }];
  const candidates = [
    { id: "p1", title: "Different Title" },
    { id: "p2", title: "Product Two" },
  ];
  const { newProducts, duplicates } = findNewProducts(candidates, existing);
  assert.equal(newProducts.length, 1);
  assert.equal(newProducts[0].id, "p2");
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].reason, "id_match");
});

test("buildHookEngine generates UGC content with real attributes", () => {
  const product = createProduct({
    id: "t1", title: "שמלת קיץ מקסי מאריג", price: 249, category: "Fashion",
    affiliateUrl: "https://s.click.aliexpress.com/e/_test",
    image: "https://images.unsplash.com/photo-test.jpg",
    marketerId: OWNER,
  });
  const pack = buildHookEngine(product, { clicks: [], sales: [], lang: "he" });
  assert.equal(pack.productId, "t1");
  assert.equal(pack.title, "שמלת קיץ מקסי מאריג");
  assert.equal(pack.price, "₪249");
  assert.ok(pack.hook.length > 0, "hook should be generated");
  assert.ok(pack.story.length > 0, "story should be generated");
  assert.ok(pack.cta.disclosure, "disclosure should be present");
  assert.ok(pack.cta.disclosure.includes("שותפים"), "disclosure should be in Hebrew");
  assert.ok(pack.trustSignals.sourceData.affiliateUrl, "trust signal: affiliate URL present");
  assert.ok(pack.trustSignals.affiliateRelationship.source, "trust signal: source present");
  assert.equal(pack.trustSignals.likeLinkVerification.status, "approved");
  assert.ok(typeof pack.trustSignals.trendSignal.score === "number", "trust signal: trend score is numeric");
});

test("buildHookEngine generates English content when lang=en", () => {
  const product = createProduct({
    id: "t2", title: "Summer Maxi Dress", price: 199, category: "Fashion",
    affiliateUrl: "https://s.click.aliexpress.com/e/_test",
    image: "https://images.unsplash.com/photo-test.jpg",
    marketerId: OWNER,
  });
  const pack = buildHookEngine(product, { lang: "en" });
  assert.ok(pack.cta.disclosure.includes("Affiliate"), "disclosure should be in English");
});

test("buildHookEngine generates Arabic content when lang=ar", () => {
  const product = createProduct({
    id: "t3", title: "تعبيرية", price: 50, category: "Fashion",
    affiliateUrl: "https://s.click.aliexpress.com/e/_test",
    image: "https://images.unsplash.com/photo-test.jpg",
    marketerId: OWNER,
  });
  const pack = buildHookEngine(product, { lang: "ar" });
  assert.ok(pack.cta.disclosure.includes("شريك"), "disclosure should be in Arabic");
});

test("isProductStale detects products with no engagement", () => {
  const p = createProduct({ id: "s1", title: "Old Product", price: 10, category: "Fashion", affiliateUrl: "https://example.com", image: "https://img.com/x.jpg", marketerId: OWNER });
  p.createdAt = Date.now() - 30 * 86400000; // 30 days ago
  const result = isProductStale(p, { clicks: [], sales: [], now: Date.now() });
  assert.equal(result.stale, true);
  assert.ok(result.reasons.includes("no_engagement_14d"));
});

test("isProductStale returns false for active products", () => {
  const p = createProduct({ id: "s2", title: "Hot Product", price: 10, category: "Fashion", affiliateUrl: "https://example.com", image: "https://img.com/x.jpg", marketerId: OWNER });
  const recentClicks = [{ productId: "s2", ts: Date.now() - 1 * 86400000 }];
  const result = isProductStale(p, { clicks: recentClicks, sales: [], now: Date.now() });
  assert.equal(result.stale, false);
});

test("isProductStale detects products without affiliate URL", () => {
  const p = createProduct({ id: "s3", title: "No URL Product", price: 10, category: "Fashion", marketerId: OWNER });
  const result = isProductStale(p, { clicks: [], sales: [], now: Date.now() });
  assert.equal(result.stale, true);
  assert.ok(result.reasons.includes("no_affiliate_url"));
});

test("isValidAffiliateUrl accepts http/https URLs", () => {
  assert.equal(isValidAffiliateUrl("https://s.click.aliexpress.com/e/_test"), true);
  assert.equal(isValidAffiliateUrl("https://www.amazon.com/dp/B08TEST"), true);
  assert.equal(isValidAffiliateUrl("http://example.com/aff?tag=test"), true);
});

test("isValidAffiliateUrl rejects invalid URLs", () => {
  assert.equal(isValidAffiliateUrl("not-a-url"), false);
  assert.equal(isValidAffiliateUrl(""), false);
  assert.equal(isValidAffiliateUrl(null), false);
  assert.equal(isValidAffiliateUrl("ftp://example.com"), false);
});

test("normalizeProduct preserves real prices and adds tags", () => {
  const raw = { id: "n1", title: "Test Product", price: 189, category: "Fashion", affiliateUrl: "https://example.com", image: "https://img.com/x.jpg", marketerId: OWNER };
  const p = normalizeProduct(raw);
  assert.equal(p.price, 189);
  assert.ok(p.tags.length > 0, "tags should be extracted");
  assert.equal(p.status, "approved");
});

test("LIVE_PRODUCTS have valid affiliate URLs", () => {
  for (const p of LIVE_PRODUCTS) {
    assert.ok(isValidAffiliateUrl(p.affiliateUrl), `LIVE_PRODUCT ${p.id} has invalid affiliate URL`);
    assert.ok(Number(p.price) > 0, `LIVE_PRODUCT ${p.id} has invalid price`);
    assert.ok(p.image && p.image.length > 0, `LIVE_PRODUCT ${p.id} has no image`);
    assert.ok(p.category, `LIVE_PRODUCT ${p.id} has no category`);
  }
});

test("bootstrapProducts returns all products with required fields", () => {
  const products = bootstrapProducts({ marketerId: OWNER });
  assert.ok(products.length > 0);
  for (const p of products) {
    assert.ok(p.id, "product has id");
    assert.ok(p.title, "product has title");
    assert.ok(Number(p.price) > 0, `product ${p.id} has valid price`);
    assert.ok(isValidAffiliateUrl(p.affiliateUrl), `product ${p.id} has valid affiliate URL`);
    assert.equal(p.marketerId, OWNER, "product has correct owner");
  }
});
