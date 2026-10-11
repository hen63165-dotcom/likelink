#!/usr/bin/env node
// Visual audit of the LIVE site: full-page screenshots of the key buyer and
// creator pages at phone (390) and desktop (1440) width, printed to the log
// as base64 (===IMG name i/n===) for review. Analytics POSTs are aborted so
// the audit adds no fake views/clicks; store links are never opened.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
const BASE = "https://likelink2.vercel.app";
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "audit") : "audit-out";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const ALL = [["home", "/"], ["search", "/search?q=%D7%A6%D7%9E%D7%99%D7%93"], ["product", "/p/p-live-05"], ["reels", "/reels"], ["creator", "/u/alyostyle"], ["products", "/products"], ["discover", "/discover"], ["sell", "/sell"], ["studio", "/studio"], ["pricing", "/pricing"], ["status", "/status"]];
// PAGES=home,product (names) picks pages; FULL=1 takes full-page phone shots. The
// default (the first screen of the key pages) keeps the log small enough to read back.
const pick = String(process.env.PAGES || "home,product,creator,reels,products,studio").split(",").map((s) => s.trim());
const PAGES = ALL.filter(([name]) => pick.includes(name));
const FULL = process.env.FULL === "1";
const emit = (name, file) => { const b = readFileSync(file).toString("base64"); const n = Math.ceil(b.length / 4000); for (let i = 0; i < n; i++) console.log(`===IMG ${name} ${i + 1}/${n}===${b.slice(i * 4000, (i + 1) * 4000)}`); };
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
// Which build is live (scripts/write-version.mjs); older builds have no /version.json.
console.log(`LIVE_VERSION ${await fetch(`${BASE}/version.json`).then((r) => (r.ok ? r.text() : `http_${r.status}`)).catch((e) => String(e)).then((t) => t.replace(/\s+/g, " ").slice(0, 200))}`);
for (const [vp, w, h] of [["m", 390, 844], ["d", 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL" });
  await ctx.route("**/api/store**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  for (const [name, p] of PAGES) {
    await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const f = path.join(OUT, `${vp}-${name}.jpg`);
    await page.screenshot({ path: f, type: "jpeg", quality: 45, fullPage: FULL && vp === "m" }).catch(() => null);
    const info = await page.evaluate(() => ({ h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 60), height: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > window.innerWidth, videos: document.querySelectorAll("video").length, posts: document.querySelectorAll(".lx-post").length, version: "" })).catch(() => ({}));
    console.log(`PAGE ${vp} ${name} ${JSON.stringify(info)}`);
    emit(`${vp}-${name}`, f);
  }
  await ctx.close();
}
await browser.close();
