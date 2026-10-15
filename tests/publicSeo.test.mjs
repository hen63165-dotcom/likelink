// What Google and link previews read on every public page.
//
// Pins:
//  - every section in the sitemap has its own title, description and
//    canonical (a page whose HTML says canonical "/" reads as a copy of the
//    home page and is left out of search) — the same head in the browser
//    (PublicSite.jsx) and in the built HTML (prerender-products.mjs);
//  - each creator storefront /u/<slug> gets its own built head;
//  - a product page's head comes from the one builder (buildProductSeo): no
//    price without a store source, no stock claim, the creator is not the
//    brand — the old getProductSEO (₪0, InStock, brand = creator) is gone;
//  - the page's JSON-LD carries the id the app replaces, so there is one;
//  - no "real price" promise while prices come from the store page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SECTION_SEO, sectionSeo } from "../src/lib/publicSeo.js";
import { prerender, sectionPages, listedFromSnapshot } from "../scripts/prerender-products.mjs";
import { buildProductSeo, canonicalProduct } from "../src/lib/discovery/surfaces.js";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const snapshot = JSON.parse(read("public/snapshot/kv.json"));

test("every sitemap section has its own head, never the home page's", () => {
  const sitemapSections = ["/discover", "/products", "/creators", "/reels", "/trends", "/collections", "/deals", "/guide", "/size", "/join"];
  const byPath = new Map(sectionPages().map((p) => [p.path, p]));
  for (const path of sitemapSections) {
    const page = byPath.get(path);
    assert.ok(page, `${path}: has a head`);
    assert.equal(page.canonical, `${PRODUCTION_ORIGIN}${path}`, `${path}: canonical is itself`);
    assert.match(page.title, / \| LikeLink2$/);
    assert.ok(page.description.length > 20, `${path}: a real description`);
  }
  const titles = sectionPages().map((p) => p.title);
  assert.equal(new Set(titles).size, titles.length, "no two sections share a title");
  assert.equal(sectionSeo("discover", { lang: "en" }).title, "Discover products through creators | LikeLink2");
});

test("the app sets the same section head the build writes", () => {
  const site = read("src/components/discover/PublicSite.jsx");
  for (const type of Object.keys(SECTION_SEO)) assert.match(site, new RegExp(`section\\("${type}"\\)`), `${type}: from publicSeo.js`);
});

test("the build writes each section and creator page with its own head and Netlify rule", () => {
  const dist = mkdtempSync(join(tmpdir(), "ll-seo-"));
  const shell = read("index.html");
  writeFileSync(join(dist, "index.html"), shell);
  writeFileSync(join(dist, "_redirects"), read("public/_redirects"));
  prerender({ dist, snapshot: join(ROOT, "public/snapshot/kv.json"), now: new Date("2026-10-15T00:00:00Z") });
  const rules = readFileSync(join(dist, "_redirects"), "utf8");
  const fallback = rules.search(/^\/\*\s+\/index\.html\s+200/m);
  for (const page of sectionPages()) {
    const html = readFileSync(join(dist, `${page.path.slice(1)}.html`), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="${page.canonical}" />`), `${page.path}: canonical`);
    assert.ok(html.includes(`<title>${page.title.replace(/&/g, "&amp;")}</title>`), `${page.path}: title`);
    assert.doesNotMatch(html, /<link rel="canonical" href="https:\/\/likelink2\.vercel\.app\/" \/>/, `${page.path}: not the home page`);
    const at = rules.indexOf(`${page.path}  /${page.path.slice(1)}.html  200`);
    assert.ok(at >= 0 && at < fallback, `${page.path}: rule before the SPA fallback`);
  }
  const { creators } = listedFromSnapshot(snapshot);
  assert.ok(creators.length > 0);
  for (const c of creators) {
    const html = readFileSync(join(dist, "u", `${c.slug}.html`), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/u/${c.slug}" />`), `/u/${c.slug}: canonical`);
    assert.match(html, /<meta property="og:type" content="profile" \/>/);
    assert.match(html, /"@type":"ProfilePage"/);
    assert.match(html, /<script type="application\/ld\+json" id="likelink-jsonld">/, "the id the app replaces");
    assert.ok(rules.indexOf(`/u/${c.slug}  /u/${c.slug}.html  200`) < fallback);
  }
  const product = readFileSync(join(dist, "p", "p-live-05.html"), "utf8");
  assert.match(product, /<script type="application\/ld\+json" id="likelink-jsonld">/);
});

test("a product's head: one builder, no price or stock without a store source, creator is not the brand", () => {
  const site = read("src/components/discover/PublicSite.jsx");
  assert.match(site, /buildProductSeo\(canonicalProduct\(p, owner, PUBLIC_ORIGIN\)\)/);
  const seoJs = read("src/lib/seo.js");
  assert.doesNotMatch(seoJs, /getProductSEO|InStock/, "the old product head (₪0, in stock, brand = creator) is gone");
  const { products } = listedFromSnapshot(snapshot);
  for (const { product, owner } of products) {
    const seo = buildProductSeo(canonicalProduct(product, owner, PRODUCTION_ORIGIN));
    assert.doesNotMatch(seo.title, /₪/, `${product.id}: no price in the title without a store price`);
    if (!(Number(product.price) > 0)) assert.equal(seo.jsonLd.offers, undefined, `${product.id}: no offer without a price`);
    assert.notEqual(seo.jsonLd.brand?.name, owner.name, `${product.id}: the creator is not the brand`);
    assert.doesNotMatch(JSON.stringify(seo.jsonLd), /InStock/);
  }
});

test("no 'real price' promise while prices come from the store page", () => {
  for (const f of ["index.html", "src/lib/seo.js", "src/lib/publicSeo.js"]) {
    assert.doesNotMatch(read(f), /עם מחיר אמיתי|עם מחיר,|with real prices/, f);
  }
});
