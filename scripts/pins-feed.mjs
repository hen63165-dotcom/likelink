// The site's pins for Pinterest, as an RSS feed GitHub Pages serves
// (dist/pins.xml → https://hen63165-dotcom.github.io/likelink/pins.xml).
//
// Pinterest's "auto-publish from RSS" (free business account → Settings →
// Bulk create Pins → Auto-publish) reads the feed by itself and turns new
// items into Pins on the owner's own board. Nothing is posted from here: this
// only writes the feed. Pinterest is a search engine for ideas, so a jewelry
// pin keeps bringing visitors for months.
//
// Truth rules: only products the public site lists, only real store photos
// (never a stock photo), the affiliate disclosure on every product pin, AI
// reels named as AI, the seller's video named as the seller's. Every link
// carries its own utm so the visits are counted as Pinterest's.
//
// Run by .github/workflows/deploy-frontend.yml after scripts/reels-feed.mjs:
//   node scripts/pins-feed.mjs dist
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "./prerender-products.mjs";
import { isRealProductPhoto } from "../src/lib/discovery/catalogIntegrity.js";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";
import { SIZE_PAGE, SIZE_PATH } from "../src/lib/sizeTool.js";

export const PINS_FEED_HOME = "https://hen63165-dotcom.github.io/likelink";
export const PIN_AD = "#פרסומת · קישור שותפים";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v, n) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};
const httpsUrl = (u) => /^https:\/\/[^\s"<>]+$/i.test(String(u || ""));

export function pinLink(path, campaign, origin = PRODUCTION_ORIGIN) {
  const url = new URL(`${origin}${path}`);
  url.searchParams.set("utm_source", "pinterest");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", campaign);
  return url.href;
}

/**
 * The pins: one per listed product (its store photo), one per reel cover, and
 * the size meter. Each has a stable guid, so Pinterest makes it once.
 * @param products [{ product, owner }] from listedFromSnapshot
 * @param reels the reels feed entries (scripts/reels-feed.mjs index.json)
 * @param feedBase where the feed and the covers are served
 */
export function buildPins({ products = [], reels = [], feedBase = PINS_FEED_HOME, origin = PRODUCTION_ORIGIN } = {}) {
  const pins = [];
  const byId = new Map(products.map(({ product }) => [String(product.id), product]));
  for (const { product } of products) {
    if (!httpsUrl(product.image) || !isRealProductPhoto(product.image)) continue;
    pins.push({
      guid: `product-${product.id}`,
      title: clip(product.title, 100),
      description: clip(`${clip(product.description || "", 380)} ${PIN_AD}`, 500),
      link: pinLink(`/p/${product.id}`, "pins_product", origin),
      image: product.image,
      date: Number(product.createdAt) || 0,
    });
  }
  for (const r of Array.isArray(reels) ? reels : []) {
    const product = byId.get(String(r?.productId || ""));
    if (!product || !/^[a-z0-9][a-z0-9-]{0,80}-cover\.jpg$/.test(String(r.poster || ""))) continue;
    const seller = r.look === "seller";
    const what = seller ? "סרטון של המוכר" : "לונה (דמות AI) מסבירה";
    pins.push({
      guid: `reel-${r.id}`,
      title: clip(seller ? product.title : r.title || product.title, 100),
      description: clip(`${what}: ${clip(r.title || product.title, 200)}. הסרטון המלא באתר. ${PIN_AD}`, 500),
      link: pinLink(`/reels?r=${encodeURIComponent(`v-${r.id}`)}`, "pins_reel", origin),
      image: `${feedBase}/media/reels/${r.poster}`,
      date: Number(r.createdAt) || 0,
    });
  }
  const ringReel = (Array.isArray(reels) ? reels : []).find((r) => /ring-size/.test(String(r?.id || "")) && /-cover\.jpg$/.test(String(r.poster || "")));
  if (ringReel) {
    pins.push({
      guid: "tool-size",
      title: SIZE_PAGE.title.he,
      description: clip(`${SIZE_PAGE.intro.he} כלי חינמי של LikeLink2. (בתמונה: לונה, דמות AI.)`, 500),
      link: pinLink(SIZE_PATH, "pins_tool", origin),
      image: `${feedBase}/media/reels/${ringReel.poster}`,
      date: Number(ringReel.createdAt) || 0,
    });
  }
  return pins;
}

/** RSS 2.0 with the image as an enclosure and as media:content (Pinterest reads either). */
export function pinsRss(pins, { feedBase = PINS_FEED_HOME, now = new Date() } = {}) {
  const items = pins.map((p) => [
    "  <item>",
    `   <title>${esc(p.title)}</title>`,
    `   <link>${esc(p.link)}</link>`,
    `   <guid isPermaLink="false">${esc(p.guid)}</guid>`,
    `   <description>${esc(p.description)}</description>`,
    `   <pubDate>${new Date(p.date || now.getTime()).toUTCString()}</pubDate>`,
    `   <enclosure url="${esc(p.image)}" type="${/\.png(\?|$)/i.test(p.image) ? "image/png" : "image/jpeg"}" length="0" />`,
    `   <media:content url="${esc(p.image)}" medium="image" />`,
    "  </item>",
  ].join("\n"));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
    " <channel>",
    "  <title>LikeLink2 · תכשיטים וטיפים לפני שקונים</title>",
    `  <link>${esc(PRODUCTION_ORIGIN)}</link>`,
    `  <atom:link href="${esc(`${feedBase}/pins.xml`)}" rel="self" type="application/rss+xml" />`,
    "  <description>מוצרים מהקטלוג של LikeLink2, סרטונים מסומנים וכלים חינמיים. קישורי המוצרים הם קישורי שותפים (#פרסומת).</description>",
    "  <language>he</language>",
    `  <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    ...items,
    " </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function writePinsFeed({ dist = "dist", feedBase = PINS_FEED_HOME, now = new Date() } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  if (!existsSync(snapshot)) return { pins: 0, reason: "no catalog copy in dist" };
  const { products } = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8")));
  const reelsIndex = join(dist, "media", "reels", "index.json");
  const reels = existsSync(reelsIndex) ? JSON.parse(readFileSync(reelsIndex, "utf8")).reels || [] : [];
  const pins = buildPins({ products, reels, feedBase });
  writeFileSync(join(dist, "pins.xml"), pinsRss(pins, { feedBase, now }));
  return { pins: pins.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = writePinsFeed({ dist: process.argv[2] || "dist" });
  console.log(r.reason ? `pins-feed: ${r.reason}` : `pins-feed: ${r.pins} pin(s) in pins.xml`);
}
