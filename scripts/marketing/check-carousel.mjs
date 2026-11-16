#!/usr/bin/env node
// The checklist carousel (the owner, 2026-11-16, over a travel account's
// "hidden camera in the hotel room" carousel: 928 sends): a useful check per
// slide, each over a real photo of one of our products, a short checklist,
// then "save it and send it to someone". Every check is the site's own guide
// text (src/lib/guide.js); every photo is the seller's, labelled as such.
// Our own look (ink card, sky number, serif title), not the reference's.
//
//   node scripts/marketing/check-carousel.mjs <out-dir>
// Writes slide-01.jpg … (1080×1350) and caption.txt.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { guideCheck } from "../../src/lib/guide.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Inlined: a page set with setContent cannot load file:// pictures.
const photo = (file) => `data:image/jpeg;base64,${readFileSync(resolve(ROOT, "public", file)).toString("base64")}`;

/** The jewellery carousel: five of the guide's checks, each over one of our listed pieces. */
export const JEWELRY = Object.freeze({
  cover: { title: "לפני שקונים תכשיט מאלי", sub: "5 בדיקות שחוסכות אכזבה", photo: "sets/p-live-05-champagne.jpg", label: "תמונת המוכר · רקע: LikeLink2" },
  checks: [
    { id: "silver", photo: "sets/p-live-05-champagne.jpg", label: "תמונת המוכר · רקע: LikeLink2" },
    { id: "moissanite", photo: "sets/p-live-03-closeup.jpg", label: "מתוך סרטון המוכר · בעריכת LikeLink2" },
    { id: "wrist", photo: "looks/p-live-04.jpg", label: "מתוך סרטון המוכר" },
    { id: "gift", photo: "looks/p-live-05.jpg", label: "מתוך סרטון המוכר" },
    { id: "link-check", photo: "sets/p-live-04-noir.jpg", label: "תמונת המוכר · רקע: LikeLink2" },
  ],
  short: ["חותמת 925, ומגנט שלא נדבק", "מואסניט: אבן אחרת, לא יהלום", "פס נייר סביב היד + 1–2 ס״מ", "מזמינים מתנה עם מרווח", "לחיצה ארוכה: לאן הקישור מוביל"],
  end: { title: "שמרי את הפוסט להזמנה הבאה", sub: "ושלחי לחברה שקונה תכשיטים באלי", ask: "רוצה את הקישורים לתכשיטים שבתמונות? כתבי ״אני״ ואשלח לך בפרטי" },
});

export function slides(set = JEWELRY) {
  const n = set.checks.length;
  return [
    { kind: "cover", ...set.cover },
    ...set.checks.map((c, i) => {
      const g = guideCheck(c.id);
      if (!g) throw new Error(`unknown guide check ${c.id}`);
      return { kind: "check", num: i + 1, of: n, title: g.title.he, body: g.body.he, photo: c.photo, label: c.label };
    }),
    { kind: "list", title: "הצ׳קליסט בקצרה", items: set.short },
    { kind: "end", ...set.end },
  ];
}

export function caption(set = JEWELRY) {
  return [
    "#פרסומת · קישור שותפים",
    `${set.cover.title}? ${set.cover.sub} 👇`,
    "",
    ...set.short.map((s, i) => `${i + 1}. ${s}`),
    "",
    "💾 שמרי את הפוסט להזמנה הבאה, ושלחי לחברה שקונה תכשיטים באלי.",
    "רוצה את הקישורים לתכשיטים שבתמונות? כתבי ״אני״ ואשלח לך בפרטי 💌",
    "",
    "התמונות של המוכרים. החומרים לפי תיאור המוכר. אם קונים דרך הקישורים ייתכן שאקבל עמלה קטנה, המחיר לא משתנה.",
    "#תכשיטים #אליאקספרס #קניותחכמות #מציאותמאלי #טיפים",
  ].join("\n");
}

function faces(dir = process.env.FONTSOURCE_DIR || "/tmp/pw/node_modules/@fontsource") {
  const out = [];
  const add = (fam, pkg, wt) => {
    for (const sub of ["hebrew", "latin"]) {
      try {
        const b = readFileSync(join(dir, pkg, "files", `${pkg}-${sub}-${wt}-normal.woff2`)).toString("base64");
        out.push(`@font-face{font-family:"${fam}";font-weight:${wt};src:url(data:font/woff2;base64,${b}) format("woff2")}`);
      } catch { /* the runner's fallback font */ }
    }
  };
  for (const wt of [400, 500, 700, 800]) add("Heebo", "heebo", wt);
  add("Frank", "frank-ruhl-libre", 700);
  return out.join("\n");
}

const CSS = `*{margin:0;box-sizing:border-box}html,body{width:1080px;height:1350px;direction:rtl;font-family:"Heebo",sans-serif;background:#0f1419;color:#fff}
.ph{position:absolute;inset:0 0 auto 0;height:820px;background:#dbe8f5 center/cover no-repeat}
.ph::after{content:"";position:absolute;inset:auto 0 0 0;height:300px;background:linear-gradient(180deg,rgba(15,20,25,0),#0f1419)}
.lab{position:absolute;top:36px;left:36px;background:rgba(0,0,0,.55);color:#fff;font-size:22px;font-weight:500;padding:7px 16px;border-radius:999px}
.pg{position:absolute;top:36px;right:36px;background:rgba(0,0,0,.55);color:#fff;font-size:24px;font-weight:700;padding:6px 16px;border-radius:999px;direction:ltr}
.card{position:absolute;right:56px;left:56px;bottom:64px;background:#17202a;border:1.5px solid #2c3a48;border-radius:36px;padding:74px 52px 50px}
.num{position:absolute;top:-58px;right:52px;width:116px;height:116px;border-radius:50%;background:#cfe3f6;color:#0f1419;display:flex;align-items:center;justify-content:center;font-family:"Frank",serif;font-size:64px;font-weight:700}
.card h2{font-family:"Frank",serif;font-size:60px;font-weight:700;line-height:1.12;color:#fff}
.card p{margin-top:22px;font-size:32px;line-height:1.5;color:#d6dde4;font-weight:400}
.cover .ph{height:1350px}.cover .ph::after{height:760px}
.cover .txt{position:absolute;right:72px;left:72px;bottom:120px}
.cover .tag{display:inline-block;background:#cfe3f6;color:#0f1419;font-size:30px;font-weight:800;padding:10px 22px;border-radius:999px}
.cover h1{margin-top:26px;font-family:"Frank",serif;font-size:104px;line-height:1.02;font-weight:700}
.cover .sub{margin-top:18px;font-size:46px;font-weight:700;color:#cfe3f6}
.cover .swipe{margin-top:34px;font-size:30px;font-weight:500;color:#d6dde4}
.list{padding:120px 80px 0}.list h2{font-family:"Frank",serif;font-size:76px;font-weight:700}
.list ul{list-style:none;margin-top:56px}.list li{display:flex;align-items:center;gap:28px;padding:30px 0;border-bottom:1.5px solid #2c3a48;font-size:38px;font-weight:500}
.list li b{flex:none;width:64px;height:64px;border-radius:50%;background:#cfe3f6;color:#0f1419;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800}
.end{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;height:1350px;padding:0 90px;background:radial-gradient(circle at 50% 30%,#1d2a37,#0f1419 70%)}
.end .bar{width:90px;height:6px;border-radius:3px;background:#cfe3f6;margin-bottom:44px}
.end h1{font-family:"Frank",serif;font-size:86px;line-height:1.1;font-weight:700}
.end .sub{margin-top:24px;font-size:44px;font-weight:700;color:#cfe3f6}
.end .ask{margin-top:70px;background:#fff;color:#0f1419;font-size:36px;font-weight:800;padding:26px 40px;border-radius:32px;line-height:1.35}
.end .site{margin-top:56px;font-size:28px;color:#9fb0c0;direction:ltr}
.ad{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:22px;color:#9fb0c0}`;

function html(s, total, idx) {
  const pg = `<div class="pg">${idx}/${total}</div>`;
  if (s.kind === "cover") {
    return `<div class="cover"><div class="ph" style="background-image:url('${photo(s.photo)}')"></div><div class="lab">${esc(s.label)}</div>
<div class="txt"><span class="tag">#פרסומת · קישור שותפים</span><h1>${esc(s.title)}</h1><div class="sub">${esc(s.sub)}</div><div class="swipe">החליקי לכל הבדיקות ←</div></div></div>`;
  }
  if (s.kind === "check") {
    return `<div class="ph" style="background-image:url('${photo(s.photo)}')"></div><div class="lab">${esc(s.label)}</div>${pg}
<div class="card"><div class="num">${s.num}</div><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p></div>`;
  }
  if (s.kind === "list") {
    return `${pg}<div class="list"><h2>${esc(s.title)}</h2><ul>${s.items.map((t, i) => `<li><b>${i + 1}</b>${esc(t)}</li>`).join("")}</ul></div>`;
  }
  return `<div class="end"><div class="bar"></div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.sub)}</div><div class="ask">${esc(s.ask)}</div><div class="site">likelink2.vercel.app/guide</div></div><div class="ad">#פרסומת · קישור שותפים</div>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] || "check-carousel-out");
  mkdirSync(out, { recursive: true });
  const list = slides();
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const css = faces() + CSS;
  for (const [i, s] of list.entries()) {
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>${html(s, list.length, i + 1)}</body></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `slide-${String(i + 1).padStart(2, "0")}.jpg`), type: "jpeg", quality: 90 });
  }
  writeFileSync(join(out, "caption.txt"), caption());
  await browser.close();
  console.log(`${list.length} slides → ${out}`);
}
