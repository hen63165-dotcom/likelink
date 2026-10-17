#!/usr/bin/env node
// Every growth feature checked on the LIVE site in a real browser (Actions →
// "Visual audit", step "Live features"). Read-only: every write the pages try
// is captured and ABORTED, the store is never contacted, media is read in
// 1 KB ranges from GitHub Pages only (never Supabase Storage). Checks:
//   - the revision the host serves (/version.json);
//   - store prices (₪, from the AliExpress API) and a loaded photo on every listed product page;
//   - /reels plays a video, and Luna's reel (an original AI character, labelled) plays;
//   - the reels feed, the Creative Engine ledger, the lookbook bytes on GitHub Pages;
//   - /guide (all 8 checks), /size (strip and bracelet answers equal sizeTool.js);
//   - IndexNow key file, Pinterest RSS (disclosure, utm, image), Daily Drop (today, disclosure, utm);
//   - /studio and /studio/creative-engine signed out (the entrance, no crash);
//   - no request from any page to a paid AI/video provider.
// Prints LIVE <json> lines and LIVE_SUMMARY; writes live-*.jpg next to the screenshots.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { GUIDE } from "../../src/lib/guide.js";
import { braceletFromWrist, ringFromCircumference } from "../../src/lib/sizeTool.js";
import { INDEXNOW_KEY } from "../indexnow.mjs";

const BASE = /^https:\/\/[a-z0-9.-]+\.(netlify\.app|vercel\.app|github\.io)(\/[a-z0-9-]+)?$/.test(process.env.AUDIT_BASE || "") ? process.env.AUDIT_BASE : "https://likelink2.vercel.app";
const PAGES = "https://hen63165-dotcom.github.io/likelink";
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "audit") : "audit-out";
mkdirSync(OUT, { recursive: true });
// Paid generation / avatar / voice providers: no public page may call one.
const PAID_HOSTS = /(^|\.)(openai\.com|elevenlabs\.io|replicate\.com|replicate\.delivery|klingai\.com|kling\.ai|heygen\.com|manymotions\.ai|higgsfield\.ai|makeugc\.ai|runwayml\.com|fal\.run|fal\.ai|stability\.ai|pika\.art|lumalabs\.ai|synthesia\.io|d-id\.com|captions\.ai)$/i;
const STORE_HOSTS = /(^|\.)(s\.click\.aliexpress\.com|aliexpress\.(com|us|ru))$/i;

const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`LIVE ${JSON.stringify({ name, pass: Boolean(pass), ...detail })}`);
};
async function get(url, init = {}) {
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow", ...init });
    return { status: res.status, type: res.headers.get("content-type") || "", text: init.method === "HEAD" ? "" : await res.text() };
  } catch (e) {
    return { status: 0, type: "", text: "", error: String(e?.message || e).slice(0, 120) };
  }
}
const json = (r) => { try { return JSON.parse(r.text); } catch { return null; } };
const priceText = (n) => `₪${Number.isInteger(n) ? n.toLocaleString("he-IL") : n.toFixed(2)}`;

/* ─────────────────────────────── over HTTP */
const version = json(await get(`${BASE}/version.json`));
check("revision_served", Boolean(version?.commit), { commit: String(version?.commit || "").slice(0, 7), builtAt: version?.builtAt || null });

const kv = json(await get(`${BASE}/snapshot/kv.json`));
const listed = (kv?.keys?.["marketplace:products"] || []).filter((p) => p && p.status === "approved");
check("catalog_copy", listed.length > 0, { listed: listed.length });

const key = await get(`${BASE}/${INDEXNOW_KEY}.txt`);
check("indexnow_key_live", key.status === 200 && key.text.trim() === INDEXNOW_KEY, { status: key.status });

const pins = await get(`${PAGES}/pins.xml`);
const items = [...pins.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const pinLinks = items.map((i) => (i.match(/<link>([^<]+)<\/link>/) || [])[1] || "");
// Product and reel pins (by their link) carry the disclosure; the size-meter pin links to a free tool, no affiliate link.
const adItems = items.filter((i) => /\/(p\/|reels)/.test((i.match(/<link>([^<]+)<\/link>/) || [])[1] || ""));
check("pinterest_rss", pins.status === 200 && items.length > 0 && pinLinks.every((l) => /utm_source=pinterest/.test(l)) && adItems.every((i) => /#פרסומת/.test(i)), {
  status: pins.status, items: items.length, withUtm: pinLinks.filter((l) => /utm_source=pinterest/.test(l)).length, productOrReelPins: adItems.length, withDisclosure: adItems.filter((i) => /#פרסומת/.test(i)).length,
});
const pinImage = (items[0]?.match(/<enclosure url="([^"]+)"/) || [])[1]?.replace(/&amp;/g, "&");
if (pinImage) {
  const img = await get(pinImage, { headers: { Range: "bytes=0-1023" } });
  check("pinterest_image_reachable", [200, 206].includes(img.status) && /^image\//.test(img.type), { status: img.status, type: img.type, host: new URL(pinImage).host });
}

const drop = json(await get(`${PAGES}/drop/today.json`));
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const dropTexts = [drop?.posts?.whatsapp?.text, drop?.posts?.telegram?.text, ...Object.values(drop?.posts || {}).map((p) => p?.caption)].filter(Boolean);
check("daily_drop_today", Boolean(drop) && [today, yesterday].includes(drop.date) && listed.some((p) => p.id === drop.product?.id), { date: drop?.date || null, product: drop?.product?.id || null });
check("daily_drop_disclosure_and_utm", dropTexts.length > 0 && dropTexts.every((t) => t.trim().startsWith("#פרסומת")) && /utm_campaign=daily_drop_\d{8}/.test(drop?.product?.link || ""), { posts: dropTexts.length, link: drop?.product?.link || null });
const dropPage = await get(`${PAGES}/drop/`);
check("daily_drop_page", dropPage.status === 200 && /#פרסומת/.test(dropPage.text), { status: dropPage.status });

const feed = json(await get(`${PAGES}/media/reels/index.json`));
const reels = feed?.reels || [];
const luna = reels.filter((r) => ["talking", "still"].includes(r.look));
const lookbooks = reels.filter((r) => r.look === "lookbook");
check("reels_feed", reels.length > 0 && reels.every((r) => (r.labels || []).some((l) => /#פרסומת/.test(l)) || ["talking", "still"].includes(r.look)), { reels: reels.length, looks: [...new Set(reels.map((r) => r.look))], luna: luna.length, lookbooks: lookbooks.length });
for (const [label, r] of [["luna_reel_bytes", luna[0]], ["lookbook_bytes", lookbooks[0]]]) {
  if (!r) { check(label, false, { reason: "none_in_feed" }); continue; }
  const v = await get(new URL(r.video, `${PAGES}/media/reels/index.json`).href, { headers: { Range: "bytes=0-1023" } });
  check(label, [200, 206].includes(v.status) && /video\/mp4/.test(v.type), { id: r.id, status: v.status, type: v.type });
}
const ledger = json(await get(`${PAGES}/media/creative/jobs.json`));
const jobs = ledger?.jobs || [];
check("creative_ledger_published", jobs.length > 0, { jobs: jobs.length, live: jobs.filter((j) => j.status === "LIVE").map((j) => j.productId), stored: jobs.filter((j) => j.status === "STORED").map((j) => j.productId) });

/* ─────────────────────────────── in a real browser (phone) */
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL", isMobile: true, hasTouch: true });
const hosts = new Set();
const paid = [];
const writes = [];
await ctx.route("**/*", (route) => {
  const req = route.request();
  const host = new URL(req.url()).hostname;
  hosts.add(host);
  if (PAID_HOSTS.test(host)) { paid.push(req.url().slice(0, 120)); return route.abort(); }
  if (STORE_HOSTS.test(host)) return route.abort();
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) { writes.push(req.url().slice(0, 100)); return route.abort(); }
  return route.continue();
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url().replace(BASE, "")}: ${String(e.message || e).slice(0, 160)}`));
const open = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(2500); };
const bodyText = () => page.evaluate(() => document.body.innerText);
async function plays(locator) {
  return locator.evaluate(async (v) => {
    v.scrollIntoView({ block: "center" });
    v.muted = true;
    try { await v.play(); } catch (e) { return { error: String(e).slice(0, 80) }; }
    const t0 = v.currentTime;
    await new Promise((r) => setTimeout(r, 2500));
    return { t0, t1: v.currentTime, w: v.videoWidth, h: v.videoHeight, src: (v.currentSrc || v.src).slice(-60) };
  }).catch((e) => ({ error: String(e).slice(0, 80) }));
}

// Prices and photos on every listed product page.
for (const p of listed) {
  await open(`/p/${p.id}`);
  const text = await bodyText();
  const img = await page.evaluate(() => [...document.querySelectorAll("main img, img")].filter((i) => i.getBoundingClientRect().width > 120).map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.currentSrc.slice(0, 90) }))[0] || null);
  const wantPrice = Number(p.price) > 0 && p.priceSource ? priceText(Number(p.price)) : null;
  check(`product_${p.id}`, (wantPrice ? text.includes(wantPrice) : text.includes("המחיר המעודכן בחנות")) && img?.ok, { price: wantPrice || "store-only", priceSource: p.priceSource || null, checkedAt: p.priceCheckedAt || null, image: img });
}
await page.screenshot({ path: path.join(OUT, "live-product.jpg"), quality: 70 });

// Reels: the first post plays; Luna's reel plays and is labelled AI.
await open("/reels");
const firstPlay = await plays(page.locator("video").first());
check("reels_page_plays", firstPlay.t1 > firstPlay.t0, firstPlay);
if (luna[0]) {
  await open(`/reels?r=${encodeURIComponent(`v-${luna[0].id}`)}`);
  const vids = page.locator("video");
  const n = await vids.count();
  let lunaPlay = null;
  for (let i = 0; i < n && !lunaPlay; i++) {
    const src = await vids.nth(i).evaluate((v) => v.currentSrc || v.src || v.querySelector("source")?.src || "");
    if (src.includes(String(luna[0].video).split("/").pop())) lunaPlay = await plays(vids.nth(i));
  }
  const text = await bodyText();
  check("luna_character_reel_plays", Boolean(lunaPlay && lunaPlay.t1 > lunaPlay.t0) && /AI/.test(text), { id: luna[0].id, look: luna[0].look, play: lunaPlay, aiLabel: /AI/.test(text) });
  await page.screenshot({ path: path.join(OUT, "live-luna.jpg"), quality: 70 });
}

// The free guide: all eight checks on the page.
await open("/guide");
const guideText = await bodyText();
const missing = GUIDE.checks.filter((c) => !guideText.includes(c.title.he)).map((c) => c.id);
check("guide_page", guideText.includes(GUIDE.title.he) && missing.length === 0, { checks: GUIDE.checks.length, missing });

// The size meter: a paper strip and a wrist, answers equal to sizeTool.js.
await open("/size");
await page.getByRole("button", { name: "פס נייר סביב האצבע" }).click();
await page.locator("input[type=number]").first().fill("54");
await page.waitForTimeout(500);
const ring = ringFromCircumference(54);
const stripText = await page.locator("[role=status]").first().innerText().catch(() => "");
check("size_ring_from_strip", stripText.includes(String(ring.us)) && stripText.includes(String(ring.eu)), { want: { us: ring.us, eu: ring.eu }, shown: stripText.replace(/\s+/g, " ").slice(0, 120) });
await page.getByRole("button", { name: "אורך צמיד" }).click();
await page.locator("input[type=number]").first().fill("15.5");
await page.waitForTimeout(500);
const b = braceletFromWrist(15.5);
const braceletText = await page.locator("[role=status]").first().innerText().catch(() => "");
check("size_bracelet_from_wrist", braceletText.includes(`${b.min}–${b.max}`), { want: `${b.min}–${b.max}`, shown: braceletText.replace(/\s+/g, " ").slice(0, 80) });
await page.screenshot({ path: path.join(OUT, "live-size.jpg"), quality: 70 });

// The Studio, signed out: the entrance with the real sign-up form; the engine's deep link does not crash.
for (const p of ["/studio", "/studio/creative-engine"]) {
  const before = errors.length;
  await open(p);
  const form = await page.locator("input[type=email]").count();
  check(`studio_signed_out_${p === "/studio" ? "entrance" : "engine_link"}`, form > 0 && errors.length === before, { emailFields: form, path: p });
}
await page.screenshot({ path: path.join(OUT, "live-studio.jpg"), quality: 70 });

check("no_paid_provider_requests", paid.length === 0, { paid, thirdPartyHosts: [...hosts].filter((h) => !/likelink2\.vercel\.app|github\.io|supabase\.co|netlify\.app/.test(h)).sort() });
check("no_page_errors", errors.length === 0, { errors: errors.slice(0, 5) });
console.log(`LIVE_WRITES_ABORTED ${writes.length}`);
await browser.close();

const failed = results.filter((r) => !r.pass).map((r) => r.name);
console.log(`LIVE_SUMMARY ${JSON.stringify({ base: BASE, passed: results.length - failed.length, of: results.length, failed })}`);
