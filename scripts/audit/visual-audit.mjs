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
const PAGES = [["home", "/"], ["search", "/search?q=%D7%A6%D7%9E%D7%99%D7%93"], ["product", "/p/p-live-05"], ["reels", "/reels"], ["creator", "/u/alyostyle"], ["discover", "/discover"], ["sell", "/sell"], ["studio", "/studio"], ["pricing", "/pricing"]];
const emit = (name, file) => { const b = readFileSync(file).toString("base64"); const n = Math.ceil(b.length / 4000); for (let i = 0; i < n; i++) console.log(`===IMG ${name} ${i + 1}/${n}===${b.slice(i * 4000, (i + 1) * 4000)}`); };
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
for (const [vp, w, h] of [["m", 390, 844], ["d", 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL" });
  await ctx.route("**/api/store**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  for (const [name, p] of PAGES) {
    await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const f = path.join(OUT, `${vp}-${name}.jpg`);
    await page.screenshot({ path: f, type: "jpeg", quality: 50, fullPage: vp === "m", clip: vp === "m" ? undefined : undefined }).catch(() => null);
    const info = await page.evaluate(() => ({ h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 60), height: document.documentElement.scrollHeight, buttons: document.querySelectorAll("button,a.lx-btn").length })).catch(() => ({}));
    console.log(`PAGE ${vp} ${name} ${JSON.stringify(info)}`);
    emit(`${vp}-${name}`, f);
  }
  await ctx.close();
}
await browser.close();
