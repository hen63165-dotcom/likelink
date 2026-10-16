// The storefront shows only what the data proves, on the real catalog copy
// (public/snapshot/kv.json, read the way the browser reads it):
//   • no invented ratings, review counts or "verified" badges;
//   • price filters and price sorting only when a product has a store price;
//   • a video that cannot play is never listed as a reel;
//   • a creator is named as the one who picked the product ("בחירה של"),
//     never as the person filmed in a seller's video.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { buildPublicGraph, hasStorePrices } from "../src/lib/publicDiscovery.js";
import { withoutCloudMedia } from "../src/lib/catalogSnapshot.js";
import { feedToVideos } from "../src/lib/reelsFeed.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const snapshot = JSON.parse(read("public/snapshot/kv.json")).keys;
const rows = (key) => withoutCloudMedia(key, typeof snapshot[key] === "string" ? JSON.parse(snapshot[key]) : snapshot[key] || []);
const graphOf = (videos = []) => buildPublicGraph({ products: rows("marketplace:products"), marketers: rows("marketplace:marketers"), clicks: rows("marketplace:clicks"), videos });

const PUBLIC_UI = [
  ...readdirSync(new URL("../src/components/discover/", import.meta.url)).filter((f) => f.endsWith(".jsx")).map((f) => `src/components/discover/${f}`),
  "index.html",
];

test("no invented ratings or review counts anywhere in the public UI", () => {
  for (const file of PUBLIC_UI) {
    const src = read(file);
    assert.doesNotMatch(src, /\b[1-5][.,]\d\s*(★|⭐|כוכבים|stars?\b)/i, `${file}: a star rating`);
    assert.doesNotMatch(src, /★{2,}|⭐/, `${file}: star glyphs`);
    assert.doesNotMatch(src, /\d[\d,.]*\+?\s*(ביקורות|חוות דעת|reviews\b|לקוחות מרוצים|happy customers|נמכרו|sold\b)/i, `${file}: a review or sales count`);
  }
});

test("a 'verified' badge appears only when the record says so", () => {
  for (const file of PUBLIC_UI) {
    read(file).split("\n").forEach((line, i) => {
      if (/<TrustBadge kind="verified"|<BadgeCheck/.test(line) && !/function TrustBadge|import /.test(line)) {
        assert.match(line, /\.verified\s*(===\s*true\s*)?\?|kind === "verified"/, `${file}:${i + 1} shows "verified" without checking the record`);
      }
    });
  }
  const graph = graphOf();
  for (const c of graph.creators) assert.equal(c.verified, false, `${c.name} carries no verified flag in the data`);
  for (const p of graph.products) {
    for (const k of ["rating", "reviews", "reviewCount", "sales", "sold"]) assert.equal(p[k], undefined, `${p.id}.${k}`);
  }
});

test("price filters and price sorting appear only when a product has a store price", () => {
  const graph = graphOf();
  assert.ok(graph.products.length > 0);
  // Since 2026-10-16 the listed products carry store prices read from the AliExpress API (with the date).
  assert.equal(hasStorePrices(graph.products), true);
  for (const p of graph.products.filter((x) => Number(x.price) > 0)) assert.equal(p.priceSource, "aliexpress_api", `${p.id}: a shown price has its store source`);
  assert.equal(hasStorePrices([{ id: "a", catalogPrice: 47.17 }]), false, "a catalog price is not a store price");
  assert.equal(hasStorePrices([{ id: "a" }, { id: "b", price: 47.17, priceSource: "aliexpress_api" }]), true);
  assert.equal(hasStorePrices(null), false);
  const pages = read("src/components/discover/pages.jsx");
  const productsPage = pages.slice(pages.indexOf("export function ProductsPage"), pages.indexOf("export function CreatorsPage"));
  assert.match(productsPage, /const priced = hasStorePrices\(graph\.products\)/);
  assert.match(productsPage, /\{priced \? \(/, "the chips and the sort render only with store prices");
  assert.match(productsPage, /const band = priced \?/, "an old ?price= link cannot empty the page");
  assert.match(productsPage, /המחיר העדכני מופיע בעמוד המוצר בחנות/);
  const discover = pages.slice(pages.indexOf("export function DiscoverPage"), pages.indexOf("export function ProductsPage"));
  assert.match(discover, /hasStorePrices\(graph\.products\) \? \(/, "no empty 'by budget' section");
});

test("a video that cannot play is never listed as a reel", () => {
  const feed = feedToVideos({ reels: [
    { id: "seller-p-live-05", productId: "p-live-05", video: "seller-p-live-05.mp4", look: "seller" },
    { id: "no-file", productId: "p-live-03", video: "", look: "seller" },
    { id: "not-a-video", productId: "p-live-04", video: "cover.jpg", look: "seller" },
  ] });
  assert.deepEqual(feed.map((v) => v.id), ["seller-p-live-05"]);
  const graph = graphOf([...feed, { id: "v-empty", videoUrl: "", public: true, productTags: [{ productId: "p-live-03" }] }]);
  assert.deepEqual(graph.reels.map((r) => r.id), ["v-seller-p-live-05"], "cloud-hosted reels (unreachable while the cloud is down) and empty records are not reels");
  for (const r of graph.reels) assert.match(r.url, /^https:\/\/.+\.mp4$/);
  for (const p of graph.products) assert.notEqual(p.media.state, "SYNTHETIC_ANIMATION", `${p.id}: no playable render, so no animation badge`);
});

test("the product page and the home hero show the product's own clean image first, named as the seller's", () => {
  const pages = read("src/components/discover/pages.jsx");
  const productPage = pages.slice(pages.indexOf("export function ProductPage"), pages.indexOf("export function ReelsPage"));
  assert.match(productPage, /const look = heroVideo \? null : lookOf\(product\.id\)/);
  assert.match(productPage, /src=\{look\?\.src \|\| product\.media\.image\}/);
  assert.match(productPage, /lookLabel\(look\.source, lang\)/, "a frame of the seller's video is named as theirs");
  const luxe = read("src/components/discover/luxe.jsx");
  assert.match(luxe, /\(lookOf\(a\.id\) \? 0 : 1\) - \(lookOf\(b\.id\) \? 0 : 1\)/, "images that ship with the site lead the collage");
  assert.match(luxe, /navigate\(`\/search\$\{q\.trim\(\) \? `\?q=\$\{encodeURIComponent\(q\.trim\(\)\)\}` : ""\}`\)/, "the hero search opens /search");
  assert.match(luxe, /<Go to="\/creators"/, "the hero leads to the creators too");
  const search = pages.slice(pages.indexOf("export function SearchPage"));
  assert.match(search, /hasStorePrices\(graph\.products\)\s*\?\s*L\("כתבו, דברו 🎙️, צלמו או הדביקו קישור — אפשר גם „סט יוגה עד 150 שקל”/, "a price example only when prices exist");
});

test("a video post never prints a name over the footage; who picked it, whose video it is and the product sit under it", () => {
  const kit = read("src/components/discover/kit.jsx");
  const card = kit.slice(kit.indexOf("export function ReelCard"), kit.indexOf("export function Spinner"));
  const onFootage = card.slice(card.indexOf("<Media"), card.indexOf("</Media>"));
  assert.ok(onFootage.length > 0);
  assert.doesNotMatch(onFootage, /creator|displayTitle\}<|source\}/, "only the media-truth badge sits on the video");
  const under = card.slice(card.indexOf("</Media>"));
  assert.match(under, /L\("בחירה של", "Picked by"\)/, "the creator is the one who picked the product");
  assert.match(under, /\{source \? <p className="lx-post-source">\{source\}<\/p> : null\}/, "whose video it is");
  assert.match(under, /<ShopButton product=\{product\}/, "the product's own store link, under the video");
  assert.match(under, /<PriceLine product=\{product\}/, "a price only from the store, else 'המחיר המעודכן בחנות'");
});

test("the creator page is a storefront of real content: no followers, views or clicks", () => {
  const pages = read("src/components/discover/pages.jsx");
  const page = pages.slice(pages.indexOf("export function CreatorPage"), pages.indexOf("export function ProductPage"));
  assert.match(page, /role="tablist"/);
  assert.match(page, /<ReelCard key=\{r\.id\} reel=\{r\} graph=\{graph\} showCreator=\{false\} shoppable/, "her videos are shoppable posts, with no name over them");
  assert.doesNotMatch(page, /\.attention\b|"views"|"clicks"|followerCount|followers\.length/, "no counters on a creator's page");
  assert.match(page, /creator\.verified \? <TrustBadge kind="verified" \/> : null/, "verified only from the record");
  const productPage = pages.slice(pages.indexOf("export function ProductPage"), pages.indexOf("export function ReelsPage"));
  assert.match(productPage, /<ReelCard key=\{r\.id\} reel=\{r\} graph=\{graph\} showCreator=\{false\} \/>/);
});

test("the reels page names the creator as the one who picked the product", () => {
  const pages = read("src/components/discover/pages.jsx");
  const reels = pages.slice(pages.indexOf("export function ReelsPage"), pages.indexOf("export function TrendsPage"));
  assert.match(reels, /L\("בחירה של", "Picked by"\)/);
  assert.match(reels, /lookOf\(product\.id\)\?\.src/, "the product thumbnail is the product's own clean image");
  assert.match(reels, /className="pe-14"/, "the labels stay clear of the side buttons");
  assert.match(reels, /המחיר המעודכן בחנות/, "no price → the store's price, never an empty or invented one");
});

test("on a product page the buy bar is the only bar at the bottom of a phone", () => {
  const shell = read("src/components/discover/PublicShell.jsx");
  assert.match(shell, /\{routeType === "product" \? null : <div className="lg:hidden">/, "no dock on a product page");
  const css = read("src/public.css");
  assert.match(css.slice(css.indexOf(".lx-buybar {")), /^\.lx-buybar \{[^}]*bottom: calc\(12px \+ env\(safe-area-inset-bottom\)\)/, "the buy bar sits at the bottom edge");
});
