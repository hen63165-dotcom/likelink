// The radar's morning story (src/lib/growth/radarStory.js): one 1080×1920 picture of what the radar
// called today (or that it called nothing), plus the page the owner posts it from: the picture to
// save, the link for the link sticker, the steps in the app. Published on GitHub Pages at
// https://hen63165-dotcom.github.io/likelink/radar-story/ (noindex) by deploy-frontend.yml, which
// runs after every "Trend radar" run:
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright node scripts/marketing/radar-story.mjs dist
// Reads only the public board (dist/radar/board.json). Nothing is posted from here.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { radarStoryOf, STORY, STORY_STEPS } from "../../src/lib/growth/radarStory.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function storyHtml(s) {
  const items = s.items.map((i) => `<li><span class="i">${esc(i.icon)}</span><span>${esc(i.text)}</span></li>`).join("");
  const accent = s.kind === "call" ? "#16a34a" : "#0b0b0b";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${STORY.width}px;height:${STORY.height}px;overflow:hidden;background:#FFD60A;font-family:Heebo,sans-serif;color:#0b0b0b;position:relative}
.top{position:absolute;top:150px;right:72px;left:72px;display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:900;font-size:46px;letter-spacing:-1px}.brand b{color:#e11d48}
.pill{font-weight:800;font-size:30px;background:#0b0b0b;color:#FFD60A;padding:10px 26px;border-radius:999px}
.card{position:absolute;top:290px;right:56px;left:56px;background:#fff;border:8px solid #0b0b0b;box-shadow:16px 16px 0 #0b0b0b;border-radius:44px;padding:64px 60px}
.kicker{font-weight:800;font-size:40px;color:#6b7280}
.title{margin-top:26px;font-weight:900;font-size:${s.title.length > 22 ? 86 : 104}px;line-height:1.05;letter-spacing:-2px;color:${accent}}
.sub{margin-top:28px;font-weight:700;font-size:44px;line-height:1.3}
ul{list-style:none;margin-top:44px;display:grid;gap:22px}
li{display:flex;gap:18px;align-items:flex-start;font-weight:700;font-size:40px;line-height:1.3;background:#fffbeb;border-radius:22px;padding:18px 22px}
.i{flex:none}
.cta{position:absolute;bottom:430px;right:0;left:0;text-align:center;font-weight:900;font-size:64px}
.ad{position:absolute;bottom:120px;right:0;left:0;text-align:center;font-weight:700;font-size:28px;opacity:.75}
</style></head><body>
<div class="top"><div class="brand">LikeLink<b>2</b> · רדאר הטרנדים</div><div class="pill">${esc(s.day.split("-").reverse().slice(0, 2).map(Number).join("."))}</div></div>
<div class="card"><p class="kicker">${esc(s.kicker)}</p><p class="title">${esc(s.title)}</p><p class="sub">${esc(s.sub)}</p>${items ? `<ul>${items}</ul>` : ""}</div>
<p class="cta">${esc(s.cta)}</p>
<p class="ad">${esc(s.disclosure)}</p>
</body></html>`;
}

/** Renders the picture; returns the file name, or "" without a browser. */
export async function renderStory(story, outDir, { playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  if (!playwrightModule) return "";
  let browser;
  try {
    const { chromium } = createRequire(import.meta.url)(playwrightModule);
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const page = await browser.newPage({ viewport: { width: STORY.width, height: STORY.height } });
    await page.setContent(storyHtml(story), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const file = `story-${story.day}.png`;
    await page.screenshot({ path: join(outDir, file) });
    return file;
  } catch (e) {
    console.log(`radar-story: picture skipped (${String(e?.message || e).slice(0, 120)})`);
    return "";
  } finally {
    await browser?.close().catch(() => {});
  }
}

export function pageHtml(story, file) {
  const body = story
    ? `${file ? `<img src="${esc(file)}" alt="הסטורי של היום" width="360" height="640"><p><a class="btn" href="${esc(file)}" download>⬇️ שמירת התמונה</a></p>` : `<pre>${esc([story.kicker, story.title, story.sub, ...story.items.map((i) => `${i.icon} ${i.text}`)].join("\n"))}</pre>`}
<h2>הקישור לסטיקר</h2><p><input readonly value="${esc(story.link)}" onclick="this.select()"> <button onclick="navigator.clipboard.writeText('${esc(story.link)}');this.textContent='הועתק ✓'">העתקה</button></p>
<p>טקסט הסטיקר: <b>${esc(story.sticker)}</b></p>
<h2>איך מפרסמים</h2><ol>${STORY_STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
    : "<p>היום אין לוח רדאר ציבורי, ולכן אין סטורי. בודקים שוב אחרי הריצה הבאה.</p>";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>הסטורי של הרדאר${story ? ` · ${esc(story.day)}` : ""}</title>
<style>body{margin:0 auto;max-width:560px;padding:16px;font:17px/1.6 system-ui,"Heebo",sans-serif;background:#fffbeb;color:#0b0b0b}img{width:100%;max-width:360px;height:auto;border-radius:18px;border:3px solid #0b0b0b;display:block}
.btn,button{display:inline-block;background:#0b0b0b;color:#fff;border:0;border-radius:999px;padding:10px 18px;font:inherit;font-weight:800;text-decoration:none}input{width:100%;font:inherit;padding:8px;border:2px solid #0b0b0b;border-radius:10px;direction:ltr}h1{font-size:24px}h2{font-size:19px;margin-top:22px}</style></head>
<body><h1>📡 הסטורי של הרדאר להיום</h1>${body}</body></html>`;
}

export async function writeRadarStory({ dist = "dist", playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  const boardFile = join(dist, "radar", "board.json");
  let board = null;
  try { board = existsSync(boardFile) ? JSON.parse(readFileSync(boardFile, "utf8")) : null; } catch { board = null; }
  const story = radarStoryOf(board);
  const out = join(dist, "radar-story");
  mkdirSync(out, { recursive: true });
  const file = story ? await renderStory(story, out, { playwrightModule }) : "";
  writeFileSync(join(out, "index.html"), pageHtml(story, file));
  writeFileSync(join(out, "today.json"), JSON.stringify(story ? { ...story, image: file || null } : { day: null }, null, 2));
  console.log(`radar-story: ${story ? `${story.kind} ${story.day}${file ? ` → ${file}` : " (no picture)"}` : "no board"}`);
  return { story, file };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await writeRadarStory({ dist: process.argv[2] || "dist" });
}
