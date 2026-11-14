// Site shots for the owner's Instagram carousels (2026-11-13: "carousels on products, on the magic
// button, on the site — vary"). This session's container cannot reach the live site; a runner can.
// Chrome (Playwright) opens each page of likelink2.vercel.app at phone size and saves what a
// visitor sees, so a carousel slide shows the real site, never a mock. It also writes the listed
// catalog (the browser's own anon read, through buildPublicGraph) and saves the store's own photos
// of the listed products, so a product slide uses the store's real photo.
//
// Read-only: every request that is not a GET is aborted (no landing, view or click is recorded),
// and headless Chrome is a bot to the site's own counters (BOT_UA / navigator.webdriver).
// Nothing is posted. Output: shots-out/ → the "carousel-shots" pre-release (review only).
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadLiveKeys, mergeCatalog } from "../../catalog/live-catalog.mjs";
import { buildPublicGraph } from "../../../src/lib/publicDiscovery.js";

const ORIGIN = "https://likelink2.vercel.app";
const plan = JSON.parse(readFileSync("scripts/marketing/carousels/shots.json", "utf8"));
const OUT = "shots-out";
mkdirSync(`${OUT}/products`, { recursive: true });

// 1) the listed catalog and the store's photos
const snapshot = JSON.parse(readFileSync("public/snapshot/kv.json", "utf8"));
const live = await loadLiveKeys();
console.log("live catalog:", live.ok ? "read" : live.reason);
const { doc, added } = mergeCatalog(snapshot, live);
const keys = doc.keys;
console.log("added from the cloud:", added);
// The live site reads the cloud's own rows (the copy is only a fallback), so a slide's price comes
// from the cloud row: the store price, when it was checked, and the store's own "before" price apart.
const cloudPrices = (live.ok ? live.keys["marketplace:products"] : []).map((p) => ({
  id: p.id, price: p.price ?? null, priceCheckedAt: p.priceCheckedAt || "", priceSource: p.priceSource || "",
  originalPrice: p.originalPrice ?? null, pricePrevious: p.pricePrevious ?? null, status: p.status || "",
}));
writeFileSync(`${OUT}/cloud-prices.json`, JSON.stringify(cloudPrices, null, 1));
const graph = buildPublicGraph({ products: keys["marketplace:products"] || [], marketers: keys["marketplace:marketers"] || [] });
const listed = graph.products.map((p) => ({
  id: p.id,
  title: p.displayTitle || p.title,
  storeTitle: p.storeTitle || "",
  kind: p.kind || "",
  category: p.category || "",
  price: p.price ?? null,
  priceSource: p.priceSource || "",
  priceCheckedAt: p.priceCheckedAt || "",
  link: p.affiliateUrl || p.url || "",
  marketerId: p.marketerId || "",
  images: [...new Set([p.image, ...(Array.isArray(p.images) ? p.images : [])].filter((u) => typeof u === "string" && u.startsWith("https://")))],
  createdAt: p.createdAt || null,
}));
writeFileSync(`${OUT}/catalog.json`, JSON.stringify(listed, null, 1));
console.log("listed products:", listed.length);

const MAX_IMG = 3 * 1024 * 1024;
const extOf = (type) => (/png/.test(type) ? "png" : /webp/.test(type) ? "webp" : /avif/.test(type) ? "avif" : "jpg");
const wanted = new Set(plan.photos === "all" ? listed.map((p) => p.id) : plan.photos || []);
let saved = 0;
for (const p of listed) {
  if (!wanted.has(p.id)) continue;
  for (const [i, url] of p.images.slice(0, plan.photosPerProduct || 4).entries()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.startsWith("image/")) continue;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < 4096 || body.length > MAX_IMG) continue;
      writeFileSync(`${OUT}/products/${p.id}-${i + 1}.${extOf(type)}`, body);
      saved++;
    } catch { /* a photo that does not answer is skipped */ }
  }
}
console.log("photos saved:", saved);

// 2) the live pages at phone size
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const shot of plan.pages) {
  if (!/^[a-z0-9-]+$/.test(shot.name)) throw new Error(`bad name ${shot.name}`);
  if (!String(shot.path).startsWith("/")) throw new Error(`bad path ${shot.name}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "he-IL" });
  await context.route("**/*", (route) => (route.request().method() === "GET" ? route.continue() : route.abort()));
  const page = await context.newPage();
  try {
    await page.goto(ORIGIN + shot.path, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
    if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 45_000 }).catch(() => console.log(shot.name, "waitFor not found:", shot.waitFor));
    await page.waitForTimeout(shot.settle || 4_000);
    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    if (shot.full) await page.screenshot({ path: `${OUT}/${shot.name}-full.png`, fullPage: true });
    for (const [i, sel] of (shot.elements || []).entries()) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(1_500);
        await el.screenshot({ path: `${OUT}/${shot.name}-el${i + 1}.png` }).catch((e) => console.log(shot.name, sel, e.message));
        await page.screenshot({ path: `${OUT}/${shot.name}-at${i + 1}.png` });
      } else console.log(shot.name, "no element", sel);
    }
    console.log("shot", shot.name, page.url());
  } catch (error) {
    console.log(shot.name, "FAILED", error.message);
  }
  await context.close();
}
await browser.close();
