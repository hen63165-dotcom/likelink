// A real screen recording of the live magic button (/magic) for Reels/TikTok:
// the live site, real store data, a real check and a real Hebrew search, with
// big Hebrew captions drawn by the browser itself (RTL is right). Nothing is
// mocked: if the live page does not answer, the run fails and nothing is made.
//
//   node scripts/marketing/magic-demo.mjs <out-dir>
//   env: PLAYWRIGHT_MODULE, MAGIC_SITE, MAGIC_LINK, MAGIC_QUERY, MAGIC_BED (an .m4a bed, optional)
//
// Output: <out>/magic-demo.mp4 (magic-clean.mp4 with MAGIC_CLEAN=1; 1080×1920, H.264, AAC 48 kHz), cover.jpg,
// caption.txt, and frames-*.jpg (one a second, for a person to look at).
// The caption starts with the disclosure: the page's buy buttons are affiliate links.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const SITE = String(process.env.MAGIC_SITE || "https://likelink2.vercel.app").replace(/\/+$/, "");
const LINK = process.env.MAGIC_LINK || "https://www.aliexpress.com/item/1005006861665924.html";
const QUERY = process.env.MAGIC_QUERY || "עגילי זהב עד 30 ש״ח";
const OUT = resolve(process.argv[2] || "magic-demo");
// MAGIC_CLEAN=1: the plain page (no captions, no bar, no end card) for a 3D studio reel
// to cut its proof shots from; that reel burns in its own labels and disclosure.
const CLEAN = process.env.MAGIC_CLEAN === "1";
const NAME = CLEAN ? "magic-clean" : "magic-demo";
mkdirSync(OUT, { recursive: true });

// The captions, the tap marks and the end card, drawn inside the page (fixed, on top).
const OVERLAY = `
(() => {
  const box = (id, css) => { let el = document.getElementById(id); if (!el) { el = document.createElement("div"); el.id = id; el.setAttribute("aria-hidden", "true"); Object.assign(el.style, css); (document.body || document.documentElement).appendChild(el); } return el; };
  window.__cap = (title, sub) => {
    const el = box("__cap", { position: "fixed", top: "86px", left: "12px", right: "12px", zIndex: "2147483646", direction: "rtl", textAlign: "center", pointerEvents: "none" });
    el.innerHTML = title ? '<div style="display:inline-block;background:#0b0b0f;color:#fff;font:800 25px/1.25 Heebo,Assistant,Arial,sans-serif;padding:12px 18px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.28)">' + title + (sub ? '<div style="font:600 16px/1.4 Heebo,Assistant,Arial,sans-serif;opacity:.88;margin-top:5px">' + sub + "</div>" : "") + "</div>" : "";
    el.style.display = title ? "block" : "none";
  };
  window.__brand = () => {
    const el = box("__brand", { position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483645", direction: "rtl", textAlign: "center", pointerEvents: "none", background: "rgba(11,11,15,.92)", color: "#fff", font: "600 12.5px/1.2 Heebo,Assistant,Arial,sans-serif", padding: "7px 10px 9px" });
    el.textContent = "#פרסומת · באתר יש קישורי שותפים   ·   likelink2.vercel.app/magic";
  };
  window.__ring = (x, y, on) => {
    const el = box("__ring", { position: "fixed", width: "56px", height: "56px", borderRadius: "50%", background: "rgba(255,255,255,.45)", border: "4px solid rgba(11,11,15,.6)", zIndex: "2147483647", pointerEvents: "none" });
    el.style.left = (x - 28) + "px";
    el.style.top = (y - 28) + "px";
    el.style.display = on ? "block" : "none";
  };
  window.__end = () => {
    const el = box("__end", { position: "fixed", inset: "0", zIndex: "2147483647", direction: "rtl", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", background: "#0b0b0f", color: "#fff", textAlign: "center", padding: "24px" });
    el.innerHTML = '<div style="font:800 44px/1.15 Heebo,Assistant,Arial,sans-serif">כפתור הקסם ✨</div>'
      + '<div style="font:600 21px/1.45 Heebo,Assistant,Arial,sans-serif;opacity:.92">בודקים כל קישור מאלי<br>ומחפשים באלי בעברית</div>'
      + '<div style="font:700 18px/1.4 Heebo,Assistant,Arial,sans-serif;background:#fff;color:#0b0b0f;border-radius:999px;padding:10px 18px;margin-top:8px">likelink2.vercel.app/magic</div>'
      + '<div style="font:600 15px/1.4 Heebo,Assistant,Arial,sans-serif;opacity:.75">בחינם · בלי הרשמה</div>'
      // The disclosure stays on every frame, the end card too.
      + '<div style="position:absolute;left:0;right:0;bottom:0;font:600 12.5px/1.2 Heebo,Assistant,Arial,sans-serif;padding:7px 10px 9px;background:rgba(255,255,255,.08)">#פרסומת · באתר יש קישורי שותפים</div>';
  };
})();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FPS = 30;
const FRAMES = join(OUT, "frames");
mkdirSync(FRAMES, { recursive: true });

// Headless Chrome's screen recording is captured at CSS pixels (432×768), so
// every frame is a full-resolution screenshot (1080×1920) on a virtual clock:
// each frame carries how long it is shown, and the video is stitched from them.
// The runner's own Google Chrome (Playwright's browser download has no build for Ubuntu 26.04).
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const context = await browser.newContext({
  viewport: { width: 432, height: 768 },
  deviceScaleFactor: 2.5,
  isMobile: true,
  hasTouch: true,
  locale: "he-IL",
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript(OVERLAY);
const page = await context.newPage();
const shown = [];
async function shot(seconds) {
  const file = join(FRAMES, `f${String(shown.length + 1).padStart(5, "0")}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  shown.push({ file, seconds });
}
const cap = async (title, sub = "") => { if (!CLEAN) await page.evaluate(([t, s]) => window.__cap?.(t, s), [title, sub]); };
// When each moment starts in the film (seconds), for cutting proof shots from it.
const moments = {};
const mark = (name) => { moments[name] = Math.round(shown.reduce((a, x) => a + x.seconds, 0) * 100) / 100; };
async function scrollAnim(dy, seconds) {
  const from = await page.evaluate(() => window.scrollY);
  const n = Math.max(1, Math.round(seconds * FPS));
  for (let i = 1; i <= n; i += 1) {
    const k = i / n;
    const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(from + dy * ease));
    await shot(1 / FPS);
  }
}
async function tap(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (b) {
    await page.evaluate(([x, y]) => window.__ring?.(x, y, true), [b.x + b.width / 2, b.y + b.height / 2]);
    await shot(0.35);
    await page.evaluate(() => window.__ring?.(0, 0, false));
  }
  await locator.click();
}
async function typeAnim(locator, text) {
  for (const ch of text) {
    await locator.pressSequentially(ch);
    await shot(0.085);
  }
}

await page.goto(`${SITE}/magic`, { waitUntil: "networkidle", timeout: 45_000 });
if (!CLEAN) await page.evaluate(() => { window.__brand?.(); });
await page.waitForSelector("text=הדבקה ובדיקה", { timeout: 20_000 });
await sleep(400);

// 1. The hook.
await cap("ראית משהו בטיקטוק? 👀", "רגע לפני שקונים באלי…");
await shot(2.4);
// 2. Copy the link (as the app's Share → Copy link does), then the magic button.
await page.evaluate((link) => navigator.clipboard.writeText(link), LINK);
await cap("1. מעתיקים את הקישור מאלי", "שיתוף ← העתקת קישור");
await shot(1.9);
await cap("2. לוחצים על כפתור הקסם ✨");
await shot(1.0);
mark("linkTap");
await tap(page.getByRole("button", { name: /הדבקה ובדיקה/ }));
const result = page.locator("#magic-result");
try {
  await result.waitFor({ timeout: 4000 });
} catch {
  // The clipboard was not readable here: type the same link, as a person would paste it.
  await page.locator("#magic-link").fill(LINK);
  await page.locator("#magic-link").press("Enter");
  await shot(0.6);
  await result.waitFor({ timeout: 25_000 });
}
await sleep(1500); // the page brings the answer into view by itself
// 3. The answer.
mark("result");
await cap("המחיר בחנות עכשיו + מה לבדוק", "ואזהרה אם זה חיקוי של מותג");
await shot(2.0);
await scrollAnim(480, 3.6);
await shot(0.8);
await cap("ובלי מספרים מומצאים 🙏", "בלי דירוגים ו„הנחות” שהמוכר כתב");
await shot(2.0);
// 4. No link? Find it in Hebrew.
await page.evaluate(() => window.scrollTo(0, 0));
await cap("אין לך קישור? 🔎", "כותבים בעברית מה רוצים");
await shot(1.4);
mark("findTab");
await tap(page.getByRole("tab", { name: /מצאי לי באלי/ }));
await sleep(500);
const box = page.locator("#magic-find");
await box.fill("");
await tap(box);
await typeAnim(box, QUERY);
await shot(0.5);
await box.press("Enter");
await shot(0.5);
await page.locator("ul.grid li").first().waitFor({ timeout: 25_000 });
await sleep(1500);
mark("grid");
const found = await page.locator("ul.grid li").count();
await cap("רק מוצרים שעברו בדיקה ✅", "הרבה הזמנות, שביעות רצון גבוהה, בלי חיקויים");
await shot(1.4);
await scrollAnim(520, 3.6);
await shot(1.0);
// 5. The end card.
await cap("");
if (!CLEAN) {
  await page.evaluate(() => window.__end?.());
  await shot(2.6);
}
await context.close();
await browser.close();

// Stitch: each frame for its own time (ffmpeg concat), then a steady 30 fps.
const list = shown.map((x) => `file '${x.file}'\nduration ${x.seconds.toFixed(4)}`).join("\n") + `\nfile '${shown.at(-1).file}'\n`;
writeFileSync(join(OUT, "frames.txt"), list);
const length = shown.reduce((a, x) => a + x.seconds, 0);
const marks = { start: 0, end: length };
const raw = join(OUT, "frames.txt");

// The bed: a soft loop made from numbers (scripts/luna_reels music.py), or silence.
const bed = process.env.MAGIC_BED && existsSync(process.env.MAGIC_BED) ? process.env.MAGIC_BED : "";
const mp4 = join(OUT, `${NAME}.mp4`);
const audio = bed ? ["-i", bed] : ["-f", "lavfi", "-t", String(length), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", raw, ...audio,
  "-vf", "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p",
  "-af", `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, length - 1.2).toFixed(2)}:d=1.2`,
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-profile:v", "high",
  // The concat demuxer shows the last picture once more on its own: the film ends at the sum of the shots.
  "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", length.toFixed(3), "-movflags", "+faststart", mp4,
], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.2", "-i", mp4, "-frames:v", "1", "-q:v", "3", join(OUT, "cover.jpg")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=1,scale=360:-1", "-q:v", "5", join(OUT, "frames-%02d.jpg")]);

const caption = [
  "#פרסומת · באתר יש קישורי שותפים",
  "",
  "ראית משהו בטיקטוק או באינסטגרם ורוצה להזמין מאלי? ✨",
  "לפני שקונים: מדביקים את הקישור בכפתור הקסם של LikeLink2, ותוך כמה שניות רואים את המחיר בחנות עכשיו, מה לבדוק לפני שמזמינים, ואם בשם המוצר יש מותג (כנראה חיקוי).",
  "",
  "ואין קישור? כותבים בעברית מה רוצים, למשל „עגילי זהב עד 30 ש״ח”, ומקבלים רק מוצרים שעוברים את הכללים שלנו.",
  "",
  "בחינם ובלי הרשמה: likelink2.vercel.app/magic (הקישור גם בתגובה הראשונה)",
  "",
  "שלחי למי שקונה באלי 💌",
  "",
  "#אליאקספרס #קניותברשת #טיפים #עליאקספרס #קניות",
].join("\n");
writeFileSync(join(OUT, "caption.txt"), `${caption}\n`);
writeFileSync(join(OUT, CLEAN ? "run-clean.json" : "run.json"), `${JSON.stringify({ site: SITE, link: LINK, query: QUERY, found, seconds: Number(length.toFixed(2)), clean: CLEAN, moments, at: new Date().toISOString() }, null, 2)}\n`);
console.log(`magic demo: ${length.toFixed(1)} s, ${found} search results, ${readdirSync(OUT).filter((f) => f.startsWith("frames-")).length} frames`);
