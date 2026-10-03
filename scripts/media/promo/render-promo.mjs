#!/usr/bin/env node
// LikeLink2 self-promo reel: AI scenes (scripts/media/ai-image/generate.py output)
// + real screenshots of the live site → MP4 (H.264 + silent AAC, 720x1280) at
// public/promo/likelink-studio.mp4, served by the site itself. Preview frames go
// to scripts/media/promo/preview/ for review before anything is published.
//   node scripts/media/promo/render-promo.mjs --scenes DIR
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SCENES = path.resolve(arg("scenes", path.join(ROOT, "promo-scenes")));
const SITE = "https://likelink2.vercel.app";
const OUT = path.join(ROOT, "public", "promo");
const PREVIEW = path.join(HERE, "preview");
mkdirSync(OUT, { recursive: true }); mkdirSync(PREVIEW, { recursive: true });

// Every line states what the live site does today (no income promise, no numbers).
const PLAN = {
  segments: [
    { kind: "ai", img: "a", cap: "אותו מוצר, 20 קישורים, 10 מחירים... על מה ללחוץ?", section: "לקונות", sectionColor: "#2b8a6e" },
    { kind: "site", img: "search", cap: "ב-LikeLink2 כותבים, מדברים, מצלמים או מדביקים קישור — והוא מוצא", bg0: "#d6fff1", bg1: "#a7d8ff" },
    { kind: "site", img: "product", cap: "וכל תוצאה מראה למה היא כאן: תמונה אמיתית, קישור ישיר, מחיר", bg0: "#d6fff1", bg1: "#a7d8ff" },
    { kind: "ai", img: "b", cap: "ואת בוחרת מהאפשרויות שנמצאו, בלי ים של לינקים", section: "לקונות", sectionColor: "#2b8a6e" },
    { kind: "ai", img: "c", cap: "ממליצה על מוצרים כל יום, והקישורים נעלמים בסטורי?", section: "למשפיעניות ולמוכרות" },
    { kind: "site", img: "sell", cap: "פותחים סטודיו בחינם, מיוצרת קטנה ועד מותג" },
    { kind: "site", img: "reels", cap: "לונה מכינה רילסים, ורואים כמה קליקים הגיעו לכל מוצר" },
    { kind: "ai", img: "d", cap: "ובחיפוש, מוצר עם תמונה אמיתית וקישור ישיר עולה למעלה", section: "למשפיעניות ולמוכרות" },
  ],
  cta: ["קונות? חפשו כל מוצר", "ממליצות? פתחו סטודיו בחינם"],
  url: "likelink2.vercel.app",
};

function run(cmd, argv, input) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ["pipe", "inherit", "inherit"] });
    p.on("error", rej); p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
    if (input) input(p.stdin); else p.stdin.end();
  });
}
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();

// Real screenshots of the live site at phone size.
const shots = {};
const mobile = await browser.newPage({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 });
for (const [k, p] of [["search", "/search?q=%D7%A6%D7%9E%D7%99%D7%93"], ["product", "/p/p-live-05"], ["sell", "/sell"], ["reels", "/reels"]]) {
  await mobile.goto(`${SITE}${p}${p.includes("?") ? "&" : "?"}utm_source=promo_render`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
  await mobile.waitForTimeout(2500);
  shots[k] = `data:image/jpeg;base64,${(await mobile.screenshot({ type: "jpeg", quality: 85 })).toString("base64")}`;
}
await mobile.close();

const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
await page.goto(pathToFileURL(path.join(HERE, "promo.html")).href);
await page.evaluate((p) => { window.PLAN = p; }, PLAN);
await page.evaluate((m) => window.loadAssets(m), {
  a: dataUrl(path.join(SCENES, "promo-a.png"), "image/png"),
  b: dataUrl(path.join(SCENES, "promo-b.png"), "image/png"),
  c: dataUrl(path.join(SCENES, "promo-c.png"), "image/png"),
  d: dataUrl(path.join(SCENES, "promo-d.png"), "image/png"),
  search: shots.search, product: shots.product, sell: shots.sell, reels: shots.reels,
});
const fps = 30, dur = await page.evaluate(() => window.durationS()), frames = fps * dur;
const mp4 = path.join(OUT, "likelink-studio.mp4");
await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-shortest",
  "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", mp4], async (stdin) => {
  for (let f = 0; f < frames; f++) {
    const j = await page.evaluate((t) => window.renderFrame(t, 0.9), (f * 1000) / fps);
    if (!stdin.write(Buffer.from(j.split(",")[1], "base64"))) await new Promise((r) => stdin.once("drain", r));
  }
  stdin.end();
});
for (const s of [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5, 26.5]) {
  const j = await page.evaluate((t) => window.renderFrame(t, 0.8), s * 1000);
  writeFileSync(path.join(PREVIEW, `frame-${s}.jpg`), Buffer.from(j.split(",")[1], "base64"));
  if (s === 26.5) writeFileSync(path.join(OUT, "likelink-studio-poster.jpg"), Buffer.from(j.split(",")[1], "base64"));
}
await browser.close();
console.log(JSON.stringify({ mp4, bytes: readFileSync(mp4).length, frames }));
