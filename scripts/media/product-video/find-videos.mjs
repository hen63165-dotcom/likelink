#!/usr/bin/env node
// Real product video — runner side (.github/workflows/product-video.yml).
//
// For each product, Google Chrome follows the product's OWN affiliate link to
// the store's product page (one page view, no clicks, no cart — the same
// read-only visit the catalog resolver makes) and looks for the seller's own
// product video: video responses the page loads, <video> sources, and .mp4
// URLs in the page's own data. The first one found is downloaded and checked
// with ffprobe (a real video stream, its length and size).
//
// A CAPTCHA stops the run: no retries, no workaround.
//
// Videos already found (<out dir>/videos.json + <id>.mp4, restored by the
// workflow from the "product-video-sources" release) are reused: only products
// without one are visited, so re-editing a reel never asks the store again.
// Naming product ids forces a fresh visit for those products.
//
//   node scripts/media/product-video/find-videos.mjs <out dir> [productId...]
// Products come from public/snapshot/kv.json (the public storefront copy).
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const out = process.argv[2] || "product-videos";
const only = new Set(process.argv.slice(3));
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };

const STORE_VIDEO = /^https:\/\/[a-z0-9.-]*(aliexpress-media\.com|alicdn\.com|alivideo\.com|aliexpress\.com|taobao\.com|tbcdn\.cn)\/.+\.mp4(\?.*)?$/i;

export function videoUrlsInText(text) {
  const found = new Set();
  const s = String(text || "").replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  for (const m of s.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\/[^"'\s<>\\]+?\.mp4(?:\?[^"'\s<>\\]*)?/gi)) {
    const url = m[0].startsWith("//") ? `https:${m[0]}` : m[0].replace(/^http:/, "https:");
    if (STORE_VIDEO.test(url)) found.add(url);
  }
  return [...found];
}

function probe(file) {
  const json = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  const d = JSON.parse(json);
  const v = (d.streams || []).find((s) => s.codec_type === "video");
  return { video: Boolean(v), width: v?.width || 0, height: v?.height || 0, audio: (d.streams || []).some((s) => s.codec_type === "audio"), seconds: Number(d.format?.duration || 0) };
}

async function main() {
  const doc = JSON.parse(readFileSync(new URL("../../../public/snapshot/kv.json", import.meta.url), "utf8"));
  const all = (doc.keys["marketplace:products"] || []).filter((p) => p.affiliateUrl);
  mkdirSync(out, { recursive: true });
  const prior = existsSync(join(out, "videos.json")) ? JSON.parse(readFileSync(join(out, "videos.json"), "utf8")).results || [] : [];
  const kept = new Map(prior.filter((r) => r.status === "FOUND" && existsSync(join(out, `${r.productId}.mp4`))).map((r) => [r.productId, r]));
  const products = all.filter((p) => (only.size ? only.has(p.id) : !kept.has(p.id)));
  const results = all.filter((p) => kept.has(p.id) && !products.includes(p)).map((p) => kept.get(p.id));
  summary(`## Real product videos — ${new Date().toISOString()} (${results.length} kept from earlier runs, ${products.length} to look for)`);
  if (!products.length) {
    writeFileSync(join(out, "videos.json"), JSON.stringify({ at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID || "", results }, null, 2));
    return;
  }

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome" });
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  for (const p of products) {
    const page = await ctx.newPage();
    const seen = new Set();
    page.on("response", (r) => {
      const u = r.url();
      const type = r.headers()["content-type"] || "";
      if (/^video\//i.test(type) || STORE_VIDEO.test(u)) seen.add(u);
    });
    const row = { productId: p.id, title: p.title, affiliateUrl: p.affiliateUrl };
    try {
      await page.goto(p.affiliateUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(6000);
      const found = await page.evaluate(() => ({
        url: location.href,
        title: document.title || "",
        videos: [...document.querySelectorAll("video, video source")].map((v) => v.currentSrc || v.src || "").filter(Boolean),
        html: document.documentElement.outerHTML,
      }));
      row.itemUrl = found.url.split("?")[0];
      if (/_____tmd_____|\/punish|captcha/i.test(found.url) || /captcha/i.test(found.title)) {
        row.status = "SOURCE_BLOCKED";
        summary(`- ${p.id}: SOURCE_BLOCKED (CAPTCHA) — stopping this run, no workaround`);
        break;
      }
      const candidates = [...new Set([...seen, ...found.videos, ...videoUrlsInText(found.html)])].filter((u) => /^https:/.test(u));
      row.candidates = candidates.slice(0, 6);
      if (!candidates.length) {
        row.status = "NO_VIDEO_ON_PAGE";
        summary(`- ${p.id}: no seller video on ${row.itemUrl.slice(0, 70)}`);
      } else {
        const file = join(out, `${p.id}.mp4`);
        let saved = false;
        for (const u of candidates) {
          try {
            const res = await fetch(u, { headers: { Referer: row.itemUrl, "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
            const type = res.headers.get("content-type") || "";
            const buf = Buffer.from(await res.arrayBuffer());
            if (!res.ok || buf.length < 50_000 || (!/video|octet-stream/i.test(type))) continue;
            // Written aside first: a bad download never replaces a good video found earlier.
            writeFileSync(`${file}.part`, buf);
            const info = probe(`${file}.part`);
            if (!info.video || info.seconds < 2) continue;
            renameSync(`${file}.part`, file);
            Object.assign(row, { status: "FOUND", videoUrl: u, bytes: statSync(file).size, ...info });
            saved = true;
            break;
          } catch { /* next candidate */ }
        }
        if (!saved) row.status = row.status || "VIDEO_NOT_DOWNLOADABLE";
        summary(`- ${p.id}: ${row.status}${saved ? ` · ${row.width}x${row.height} · ${row.seconds.toFixed(1)}s · audio ${row.audio ? "yes" : "no"} · ${(row.bytes / 1e6).toFixed(1)} MB` : ` (${candidates.length} candidate URLs)`}`);
      }
    } catch (e) {
      row.status = "FAILED";
      row.error = String(e?.message || e).slice(0, 200);
      summary(`- ${p.id}: FAILED ${row.error}`);
    } finally {
      // A fresh look that found nothing never throws away a video found earlier.
      results.push(row.status === "FOUND" || !kept.has(p.id) ? (row.status ? row : { ...row, status: "UNKNOWN" }) : kept.get(p.id));
      await page.close();
    }
  }
  await browser.close();
  // Products a CAPTCHA kept us from re-checking keep the video found earlier.
  for (const p of products) if (!results.some((r) => r.productId === p.id) && kept.has(p.id)) results.push(kept.get(p.id));
  writeFileSync(join(out, "videos.json"), JSON.stringify({ at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID || "", results }, null, 2));
  summary(`With a seller video: ${results.filter((r) => r.status === "FOUND").length}/${all.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; });
