// "טיקטוק של LikeLink2" (src/lib/growth/tiktok.js): every morning GitHub Pages
// serves https://hen63165-dotcom.github.io/likelink/tiktok/ with today's TikToks,
// ready to post from a phone: the video to download, or the photo-mode slides
// already rendered (1080×1920 PNG, the disclosure on every slide), the text for
// the screen, the caption, the steps in the app, and what the owner's own
// results taught so far. Run by .github/workflows/deploy-frontend.yml after the
// daily drop:
//   TIKTOK_RESULTS=results.json PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright \
//     node scripts/marketing/tiktok-kit.mjs dist
// Without a browser the slides are listed as text over the product photo
// instead (nothing invented, nothing missing). Nothing is posted from here.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";
import { readTrends } from "./daily-drop.mjs";
import { CHOICE_TEXT, MIN_POSTS, TIKTOK_FORMATS, israelNoon, tiktokDay, tiktokWeek } from "../../src/lib/growth/tiktok.js";
import { cleanImage } from "../../src/lib/looks.js";
import { socialProfiles } from "../../src/lib/growth/socialAccounts.js";

const RESULTS_FORM = "https://github.com/hen63165-dotcom/likelink/actions/workflows/tiktok-results.yml";
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function copyField(label, text, rows = 3) {
  return `<label class="f"><span>${esc(label)}</span><textarea readonly rows="${rows}">${esc(text)}</textarea><button type="button" class="copy">העתקה</button></label>`;
}

/** One slide as a page: the product photo, the line, the disclosure. Light, like the site. */
export function slideHtml(slide, { index, total, base }) {
  const first = index === 0;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><base href="${esc(base)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800&family=Frank+Ruhl+Libre:wght@700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px}
body{position:relative;overflow:hidden;background:#eaf2fb;color:#0b0b0c;font-family:Heebo,sans-serif}
.photo{position:absolute;inset-inline:90px;top:${first ? 560 : 820}px;height:${first ? 1020 : 820}px;border-radius:48px;overflow:hidden;background:#d4e5f6;box-shadow:0 40px 80px -40px rgba(10,30,60,.45)}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.text{position:absolute;inset-inline:90px;top:170px}
h1{font-family:"Frank Ruhl Libre",serif;font-weight:700;font-size:${first ? 104 : 92}px;line-height:1.08}
p{margin-top:34px;font-size:44px;line-height:1.45;font-weight:500;color:#34313f}
.count{position:absolute;top:90px;inset-inline-start:90px;font-size:34px;font-weight:700;color:#646173}
.ad{position:absolute;bottom:80px;inset-inline:90px;display:flex;justify-content:space-between;font-size:30px;font-weight:700;color:#34313f}
.brand{font-family:Inter,Heebo,sans-serif;font-weight:800;letter-spacing:-.02em}
</style></head><body>
<div class="count">${index + 1}/${total}</div>
<div class="text"><h1>${esc(slide.text)}</h1>${slide.sub ? `<p>${esc(slide.sub)}</p>` : ""}</div>
${slide.image ? `<div class="photo"><img src="${esc(slide.image)}" alt=""></div>` : ""}
<div class="ad"><span>#פרסומת · קישור שותפים${slide.image ? " · התמונה: מהמוכר" : ""}</span><span class="brand" dir="ltr">LikeLink2</span></div>
</body></html>`;
}

/** The profile photo: the site's link mark, white on black (TikTok shows it in a circle). */
const PROFILE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1080px;height:1080px;background:#0b0b0c;display:grid;place-items:center}</style></head><body>
<svg width="620" height="620" viewBox="0 0 24 24" fill="none"><path d="M9.5 14.5l5-5M8 11l-1.6 1.6a3.4 3.4 0 004.8 4.8L13 15.8M16 13l1.6-1.6a3.4 3.4 0 00-4.8-4.8L11 8.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></body></html>`;

/** A relative image path (a look frame under dist/) as a data URL; remote URLs stay as they are. */
export function inlineLocal(src, outDir) {
  const s = String(src || "");
  if (!s || /^(https?:|data:)/i.test(s)) return s;
  const file = resolve(outDir, s);
  const root = resolve(outDir, "..");
  if (!file.startsWith(root + sep) || !/\.(jpe?g|png|webp)$/i.test(file) || !existsSync(file)) return "";
  const type = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
}

/** Renders the carousel slides and the profile photo; returns the files written (empty without a browser). */
export async function renderImages(day, outDir, { playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  if (!playwrightModule) return { slides: {}, profile: "" };
  let browser;
  try {
    const { chromium } = createRequire(import.meta.url)(playwrightModule);
    browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const slides = {};
    const base = pathToFileURL(resolve(outDir) + "/").href;
    for (const post of day.posts.filter((p) => p.slides.length)) {
      slides[post.id] = [];
      for (const [i, s] of post.slides.entries()) {
        // A page set from a string may not read local files: a frame that ships with the site goes in as data.
        const image = inlineLocal(s.image, outDir);
        await page.setContent(slideHtml({ ...s, image }, { index: i, total: post.slides.length, base }), { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const file = `${post.id}-${i + 1}.png`;
        await page.screenshot({ path: join(outDir, "slides", file) });
        slides[post.id].push(file);
      }
    }
    await page.setViewportSize({ width: 1080, height: 1080 });
    await page.setContent(PROFILE_HTML);
    await page.screenshot({ path: join(outDir, "profile.png") });
    return { slides, profile: "profile.png" };
  } catch (e) {
    console.log(`tiktok-kit: images skipped (${String(e?.message || e).slice(0, 120)})`);
    return { slides: {}, profile: "" };
  } finally {
    await browser?.close().catch(() => {});
  }
}

function postCard(post, images) {
  const rendered = images.slides[post.id] || [];
  const media = post.video
    ? `<video src="../media/reels/${esc(post.video.file)}" ${post.video.poster ? `poster="../media/reels/${esc(post.video.poster)}"` : ""} controls playsinline muted loop preload="metadata"></video>
       <a class="btn" href="../media/reels/${esc(post.video.file)}" download>הורדת הסרטון</a>
       <p class="note">${esc(post.video.labels.join(" · "))}</p>`
    : rendered.length
      ? `<div class="slides">${rendered.map((f, i) => `<a href="slides/${esc(f)}" download><img src="slides/${esc(f)}" alt="שקף ${i + 1}" loading="lazy"></a>`).join("")}</div>
         <p class="note">לוחצים על כל שקף כדי להוריד אותו (${rendered.length} שקפים, לפי הסדר).</p>`
      : post.slides.length
        ? `<ol>${post.slides.map((s) => `<li><b>${esc(s.text)}</b>${s.sub ? `<br><small>${esc(s.sub)}</small>` : ""}</li>`).join("")}</ol>
           ${post.slides[0]?.image ? `<a class="btn" href="${esc(post.slides[0].image)}" download>התמונה של המוצר</a>` : ""}`
        : "";
  return `<section class="card" id="${esc(post.id)}">
<p class="kicker">${post.choice === "bonus" ? "בונוס" : `טיקטוק ${post.slot}`} · ${esc(post.formatName)}</p>
<h2>${esc(post.hook)}</h2>
<p class="note">${esc(TIKTOK_FORMATS[post.format].why)} ${esc((CHOICE_TEXT[post.choice] || (() => ""))(MIN_POSTS))}</p>
<p class="note">המוצר: <a href="${esc(post.product.link)}">${esc(post.product.title)}</a></p>
${media}
${post.script.length ? copyField("התסריט (מדברים למצלמה, 15–25 שניות)", post.script.join("\n"), post.script.length + 1) : ""}
${post.onScreen.length && !rendered.length ? copyField("טקסט על המסך", post.onScreen.join("\n"), Math.min(post.onScreen.length, 5)) : ""}
${copyField("כיתוב", post.caption, 6)}
<details><summary>איך מפרסמים</summary><ol>${post.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>
${copyField("מזהה הפוסט (לרישום התוצאות)", post.id, 1)}
<p class="note">אחרי 48 שעות: פותחים בטיקטוק את הפוסט ← ניתוח נתונים, ורושמים את המספרים ב<a href="${RESULTS_FORM}">טופס התוצאות</a> (Run workflow). המנוע לומד מזה מה לתת מחר.</p>
</section>`;
}

const WEEKDAY_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** The coming week for TikTok Studio's scheduler: one row per post, everything to upload in one sitting. */
export function weekSection(week = [], images = { slides: {} }) {
  if (!week.length) return "";
  const item = (p) => {
    const rendered = images.slides[p.id] || [];
    const files = p.video
      ? `<a href="../media/reels/${esc(p.video.file)}" download>הסרטון</a>`
      : rendered.length
        ? rendered.map((f, i) => `<a href="slides/${esc(f)}" download>שקף ${i + 1}</a>`).join(" · ")
        : "";
    // Slides that weren't rendered (no browser on the runner): their text and the product's picture, to make them in the app.
    const unrendered = !p.video && !rendered.length && p.slides.length
      ? `<ol>${p.slides.map((s) => `<li><b>${esc(s.text)}</b>${s.sub ? `<br><small>${esc(s.sub)}</small>` : ""}</li>`).join("")}</ol>
         ${p.slides[0]?.image ? `<a href="${esc(p.slides[0].image)}" download>התמונה של המוצר</a>` : ""}`
      : "";
    return `<li class="wk"><p class="kicker">${esc(p.at)} · ${esc(p.formatName)}${p.aiLabel ? " · לסמן תוכן AI" : ""}</p>
<b>${esc(p.hook)}</b><br><span class="note">${esc(p.product.title)}${files ? ` · ${files}` : ""}</span>
${unrendered}${copyField("כיתוב", p.caption, 4)}${copyField("מזהה הפוסט", p.id, 1)}</li>`;
  };
  return `<section class="card" id="week"><h2>השבוע מראש: לתזמן פעם אחת ב-TikTok Studio</h2>
<p class="note">ב-TikTok Studio במחשב (tiktok.com/tiktokstudio) אפשר לתזמן פוסט עד 10 ימים מראש, כשהאפשרות "תזמון" מופיעה בחשבון (אם היא לא מופיעה, מפרסמים מהטלפון בשעה שכתובה כאן). יושבים פעם בשבוע, מעלים כל פוסט עם הכיתוב שלו, בוחרים "תזמון" ואת היום והשעה שכתובים כאן, ומפעילים בכל פוסט "גילוי תוכן הפוסט" ← "תוכן ממותג". צליל טרנדי מוסיפים רק באפליקציה, אז פוסט שרוצים איתו צליל מפרסמים מהטלפון ביום עצמו.</p>
${week.map((d) => `<details><summary>${esc(WEEKDAY_HE[new Date(`${d.date}T12:00:00Z`).getUTCDay()])} · ${esc(d.date)} · ${d.posts.length} פוסטים</summary><ul class="wkl">${d.posts.map(item).join("")}</ul></details>`).join("\n")}
<p class="note">כל יום כאן הוא תוכנית לפי הסבב. הטרנד של היום וההחלטות לפי התוצאות שלך מתעדכנים בעמוד כל בוקר, אז מי שמתזמנת שבוע שלם מוותרת על ההתאמה היומית. אפשר גם לשלב: לתזמן את השבוע, ולהחליף פוסט כשהעמוד מציע טרנד מתאים.</p>
</section>`;
}

/** The page: plain HTML, no app bundle, light like the site. */
export function tiktokPage(day, images = { slides: {}, profile: "" }, week = []) {
  const a = day.account;
  const tt = socialProfiles().find((p) => p.network === "tiktok");
  const photo = `<a href="${esc(images.profile || a.photo)}" download>הורדה</a>`;
  const rows = day.learning.formats.map((r) => `<tr><td>${esc(TIKTOK_FORMATS[r.format].he)}</td><td>${r.posts}</td><td>${r.posts ? r.medianViews : "–"}</td><td>${r.posts ? `${r.engagementRate}%` : "–"}</td><td>${r.status === "MEASURED" ? "נמדד" : `עוד ${Math.max(0, MIN_POSTS - r.posts)} פוסטים`}</td></tr>`).join("");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>טיקטוק של LikeLink2 · ${esc(day.date)}</title>
<style>
:root{--bg:#fff;--card:#fff;--sky:#eaf2fb;--ink:#0b0b0c;--mute:#5d5866;--line:#e3e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#12171e;--sky:#0f1924;--ink:#f3f2f8;--mute:#a7a3b3;--line:#232a33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Heebo","Noto Sans Hebrew",sans-serif}
header{background:var(--sky);padding:28px 16px 22px}header>div,main{max-width:720px;margin:0 auto}main{padding:4px 16px 60px}
h1{font-size:30px;line-height:1.15;margin:6px 0}h2{font-size:21px;line-height:1.3;margin:4px 0 8px}
.kicker{font-weight:700;color:var(--mute);margin:0;font-size:14px}.note{color:var(--mute);font-size:14px;margin:6px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:16px 0}
video{width:100%;max-height:72vh;border-radius:14px;background:#000}
.slides{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.slides img{width:100%;border-radius:10px;display:block}
.btn{display:inline-block;margin-top:10px;background:var(--ink);color:var(--bg);font-weight:800;padding:10px 18px;border-radius:999px;text-decoration:none}
.f{display:block;margin:10px 0}.f span{display:block;font-size:13px;color:var(--mute);margin-bottom:4px}
textarea{width:100%;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:10px;font:inherit;font-size:14.5px;resize:vertical}
.copy{margin-top:6px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
details{margin:10px 0}summary{cursor:pointer;font-weight:700}ol,ul{padding-inline-start:20px}a{color:inherit}
.wkl{list-style:none;padding:0;margin:8px 0}.wk{border-top:1px solid var(--line);padding:10px 0}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:8px 4px;text-align:start}
</style></head><body>
<header><div><p class="kicker">טיקטוק של LikeLink2 · ${esc(day.date)}</p><h1>${day.posts.length ? `${day.posts.length} טיקטוקים מוכנים להיום` : "אין היום פוסט מוכן"}</h1>
<p class="note">כל יום בבוקר: פורמט טרנדי, מוצר אמיתי מהאתר, טקסט שנבדק, והצעדים באפליקציה. כדאי לפרסם ב־${esc(day.schedule.join(" או ב־"))}. ${esc(day.scheduleNote)}</p>
${day.trend ? `<p class="note">חם היום בחיפושים בישראל ומתאים למוצר: „${esc(day.trend.term)}” (Google Trends).</p>` : ""}
<p class="note"><a href="../drop/">לדרופ היומי לכל הרשתות</a> · <a href="../trend-board/">טרנדים מ-AliExpress לפי קטגוריות</a></p></div></header>
<main>
${tt ? `<details class="card"${day.learning.posts ? "" : " open"}><summary>החשבון: <span dir="ltr">@${esc(tt.handle)}</span></summary>
<p class="note"><a href="${esc(tt.url)}" target="_blank" rel="noopener">לפרופיל בטיקטוק</a>. הוא כבר מקושר מתחתית האתר.</p>
<ol>
<li>פרופיל ← עריכת פרופיל: השם, הביו והתמונה שכאן למטה.</li>
<li>תמונת פרופיל: ${photo}</li>
<li>קישור לאתר בביו: טיקטוק פותחת אותו רק לחלק מהחשבונות (למשל חשבון עסקי, או אחרי מספר עוקבים). כשהשדה "אתר" מופיע בעריכת הפרופיל, מדביקים בו את הקישור שכאן.</li>
</ol>` : `<details class="card"${day.learning.posts ? "" : " open"}><summary>פתיחת החשבון (פעם אחת)</summary>
<ol>
<li>מורידים את טיקטוק ונרשמים עם הטלפון או המייל שלך. החשבון שלך, בשמך.</li>
<li>הגדרות ← חשבון ← מעבר לחשבון עסקי (בחינם). בחשבון עסקי יש ניתוח נתונים, ואפשר להוסיף קישור לאתר בביו כשטיקטוק פותחת את זה לחשבון.</li>
<li>בוחרים שם משתמש (אחד מאלה, מה שפנוי): ${a.usernames.map((u) => `<b dir="ltr">@${esc(u)}</b>`).join(" · ")}</li>
<li>תמונת פרופיל: ${photo}</li>
<li>שולחים לי את שם המשתמש, ואחבר אותו לאתר (קישור בתחתית האתר ובנתונים לגוגל).</li>
</ol>`}
${copyField("שם", a.name, 1)}${copyField(`ביו (עד 80 תווים)`, a.bio, 2)}${copyField("קישור לביו", a.link, 1)}
<p class="note">הקישור בביו פותח את דף הסרטונים באתר: כל סרטון עם המוצר והקישור לחנות, כמו בטיקטוק.</p>
</details>
${day.posts.map((p) => postCard(p, images)).join("\n")}
${weekSection(week, images)}
<section class="card"><h2>מה למדנו מהתוצאות שלך</h2>
<p class="note">${day.learning.posts ? `${day.learning.posts} פוסטים נרשמו.` : "עוד לא נרשמו תוצאות."} כל פורמט צריך ${MIN_POSTS} פוסטים לפחות לפני שמשווים. ${esc(day.learning.note)}.</p>
<table><thead><tr><th>פורמט</th><th>פוסטים</th><th>צפיות (חציון)</th><th>מעורבות</th><th>מצב</th></tr></thead><tbody>${rows}</tbody></table>
${day.learning.leader ? `<p class="note">מוביל כרגע: <b>${esc(TIKTOK_FORMATS[day.learning.leader].he)}</b>. הוא מקבל משבצת קבועה, והמשבצת השנייה ממשיכה לבדוק.</p>` : ""}
</section>
<p class="note">הכללים: #פרסומת · קישור שותפים בתחילת כל כיתוב, "גילוי תוכן" מופעל בכל פוסט, לונה מסומנת כתוכן AI. בלי מחירים, בלי „רק היום”, בלי ביקורות או קניות מומצאות, ובלי לקנות עוקבים או צפיות. שום דבר לא מתפרסם מכאן לבד.</p>
</main>
<script>document.querySelectorAll(".copy").forEach(function(b){b.addEventListener("click",function(){var t=b.previousElementSibling;t.select();try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand("copy")}b.textContent="הועתק ✓";setTimeout(function(){b.textContent="העתקה"},1600)})});</script>
</body></html>
`;
}

// No results file yet = nothing logged. A file that exists but is broken stops
// the kit: a page that "learned" from an empty list would steer the owner wrong.
export function readResults(file = process.env.TIKTOK_RESULTS) {
  if (!file || !existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(list)) throw new Error("the TikTok results file is not a list");
  return list;
}

export async function writeTikTokKit({ dist = "dist", now = Date.now(), fetchImpl = fetch, results = readResults(), playwrightModule = process.env.PLAYWRIGHT_MODULE } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  const reelsIndex = join(dist, "media", "reels", "index.json");
  if (!existsSync(snapshot)) return { written: false, reason: "no catalog copy in dist" };
  const products = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8"))).products.map((x) => x.product);
  const reels = existsSync(reelsIndex) ? JSON.parse(readFileSync(reelsIndex, "utf8")).reels || [] : [];
  const trends = await readTrends(fetchImpl);
  const imageOf = (p) => cleanImage(p, "..")?.src || "";
  // Today and the week are the owner's days in Israel, whenever the deploy runs.
  const day = tiktokDay({ products, reels, trends, results, now: israelNoon(now), imageOf });
  const week = tiktokWeek({ products, reels, results, now, imageOf });
  const out = join(dist, "tiktok");
  mkdirSync(join(out, "slides"), { recursive: true });
  const images = await renderImages({ posts: [...day.posts, ...week.flatMap((d) => d.posts)] }, out, { playwrightModule });
  writeFileSync(join(out, "index.html"), tiktokPage(day, images, week));
  const strip = ({ lines, ...p }) => ({ ...p, renderedSlides: images.slides[p.id] || [] });
  writeFileSync(join(out, "today.json"), `${JSON.stringify({ ...day, posts: day.posts.map(strip) }, null, 1)}\n`);
  writeFileSync(join(out, "week.json"), `${JSON.stringify(week.map((d) => ({ ...d, posts: d.posts.map(strip) })), null, 1)}\n`);
  return { written: true, posts: day.posts.map((p) => p.id), week: week.reduce((n, d) => n + d.posts.length, 0), slides: Object.values(images.slides).flat().length, results: day.learning.posts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await writeTikTokKit({ dist: process.argv[2] || "dist" });
  console.log(r.written ? `tiktok-kit: ${r.posts.join(", ")} + ${r.week} for the week (${r.slides} slide(s), ${r.results} logged result(s))` : `tiktok-kit: skipped (${r.reason})`);
}
