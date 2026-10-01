#!/usr/bin/env node
// Catalog truth resolver — runner side (.github/workflows/catalog-resolve.yml).
//
//   GET  /api/store?mode=media-pipeline&op=catalog-candidates   (what needs a real photo)
//   →    Google Chrome follows each product's own affiliate link to the store's
//        product page and reads the page's own og:image (the store's main photo)
//   POST /api/store?mode=media-pipeline&op=catalog-resolve       (server validates,
//        downloads the image itself, writes, reads back)
//
// Read-only on the store: one page view per product, no clicks, no cart.
// --dry-run prints what it found and sends nothing.
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

const API = String(process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.AUTOPILOT_SECRET || "";
const DRY = process.argv.includes("--dry-run");
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };

async function api(op, { method = "GET", body } = {}) {
  const res = await fetch(`${API}/api/store?mode=media-pipeline&op=${op}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, Origin: API, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function main() {
  if (!SECRET) throw new Error("AUTOPILOT_SECRET is required");
  const c = await api("catalog-candidates");
  if (c.status !== 200 || !c.json?.ok) throw new Error(`candidates_failed ${c.status} ${JSON.stringify(c.json).slice(0, 200)}`);
  summary(`## Catalog resolver — ${new Date().toISOString()}${DRY ? " (dry run)" : ""}`);
  summary(`Candidates: ${c.json.candidates.length} · products with a shared link (owner must add the product's own link): ${c.json.needsOwnerLink.length}`);
  if (!c.json.candidates.length) return;

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome" });
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  let failures = 0;
  for (const p of c.json.candidates) {
    const page = await ctx.newPage();
    try {
      await page.goto(p.affiliateUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(4000);
      const found = await page.evaluate(() => ({
        url: location.href,
        og: document.querySelector('meta[property="og:image"]')?.content || "",
        title: document.querySelector('meta[property="og:title"]')?.content || document.title || "",
      }));
      const itemUrl = found.url.split("?")[0];
      let image = found.og.startsWith("//") ? `https:${found.og}` : found.og;
      image = image.replace(/_\d+x\d+(q\d+)?\.(jpg|png|webp)(_\.webp)?$/i, "");
      summary(`- ${p.id}: page ${itemUrl.slice(0, 80)} · image ${image.slice(0, 90) || "none"} · store title "${found.title.slice(0, 60)}"`);
      if (!/\/item\/\d+\.html$/.test(itemUrl) || !image) { failures += 1; summary("  - not a product page / no image (blocked or link opens another page) — nothing sent"); continue; }
      if (DRY) continue;
      const r = await api("catalog-resolve", { method: "POST", body: { productId: p.id, itemUrl, image } });
      summary(`  - server: http ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
      if (r.status !== 200) failures += 1;
    } catch (e) {
      failures += 1;
      summary(`- ${p.id}: FAILED ${String(e?.message || e).slice(0, 200)}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  summary(`Done: ${c.json.candidates.length - failures}/${c.json.candidates.length} resolved`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
