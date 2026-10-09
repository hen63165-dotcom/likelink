// Product link previews without a server (scripts/prerender-products.mjs) and
// Hebrew counts on the public site. A shared /p/<id> link must show that
// product (title, real photo, price) in WhatsApp/Facebook, built by the same
// buildProductSeo the server uses, from the products the public site lists —
// never a product the site hides, never a file on our own cloud.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listedFromSnapshot, prerender, productHead } from "../scripts/prerender-products.mjs";
import { enCount, heAnd, heCount } from "../src/lib/publicDiscovery.js";

const ROOT = new URL("..", import.meta.url).pathname;
const doc = JSON.parse(readFileSync(join(ROOT, "public/snapshot/kv.json"), "utf8"));
const shell = readFileSync(join(ROOT, "index.html"), "utf8");

test("only the products the public site lists get a preview page", () => {
  const { products } = listedFromSnapshot(doc);
  assert.ok(products.length > 0);
  for (const { product, owner } of products) {
    assert.equal(product.status, "approved");
    assert.equal(owner.id, product.marketerId);
  }
  // A product the site hides (a link shared with another product) gets none.
  const twin = { ...products[0].product, id: "p-twin" };
  const hidden = listedFromSnapshot({ keys: { ...doc.keys, "marketplace:products": [...doc.keys["marketplace:products"], twin] } });
  const ids = hidden.products.map(({ product }) => product.id);
  assert.ok(!ids.includes("p-twin") && !ids.includes(products[0].product.id), "a shared link does not lead to either product");
});

test("the preview <head> is the product's own: title, photo, url, JSON-LD", () => {
  const seo = {
    title: "צמיד <b> \"x\"", description: "תיאור", robots: "index,follow", canonical: "https://likelink2.vercel.app/p/a",
    og: { title: "צמיד", description: "תיאור", image: "https://ae01.alicdn.com/kf/a.jpg", url: "https://likelink2.vercel.app/p/a" },
    jsonLd: { "@type": "Product", name: "</script><script>alert(1)</script>" },
  };
  const html = productHead(shell, seo, "צמיד");
  assert.match(html, /<title>צמיד &lt;b&gt; &quot;x&quot;<\/title>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/ae01\.alicdn\.com\/kf\/a\.jpg" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/likelink2\.vercel\.app\/p\/a" \/>/);
  assert.match(html, /<meta property="og:type" content="product" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/likelink2\.vercel\.app\/p\/a" \/>/);
  assert.doesNotMatch(html, /<\/script><script>alert/, "JSON-LD cannot close its script tag");
  assert.equal((html.match(/<meta property="og:title"/g) || []).length, 1, "tags are replaced, not duplicated");
  assert.match(html, /<div id="root"/, "still the app shell people get");
});

test("prerender writes one page per product, the Netlify rules before the SPA fallback, and a sitemap", () => {
  const dist = mkdtempSync(join(tmpdir(), "ll-dist-"));
  writeFileSync(join(dist, "index.html"), shell);
  writeFileSync(join(dist, "_redirects"), readFileSync(join(ROOT, "public/_redirects"), "utf8"));
  const result = prerender({ dist, snapshot: join(ROOT, "public/snapshot/kv.json"), now: new Date("2026-10-09T00:00:00Z") });
  const { products } = listedFromSnapshot(doc);
  assert.equal(result.pages, products.length);
  for (const { product } of products) {
    const page = readFileSync(join(dist, "p", `${product.id}.html`), "utf8");
    assert.match(page, new RegExp(`<meta property="og:url" content="https://likelink2\\.vercel\\.app/p/${product.id}" />`));
    assert.doesNotMatch(page, /api\/og\?mode=media|supabase\.co\/storage/, "no preview points at our own cloud media");
  }
  const rules = readFileSync(join(dist, "_redirects"), "utf8");
  assert.ok(rules.indexOf(`/p/${products[0].product.id}  /p/${products[0].product.id}.html  200`) < rules.search(/^\/\*\s+\/index\.html\s+200/m));
  const sitemap = readFileSync(join(dist, "sitemap-static.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/likelink2\.vercel\.app\/p\/p-live-02<\/loc>/);
  assert.doesNotMatch(sitemap, /likelink\.com/);
});

test("prerender is a no-op without a build", () => {
  const empty = mkdtempSync(join(tmpdir(), "ll-empty-"));
  mkdirSync(join(empty, "x"));
  assert.deepEqual(prerender({ dist: join(empty, "x") }), { pages: 0, skipped: true });
  assert.ok(!existsSync(join(empty, "x", "p")));
});

test("Hebrew counts read naturally (never '1 צפיות')", () => {
  assert.equal(heCount(1, "views"), "צפייה אחת");
  assert.equal(heCount(3, "views"), "3 צפיות");
  assert.equal(heCount(0, "clicks"), "0 קליקים");
  assert.equal(heCount(1, "products"), "מוצר אחד");
  assert.equal(heCount(1, "categories"), "קטגוריה אחת");
  assert.equal(enCount(1, "views"), "1 view");
  assert.equal(enCount(2, "clicks"), "2 clicks");
  assert.equal(heAnd("צפייה אחת", "0 קליקים"), "צפייה אחת ו־0 קליקים");
  assert.equal(heAnd("3 צפיות", "קליק אחד"), "3 צפיות וקליק אחד");
  const pages = ["src/components/discover/pages.jsx", "src/components/discover/hero.jsx", "src/components/discover/kit.jsx", "src/lib/publicDiscovery.js"]
    .map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
  assert.doesNotMatch(pages, /\$\{(?!TREND_MIN_EVENTS)[^}]+\} (צפיות|קליקים|יוצרים|קטגוריות)/, "counted nouns go through heCount (the fixed threshold of 3 is plural)");
});
