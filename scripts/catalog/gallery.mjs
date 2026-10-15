// The store's own photo gallery of a product, for a person to choose a
// professional image by eye (src/lib/looks.js CLEAN_STORE_PHOTOS / GALLERY_PICKS).
// Read-only: a real Chrome opens the product's store page directly (never the
// affiliate link, which would count a click), reads the gallery the page
// lists, and downloads those images from the store CDN. A CAPTCHA stops the
// run; it is never worked around. Nothing is posted or written to the site.
//   PRODUCTS=p-live-03 OUT=/tmp/gallery node scripts/catalog/gallery.mjs
// Run by .github/workflows/catalog-gallery.yml, which publishes OUT to the
// ops/gallery branch (overwritten each run).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";

const CDN = /^https:\/\/(ae-pic-a1\.aliexpress-media\.com|ae01\.alicdn\.com)\/kf\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i;

/** A store image URL without its size suffix, or "" when it is not a store-CDN image. */
export function cleanImageUrl(raw) {
  let u = String(raw || "").trim();
  if (u.startsWith("//")) u = `https:${u}`;
  u = u.split("?")[0].replace(/(\.(?:jpg|jpeg|png|webp))_[^/]*$/i, "$1");
  return CDN.test(u) ? u : "";
}

/** Gallery first (the page's own list), then every other store image on the page; no duplicates. */
export function galleryFrom({ paths = [], html = "" }, max = 16) {
  const out = [];
  const add = (u) => { const c = cleanImageUrl(u); if (c && !out.includes(c)) out.push(c); };
  paths.forEach(add);
  for (const m of String(html).matchAll(/(?:https?:)?\/\/(?:ae-pic-a1\.aliexpress-media\.com|ae01\.alicdn\.com)\/kf\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)/gi)) add(m[0]);
  return out.slice(0, max);
}

export function storePages(snapshot, ids) {
  const listed = listedFromSnapshot(snapshot).products.map((x) => x.product);
  return listed
    .filter((p) => !ids.length || ids.includes(p.id))
    .map((p) => ({ id: p.id, itemUrl: p.imageSource?.itemUrl || "" }))
    .filter((p) => /^https:\/\/www\.aliexpress\.(us|com)\/item\/\d+\.html$/.test(p.itemUrl));
}

async function main() {
  const out = process.env.OUT || "gallery";
  const ids = String(process.env.PRODUCTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const pages = storePages(JSON.parse(readFileSync("public/snapshot/kv.json", "utf8")), ids);
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome" });
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  const report = [];
  try {
    for (const p of pages) {
      const page = await ctx.newPage();
      try {
        await page.goto(p.itemUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(5000);
        const found = await page.evaluate(() => {
          const rp = window.runParams?.data || {};
          const paths = rp.imageModule?.imagePathList || rp.imageComponent?.imagePathList || [];
          const imgs = [...document.querySelectorAll("img")].map((i) => i.currentSrc || i.src);
          return { url: location.href, title: document.title, paths: [...paths, ...imgs], html: document.documentElement.outerHTML.slice(0, 3_000_000) };
        });
        if (/_____tmd_____|\/punish|captcha/i.test(found.url) || /captcha/i.test(found.title)) {
          report.push({ id: p.id, status: "SOURCE_BLOCKED" });
          console.log(`${p.id}: the store asked for a CAPTCHA — stopping (never worked around)`);
          break;
        }
        const urls = galleryFrom(found);
        const dir = join(out, p.id);
        mkdirSync(dir, { recursive: true });
        const saved = [];
        for (const [i, u] of urls.entries()) {
          const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
          const type = res.headers.get("content-type") || "";
          if (!res.ok || !type.startsWith("image/")) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 4096) continue;
          const file = `${String(i + 1).padStart(2, "0")}.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
          writeFileSync(join(dir, file), buf);
          saved.push({ file, url: u, bytes: buf.length });
        }
        writeFileSync(join(dir, "index.json"), `${JSON.stringify({ id: p.id, itemUrl: p.itemUrl, storeTitle: found.title, images: saved }, null, 1)}\n`);
        report.push({ id: p.id, status: "OK", images: saved.length });
        console.log(`${p.id}: ${saved.length} image(s) from the store gallery`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
