#!/usr/bin/env node
// LikeLink content pack — marketing assets built ONLY from what is live on the
// site today (never invented):
//   1. a "picked this week" carousel (1080x1350 JPEG slides) from the public
//      product pages (/p/:id OG data: title, real store photo, catalog price);
//   2. a real screen-recording reel of the live site (search → "why here" →
//      product page), captions drawn as an overlay in the page, labelled as a
//      real screenshot, with LikeLink's own beat.
// Tracking writes made by the recording are intercepted and aborted, so the
// render never adds a fake view or click to production. Store affiliate links
// are never opened (that would be a fake click at the store).
//   node scripts/media/content/render-pack.mjs --out public/content/<date>
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const SITE = "https://likelink2.vercel.app";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg("out", "public/content/latest"));
const IDS = (arg("products", "p-live-01,p-live-04,p-live-05,p-live-03,p-live-02")).split(",");
mkdirSync(OUT, { recursive: true });
const UI = "'Noto Sans Hebrew','Noto Sans','DejaVu Sans',Arial,sans-serif";
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", rej); p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
  });
}

// Real product facts from the public product page (what a link preview sees).
async function productFacts(id) {
  const res = await fetch(`${SITE}/p/${encodeURIComponent(id)}`, { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  const html = await res.text();
  const meta = (p) => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1] || "";
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const product = ld.flatMap((x) => (x["@graph"] || [x])).find((x) => x["@type"] === "Product");
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const title = String(product?.name || meta("og:title")).replace(/\s*[—|·-]\s*LikeLink.*$/i, "").trim();
  const price = Number(offer?.price) || null;
  const image = meta("og:image");
  if (!title || !image || /icon-512/.test(image)) return null; // not attributable / no real photo → skipped
  return { id, title, price, image };
}

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();

/* ------------------------------------------------------------ carousel */
const facts = (await Promise.all(IDS.map((id) => productFacts(id).catch(() => null)))).filter(Boolean);
const slide = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const shell = (body) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;font-family:${UI};overflow:hidden}
.cover{height:100%;background:linear-gradient(150deg,#2b1650,#d22f5d);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px}
.k{font-size:44px;font-weight:800;opacity:.9}.h{font-size:118px;font-weight:900;line-height:1.05;margin:28px 0}.s{font-size:46px;font-weight:700}
.swipe{margin-top:60px;background:#fff;color:#2b1650;border-radius:60px;padding:22px 48px;font-size:42px;font-weight:900}
.p{height:100%;background:#faf7f2;display:flex;flex-direction:column}
.ph{flex:1;background:#fff center/contain no-repeat}
.info{padding:44px 60px 56px;background:#fff;border-top:1px solid #eee}
.n{font-size:30px;font-weight:800;color:#d22f5d}.t{font-size:52px;font-weight:900;line-height:1.2;margin:10px 0 18px;color:#17131f}
.pr{display:inline-block;background:#17131f;color:#fff;border-radius:18px;padding:14px 28px;font-size:46px;font-weight:900}
.note{font-size:26px;color:#6a6373;margin-top:16px}
.tag{position:absolute;top:36px;right:36px;background:rgba(23,19,31,.78);color:#fff;border-radius:40px;padding:12px 26px;font-size:28px;font-weight:700}
.brand{position:absolute;top:36px;left:40px;font-size:40px;font-weight:900;color:#17131f}
</style></head><body>${body}</body></html>`;
const prices = facts.map((f) => f.price).filter(Boolean);
const from = prices.length ? Math.floor(Math.min(...prices)) : null;
const slides = [
  shell(`<div class="cover"><div class="k">LikeLink2 · נבחרו השבוע</div><div class="h">${facts.length} תכשיטים<br>שווים שמירה</div><div class="s">${from ? `החל מ־₪${from} · מחיר בקטלוג` : "מחירים בקטלוג"}</div><div class="swipe">החליקי ←</div></div>`),
  ...facts.map((f, i) => shell(`<div class="p" style="position:relative"><div class="tag">תמונה אמיתית מדף המוצר</div><div class="brand">LikeLink<span style="color:#d22f5d">2</span></div><div class="ph" style="background-image:url('${esc(f.image)}')"></div><div class="info"><div class="n">${i + 1} / ${facts.length}</div><div class="t">${esc(f.title)}</div>${f.price ? `<div class="pr">₪${f.price}</div>` : ""}<div class="note">מחיר בקטלוג החנות, עשוי להשתנות · קישור שותפים</div></div></div>`)),
  shell(`<div class="cover"><div class="h" style="font-size:96px">רוצה את הקישור?</div><div class="s">חפשי את שם המוצר ב-LikeLink2</div><div class="swipe">הקישור בביו</div><div class="s" style="margin-top:40px;font-size:34px;opacity:.85">#פרסומת · קישורי שותפים</div></div>`),
];
const files = [];
for (let i = 0; i < slides.length; i++) {
  await slide.setContent(slides[i], { waitUntil: "networkidle" });
  await slide.waitForTimeout(400);
  const f = path.join(OUT, `carousel-${String(i + 1).padStart(2, "0")}.jpg`);
  writeFileSync(f, await slide.screenshot({ type: "jpeg", quality: 88 }));
  files.push(path.basename(f));
}
await slide.close();

/* ------------------------------------------------------------ screen reel */
const recDir = path.join(OUT, "_rec");
mkdirSync(recDir, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2, locale: "he-IL", recordVideo: { dir: recDir, size: { width: 720, height: 1280 } } });
// Never write analytics from a render: views/clicks/funnel posts are aborted.
await ctx.route("**/api/store**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
const page = await ctx.newPage();
const caption = (lines, accent = "#d22f5d") => page.evaluate(([ls, a, ui]) => {
  let el = document.getElementById("__cap");
  if (!el) {
    el = document.createElement("div"); el.id = "__cap";
    Object.assign(el.style, { position: "fixed", left: "0", right: "0", bottom: "92px", zIndex: 2147483647, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", pointerEvents: "none", direction: "rtl", fontFamily: ui });
    document.body.appendChild(el);
    const tag = document.createElement("div");
    Object.assign(tag.style, { position: "fixed", top: "10px", left: "50%", transform: "translateX(-50%)", zIndex: 2147483647, background: "rgba(43,22,80,.85)", color: "#fff", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: "700", fontFamily: ui, pointerEvents: "none" });
    tag.textContent = "הקלטת מסך אמיתית מהאתר";
    document.body.appendChild(tag);
  }
  el.innerHTML = ls.map((l, i) => `<span style="background:${i === 0 ? a : "#fff"};color:${i === 0 ? "#fff" : "#17131f"};font-weight:900;font-size:21px;padding:6px 14px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.25)">${l}</span>`).join("");
}, [lines, accent, UI]);
const tRec = Date.now(); // the recording starts with the page
await page.goto(`${SITE}/?utm_source=content_render`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
await page.waitForSelector("#lx-q", { timeout: 20_000 }).catch(() => null);
await caption(["ראיתי צמיד ברילס", "ולא ידעתי איפה לקנות"]);
await page.waitForTimeout(150);
// The reel starts here: the site is loaded and the question is on screen (no loading frames).
const startS = (Date.now() - tRec) / 1000;
const t0 = Date.now();
await page.waitForTimeout(2600);
await caption(["כותבים ב-LikeLink2"]);
const box = page.locator("#lx-q").first();
await box.click({ timeout: 10_000 }).catch(() => null);
await box.type("צמיד", { delay: 220 }).catch(() => null);
await page.waitForTimeout(500);
await box.press("Enter").catch(() => null);
await page.waitForTimeout(2500);
await caption(["וכל תוצאה מראה", "למה היא כאן"]);
await page.mouse.wheel(0, 380); await page.waitForTimeout(2600);
await caption(["תמונה אמיתית · קישור ישיר · מחיר"]);
await page.locator('a[href^="/p/"]').first().click({ timeout: 10_000 }).catch(() => null);
await page.waitForTimeout(3000);
await page.mouse.wheel(0, 300); await page.waitForTimeout(2000);
await caption(["חינם · בלי הרשמה לקונות", "הקישור בביו"], "#2b1650");
await page.waitForTimeout(3000);
const durS = (Date.now() - t0) / 1000;
await page.close();
await ctx.close();
const webm = readdirSync(recDir).find((f) => f.endsWith(".webm"));
// LikeLink's own beat (original, generated from math — no third-party music).
const kick = "0.85*sin(2*PI*52*t*(1+1.6*exp(-28*mod(t,0.5))))*exp(-8*mod(t,0.5))";
const hat = "0.10*(2*random(0)-1)*exp(-70*mod(t+0.25,0.5))";
const pad = "0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.25*t))";
const beat = `0.5*(${kick}+${hat}+${pad})`.replace(/,/g, "\\,");
const mp4 = path.join(OUT, "screen-reel.mp4");
await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", startS.toFixed(2), "-i", path.join(recDir, webm), "-f", "lavfi", "-i", `aevalsrc=exprs=${beat}|${beat}:s=48000`,
  "-map", "0:v", "-map", "1:a", "-shortest", "-vf", "scale=720:1280,fps=30", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", mp4]);
await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.3", "-i", mp4, "-frames:v", "1", "-q:v", "4", path.join(OUT, "screen-reel-poster.jpg")]);
for (const s of [0.3, 3, 6, 10, 14]) await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(s), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", "-q:v", "6", path.join(OUT, `_preview-${s}.jpg`)]).catch(() => null);
rmSync(recDir, { recursive: true, force: true });
await browser.close();
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), products: facts, carousel: files, reel: "screen-reel.mp4", recordedSeconds: Math.round(durS) }, null, 2));
console.log(JSON.stringify({ products: facts.length, slides: files.length, reel: mp4 }));
