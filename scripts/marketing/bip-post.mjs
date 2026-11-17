// "Building in public" (the owner, 2026-11-16: "publish like Maor Shlomo did at the start, alone";
// "I want it global"): one 1080x1350 picture per language for the day, from the radar's own sealed
// pick of the day (op=leaderboard → duel.recent) — facts only: what it picked, its sealed base (the
// top items' AliExpress orders over 30 days, measured that day — never "orders today"), the seal day and the public grade day. No promise, no forecast, no "only one in the world".
// Usage: FONTS=<@fontsource dir> node scripts/marketing/bip-post.mjs <day> <name-he> <name-en> <orders> <sealed d.m> <due d.m> <outdir>
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const [, , DAY, HE, EN, ORDERS, SEALED, DUE, OUT] = process.argv;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const enDay = (dm) => { const [d, m] = String(dm).split("."); return MON[Number(m) - 1] ? `${MON[Number(m) - 1]} ${Number(d)}` : dm; };
const F = process.env.FONTS || join(process.cwd(), "node_modules/@fontsource");
const b64 = (p) => readFileSync(p).toString("base64");
const font = (n, f, w) => `@font-face{font-family:${n};font-weight:${w};src:url(data:font/woff2;base64,${b64(join(F, f))}) format("woff2");}`;
const T = {
  he: { dir: "rtl", tag: `🛠️ יום ${DAY} · בונה בפומבי`, h: "רדאר שמזהה מוצרים<br>לפני שהם מגיעים לישראל", k: "🤖 הרדאר בחר היום", v: HE, rows: [`📦 ${ORDERS} הזמנות ב־30 יום (נמדד היום)`, `⛓️ חתום בביטקוין ב־${SEALED}`, `⚖️ הציון בפומבי ב־${DUE} (פגיעה = ‎+15%)`], cta: "🔮 יש לך חוש שישי לטרנדים?<br>likelink2.vercel.app/radar" },
  en: { dir: "ltr", tag: `🛠️ Day ${DAY} · Building in public`, h: "A trend radar that seals every pick in advance", k: "🤖 Today the radar picked", v: EN, rows: [`📦 ${ORDERS} orders in 30 days (measured today)`, `⛓️ Sealed in Bitcoin on ${enDay(SEALED)}`, `⚖️ Graded in public on ${enDay(DUE)} (hit = +15%)`], cta: "🔮 Do you have a sixth sense for trends?<br>likelink2.vercel.app/radar" },
};
const css = `${font("Heebo", "heebo/files/heebo-hebrew-800-normal.woff2", 800)}${font("Heebo", "heebo/files/heebo-latin-800-normal.woff2", 800)}${font("Heebo", "heebo/files/heebo-hebrew-900-normal.woff2", 900)}${font("Heebo", "heebo/files/heebo-latin-900-normal.woff2", 900)}${font("Frank", "frank-ruhl-libre/files/frank-ruhl-libre-hebrew-900-normal.woff2", 900)}${font("Frank", "frank-ruhl-libre/files/frank-ruhl-libre-latin-900-normal.woff2", 900)}
*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1350px;font-family:Heebo,sans-serif;background:#0b0b0b;color:#fff;overflow:hidden}
.s{height:1350px;padding:90px 84px 80px;display:flex;flex-direction:column;justify-content:space-between}
.tag{font-weight:900;font-size:44px;color:#fbbf24}.h{font-family:Frank,serif;font-weight:900;font-size:84px;line-height:1.15;margin-top:30px}
.card{background:#1f2937;border-radius:32px;padding:44px 48px;margin-top:40px}.k{font-weight:800;font-size:34px;opacity:.75}.v{font-weight:900;font-size:72px;color:#fbbf24;margin-top:8px}
.row{font-weight:800;font-size:36px;line-height:1.7;margin-top:22px}.cta{font-weight:900;font-size:44px;line-height:1.35}.b{font-weight:800;font-size:30px;opacity:.55;margin-top:20px}`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1350 } })).newPage();
for (const [lang, t] of Object.entries(T)) {
  await page.setContent(`<!doctype html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="s"><div><div class="tag">${t.tag}</div><div class="h">${t.h}</div><div class="card"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="row">${t.rows.join("<br>")}</div></div></div><div><div class="cta">${t.cta}</div><div class="b">LikeLink2</div></div></div></body></html>`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `bip-day${DAY}-${lang}.jpg`), type: "jpeg", quality: 92 });
}
await browser.close();
console.log("ok");
