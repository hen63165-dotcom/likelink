#!/usr/bin/env node
// End-to-end check of one product's Creative Engine video on the LIVE site
// (Actions → "Visual audit", step "Product video end to end"). On a phone-size
// screen it opens the product page and the creator's storefront and checks:
//   - the product page loads (title, no sideways scroll) and lists the video;
//   - the video really plays (currentTime moves, 1080×1920 frames, no error),
//     with its label naming the seller's media in LikeLink2's edit;
//   - the shop buttons lead to the product's own affiliate link, marked sponsored;
//   - the site's own click tracking fires with the video's id (camp) — the
//     request is captured and ABORTED, so no fake click is stored, and the
//     store itself is never contacted (every request to it is aborted too);
//   - an unknown product shows the not-found page instead of breaking.
// Prints E2E <json> lines and writes e2e-<id>-*.jpg next to the screenshots.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = /^https:\/\/[a-z0-9.-]+\.(netlify\.app|vercel\.app|github\.io)(\/[a-z0-9-]+)?$/.test(process.env.AUDIT_BASE || "") ? process.env.AUDIT_BASE : "https://likelink2.vercel.app";
const ID = /^[a-z0-9-]{1,40}$/.test(process.env.E2E_PRODUCT || "") ? process.env.E2E_PRODUCT : "p-live-04";
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "audit") : "audit-out";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const kv = JSON.parse(readFileSync(new URL("../../public/snapshot/kv.json", import.meta.url), "utf8"));
const product = (kv.keys["marketplace:products"] || []).find((p) => p.id === ID);
const creator = (kv.keys["marketplace:marketers"] || []).find((m) => m.id === product?.marketerId);
const REEL = `v-lookbook-${ID}`;
const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass: Boolean(pass), ...detail });
  console.log(`E2E ${JSON.stringify({ name, pass: Boolean(pass), ...detail })}`);
};

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", isMobile: true, hasTouch: true });
// The site skips its own tracking in automated browsers; look like a person so
// the tracking call is made — then capture and abort it below (nothing is stored).
await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
const writes = [];
const storeHits = [];
await ctx.route("**/*", (route) => {
  const req = route.request();
  const url = req.url();
  if (/aliexpress|s\.click\./i.test(new URL(url).hostname)) {
    storeHits.push(url);
    return route.abort();
  }
  if (req.method() !== "GET" && /\/api\//.test(url)) {
    writes.push({ url, body: req.postData() || "" });
    return route.abort();
  }
  return route.continue();
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));

async function playCheck(locator) {
  return locator.evaluate(async (v) => {
    v.scrollIntoView({ block: "center" });
    v.muted = true;
    try { await v.play(); } catch (e) { return { error: String(e) }; }
    const t0 = v.currentTime;
    await new Promise((r) => setTimeout(r, 3000));
    return { src: v.currentSrc, t0, t1: v.currentTime, readyState: v.readyState, w: v.videoWidth, h: v.videoHeight, duration: v.duration, error: v.error ? v.error.code : null };
  });
}

// 1) The product page.
await page.goto(`${BASE}/p/${ID}`, { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(3500);
const h1 = (await page.locator("h1").first().textContent().catch(() => "")) || "";
check("product_page_loads", h1.trim().length > 0 && String(product?.title || "").includes(h1.trim().slice(0, 12)), { url: `${BASE}/p/${ID}`, h1: h1.trim().slice(0, 80) });
check("no_sideways_scroll_phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
const video = page.locator(`video[src*="lookbook-${ID}.mp4"]`).first();
check("video_on_product_page", (await video.count()) > 0);
if (await video.count()) {
  const v = await playCheck(video);
  check("video_plays", !v.error && v.t1 > v.t0 && v.readyState >= 2, v);
  check("video_is_vertical_1080x1920", v.w === 1080 && v.h === 1920, { w: v.w, h: v.h });
  const label = await video.locator("xpath=ancestor::article[1]").locator(".lx-post-source").textContent().catch(() => "");
  check("video_labelled_as_seller_media", /המוכר · בעריכת LikeLink2/.test(label || "") && !/UGC|אמיתי/.test(label || ""), { label });
  await video.locator("xpath=ancestor::article[1]").screenshot({ path: path.join(OUT, `e2e-${ID}-post.jpg`), type: "jpeg", quality: 70 }).catch(() => null);
}
await page.screenshot({ path: path.join(OUT, `e2e-${ID}-product.jpg`), type: "jpeg", quality: 55 });
const mainShop = page.locator('a[rel~="sponsored"]').first();
const mainHref = (await mainShop.getAttribute("href").catch(() => "")) || "";
check("shop_button_is_own_affiliate_link", mainHref === product?.affiliateUrl || mainHref.startsWith(String(product?.affiliateUrl || "").split("?")[0]), { href: mainHref.slice(0, 120) });

// 2) The creator's storefront: the same video as a shoppable post, its shop click tracked with the video's id.
if (creator?.slug) {
  await page.goto(`${BASE}/u/${creator.slug}`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(3500);
  const post = page.locator("article.lx-post", { has: page.locator(`video[src*="lookbook-${ID}.mp4"]`) }).first();
  check("video_post_on_creator_page", (await post.count()) > 0, { url: `${BASE}/u/${creator.slug}` });
  if (await post.count()) {
    const shop = post.locator('a[rel~="sponsored"]').first();
    const href = (await shop.getAttribute("href").catch(() => "")) || "";
    await post.scrollIntoViewIfNeeded();
    const before = writes.length;
    const popup = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await shop.click({ timeout: 8000 }).catch(() => null);
    const opened = await popup;
    await page.waitForTimeout(2500);
    const tracked = writes.slice(before).map((w) => w.body).join("\n");
    // The body may carry the click list as a JSON string, so match the values, not the quoting.
    check("shop_click_tracked_with_video_id", tracked.includes(ID) && tracked.includes(REEL), { campaign: REEL, writesCaptured: writes.length - before, stored: false });
    check("shop_opens_affiliate_link_only", Boolean(href) && (!opened || storeHits.some((u) => u.startsWith(href.split("?")[0]))), { href: href.slice(0, 120), storeRequestsAborted: storeHits.length });
    if (opened) await opened.close().catch(() => null);
  }
}

// 3) Error handling: an unknown product shows the not-found page.
await page.goto(`${BASE}/p/p-does-not-exist-e2e`, { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(2500);
const body = (await page.locator("body").innerText().catch(() => "")) || "";
check("unknown_product_not_found_page", /לא נמצא|לא מצאנו|not found/i.test(body), { sample: body.replace(/\s+/g, " ").slice(0, 80) });
check("no_page_errors", errors.length === 0, { errors: errors.slice(0, 3) });

await browser.close();
const pass = results.every((r) => r.pass);
writeFileSync(path.join(OUT, `e2e-${ID}.json`), `${JSON.stringify({ base: BASE, product: ID, campaign: REEL, pass, results, at: new Date().toISOString() }, null, 1)}\n`);
console.log(`E2E_RESULT ${pass ? "PASS" : "FAIL"} ${results.filter((r) => r.pass).length}/${results.length}`);
if (!pass) process.exitCode = 1;
