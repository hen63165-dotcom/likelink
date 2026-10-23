// "האינסטגרם של LikeLink2" (src/lib/growth/instagramGrid.js): nine posts in
// one look, rendered as 1080×1440 images with the runner's Chrome, plus the
// page the owner posts from: the grid preview, each image to download, the
// caption to copy and the steps in the app. Published on GitHub Pages at
// https://hen63165-dotcom.github.io/likelink/instagram/ (noindex) by
// .github/workflows/deploy-frontend.yml:
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright node scripts/marketing/instagram-grid.mjs dist
// The AI character is PRESENTER_FILE (one of the own image model's candidates,
// labelled "דמות AI" on the picture and in the caption). Without a browser the
// page lists the posts as text over their pictures. Nothing is posted from here.
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";
import { inlineLocal } from "./tiktok-kit.mjs";
import { cleanImage } from "../../src/lib/looks.js";
import { AI_TAG, GRID_POST, instagramGrid } from "../../src/lib/growth/instagramGrid.js";

// Candidate E of the presenter casting (2026-10-22: the same character in two
// frames, p-camel-0/1); the owner's pick replaces it. Comma-separated in env.
export const PRESENTER_FILES = (process.env.PRESENTER_FILES || "scripts/media/ai-image/samples/p-camel-1.png,scripts/media/ai-image/samples/p-camel-0.png").split(",").map((s) => s.trim()).filter(Boolean);

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MARK = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 14.5l5-5M8 11l-1.6 1.6a3.4 3.4 0 004.8 4.8L13 15.8M16 13l1.6-1.6a3.4 3.4 0 00-4.8-4.8L11 8.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

/** One post as a page: the picture full bleed, the name tag, the labels, the hook bar. */
export function postHtml(post) {
  const person = post.kind !== "product";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}html,body{width:${GRID_POST.width}px;height:${GRID_POST.height}px}
body{position:relative;overflow:hidden;background:#eaf2fb;font-family:Heebo,sans-serif}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${person ? "50% 18%" : "50% 50%"};display:block}
.shade{position:absolute;inset-inline:0;bottom:0;height:46%;background:linear-gradient(to top,rgba(0,0,0,.42),rgba(0,0,0,0))}
.tag{position:absolute;top:48px;inset-inline-start:48px;display:flex;align-items:center;gap:10px;background:#0b0b0c;color:#fff;font-weight:800;font-size:34px;padding:14px 28px;border-radius:999px}
.labels{position:absolute;top:48px;inset-inline-end:48px;display:flex;gap:10px}
.labels span{background:rgba(255,255,255,.92);color:#0b0b0c;font-weight:700;font-size:28px;padding:12px 22px;border-radius:999px}
.bar{position:absolute;bottom:60px;inset-inline:54px;background:rgba(11,11,12,.88);border-radius:38px;padding:36px 42px 32px;text-align:center}
.hook{color:#FBBF24;font-weight:900;font-size:66px;line-height:1.18}
.sub{margin-top:14px;color:#fff;font-weight:500;font-size:34px;line-height:1.3}
.note{margin-top:10px;color:rgba(255,255,255,.72);font-size:24px;font-weight:500}
.inset{position:absolute;bottom:360px;inset-inline-end:54px;width:300px;height:300px;border:10px solid #fff;border-radius:30px;overflow:hidden;background:#fff;transform:rotate(-4deg);box-shadow:0 24px 50px -20px rgba(0,0,0,.55)}
.inset img{width:100%;height:100%;object-fit:cover;display:block}
</style></head><body>
${post.image ? `<img class="bg" src="${esc(post.image)}" alt="">` : ""}
<div class="shade"></div>
<div class="tag">${MARK}<span>${esc(post.tags[post.tags.length - 1])}</span></div>
<div class="labels">${post.tags.slice(0, -1).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
${post.inset ? `<div class="inset"><img src="${esc(post.inset)}" alt=""></div>` : ""}
<div class="bar"><div class="hook">${esc(post.hook)}</div>${post.sub ? `<div class="sub">${esc(post.sub)}</div>` : ""}${post.imageNote ? `<div class="note">${esc(post.imageNote)}</div>` : ""}</div>
</body></html>`;
}

/** Renders every post; returns { [post.id]: file } (empty without a browser). */
export async function renderPosts(posts, outDir, { playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  if (!playwrightModule) return {};
  let browser;
  try {
    const { chromium } = createRequire(import.meta.url)(playwrightModule);
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const page = await browser.newPage({ viewport: { width: GRID_POST.width, height: GRID_POST.height } });
    const files = {};
    for (const post of posts) {
      // A page set from a string may not read local files: a picture that ships with the site goes in as data.
      const image = inlineLocal(post.image, outDir);
      const inset = post.inset ? inlineLocal(post.inset, outDir) : "";
      await page.setContent(postHtml({ ...post, image, inset }), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const file = `${post.id}.png`;
      await page.screenshot({ path: join(outDir, "posts", file) });
      files[post.id] = file;
    }
    return files;
  } catch (e) {
    console.log(`instagram-grid: images skipped (${String(e?.message || e).slice(0, 120)})`);
    return {};
  } finally {
    await browser?.close().catch(() => {});
  }
}

function copyField(label, text, rows = 6) {
  return `<label class="f"><span>${esc(label)}</span><textarea readonly rows="${rows}">${esc(text)}</textarea><button type="button" class="copy">העתקה</button></label>`;
}

const STEPS = {
  product: ["באינסטגרם: ➕ ← פוסט ← בוחרים את התמונה.", "מדביקים את הכיתוב.", "מפרסמים. מי שכותבת „רוצה” מקבלת את הקישור בפרטי."],
  tip: ["באינסטגרם: ➕ ← פוסט ← בוחרים את התמונה.", "מדביקים את הכיתוב.", "הגדרות מתקדמות ← „תווית AI” ← מפעילים (הדמות היא AI).", "מפרסמים. מי שכותבת „מדריך” מקבלת את המדריך בפרטי."],
  tool: ["באינסטגרם: ➕ ← פוסט ← בוחרים את התמונה.", "מדביקים את הכיתוב.", "הגדרות מתקדמות ← „תווית AI” ← מפעילים.", "מוודאים שבביו יש קישור לאתר."],
};

/** The page: the grid as it will look on the profile, then each post to download and post. */
export function gridPage(posts, files = {}, { date = "" } = {}) {
  const pic = (p) => (files[p.id] ? `posts/${esc(files[p.id])}` : esc(p.image));
  const tiles = posts.map((p) => `<a href="#${esc(p.id)}"><img src="${pic(p)}" alt="${esc(p.alt)}" loading="lazy"></a>`).join("");
  const cards = posts.map((p, i) => `<section class="card" id="${esc(p.id)}">
<p class="kicker">פוסט ${i + 1} · ${p.kind === "product" ? "מוצר" : p.kind === "tip" ? "טיפ מהמדריך" : "כלי חינמי"}</p>
<h2>${esc(p.hook)}</h2>
<a href="${pic(p)}" download><img class="post" src="${pic(p)}" alt="${esc(p.alt)}" loading="lazy"></a>
${files[p.id] ? `<a class="btn" href="posts/${esc(files[p.id])}" download>הורדת התמונה</a>` : `<p class="note">התמונה לא נוצרה הפעם: מעלים את התמונה הזו וכותבים עליה „${esc(p.hook)}”.</p>`}
${copyField("כיתוב", p.caption, Math.min(12, p.caption.split("\n").length + 1))}
<details><summary>איך מפרסמים</summary><ol>${STEPS[p.kind].map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>
</section>`).join("\n");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>האינסטגרם של LikeLink2${date ? ` · ${esc(date)}` : ""}</title>
<style>
:root{--bg:#fff;--card:#fff;--sky:#eaf2fb;--ink:#0b0b0c;--mute:#5d5866;--line:#e3e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#12171e;--sky:#0f1924;--ink:#f3f2f8;--mute:#a7a3b3;--line:#232a33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Heebo","Noto Sans Hebrew",sans-serif}
header{background:var(--sky);padding:28px 16px 22px}header>div,main{max-width:720px;margin:0 auto}main{padding:4px 16px 60px}
h1{font-size:30px;line-height:1.15;margin:6px 0}h2{font-size:21px;line-height:1.3;margin:4px 0 8px}
.kicker{font-weight:700;color:var(--mute);margin:0;font-size:14px}.note{color:var(--mute);font-size:14px;margin:6px 0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin:16px 0}.grid img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:16px 0}
img.post{width:100%;border-radius:14px;display:block}
.btn{display:inline-block;margin-top:10px;background:var(--ink);color:var(--bg);font-weight:800;padding:10px 18px;border-radius:999px;text-decoration:none}
.f{display:block;margin:10px 0}.f span{display:block;font-size:13px;color:var(--mute);margin-bottom:4px}
textarea{width:100%;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:10px;font:inherit;font-size:14.5px;resize:vertical}
.copy{margin-top:6px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
details{margin:10px 0}summary{cursor:pointer;font-weight:700}ol{padding-inline-start:20px}a{color:inherit}
</style></head><body>
<header><div><p class="kicker">האינסטגרם של LikeLink2${date ? ` · ${esc(date)}` : ""}</p><h1>${posts.length} פוסטים במראה אחד</h1>
<p class="note">ככה הפרופיל ייראה: כל פוסט עם התג „LikeLink2 ממליצה”, פס כותרת אחד בתחתית, ובכל שורה טיפ שמלמד משהו לפני המוצרים, כמו אצל היוצרות הגדולות. פוסט מוצר מתחיל ב־„#פרסומת · קישור שותפים” ומשתמש בתמונה של המוצר עצמו; בפוסט עם הדמות כתוב „${esc(AI_TAG)}”.</p>
<p class="note">איך לפרסם כדי שהרשת תיראה כמו כאן: מתחילים מהפוסט האחרון ברשימה ועולים, פוסט אחד או שניים ביום (אינסטגרם מראה את החדש ביותר ראשון).</p>
<p class="note"><a href="../drop/">לדרופ היומי</a> · <a href="../tiktok/">לטיקטוק של היום</a></p></div></header>
<main>
<div class="grid" aria-label="תצוגת הרשת">${tiles}</div>
${cards}
</main>
<script>document.addEventListener("click",(e)=>{const b=e.target.closest(".copy");if(!b)return;const t=b.previousElementSibling;t.select();navigator.clipboard?.writeText(t.value).then(()=>{b.textContent="הועתק";setTimeout(()=>{b.textContent="העתקה"},1500)}).catch(()=>document.execCommand("copy"))});</script>
</body></html>`;
}

export async function writeInstagramGrid({ dist = "dist", now = Date.now(), playwrightModule = process.env.PLAYWRIGHT_MODULE, presenterFiles = PRESENTER_FILES } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  if (!existsSync(snapshot)) return { written: false, reason: "no catalog copy in dist" };
  const products = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8"))).products.map((x) => x.product);
  const out = join(dist, "instagram");
  mkdirSync(join(out, "posts"), { recursive: true });
  const presenter = [];
  for (const [i, file] of presenterFiles.entries()) {
    if (!existsSync(file)) continue;
    copyFileSync(file, join(out, `presenter-${i + 1}.png`));
    presenter.push(`presenter-${i + 1}.png`);
  }
  const imageOf = (p) => cleanImage(p, "..")?.src || "";
  const posts = instagramGrid({ products, imageOf, presenter });
  const files = await renderPosts(posts, out, { playwrightModule });
  const date = new Date(now).toISOString().slice(0, 10);
  writeFileSync(join(out, "index.html"), gridPage(posts, files, { date }));
  writeFileSync(join(out, "grid.json"), `${JSON.stringify({ date, posts: posts.map((p) => ({ ...p, rendered: files[p.id] || "" })) }, null, 1)}\n`);
  return { written: true, posts: posts.length, rendered: Object.keys(files).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await writeInstagramGrid({ dist: process.argv[2] || "dist" });
  console.log(r.written ? `instagram-grid: ${r.posts} post(s), ${r.rendered} rendered` : `instagram-grid: skipped (${r.reason})`);
}
