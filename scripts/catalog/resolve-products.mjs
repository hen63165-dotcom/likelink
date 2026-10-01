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
  // Evidence mode: submit observations a previous run made on the store's own
  // product pages (EVIDENCE_JSON = [{productId,itemUrl,image,storeTitle,observedInRun}]).
  // The server applies exactly the same checks (product page, store CDN, it
  // downloads the image itself, read-back) — no store request is made here.
  if (process.env.EVIDENCE_JSON && process.env.EVIDENCE_JSON.trim()) {
    const list = JSON.parse(process.env.EVIDENCE_JSON);
    summary(`## Catalog resolver — evidence mode (${list.length})`);
    let bad = 0;
    for (const e of list) {
      const r = await api("catalog-resolve", { method: "POST", body: e });
      summary(`- ${e.productId}: http ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
      if (r.status !== 200) bad += 1;
    }
    if (bad) process.exitCode = 1;
    return;
  }
  const c = await api("catalog-candidates");
  if (c.status !== 200 || !c.json?.ok) throw new Error(`candidates_failed ${c.status} ${JSON.stringify(c.json).slice(0, 200)}`);
  summary(`## Catalog resolver — ${new Date().toISOString()}${DRY ? " (dry run)" : ""}`);
  summary(`Candidates: ${c.json.candidates.length} · products with a shared link (owner must add the product's own link): ${c.json.needsOwnerLink.length}`);
  if (!c.json.candidates.length) return;

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome" });
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  let failures = 0;
  let blocked = false;
  for (const p of c.json.candidates) {
    // One CAPTCHA means the store is blocking automation right now: stop asking it
    // (no retries, no workaround); the remaining products wait for the next run.
    if (blocked) { summary(`- ${p.id}: skipped — the store blocked automation earlier in this run`); continue; }
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
      const captcha = /_____tmd_____|\/punish|captcha/i.test(found.url) || /captcha/i.test(found.title);
      if (captcha || !/\/item\/\d+\.html$/.test(itemUrl) || !image) {
        failures += 1;
        const status = captcha ? "SOURCE_BLOCKED" : "NOT_PRODUCT_PAGE";
        summary(`  - ${status} — nothing written to the product`);
        if (captcha) blocked = true;
        if (!DRY) {
          const r = await api("catalog-resolve-status", { method: "POST", body: { productId: p.id, status, detail: captcha ? "captcha" : itemUrl.slice(0, 100) } });
          summary(`  - recorded: http ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
        }
        continue;
      }
      if (DRY) continue;
      const r = await api("catalog-resolve", { method: "POST", body: { productId: p.id, itemUrl, image, storeTitle: found.title.slice(0, 140), observedInRun: process.env.GITHUB_RUN_ID || "" } });
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
