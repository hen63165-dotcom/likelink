#!/usr/bin/env node
// LikeLink2 self-promo reel: AI scenes (scripts/media/ai-image/generate.py output)
// + real screenshots of the live site → MP4 (H.264 + LikeLink's own beat, 720x1280) at
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
  seg: 2.6,
  segments: [
    { kind: "ai", img: "a", cap: ["אותו מוצר.", "20 קישורים.", "איזה נכון?"], section: "לקונות", sectionColor: "#2b8a6e" },
    { kind: "site", img: "search", cap: ["כותבים, מדברים, מצלמים", "או מדביקים קישור"], bg0: "#d6fff1", bg1: "#a7d8ff" },
    { kind: "site", img: "product", cap: ["וכל תוצאה מראה", "למה היא כאן"], bg0: "#d6fff1", bg1: "#a7d8ff" },
    { kind: "ai", img: "b", cap: ["תמונה אמיתית. קישור ישיר.", "את בוחרת."], section: "לקונות", sectionColor: "#2b8a6e" },
    { kind: "ai", img: "c", cap: ["ממליצה על מוצרים", "והקישורים נעלמים בסטורי?"], section: "ליוצרות ולמוכרות" },
    { kind: "site", img: "sell", cap: ["סטודיו בחינם", "מיוצרת קטנה ועד מותג"] },
    { kind: "site", img: "reels", cap: ["רילסים מלונה", "וקליקים אמיתיים לכל מוצר"] },
    { kind: "ai", img: "d", cap: ["מוצר אמיתי עם קישור ישיר", "עולה למעלה"], section: "ליוצרות ולמוכרות" },
  ],
  cta: ["קונות? חפשו כל מוצר", "ממליצות? פתחו סטודיו בחינם"],
  url: "likelink2.vercel.app",
};

// LikeLink's own beat (original, generated from math — no third-party music).
const OWN_BEAT = (() => {
  const kick = "0.85*sin(2*PI*52*t*(1+1.6*exp(-28*mod(t,0.5))))*exp(-8*mod(t,0.5))";
  const hat = "0.10*(2*random(0)-1)*exp(-70*mod(t+0.25,0.5))";
  const pad = "0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.25*t))";
  const e = `0.55*(${kick}+${hat}+${pad})`.replace(/,/g, "\\,");
  return `aevalsrc=exprs=${e}|${e}:s=48000`;
})();

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
  "-f", "lavfi", "-i", OWN_BEAT, "-map", "0:v", "-map", "1:a", "-shortest",
  "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", mp4], async (stdin) => {
  for (let f = 0; f < frames; f++) {
    const j = await page.evaluate((t) => window.renderFrame(t, 0.9), (f * 1000) / fps);
    if (!stdin.write(Buffer.from(j.split(",")[1], "base64"))) await new Promise((r) => stdin.once("drain", r));
  }
  stdin.end();
});
const lastS = dur - 0.5;
for (const s of [0.3, 1.3, 3.9, 6.5, 9.1, 11.7, 14.3, 16.9, 19.5, lastS]) {
  const j = await page.evaluate((t) => window.renderFrame(t, 0.8), s * 1000);
  writeFileSync(path.join(PREVIEW, `frame-${s}.jpg`), Buffer.from(j.split(",")[1], "base64"));
  if (s === lastS) writeFileSync(path.join(OUT, "likelink-studio-poster.jpg"), Buffer.from(j.split(",")[1], "base64"));
}
await browser.close();
console.log(JSON.stringify({ mp4, bytes: readFileSync(mp4).length, frames }));
