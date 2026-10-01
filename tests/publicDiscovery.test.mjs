// Public discovery graph — truth contract for every public LikeLink2 surface.
//
// The redesigned public site (home, discover, search, reels, trends,
// collections, deals, product + creator pages) renders ONLY what
// buildPublicGraph derives. These tests pin that it never invents a trend,
// a discount, a video, a verification badge or a personal pick.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildPublicGraph,
  searchGraph,
  lunaPicks,
  productInsights,
  relatedProducts,
  dealOf,
  merchantOf,
  TREND_MIN_EVENTS,
} from "../src/lib/publicDiscovery.js";
import { MEDIA_TRUTH } from "../src/lib/discovery/mediaTruth.js";
import { parsePath } from "../src/utils/routing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const NOW = Date.UTC(2026, 9, 1);
const creator = { id: "m1", name: "ALYOSTYLE", slug: "alyostyle", bio: "Luxury staples" };
const mk = (id, extra = {}) => ({
  id,
  title: `מוצר ${id}`,
  price: 50,
  category: "Beauty",
  status: "approved",
  marketerId: "m1",
  image: `https://images.example.com/${id}.jpg`,
  affiliateUrl: "https://s.click.aliexpress.com/e/_x",
  createdAt: NOW - 1000,
  ...extra,
});

const products = [
  mk("a", { title: "סרום ויטמין C 30ml — ₪45", price: 45, tags: ["סרום", "טיפוח"] }),
  mk("b", { price: 29 }),
  mk("c", { price: 89 }),
  mk("d", { category: "Tech", price: 199 }),
  mk("draft", { status: "pending" }),
  mk("orphan", { marketerId: "ghost" }),
];

test("only approved, attributed products reach the public graph", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.deepEqual(g.products.map((p) => p.id).sort(), ["a", "b", "c", "d"]);
  assert.equal(g.creators.length, 1);
  assert.equal(g.creators[0].verified, false, "verified only when the record says so");
  assert.equal(buildPublicGraph({ products, marketers: [{ ...creator, verified: true }], now: NOW }).creators[0].verified, true);
});

test("display titles drop the duplicated price; the price field stays the truth", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.equal(g.byId.get("a").displayTitle, "סרום ויטמין C 30ml");
  assert.equal(g.byId.get("a").price, 45);
});

test("no recorded events → no trends and no 'attention' list", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.deepEqual(g.trends, []);
  assert.deepEqual(g.attention, []);
});

test("trends need recorded events inside the window", () => {
  const events = Array.from({ length: TREND_MIN_EVENTS }, (_, i) => ({ productId: "a", ts: NOW - i * 1000, type: i ? "view" : undefined }));
  const stale = [{ productId: "d", ts: NOW - 40 * 86_400_000 }, { productId: "d", ts: NOW - 41 * 86_400_000 }, { productId: "d", ts: NOW - 42 * 86_400_000 }];
  const g = buildPublicGraph({ products, marketers: [creator], clicks: [...events, ...stale], now: NOW });
  assert.equal(g.trends.length, 1);
  assert.equal(g.trends[0].category, "Beauty");
  assert.equal(g.trends[0].clicks, 1);
  assert.equal(g.trends[0].views, TREND_MIN_EVENTS - 1);
  assert.equal(g.attention[0].id, "a");
});

test("deals exist only with a real higher previous price", () => {
  assert.equal(dealOf({ price: 50 }), null);
  assert.equal(dealOf({ price: 50, originalPrice: 40 }), null);
  assert.equal(dealOf({ price: 0, originalPrice: 40 }), null);
  assert.deepEqual(dealOf({ price: 75, originalPrice: 100 }), { price: 75, was: 100, discountPct: 25, saved: 25 });
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.deepEqual(g.deals, []);
});

test("a product photo is never a reel; rendered video is animation, not real video", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.deepEqual(g.reels, []);
  for (const p of g.products) assert.equal(p.media.state, MEDIA_TRUTH.STATIC_IMAGE);
  const g2 = buildPublicGraph({
    products,
    marketers: [creator],
    videos: [
      { id: "v1", marketerId: "m1", videoUrl: "https://cdn.example.com/v1.mp4", productTags: [{ productId: "a" }] },
      { id: "v2", marketerId: "m1", videoUrl: "https://cdn.example.com/v2.mp4", source: "likelink_reel" },
      { id: "v3", marketerId: "m1", videoUrl: "data:image/svg+xml;base64,AA" },
      { id: "v4", marketerId: "ghost", videoUrl: "https://cdn.example.com/v4.mp4" },
    ],
    now: NOW,
  });
  const states = Object.fromEntries(g2.reels.map((r) => [r.id, r.state]));
  assert.equal(states["v-v1"], MEDIA_TRUTH.REAL_VIDEO);
  assert.equal(states["v-v2"], MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.ok(!("v-v3" in states), "non-http media is not a public reel");
  assert.ok(!("v-v4" in states), "unattributed video is not public");
});

test("collections state their rule and contain only public products", () => {
  const g = buildPublicGraph({
    products,
    marketers: [creator],
    collections: [{ id: "x", marketerId: "m1", title: "המועדפים", productIds: ["a", "draft", "nope"] }],
    now: NOW,
  });
  const curated = g.collections.find((c) => c.id === "c-x");
  assert.deepEqual(curated.productIds, ["a"]);
  const beauty = g.collections.find((c) => c.id === "cat-Beauty");
  assert.match(beauty.description.he, /3 המוצרים המאושרים/);
  const under = g.collections.find((c) => c.id === "under-100");
  assert.ok(under.productIds.every((id) => g.byId.get(id).price < 100));
  assert.ok(!g.collections.some((c) => c.id === "cat-Tech"), "a one-product category is not a board");
});

test("search finds products, creators and categories in Hebrew and English", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.equal(searchGraph(g, "סרום").products[0].id, "a");
  assert.equal(searchGraph(g, "alyostyle").creators.length, 1);
  assert.ok(searchGraph(g, "טיפוח").categories.some((c) => c.id === "Beauty"));
  assert.ok(searchGraph(g, "beauty").products.length >= 3);
  assert.equal(searchGraph(g, "   ").total, 0);
  assert.equal(searchGraph(g, "zzzzqq").total, 0);
});

test("Luna picks need a real signal and say which one", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  assert.deepEqual(lunaPicks(g, {}), { products: [], reason: null });
  const picks = lunaPicks(g, { favorites: ["a"] });
  assert.equal(picks.reason.kind, "saved");
  assert.ok(picks.products.every((p) => p.category === "Beauty" && p.id !== "a"));
});

test("product insights are computed from real fields only", () => {
  const g = buildPublicGraph({ products, marketers: [creator], now: NOW });
  const kinds = productInsights(g, g.byId.get("b")).map((i) => i.kind);
  assert.ok(kinds.includes("creator"));
  assert.ok(kinds.includes("price"));
  assert.ok(!kinds.includes("attention"), "no events → no attention claim");
  assert.ok(!kinds.includes("deal"));
  assert.deepEqual(relatedProducts(g, g.byId.get("a")).map((p) => p.id).slice(0, 2).sort(), ["b", "c"]);
});

test("merchant comes from the product's own source or link", () => {
  assert.equal(merchantOf({ source: "aliexpress" }), "AliExpress");
  assert.equal(merchantOf({ affiliateUrl: "https://s.click.aliexpress.com/e/x" }), "AliExpress");
  assert.equal(merchantOf({}), "");
});

test("public discovery routes are in the router and served by the SPA rewrites", () => {
  assert.deepEqual(parsePath("/reels"), { type: "reels" });
  assert.deepEqual(parsePath("/trends"), { type: "trends" });
  assert.deepEqual(parsePath("/deals"), { type: "deals" });
  assert.deepEqual(parsePath("/products"), { type: "products", category: null });
  assert.deepEqual(parsePath("/collections"), { type: "collections", id: null });
  assert.deepEqual(parsePath("/collections/cat-Beauty"), { type: "collections", id: "cat-Beauty" });
  assert.deepEqual(parsePath("/search"), { type: "search" });
  assert.deepEqual(parsePath("/saved"), { type: "saved" });
  const vercel = JSON.parse(read("vercel.json"));
  const sources = new Set(vercel.rewrites.map((r) => r.source));
  for (const p of ["/reels", "/trends", "/deals", "/products", "/products/:path*", "/collections", "/collections/:path*", "/search", "/saved"]) {
    assert.ok(sources.has(p), `vercel.json must rewrite ${p} to the SPA`);
  }
});

test("public surfaces carry no fabricated claims", () => {
  const files = ["src/components/discover/kit.jsx", "src/components/discover/PublicSite.jsx", "src/components/discover/pages.jsx", "src/components/discover/PublicShell.jsx"];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/pixar/i.test(src), `${f} must not reference Pixar`);
    assert.ok(!/\b\d+(\.\d+)?\s?[KM]\+?\s+(followers|views|עוקבים|צפיות)/i.test(src), `${f} must not hardcode audience numbers`);
    assert.ok(!/"(ACTIVE|PUBLISHED)"/.test(src), `${f} must not hardcode ACTIVE/PUBLISHED`);
  }
  const kit = read("src/components/discover/kit.jsx");
  assert.ok(kit.includes("MEDIA_TRUTH_LABEL"), "video badges must come from mediaTruth labels");
  assert.ok(kit.includes("AFFILIATE_DISCLOSURE_HE"), "shop CTAs must carry the affiliate disclosure");
});

test("index.html boots the app and its pre-hydration fallback is the public site, not the Studio", () => {
  const html = read("index.html");
  assert.ok(/<script type="module" src="\.\/src\/main\.jsx"><\/script>/.test(html), "index.html must load src/main.jsx");
  assert.ok(html.includes("data-ll-public-root"), "the first paint must be the public site");
  assert.ok(!html.includes('class="ll-studio"'), "the Studio is not the public first paint");
  assert.ok(!/top creators|המובילות בישראל|הכי גדולה/.test(html), "no unprovable superlatives in public meta");
});
