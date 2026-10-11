// The daily drop page (src/lib/growth/dailyDrop.js): every morning GitHub
// Pages serves https://hen63165-dotcom.github.io/likelink/drop/ — today's
// video and the post for every network, with copy buttons. Run by
// .github/workflows/deploy-frontend.yml (daily schedule + every deploy) after
// the reels feed:
//   node scripts/marketing/daily-drop.mjs dist
// Trends: Google Trends' public daily feed for Israel. When it cannot be read
// the drop simply has no trend angle (never an invented one).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";
import { buildDrop, pickProduct } from "../../src/lib/growth/dailyDrop.js";
import { parseTrendsRss } from "../../src/lib/growth/likeloop.js";
import { currentMoment } from "../../src/lib/moments.js";

const TRENDS_URL = "https://trends.google.com/trending/rss?geo=IL";
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function readTrends(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(TRENDS_URL, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? parseTrendsRss(await res.text()) : [];
  } catch {
    return [];
  }
}

const REASON = {
  trend: (d) => `חם היום בחיפושים בישראל: „${d.trend.term}” (Google Trends), והוא מתאים למוצר הזה.`,
  moment: (d) => `מתאים לתקופה: ${d.moment?.title || ""}.`,
  rotation: () => "התור היומי: כל מוצר עם וידאו מקבל את היום שלו.",
};

function block(title, items) {
  return `<section class="card"><h2>${esc(title)}</h2>${items.join("")}</section>`;
}
function copyField(label, text, rows = 4) {
  return `<label class="f"><span>${esc(label)}</span><textarea readonly rows="${rows}">${esc(text)}</textarea><button type="button" class="copy">העתקה</button></label>`;
}

/** The page: plain HTML, no app bundle, works on a phone. */
export function dropPage(d, { trends = [] } = {}) {
  const p = d.posts;
  const wa = `https://wa.me/?text=${encodeURIComponent(p.whatsapp.text)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(d.product.link)}&text=${encodeURIComponent(p.telegram.text)}`;
  const video = d.video
    ? `<video src="../media/reels/${esc(d.video.file)}" ${d.video.poster ? `poster="../media/reels/${esc(d.video.poster)}"` : ""} controls playsinline muted loop preload="metadata"></video>
       <a class="btn" href="../media/reels/${esc(d.video.file)}" download>הורדת הסרטון</a>
       <p class="note">${esc((d.video.labels || []).join(" · "))}</p>`
    : `<p class="note">אין היום וידאו.</p>`;
  const hot = trends.slice(0, 8).map((t) => `<li>${esc(t.term)}${t.traffic ? ` <small>${esc(t.traffic)}</small>` : ""}</li>`).join("");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>הדרופ היומי · ${esc(d.date)} | LikeLink2</title>
<style>
:root{--bg:#0f0d12;--card:#19161f;--ink:#f6f2ea;--mute:#b9b2c4;--gold:#e9c46a;--line:#2b2633}
@media (prefers-color-scheme:light){:root{--bg:#f7f5f2;--card:#fff;--ink:#16131a;--mute:#5d5866;--line:#e6e1da}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Heebo","Noto Sans Hebrew",sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px 60px}h1{font-size:30px;margin:6px 0 4px}h2{font-size:19px;margin:0 0 10px}
.kicker{color:var(--gold);font-weight:700;letter-spacing:.3px}.note{color:var(--mute);font-size:13.5px;margin:6px 0 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:14px 0}
video{width:100%;max-height:70vh;border-radius:14px;background:#000}
.btn{display:inline-block;margin-top:10px;background:var(--gold);color:#1b1406;font-weight:800;padding:10px 18px;border-radius:999px;text-decoration:none}
.row{display:flex;flex-wrap:wrap;gap:8px}.row .btn{margin-top:0}
.f{display:block;margin:10px 0}.f span{display:block;font-size:13px;color:var(--mute);margin-bottom:4px}
textarea{width:100%;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:10px;font:inherit;font-size:14.5px;resize:vertical}
.copy{margin-top:6px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
ol,ul{margin:6px 0;padding-inline-start:20px}small{color:var(--mute)}a{color:var(--gold)}
</style></head><body><main>
<p class="kicker">הדרופ היומי · ${esc(d.date)}</p>
<h1>${esc(d.hooks[0] || d.product.title)}</h1>
<p class="note">${esc(REASON[d.reason]?.(d) || "")} המוצר: <a href="${esc(d.product.link)}">${esc(d.product.title)}</a></p>
<section class="card">${video}</section>
${block("איך מעלים בדקה", [`<ol><li>מורידים את הסרטון (הכפתור למעלה).</li><li>פותחים טיקטוק או אינסטגרם, מעלים, ומוסיפים סאונד טרנדי בעוצמה נמוכה.</li><li>מעתיקים את הטקסט של הרשת ומדביקים.</li><li>כדאי לנסות לפרסם בערב, בין 20:00 ל־21:30, ולענות לתגובות בשעה הראשונה.</li></ol>`])}
${block("טיקטוק", [copyField("טקסט על המסך (באפליקציה)", p.tiktok.onScreen.join("\n"), 2), copyField("כיתוב", p.tiktok.caption, 7), copyField("קישור לביו", p.tiktok.bioLink, 1)])}
${block("אינסטגרם רילס", [copyField("טקסט על המסך", p.instagram.onScreen.join("\n"), 1), copyField("כיתוב", p.instagram.caption, 10), `<p class="note">מי שכותבת "רוצה" מקבלת את הקישור בפרטי, כשבוט התגובות מחובר.</p>`])}
${block("יוטיוב שורטס", [copyField("כותרת", p.shorts.title, 1), copyField("תיאור", p.shorts.description, 4)])}
${block("וואטסאפ וטלגרם", [copyField("וואטסאפ (סטטוס או קבוצה)", p.whatsapp.text, 4), `<div class="row"><a class="btn" href="${esc(wa)}">שליחה בוואטסאפ</a><a class="btn" href="${esc(tg)}">שיתוף בטלגרם</a></div>`, copyField("טלגרם", p.telegram.text, 7)])}
${block("פייסבוק", [copyField("פוסט", p.facebook.text, 7)])}
${block("סטורי", [copyField("סקר בסטורי", p.story.poll, 1), copyField("קישור לסטיקר", p.story.link, 1)])}
${block("פתיחות נוספות לנסות", [`<ul>${d.hooks.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`])}
${hot ? block("מה חם היום בחיפושים בישראל", [`<ul>${hot}</ul><p class="note">מקור: Google Trends. נכנס לפוסט רק כשמתאים באמת למוצר.</p>`]) : ""}
<p class="note">כל הטקסטים נבדקים: בלי מחירים שמתיישנים, בלי „רק היום” ו„נשארו אחרונים”, בלי ביקורות או מכירות מומצאות, ועם #פרסומת בהתחלה.</p>
</main>
<script>document.querySelectorAll(".copy").forEach(function(b){b.addEventListener("click",function(){var t=b.previousElementSibling;t.select();try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand("copy")}b.textContent="הועתק ✓";setTimeout(function(){b.textContent="העתקה"},1600)})});</script>
</body></html>
`;
}

export async function writeDailyDrop({ dist = "dist", now = Date.now(), fetchImpl = fetch } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  const reelsIndex = join(dist, "media", "reels", "index.json");
  if (!existsSync(snapshot) || !existsSync(reelsIndex)) return { written: false, reason: "no catalog copy or reels feed in dist" };
  const products = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8"))).products.map((x) => x.product);
  const reels = JSON.parse(readFileSync(reelsIndex, "utf8")).reels || [];
  const trends = await readTrends(fetchImpl);
  const moment = currentMoment(now);
  const pick = pickProduct({ products, reels, trends, moment, now });
  if (!pick) return { written: false, reason: "no product with a video" };
  const drop = buildDrop({ ...pick, moment, now });
  const out = join(dist, "drop");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), dropPage(drop, { trends }));
  writeFileSync(join(out, "today.json"), `${JSON.stringify({ ...drop, trendsRead: trends.length }, null, 1)}\n`);
  return { written: true, product: drop.product.id, reason: drop.reason, trends: trends.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await writeDailyDrop({ dist: process.argv[2] || "dist" });
  console.log(r.written ? `daily-drop: ${r.product} (${r.reason}; ${r.trends} trend(s) read)` : `daily-drop: skipped (${r.reason})`);
}
