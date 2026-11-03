#!/usr/bin/env node
// A 10-slide Instagram carousel people save (the owner, 2026-11-03, after an
// SBX example: "do everything like the best influencers"): the cover, Luna's
// 8 shopping checks one per slide, and the closing slide with the save/send
// ask and where the full guide is. Every word comes from src/lib/guide.js, the
// same text as /guide on the site, so the post says nothing the site does not.
// No AI picture and no product on the slides; the guide page has affiliate
// examples, so the closing slide says so (#פרסומת).
//
//   [PLAYWRIGHT_MODULE=/path/to/node_modules/playwright] node scripts/marketing/guide-carousel.mjs <out-dir>
// Writes slide-01.jpg … slide-10.jpg (1080×1350, Instagram's 4:5) and caption.txt.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GUIDE, GUIDE_PATH } from "../../src/lib/guide.js";
import { PRODUCTION_ORIGIN } from "../../src/constants/domain.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT = (w) => pathToFileURL(resolve(HERE, `../luna_reels/assets/Heebo-${w}.ttf`)).href;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SITE = PRODUCTION_ORIGIN.replace(/^https?:\/\//, "");

export function slides(guide = GUIDE) {
  const n = guide.checks.length;
  return [
    { kind: "cover", title: guide.title.he, sub: guide.kicker.he, note: "שמרי את הפוסט לפני ההזמנה הבאה" },
    ...guide.checks.map((c, i) => ({ kind: "check", num: i + 1, of: n, title: c.title.he, body: c.body.he })),
    { kind: "end", title: "רוצה את המדריך המלא?", sub: "עם דוגמאות למוצרים, לשמירה כ־PDF",
      link: `${SITE}${GUIDE_PATH}`, ask: "שמרי · שלחי לחברה שקונה באלי",
      disclosure: "במדריך יש דוגמאות עם קישורי שותפים (#פרסומת)" },
  ];
}

export function caption(guide = GUIDE) {
  return [
    `${guide.title.he} 📌`,
    "",
    ...guide.checks.map((c, i) => `${i + 1}. ${c.title.he}`),
    "",
    "שמרי את הפוסט לפני ההזמנה הבאה, ושלחי לחברה שקונה באלי 💌",
    "המדריך המלא עם דוגמאות: הקישור בתגובה הראשונה 👇",
    "",
    "במדריך יש דוגמאות עם קישורי שותפים (#פרסומת): אם תקני דרכם ייתכן שאקבל עמלה, בלי עלות נוספת לך.",
    "",
    "#קניותחכמות #אליאקספרס #טיפים #תכשיטים #קניותאונליין #LikeLink2",
  ].join("\n");
}

function html(list) {
  const page = (s) => {
    if (s.kind === "cover") return `<section class="s cover"><div class="brand">LikeLink2</div>
      <div class="kicker">${esc(s.sub)}</div><h1>${esc(s.title)}</h1><div class="line"></div>
      <div class="note">${esc(s.note)}</div><div class="swipe">החליקי ←</div></section>`;
    if (s.kind === "check") return `<section class="s"><div class="brand">LikeLink2</div>
      <div class="badge">${s.num}</div><h2>${esc(s.title)}</h2><div class="line"></div>
      <div class="card"><p>${esc(s.body)}</p></div><div class="count">${s.num}/${s.of}</div></section>`;
    return `<section class="s end"><div class="brand">LikeLink2</div><h2>${esc(s.title)}</h2>
      <div class="sub">${esc(s.sub)}</div><div class="pill">${esc(s.link)}</div>
      <div class="ask">${esc(s.ask)}</div><div class="disc">${esc(s.disclosure)}</div></section>`;
  };
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
  @font-face{font-family:H;font-weight:500;src:url("${FONT("Medium")}")}
  @font-face{font-family:H;font-weight:800;src:url("${FONT("ExtraBold")}")}
  *{box-sizing:border-box;margin:0}
  body{background:#0b1420;font-family:H,sans-serif}
  .s{position:relative;width:1080px;height:1350px;overflow:hidden;padding:120px 96px 90px;color:#f3f2f8;
     background:radial-gradient(900px 600px at 80% 0%,#163150 0%,transparent 60%),#0f1924;display:flex;flex-direction:column;align-items:center;text-align:center}
  .brand{font-weight:800;font-size:40px;letter-spacing:.5px;color:#fff}
  .kicker{margin-top:120px;font-weight:500;font-size:40px;color:#9fd3ff}
  h1{margin-top:28px;font-weight:800;font-size:104px;line-height:1.08;color:#7cc4ff}
  h2{margin-top:44px;font-weight:800;font-size:74px;line-height:1.15;color:#7cc4ff}
  .line{width:120px;height:8px;border-radius:8px;background:#7cc4ff;margin:40px auto}
  .note{font-weight:800;font-size:48px;color:#fff}
  .swipe{position:absolute;bottom:90px;font-weight:500;font-size:38px;color:#9fb3c8}
  .badge{margin-top:50px;width:150px;height:150px;border-radius:50%;background:#7cc4ff;color:#0f1924;font-weight:800;font-size:92px;
     display:flex;align-items:center;justify-content:center}
  .card{width:100%;border:3px solid #2b5277;border-radius:36px;padding:56px 60px;background:rgba(124,196,255,.06)}
  .card p{font-weight:500;font-size:48px;line-height:1.5;text-align:right}
  .count{position:absolute;bottom:40px;font-weight:500;font-size:34px;color:#9fb3c8}
  .end h2{margin-top:230px;font-size:92px}
  .sub{margin-top:28px;font-weight:500;font-size:46px;color:#c9d6e3}
  .pill{margin-top:80px;padding:30px 60px;border-radius:999px;background:#fff;color:#0f1924;font-weight:800;font-size:50px;direction:ltr}
  .ask{margin-top:90px;font-weight:800;font-size:56px;color:#fff}
  .disc{position:absolute;bottom:80px;font-weight:500;font-size:32px;color:#9fb3c8}
  </style></head><body>${list.map(page).join("")}</body></html>`;
}

async function main(out) {
  mkdirSync(out, { recursive: true });
  const list = slides();
  // The browser as the TikTok kit loads it (PLAYWRIGHT_MODULE), else a globally installed Playwright.
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.setContent(html(list), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const els = await page.$$("section.s");
    for (let i = 0; i < els.length; i++) {
      await els[i].screenshot({ path: resolve(out, `slide-${String(i + 1).padStart(2, "0")}.jpg`), type: "jpeg", quality: 92 });
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(out, "caption.txt"), caption() + "\n", "utf8");
  console.log(`${list.length} slides → ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(resolve(process.argv[2] || "carousel-guide")).catch((e) => { console.error(e); process.exit(1); });
}
