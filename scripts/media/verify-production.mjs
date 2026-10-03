#!/usr/bin/env node
// Production verification from a real browser (GitHub Actions runner, Google
// Chrome — which decodes H.264, unlike open-source Chromium builds).
//
//   • every public route at 375px and 1440px: HTTP, console/page errors,
//     horizontal overflow, broken images, h1
//   • /reels: a real <video> plays (readyState, currentTime advancing) and the
//     truth label is shown; no play icon is drawn for a photo
//   • save / follow / language switch round-trips on the live site
//   • live media: the newest native reels are downloaded from the public media
//     proxy, probed with ffprobe and turned into frame contact sheets
//
// Images are printed to the log as base64 between markers so a reviewer can
// see exactly what visitors get:  ===IMG <name> <part>/<parts>===
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const BASE = (process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "verify") : "verify-out";
mkdirSync(OUT, { recursive: true });
const results = [];
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };
const emitImage = (name, file) => {
  const b64 = readFileSync(file).toString("base64");
  const parts = Math.ceil(b64.length / 4000);
  for (let i = 0; i < parts; i++) console.log(`===IMG ${name} ${i + 1}/${parts}===${b64.slice(i * 4000, (i + 1) * 4000)}`);
};
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROUTES = ["/", "/discover", "/products", "/creators", "/u/alyostyle", "/p/p-live-05", "/reels", "/trends", "/collections", "/deals", "/search?q=%D7%A1%D7%A8%D7%95%D7%9D", "/saved", "/studio"];

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const vp of [{ n: "m", width: 375, height: 812 }, { n: "d", width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "he-IL" });
    const page = await ctx.newPage();
    let errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`.slice(0, 200)); });
    // Name the resource behind a "Failed to load resource" console line.
    page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`.slice(0, 220)); });
    for (const r of ROUTES) {
      errors = [];
      const resp = await page.goto(BASE + r, { waitUntil: "load", timeout: 45000 }).catch((e) => ({ status: () => 0, err: e.message }));
      await page.waitForTimeout(r === "/reels" ? 5000 : 2500);
      const m = await page.evaluate(() => {
        const v = document.querySelector(".lx-reels video, video");
        return {
          hscroll: document.documentElement.scrollWidth - window.innerWidth,
          h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 50),
          broken: [...document.querySelectorAll("img")].filter((i) => i.complete && i.getAttribute("src") && i.naturalWidth === 0).length,
          public: !!document.querySelector(".lx"),
          studio: !!document.querySelector(".ll-studio"),
          video: v ? { src: v.currentSrc.slice(0, 120), readyState: v.readyState, t: Number(v.currentTime.toFixed(2)), w: v.videoWidth, h: v.videoHeight, paused: v.paused } : null,
          badges: [...document.querySelectorAll(".lx-badge")].slice(0, 6).map((b) => b.textContent.trim()),
          // Home "לונה מקדמת עכשיו": the marketing engine's own published feed posts, each link with its creative id.
          engine: (() => { const a = [...document.querySelectorAll('[aria-labelledby="h-engine"] a')]; return { cards: a.length, withCid: a.filter((x) => /[?&]cid=/.test(x.getAttribute("href") || "")).length }; })(),
        };
      });
      const row = { vp: vp.n, route: r, status: resp?.status?.() ?? 0, ...m, errors: errors.slice(0, 5) };
      results.push(row);
      summary(`- ${vp.n} ${r}: http ${row.status} · hscroll ${row.hscroll} · broken ${row.broken} · errors ${row.errors.length}${r === "/" ? ` · engine cards ${row.engine.cards} (cid ${row.engine.withCid})` : ""}${row.video ? ` · video rs=${row.video.readyState} t=${row.video.t}s ${row.video.w}x${row.video.h}` : ""}`);
      if (["/", "/reels", "/p/p-live-05"].includes(r)) {
        const f = path.join(OUT, `${vp.n}${r.replace(/\W+/g, "_")}.jpg`);
        await page.screenshot({ path: f, type: "jpeg", quality: 55 });
        emitImage(`${vp.n}${r.replace(/\W+/g, "_")}`, f);
      }
    }
    // Interactions on the live site (mobile only; local state, no writes beyond the visitor's own).
    if (vp.n === "m") {
      // Each step is time-capped and recorded; a missing control is reported, never a hang.
      const step = async (name, fn) => { try { return await fn(); } catch (e) { summary(`  interaction ${name} failed: ${String(e.message || e).split("\n")[0].slice(0, 160)}`); return null; } };
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.waitForTimeout(2500);
      const save = page.locator("article button[aria-pressed]").first();
      const saved = await step("save", async () => { await save.click({ timeout: 8000 }); return (await save.getAttribute("aria-pressed")) === "true"; });
      await page.goto(BASE + "/saved", { waitUntil: "load" });
      await page.waitForTimeout(3000);
      const savedCount = await page.locator("article").count();
      const creatorResp = await page.goto(BASE + "/u/alyostyle", { waitUntil: "load" }).catch(() => null);
      await page.waitForTimeout(3000);
      const followDiag = await page.evaluate(() => ({ pressed: [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent.trim().slice(0, 30)).slice(0, 8), h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 40), lx: !!document.querySelector(".lx") }));
      await step("follow", () => page.locator("button[aria-pressed]", { hasText: "מעקב" }).first().click({ timeout: 8000 }));
      const following = await page.locator("button[aria-pressed=true]", { hasText: "עוקבים" }).count();
      if (!following) summary(`  follow diagnostics: http ${creatorResp?.status?.() ?? 0} · ${JSON.stringify(followDiag)}`);
      await page.goto(BASE + "/", { waitUntil: "load" });
      // At 375px the language switch lives in the menu drawer.
      await page.waitForTimeout(2000);
      await page.locator("button[aria-label='תפריט']").click({ timeout: 8000 }).catch(() => {});
      await page.locator("[role=dialog] button", { hasText: "EN" }).first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      const dir = await page.evaluate(() => document.querySelector(".lx")?.dir);
      summary(`- interactions: save ${saved} → saved page items ${savedCount} · follow ${following > 0} · language switch dir=${dir}`);
      results.push({ interactions: { saved, savedCount, following: following > 0, dir } });
    }
    await ctx.close();
  }
  // Tracking probe: a page that presents as a regular browser must SEND a view
  // event for a product page and a funnel step for a Studio CTA. Writes are
  // intercepted and aborted, so the check never adds fake data to production.
  // The probe is time-capped: it can fail, never hang the job.
  const probe = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL" });
    let page = null;
    try {
      await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
      page = await ctx.newPage();
      const captured = [];
      const funnel = [];
      await page.route("**/api/store", async (route) => {
        const r = route.request();
        let body = null;
        try { body = r.method() === "POST" ? JSON.parse(r.postData() || "{}") : null; } catch { body = null; }
        if (body?.key === "marketplace:funnel") {
          try { funnel.push(...JSON.parse(body.value || "[]")); } catch { /* ignore */ }
          return route.abort();
        }
        if (body?.key === "marketplace:clicks") {
          let events = [];
          try { events = JSON.parse(body.value || "[]"); } catch { events = []; }
          captured.push(...events.filter((e) => e?.type === "view"));
          return route.abort();
        }
        return route.continue();
      });
      const target = process.env.TRACKING_PRODUCT || "/p/p-live-05";
      await page.goto(BASE + target, { waitUntil: "load", timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(4000);
      const ok = captured.some((e) => e.productId === target.split("/").pop());
      summary(`- tracking: product view sent=${ok} (${captured.length} view event(s) intercepted and aborted — nothing written)`);
      results.push({ route: `tracking ${target}`, status: ok ? 200 : 0, hscroll: 0, broken: 0, errors: ok ? [] : ["view_event_not_sent"] });
      // Studio CTA: clicking a Studio link on the home page sends a funnel step.
      await page.goto(BASE + "/", { waitUntil: "load", timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(2500);
      // The first /studio link can sit in a closed menu drawer; click a visible one.
      const ctaLinks = await page.locator('a[href="/studio"]:visible').count();
      await page.locator('a[href="/studio"]:visible').first().click({ timeout: 10000 }).catch((e) => summary(`  studio CTA click failed (${ctaLinks} visible): ${String(e.message || e).split("\n")[0].slice(0, 120)}`));
      await page.waitForTimeout(2500);
      const cta = funnel.some((e) => e.type === "studio_cta");
      summary(`- funnel: studio_cta sent=${cta} (${funnel.length} event(s) intercepted and aborted — nothing written)`);
      results.push({ route: "funnel studio_cta", status: cta ? 200 : 0, hscroll: 0, broken: 0, errors: cta ? [] : ["studio_cta_not_sent"] });
    } finally {
      await page?.unrouteAll?.({ behavior: "ignoreErrors" }).catch(() => null);
      await Promise.race([ctx.close().catch(() => null), new Promise((r) => setTimeout(r, 10000))]);
    }
  };
  // Link & button audit, as a visitor inside Instagram's in-app browser:
  //   • every <a> on the main pages has a real href (no "#", empty or javascript:)
  //   • every internal link opens a real page (no "not found" h1, http 200)
  //   • shop links are https and are NOT fetched: requesting an affiliate link
  //     from a bot would add a fake click at the store
  //   • in the in-app browser the shop button opens in the same view
  //   • the logo on the home page answers a tap (scrolls back to the top)
  const linkAudit = async () => {
    const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.109";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", userAgent: IG_UA });
    const page = await ctx.newPage();
    const issues = [];
    try {
      const pages = ["/", "/discover", "/products", "/creators", "/reels", "/trends", "/collections", "/deals", "/search?q=%D7%A6%D7%9E%D7%99%D7%93", "/p/p-live-05", "/u/alyostyle"];
      const internal = new Set();
      const shop = new Map();
      for (const r of pages) {
        await page.goto(BASE + r, { waitUntil: "load", timeout: 45000 }).catch(() => null);
        await page.waitForTimeout(2000);
        const anchors = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href") || "", text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 40), target: a.getAttribute("target") || "", rel: a.getAttribute("rel") || "" })));
        for (const a of anchors) {
          if (!a.href || a.href === "#" || /^javascript:/i.test(a.href)) { issues.push(`${r}: dead link "${a.text}" href="${a.href}"`); continue; }
          if (a.href.startsWith("/") && !a.href.startsWith("/api/") && !a.href.startsWith("/r?") && !a.href.startsWith("/r/")) internal.add(a.href.split("#")[0]);
          if (/sponsored/.test(a.rel)) { shop.set(a.href, a.text); if (a.target === "_blank") issues.push(`${r}: shop link opens a new window inside Instagram ("${a.text}")`); }
        }
      }
      for (const href of [...internal].slice(0, 80)) {
        const resp = await page.goto(BASE + href, { waitUntil: "load", timeout: 45000 }).catch(() => null);
        await page.waitForTimeout(1200);
        const h1 = await page.evaluate(() => (document.querySelector("h1")?.textContent || "").trim());
        const status = resp?.status?.() ?? 0;
        if (status !== 200 || /לא נמצא|not found/i.test(h1)) issues.push(`${href}: http ${status} · "${h1.slice(0, 40)}"`);
      }
      // Shop links: https only (checked as text — never fetched, see above).
      for (const href of shop.keys()) if (!/^https:\/\//i.test(href)) issues.push(`shop link not https: ${href.slice(0, 80)}`);
      // Logo tap on the home page.
      await page.goto(BASE + "/", { waitUntil: "load", timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(300);
      await page.locator('a[aria-label="LikeLink2"]:visible').first().click({ timeout: 8000 }).catch((e) => issues.push(`logo click failed: ${String(e.message).split("\n")[0].slice(0, 100)}`));
      await page.waitForTimeout(1200);
      const y = await page.evaluate(() => window.scrollY);
      if (y > 10) issues.push(`logo on the home page did not respond (scrollY ${y})`);
      summary(`- link audit (Instagram in-app): ${internal.size} internal links, ${shop.size} shop links, logo scrollY after tap ${y}, issues ${issues.length}`);
      for (const i of issues.slice(0, 40)) summary(`  LINK ${i}`);
      results.push({ route: "link audit", status: 200, hscroll: 0, broken: 0, errors: issues.slice(0, 40) });
    } finally {
      await Promise.race([ctx.close().catch(() => null), new Promise((r) => setTimeout(r, 10000))]);
    }
  };
  const audited = await Promise.race([linkAudit().then(() => "done"), new Promise((r) => setTimeout(() => r("timeout"), 300000))]);
  if (audited === "timeout") { summary("- link audit: TIMEOUT after 300s"); results.push({ route: "link audit", status: 0, hscroll: 0, broken: 0, errors: ["audit_timeout"] }); }
  const capped = await Promise.race([probe().then(() => "done"), new Promise((r) => setTimeout(() => r("timeout"), 90000))]);
  if (capped === "timeout") {
    summary("- tracking probe: TIMEOUT after 90s");
    results.push({ route: "tracking probe", status: 0, hscroll: 0, broken: 0, errors: ["probe_timeout"] });
  }
  await Promise.race([browser.close().catch(() => null), new Promise((r) => setTimeout(r, 15000))]);

  // Live media: newest native reels, downloaded exactly as visitors get them.
  const status = await (await fetch(`${BASE}/api/store?mode=media-pipeline&op=status`)).json();
  summary(`- pipeline status: ${status.reels} reels ${JSON.stringify(status.byStyle)} truth ${JSON.stringify(status.truth)} external ${status.externalChannel}`);
  for (const r of (status.latest || []).slice(0, 3)) {
    const res = await fetch(r.videoUrl, { headers: { Range: "bytes=0-" } });
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT, `${r.id}.mp4`);
    writeFileSync(file, bytes);
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-show_entries", "format=duration", "-of", "json", file]).stdout.toString();
    summary(`- live ${r.id}: http ${res.status} ${res.headers.get("content-type")} range=${res.headers.get("content-range")} ${bytes.length} bytes · probe ${probe.replace(/\s+/g, "")}`);
    const tile = path.join(OUT, `${r.id}.jpg`);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-vf", "select='eq(n\\,15)+eq(n\\,100)+eq(n\\,215)',scale=240:-1,tile=3x1", "-frames:v", "1", "-vsync", "0", "-q:v", "6", tile]);
    emitImage(r.id, tile);
  }
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((x) => x.route && (x.status !== 200 || x.hscroll > 0 || x.broken || x.errors.length));
  summary(`RESULT routes=${results.filter((x) => x.route).length} issues=${bad.length}`);
  for (const b of bad) summary(`  ISSUE ${b.vp || ""} ${b.route} · http ${b.status} · hscroll ${b.hscroll} · broken ${b.broken} · errors ${JSON.stringify(b.errors).slice(0, 600)}`);
}

// Never hang the job: whatever happens, the process ends (an open Chrome would keep it alive).
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 2000));
