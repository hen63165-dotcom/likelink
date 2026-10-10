// The free traffic engine: the size meter people search for and share (/size),
// IndexNow after a deploy, and the Pinterest auto-publish feed. Real visitors
// only: nothing here posts, clicks or counts anything by itself, and every pin
// carries the same disclosure a person sees on the site.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  braceletFromWrist,
  CARD_MM,
  pxPerMm,
  ringFromCircumference,
  ringFromDiameter,
  SIZE_PAGE,
  SIZE_PATH,
  sizeProducts,
  statedRange,
} from "../src/lib/sizeTool.js";
import { parsePath } from "../src/utils/routing.js";
import { SPA_SECTIONS } from "../scripts/rebase-static-pages.mjs";
import { listedFromSnapshot, pageHead, sectionPages } from "../scripts/prerender-products.mjs";
import { INDEXNOW_KEY, indexNowPayload, notify, sitemapUrls } from "../scripts/indexnow.mjs";
import { buildPins, PIN_AD, pinsRss } from "../scripts/pins-feed.mjs";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const snap = JSON.parse(read("public/snapshot/kv.json"));

test("ring sizes follow the standard tables (EU = inner circumference, US from the diameter)", () => {
  assert.deepEqual(ringFromDiameter(17.3), { diameter: 17.3, circumference: 54.3, eu: 54, us: 7 });
  assert.equal(ringFromDiameter(16.5).us, 6);
  assert.equal(ringFromDiameter(18.1).us, 8);
  const strip = ringFromCircumference(52);
  assert.equal(strip.eu, 52);
  assert.equal(strip.us, 6);
  for (const bad of [0, 10, 30, "x", null]) assert.equal(ringFromDiameter(bad), null);
  assert.equal(ringFromCircumference(500), null);
});

test("the screen is calibrated by a real card's long side; bracelet advice is labelled general", () => {
  assert.equal(pxPerMm(CARD_MM.long * 4), 4);
  assert.equal(pxPerMm(0), 0);
  assert.deepEqual(braceletFromWrist(15.5), { wrist: 15.5, min: 17, max: 17.5 });
  assert.equal(braceletFromWrist(40), null);
  assert.deepEqual(statedRange("שרשרת מתכווננת מ-14 עד 21 ס״מ"), { from: 14, to: 21 });
  assert.equal(statedRange("מידה 7"), null);
  const page = read("src/components/discover/pages.jsx");
  assert.match(page, /עצה כללית/);
  assert.match(page, /שום דבר לא נשלח|לא נשמרת אצלנו/);
});

test("the meter shows only catalog rings and bracelets the public site lists", () => {
  const { products } = listedFromSnapshot(snap);
  const list = products.map(({ product }) => ({ ...product, displayTitle: product.title }));
  assert.deepEqual(sizeProducts(list, "ring").map((p) => p.id), ["p-live-01"]);
  assert.deepEqual(sizeProducts(list, "bracelet").map((p) => p.id).sort(), ["p-live-02", "p-live-03", "p-live-04"]);
});

test("/size is a real public page on every host, with its own head for search", () => {
  assert.equal(SIZE_PATH, "/size");
  assert.equal(parsePath("/size").type, "size");
  assert.ok(JSON.parse(read("vercel.json")).rewrites.some((r) => r.source === "/size"));
  assert.ok(SPA_SECTIONS.includes("size"));
  assert.match(read("src/App.jsx"), /"size"/);
  const size = sectionPages().find((p) => p.path === "/size");
  assert.equal(size.canonical, `${PRODUCTION_ORIGIN}/size`);
  // The structured FAQ is exactly the FAQ a person reads on the page.
  const faq = size.jsonLd.find((x) => x["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((q) => q.name), SIZE_PAGE.faq.map((f) => f.q.he));
  const shell = '<html><head><title>x</title><meta name="description" content="d" /><link rel="canonical" href="https://likelink2.vercel.app/" /></head><body></body></html>';
  const html = pageHead(shell, size);
  assert.match(html, /<title>מה מידת הטבעת שלי\?/);
  assert.match(html, /<link rel="canonical" href="https:\/\/likelink2\.vercel\.app\/size" \/>/);
  assert.match(html, /application\/ld\+json/);
});

test("IndexNow: the key file the site serves, only our own URLs, nothing sent without the live key", async () => {
  const keyFile = `public/${INDEXNOW_KEY}.txt`;
  assert.ok(existsSync(new URL(`../${keyFile}`, import.meta.url)));
  assert.equal(read(keyFile).trim(), INDEXNOW_KEY);
  const urls = sitemapUrls("<urlset><url><loc>https://likelink2.vercel.app/size</loc></url><url><loc>https://likelink2.vercel.app/size</loc></url><url><loc>https://evil.example/x</loc></url></urlset>");
  const payload = indexNowPayload(urls);
  assert.equal(payload.host, "likelink2.vercel.app");
  assert.equal(payload.keyLocation, `${PRODUCTION_ORIGIN}/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(payload.urlList, ["https://likelink2.vercel.app/size"]);

  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(`${tmpdir()}/indexnow-`);
  writeFileSync(`${dir}/sitemap-static.xml`, "<urlset><url><loc>https://likelink2.vercel.app/size</loc></url></urlset>");
  const calls = [];
  const offline = async (url, init) => { calls.push([url, init?.method || "GET"]); return new Response("not found", { status: 404 }); };
  const r1 = await notify({ dist: dir, fetchImpl: offline });
  assert.equal(r1.sent, false);
  assert.match(r1.reason, /key file not live/);
  assert.deepEqual(calls.map((c) => c[1]), ["GET"], "nothing is posted without the live key file");
  const live = async (url, init) => (init?.method === "POST" ? new Response("", { status: 202 }) : new Response(INDEXNOW_KEY, { status: 200 }));
  const r2 = await notify({ dist: dir, fetchImpl: live });
  assert.deepEqual(r2, { sent: true, status: 202, urls: 1 });
});

test("Pinterest feed: listed products with real photos, disclosure on every pin, AI and seller named", () => {
  const { products } = listedFromSnapshot(snap);
  const stock = { product: { ...products[0].product, id: "p-stock", image: "https://images.unsplash.com/x.jpg" }, owner: products[0].owner };
  const reels = [
    { id: "luna-ring-size-a", productId: "p-live-01", poster: "ring-size-a-cover.jpg", title: "איך יודעים מידת טבעת", look: "talking", createdAt: 1 },
    { id: "seller-p-live-03", productId: "p-live-03", poster: "seller-p-live-03-cover.jpg", title: "", look: "seller", createdAt: 2 },
    { id: "luna-gone", productId: "p-gone", poster: "gone-cover.jpg", title: "x", look: "talking", createdAt: 3 },
    { id: "luna-sheet", productId: "p-live-02", poster: "silver-925-preview.jpg", title: "x", look: "talking", createdAt: 4 },
  ];
  const pins = buildPins({ products: [...products, stock], reels });
  const guids = pins.map((p) => p.guid);
  assert.equal(new Set(guids).size, guids.length, "one pin per guid");
  assert.ok(!guids.includes("product-p-stock"), "a stock photo never becomes a product pin");
  assert.ok(!guids.includes("reel-luna-gone") && !guids.includes("reel-luna-sheet"), "only listed products, only single-frame covers");
  assert.ok(guids.includes("tool-size"));
  for (const p of pins) {
    assert.match(p.link, /utm_source=pinterest/);
    assert.ok(p.link.startsWith(PRODUCTION_ORIGIN));
    assert.ok(p.image.startsWith("https://"));
    assert.ok(p.description.length <= 500 && p.title.length <= 100);
    if (!p.guid.startsWith("tool-")) assert.ok(p.description.includes(PIN_AD), `${p.guid} carries the disclosure`);
  }
  assert.match(pins.find((p) => p.guid === "reel-luna-ring-size-a").description, /דמות AI/);
  assert.match(pins.find((p) => p.guid === "reel-seller-p-live-03").description, /סרטון של המוכר/);
  assert.match(pins.find((p) => p.guid === "tool-size").description, /דמות AI/);
  assert.match(pins.find((p) => p.guid === "reel-luna-ring-size-a").link, /\/reels\?r=v-luna-ring-size-a/);

  const xml = pinsRss(pins, { now: new Date("2026-10-10T00:00:00Z") });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<item>/g) || []).length, pins.length);
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;)/, "every & is escaped");
});

test("the deploy runs the pins feed after the reels and IndexNow only after a code push", () => {
  const wf = read(".github/workflows/deploy-frontend.yml");
  assert.ok(wf.indexOf("scripts/reels-feed.mjs") < wf.indexOf("scripts/pins-feed.mjs"));
  assert.match(wf, /if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\n\s+run: node scripts\/indexnow\.mjs dist/);
});
