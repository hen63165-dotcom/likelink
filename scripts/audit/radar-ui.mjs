#!/usr/bin/env node
// The radar's UI on a real build with live data (Master Execution Order, verification gate):
// /radar, /radar-pro and /magic, in Hebrew and English, at phone (390) and desktop (1440) width.
// Every write is aborted (no fake views, clicks, engagement or waitlist rows); store links are
// never opened. Fails (exit 1) on horizontal overflow, a missing heading, a page error, no live
// card on the radar, a price on the tiers or a missing waitlist button. Screenshots go to
// $RUNNER_TEMP/audit (the workflow publishes them).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

// AUDIT_BASE: a hosted build (Netlify/Vercel), or this branch served on the runner (127.0.0.1:4173).
const BASE = /^(https:\/\/[a-z0-9.-]+\.(netlify\.app|vercel\.app)|http:\/\/127\.0\.0\.1:4173)$/.test(process.env.AUDIT_BASE || "") ? process.env.AUDIT_BASE : "https://likelink2.vercel.app";
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "audit") : "audit-out";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL ${m}`); };
console.log(`BASE ${BASE}`);
console.log(`VERSION ${await fetch(`${BASE}/version.json`).then((r) => (r.ok ? r.text() : `http_${r.status}`)).catch((e) => String(e)).then((t) => t.replace(/\s+/g, " ").slice(0, 200))}`);

for (const lang of ["he", "en"]) {
  for (const [vp, w, h] of [["m", 390, 844], ["d", 1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: lang === "he" ? "he-IL" : "en-US" });
    await ctx.addInitScript((l) => { try { localStorage.setItem("sch:local:ui:lang", l); } catch { /* */ } }, lang);
    // No write leaves the audit: events, waitlist, settings.
    await ctx.route("**/api/store**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
    await ctx.route("**/functions/v1/api/**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 160)));
    // Diagnostics: where the board came from (or why it did not), and console errors.
    page.on("response", (r) => { if (/board\.json/.test(r.url())) console.log(`BOARD ${r.status()} ${r.headers()["content-type"] || ""} ${r.url()}`); });
    page.on("requestfailed", (r) => { if (/board\.json/.test(r.url())) console.log(`BOARD_FAILED ${r.failure()?.errorText || ""} ${r.url()}`); });
    page.on("console", (m) => { if (m.type() === "error" && /board|radar|CORS|blocked/i.test(m.text())) console.log(`CONSOLE ${m.text().slice(0, 200)}`); });
    for (const [name, p] of [["radar", "/radar"], ["radar-pro", "/radar-pro"], ["magic", "/magic"]]) {
      errors.length = 0;
      await page.goto(BASE + p, { waitUntil: "load", timeout: 45000 }).catch((e) => fail(`${lang} ${vp} ${name} load: ${e.message}`));
      await page.waitForTimeout(4000);
      if (name === "radar") await page.getByRole("button", { name: lang === "he" ? /מה הולך להיות להיט/ : /about to be a hit/ }).click().catch(() => null);
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => ({
        h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 80),
        dir: document.documentElement.dir,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        cards: document.querySelectorAll("main li article, li.lx-card, article.lx-card").length,
        alpha: /Alpha/.test(document.body.innerText),
        text: document.body.innerText.slice(0, 20000),
      })).catch(() => ({}));
      const label = `${lang} ${vp} ${name}`;
      console.log(`PAGE ${label} ${JSON.stringify({ h1: info.h1, dir: info.dir, overflowX: info.overflowX, cards: info.cards, alpha: info.alpha, errors: errors.length })}`);
      if (!info.h1) fail(`${label}: no heading`);
      if (info.overflowX) fail(`${label}: horizontal overflow`);
      if (errors.length) fail(`${label}: page error ${errors[0]}`);
      if (info.dir !== (lang === "he" ? "rtl" : "ltr")) fail(`${label}: direction ${info.dir}`);
      if (name === "radar" && !info.cards) fail(`${label}: no live radar card`);
      if (name === "radar-pro") {
        const t = info.text || "";
        if (!(lang === "he" ? /מחיר: עוד לא נקבע/ : /Price: not set yet/).test(t)) fail(`${label}: the tiers do not say the price is not set`);
        if (/₪\s?\d/.test(t.split(lang === "he" ? "המסלולים" : "The tiers").pop() || "")) fail(`${label}: a shekel price appears on the tiers`);
        if (!(lang === "he" ? /הצטרפות לרשימת ההמתנה/ : /Join the waitlist/).test(t)) fail(`${label}: no waitlist button`);
        if (/היחיד בעולם|only one in the world|guaranteed/i.test(t)) fail(`${label}: a claim we may not make`);
      }
      await page.screenshot({ path: path.join(OUT, `${lang}-${vp}-${name}.jpg`), type: "jpeg", quality: 55, fullPage: true }).catch(() => null);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failures.length ? `RADAR_UI FAILED ${failures.length}` : "RADAR_UI OK");
process.exit(failures.length ? 1 : 0);
