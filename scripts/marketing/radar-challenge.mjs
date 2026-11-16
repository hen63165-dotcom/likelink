// 🔮 The weekly challenge's post kit (src/lib/growth/radarChallenge.js): the LinkedIn/X poll the owner
// publishes herself — the question, the four options (LinkedIn's 30-character limit), the post in
// Hebrew and in English, a 1080×1350 picture of the four products, and, once a challenge is graded,
// the results post. Published on GitHub Pages at https://hen63165-dotcom.github.io/likelink/radar-challenge/
// (noindex) by deploy-frontend.yml after the board copy:
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright node scripts/marketing/radar-challenge.mjs dist
// Reads only the public board (dist/radar/board.json). Nothing is posted from here.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { challengePosts, dm } from "../../src/lib/growth/radarChallenge.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const IMG = /^https:\/\/[^/]*(aliexpress-media\.com|alicdn\.com|aliexpress\.com)\//i;

export const STEPS = Object.freeze([
  "בלינקדאין: ״התחלת פוסט״ ← ״עוד״ (+) ← ״סקר״.",
  "מדביקים את השאלה ואת 4 האפשרויות בדיוק כמו כאן, ובוחרים משך ״שבועיים״.",
  "בטקסט הפוסט מדביקים את הטקסט בעברית, ומוסיפים את התמונה בתגובה הראשונה (בלינקדאין סקר ותמונה לא נכנסים לאותו פוסט).",
  "ב־X: פוסט חדש ← סמל הסקר, אותן 4 אפשרויות (עד 25 תווים לאפשרות ב־X: אם צריך, מקצרים) ומשך 7 ימים, והטקסט באנגלית.",
  "אחרי 14 יום מופיע כאן פוסט התוצאות: מעלים אותו ושואלים מי בחר נכון.",
]);

export function cardHtml(open) {
  const tiles = open.options.map((o, i) => `<div class="t">${o.image && IMG.test(o.image) ? `<img src="${esc(o.image)}" alt="">` : `<div class="ph">${i + 1}</div>`}<p><b>${i + 1}</b> ${esc(o.label)}</p></div>`).join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{width:1080px;height:1350px;overflow:hidden;background:#f3e8ff;font-family:Heebo,sans-serif;color:#0b0b0b;position:relative}
.top{position:absolute;top:56px;right:64px;left:64px;display:flex;justify-content:space-between;align-items:center}.brand{font-weight:900;font-size:36px}.brand b{color:#7c3aed}
.pill{font-weight:800;font-size:28px;background:#0b0b0b;color:#fff;padding:8px 22px;border-radius:999px}
h1{position:absolute;top:150px;right:64px;left:64px;font-weight:900;font-size:66px;line-height:1.08;letter-spacing:-1px}
.g{position:absolute;top:400px;right:64px;left:64px;display:grid;grid-template-columns:1fr 1fr;gap:28px}
.t{background:#fff;border:5px solid #0b0b0b;border-radius:30px;overflow:hidden;box-shadow:10px 10px 0 #0b0b0b}
.t img,.ph{display:block;width:100%;height:300px;object-fit:cover;background:#ede9fe}.ph{display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#7c3aed}
.t p{padding:14px 18px;font-weight:800;font-size:30px;line-height:1.2}.t p b{color:#7c3aed}
.seal{position:absolute;bottom:70px;right:64px;left:64px;text-align:center;font-weight:800;font-size:32px}</style></head><body>
<div class="top"><div class="brand">LikeLink<b>2</b> · רדאר הטרנדים</div><div class="pill">עד ${esc(dm(open.due))}</div></div>
<h1>🔮 איזה מוצר יזנק הכי הרבה בהזמנות בשבועיים הקרובים?</h1>
<div class="g">${tiles}</div>
<p class="seal">🔒 הרדאר כבר בחר · חתום מראש · הציון בפומבי ב־${esc(dm(open.due))}</p>
</body></html>`;
}

async function renderCard(open, outDir, playwrightModule) {
  if (!playwrightModule || !open) return "";
  let browser;
  try {
    const { chromium } = createRequire(import.meta.url)(playwrightModule);
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(cardHtml(open), { waitUntil: "networkidle", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    const file = `challenge-${open.id}.png`;
    await page.screenshot({ path: join(outDir, file) });
    return file;
  } catch (e) {
    console.log(`radar-challenge: picture skipped (${String(e?.message || e).slice(0, 120)})`);
    return "";
  } finally {
    await browser?.close().catch(() => {});
  }
}

const copyBlock = (title, text) => `<h2>${esc(title)}</h2><textarea readonly rows="${Math.min(18, String(text).split("\n").length + 1)}">${esc(text)}</textarea><button onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='הועתק ✓'">העתקה</button>`;

export function pageHtml(board, posts, file) {
  const o = board?.open;
  const parts = [];
  if (o && posts.open) {
    if (file) parts.push(`<img src="${esc(file)}" alt="תמונת האתגר" width="360" height="450"><p><a class="btn" href="${esc(file)}" download>⬇️ שמירת התמונה</a></p>`);
    parts.push(copyBlock("שאלת הסקר", posts.open.question));
    parts.push(...posts.open.options.map((x, i) => copyBlock(`אפשרות ${i + 1}`, x)));
    parts.push(`<p>משך הסקר: <b>${esc(posts.open.duration)}</b></p>`);
    parts.push(copyBlock("הפוסט בעברית (לינקדאין)", posts.open.he));
    parts.push(copyBlock("הפוסט באנגלית (X / לינקדאין)", posts.open.en));
  } else parts.push("<p>האתגר הבא נפתח בריצה הבאה של הרדאר (כל בוקר ב־07:37), מהרגע שיש 4 סוגי מוצרים מדודים.</p>");
  if (posts.result) parts.push(copyBlock(`פוסט התוצאות (${posts.result.id})`, posts.result.he));
  parts.push(`<h2>איך מפרסמים</h2><ol>${STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>האתגר השבועי של הרדאר</title>
<style>body{margin:0 auto;max-width:620px;padding:16px;font:17px/1.6 system-ui,"Heebo",sans-serif;background:#faf5ff;color:#0b0b0b}img{width:100%;max-width:360px;height:auto;border-radius:18px;border:3px solid #0b0b0b;display:block}
.btn,button{display:inline-block;background:#0b0b0b;color:#fff;border:0;border-radius:999px;padding:8px 16px;font:inherit;font-weight:800;text-decoration:none;margin-top:6px}textarea{width:100%;font:inherit;padding:8px;border:2px solid #0b0b0b;border-radius:10px}h1{font-size:24px}h2{font-size:18px;margin-top:20px}</style></head>
<body><h1>🔮 האתגר השבועי של הרדאר</h1>${parts.join("\n")}</body></html>`;
}

export async function writeRadarChallenge({ dist = "dist", playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  const boardFile = join(dist, "radar", "board.json");
  let board = null;
  try { board = existsSync(boardFile) ? JSON.parse(readFileSync(boardFile, "utf8")) : null; } catch { board = null; }
  const ch = board?.challenge || null;
  const posts = challengePosts(ch);
  const out = join(dist, "radar-challenge");
  mkdirSync(out, { recursive: true });
  const file = ch?.open ? await renderCard(ch.open, out, playwrightModule) : "";
  writeFileSync(join(out, "index.html"), pageHtml(ch, posts, file));
  writeFileSync(join(out, "posts.json"), JSON.stringify({ ...posts, image: file || null }, null, 2));
  console.log(`radar-challenge: ${ch?.open ? `open ${ch.open.id}${file ? ` → ${file}` : " (no picture)"}` : "no open challenge"}${posts.result ? ` · results ${posts.result.id}` : ""}`);
  return { posts, file };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await writeRadarChallenge({ dist: process.argv[2] || "dist" });
}
