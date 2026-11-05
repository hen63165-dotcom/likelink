#!/usr/bin/env node
// A 10-slide Instagram carousel people save (the owner, 2026-11-03, after an
// SBX example: "do everything like the best influencers"): the cover, Luna's
// 8 shopping checks one per slide, and the closing slide with the save/send
// ask and where the full guide is. Every word comes from src/lib/guide.js, the
// same text as /guide on the site, so the post says nothing the site does not.
// No AI picture and no product on the slides; the guide page has affiliate
// examples, so the closing slide says so (#פרסומת).
//
//   [PLAYWRIGHT_MODULE=/path/to/node_modules/playwright] node scripts/marketing/guide-carousel.mjs <out-dir> [1111 | picks (PHOTOS_DIR=ops/photos checkout) | about (SHOTS_DIR=site screenshots)]
// Writes slide-01.jpg … slide-10.jpg (1080×1350, Instagram's 4:5) and caption.txt.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GUIDE, GUIDE_PATH, guideCheck } from "../../src/lib/guide.js";
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

// The 11.11 edition (the owner, 2026-11-05: "trendy and curious, so people
// say wow, I want that, and click"). 11.11 is AliExpress's biggest sale of the
// year, when shoppers fill their carts, so the post is five of Luna's checks
// that matter most then, in the site's words, opened and closed by real
// product photos: the sellers' own pictures (public/sets, each with its label)
// and the names the products carry on the site. No price, no discount, no
// date the store did not announce, no urgency. One comment keyword: "רוצה".
export const SALE = "11.11";
export const SALE_CHECKS = Object.freeze(["real-sale", "link-check", "ring-size", "gift", "protection"]);
export const SALE_PICKS = Object.freeze([
  { id: "p-live-03", name: "צמיד טניס מואסניט" },
  { id: "p-live-04", name: "שרשרת יד עם תליוני מואסניט" },
  { id: "p-live-05", name: "עגילי מואסניט" },
]);
export const SALE_KEYWORD = "רוצה";
const AD = "#פרסומת · קישור שותפים";
const SETS = resolve(HERE, "../../public/sets");

/** A pick's photo and its label, from public/sets/index.json. */
export function pickPhoto(id, index = JSON.parse(readFileSync(resolve(SETS, "index.json"), "utf8"))) {
  const set = index.sets?.[id];
  if (!set) return null;
  return { file: resolve(SETS, set.file), label: set.label || index.label };
}

export function saleSlides(guide = GUIDE, picks = SALE_PICKS.map((p) => ({ ...p, photo: pickPhoto(p.id) }))) {
  const checks = SALE_CHECKS.map((id) => guideCheck(id)).filter(Boolean);
  const n = checks.length;
  return [
    { kind: "salecover", sale: SALE, title: "לפני שממלאות עגלה באלי", sub: `${n} בדיקות שחוסכות אכזבה`,
      ad: AD, picks, credit: "תמונות המוכרים" },
    ...checks.map((c, i) => ({ kind: "check", num: i + 1, of: n, title: c.title.he, body: c.body.he })),
    { kind: "picks", title: "3 מהבחירות של LikeLink2", picks, ad: AD, note: "החומרים לפי המוכר",
      ask: `כתבי "${SALE_KEYWORD}" ואשלח לך את הקישורים` },
    { kind: "end", title: `שמרי לפני ${SALE}`, sub: "ושלחי לחברה שכבר מילאה עגלה",
      link: `${SITE}${GUIDE_PATH}`, ask: `כתבי "${SALE_KEYWORD}" ואשלח לך את המדריך המלא`,
      disclosure: "במדריך ובקישורים יש קישורי שותפים (#פרסומת)" },
  ];
}

export function saleCaption(guide = GUIDE) {
  const checks = SALE_CHECKS.map((id) => guideCheck(id)).filter(Boolean);
  return [
    AD,
    "",
    `${SALE} מגיע 🛒 לפני שממלאות עגלה באלי, ${checks.length} בדיקות שחוסכות אכזבה:`,
    ...checks.map((c, i) => `${i + 1}. ${c.title.he}`),
    "",
    `ובסוף: 3 מהבחירות של LikeLink2 ✨ (${SALE_PICKS.map((p) => p.name).join(", ")}; החומרים לפי המוכר)`,
    "",
    `כתבי "${SALE_KEYWORD}" ואשלח לך בהודעה את הקישורים ואת המדריך המלא 💌`,
    `שמרי את הפוסט לפני ${SALE}, ושלחי לחברה שכבר מילאה עגלה.`,
    "",
    "אם תקני דרך הקישורים ייתכן שאקבל עמלה, בלי עלות נוספת לך.",
    "",
    "#1111 #אליאקספרס #קניותחכמות #תכשיטים #מואסניט",
  ].join("\n");
}

// The picks edition (the owner, 2026-11-05: "add more products from Ali …
// the prettiest, the hottest in each topic"). Seven listed products, chosen
// by AliExpress's own recent order counts (deals:momentum: the most ordered,
// or rising this week, in their category; a number used to choose only and
// never shown) and by eye, each on its own slide in the seller's own photo,
// named as the site names it. A product whose every store photo shows more
// than its name (a watch set under "earrings") is left out. PHOTOS_DIR is a
// checkout of the ops/photos branch (scripts/catalog/photos.mjs).
export const PICKS = Object.freeze([
  { id: "ae-1005012013972716", name: "עגילים · חישוק", photo: "0" },
  { id: "ae-1005008660374263", name: "טבעת · זרקון", photo: "1" },
  { id: "ae-1005007805729113", name: "טבעת · וינטג'", photo: "2" },
  { id: "ae-1005012221742613", name: "שרשרת · תליון · חרוז", photo: "0" },
  { id: "ae-1005009695987191", name: "מקל שיער · פרחים", photo: "0" },
  { id: "ae-1005007171107355", name: "גומיות שיער צבעוניות", photo: "2" },
  // The store photo prints "13Pcs" across its top: framed lower and a little closer.
  { id: "ae-1005006782857610", name: "מברשות איפור", photo: "0", frame: "background-size:140%;background-position:0% 55%" },
]);
const MATERIAL = /זרקון|נירוסטה|כסף|925|זהב|מואסניט|קריסטל/;

/** A pick's photo file in PHOTOS_DIR (<id>/<n>.<ext>), or null. */
export function picksPhoto(dir, pick) {
  if (!dir) return null;
  for (const ext of ["webp", "jpg", "png"]) {
    const file = resolve(dir, pick.id, `${pick.photo}.${ext}`);
    try { readFileSync(file); return { file, label: "תמונת המוכר", type: ext === "jpg" ? "jpeg" : ext }; } catch { /* next */ }
  }
  return null;
}

export function picksSlides(picks = PICKS, dir = process.env.PHOTOS_DIR) {
  const list = picks.map((p) => ({ ...p, photo: picksPhoto(dir, p) }));
  const n = list.length;
  return [
    { kind: "pickscover", sale: SALE, title: `${n} בחירות לעגלה`, sub: "תכשיטים, שיער ואיפור", ad: AD, picks: list.slice(0, 4) },
    ...list.map((p, i) => ({ kind: "pick", num: i + 1, of: n, name: p.name, photo: p.photo, frame: p.frame || "", ad: AD,
      note: MATERIAL.test(p.name) ? "החומרים לפי המוכר" : "" })),
    { kind: "end", title: "רוצה את הקישורים?", sub: `כתבי "${SALE_KEYWORD}" ואשלח לך את כל ה־${n}`,
      link: `${SITE}`, ask: "שמרי · שלחי לחברה שעוד מתלבטת",
      disclosure: "#פרסומת · קישורי שותפים · התמונות של המוכרים" },
  ];
}

export function picksCaption(picks = PICKS) {
  return [
    AD,
    "",
    `${picks.length} בחירות לעגלה של ${SALE} 🛒✨`,
    ...picks.map((p, i) => `${i + 1}. ${p.name}`),
    "",
    `כתבי "${SALE_KEYWORD}" ואשלח לך בהודעה את הקישורים לכל ה־${picks.length} 💌`,
    "שמרי את הפוסט, ושלחי לחברה שעוד מתלבטת מה לקנות.",
    "",
    "התמונות של המוכרים. החומרים והמידות לפי תיאור המוכר.",
    "אם תקני דרך הקישורים ייתכן שאקבל עמלה, בלי עלות נוספת לך.",
    "",
    "#1111 #אליאקספרס #מציאותמאלי #תכשיטים #אביזרישיער",
  ].join("\n");
}

// The Hanukkah edition (the owner, 2026-11-05: "think and do what else brings
// traffic, sales and clicks"). The affiliate account's paid orders this month
// were squishy toys, and Hanukkah gifts are ordered from AliExpress weeks
// ahead because of shipping. So: the season page's five checks as one list
// (the guide's own titles), then seven listed products for kids and for her,
// each in its seller's photo and named in the site's own words. A toy carries
// "check the age range", a material is the seller's claim. No price, no
// discount, no date, no promise that it arrives in time.
export const HANUKKAH = "חנוכה";
export const HANUKKAH_PATH = "/hanukkah-gifts";
export const HANUKKAH_CHECKS = Object.freeze(["gift", "ring-size", "wrist", "link-check", "protection"]);
export const HANUKKAH_PICKS = Object.freeze([
  { id: "ae-1005011587273406", name: "כדורי לחץ · דבש וגבינה", photo: "0", toy: true },
  { id: "ae-1005012013972716", name: "עגילים · חישוק", photo: "0" },
  { id: "ae-1005012814888164", name: "צעצוע רך · טופו", photo: "1", toy: true },
  { id: "p-live-03", name: "צמיד טניס מואסניט", set: true },
  { id: "ae-1005009832709994", name: "סט אביזרי שיער", photo: "0" },
  { id: "ae-1005009384325747", name: "כדור לחיץ", photo: "0", toy: true },
  { id: "ae-1005013266250549", name: "גומיות שיער צבעוניות", photo: "2" },
]);

export function hanukkahSlides(picks = HANUKKAH_PICKS, dir = process.env.PHOTOS_DIR) {
  const checks = HANUKKAH_CHECKS.map((id) => guideCheck(id)).filter(Boolean);
  const list = picks.map((p) => ({ ...p, photo: p.set ? pickPhoto(p.id) : picksPhoto(dir, p) }));
  const n = list.length;
  const note = (p) => (p.toy ? "גיל ההתאמה לפי עמוד המוצר" : MATERIAL.test(p.name) ? "החומרים לפי המוכר" : "");
  return [
    { kind: "pickscover", compact: true, sale: HANUKKAH, title: "מתנות מאלי לילדים ולה", sub: `${checks.length} בדיקות לפני שמזמינים + ${n} בחירות`, ad: AD,
      picks: [list[0], list[1], list[3], list[6]] },
    { kind: "list", tag: "לפני שמזמינים", title: `${checks.length} בדיקות למתנה מאלי`, items: checks.map((c) => c.title.he),
      foot: "התשובות המלאות באתר, בדף מתנות לחנוכה" },
    ...list.map((p, i) => ({ kind: "pick", num: i + 1, of: n, name: p.name, photo: p.photo, frame: p.frame || "", ad: AD, note: note(p) })),
    { kind: "end", title: "רוצה את הקישורים?", sub: `כתבי "${SALE_KEYWORD}" ואשלח לך את כל ה־${n}`,
      link: `${SITE}${HANUKKAH_PATH}`, ask: "שמרי · שלחי לחברה שעוד מחפשת מתנה",
      disclosure: "#פרסומת · קישורי שותפים · התמונות של המוכרים" },
  ];
}

export function hanukkahCaption(picks = HANUKKAH_PICKS) {
  const checks = HANUKKAH_CHECKS.map((id) => guideCheck(id)).filter(Boolean);
  return [
    AD,
    "",
    `מזמינות מתנות לחנוכה מאלי? 🎁 משלוח מחו״ל לוקח זמן, אז הנה ${checks.length} בדיקות לפני שמזמינים:`,
    ...checks.map((c, i) => `${i + 1}. ${c.title.he}`),
    "",
    `ובסוף: ${picks.length} בחירות לילדים ולה ✨`,
    ...picks.map((p, i) => `${i + 1}. ${p.name}`),
    "",
    `כתבי "${SALE_KEYWORD}" ואשלח לך בהודעה את הקישורים 💌`,
    "שמרי את הפוסט, ושלחי לחברה שעוד מחפשת מתנה.",
    "",
    "התמונות של המוכרים. החומרים, המידות וגיל ההתאמה לפי עמוד המוצר.",
    "אם תקני דרך הקישורים ייתכן שאקבל עמלה, בלי עלות נוספת לך.",
    "",
    "#חנוכה #מתנותלחנוכה #אליאקספרס #מציאותמאלי #סקווישי",
  ].join("\n");
}

// The "what is LikeLink2" edition (the owner, 2026-11-05: "traffic of sellers
// and buyers … so they understand what the site does … open a studio"). One
// carousel for both audiences, every line something the site does today
// (/join, the product page, the share kit's nine networks, the media labels,
// the size meter and the guide), with two real phone screenshots of the site
// (SHOTS_DIR: product_crop.png, size_crop.png; no price in the frame, since a
// store price changes). No income, no user counts, no ratings. LikeLink2 is
// the owner's own project, and the post says so.
export const ABOUT_KEYWORD = "רוצה";
export function aboutSlides(dir = process.env.SHOTS_DIR) {
  const shot = (name) => (dir ? { file: resolve(dir, name), type: "png" } : null);
  return [
    { kind: "aboutcover", title: "ראית מוצר בסרטון ולא מצאת אותו?", sub: "בניתי בשביל זה מקום אחד" },
    { kind: "phone", tag: "לקונות", title: "רואים בסרטון, קונים בחנות", lines: ["לוחצים על המוצר ועוברים ישר לחנות המקורית", "בלי להירשם ובלי תוספת למחיר"], shot: shot("product_crop.png") },
    { kind: "list", tag: "לקונות", title: "כל תמונה אומרת מה היא", items: ["תמונת המוכר", "צילום אמיתי", "אנימציה, מסומנת"], foot: "בלי דירוגים מומצאים ובלי מונים מזויפים" },
    { kind: "phone", tag: "בחינם", title: "מודד מידות מהמסך", lines: ["מידת טבעת וצמיד בלי ללכת לחנות", "ועוד מדריך: 8 בדיקות לפני שקונים באלי"], shot: shot("size_crop.png") },
    { kind: "list", tag: "ליוצרות ולמוכרות", title: "הקישור בביו שלך יכול להיות חנות", items: ["דף משלך עם כל מה שאת ממליצה עליו", "לכל מוצר דף עם סרטון וקישור לחנות", "#פרסומת מסומן לבד בכל מוצר"], foot: "" },
    { kind: "list", tag: "ליוצרות ולמוכרות", title: "איך זה עובד", items: ["1. מדביקה קישור למוצר שאת ממליצה עליו", "2. מקבלת דף מוצר וקישור עם מעקב", "3. פוסט מוכן ל־9 רשתות, עם גילוי נאות"], foot: "" },
    { kind: "list", tag: "ליוצרות ולמוכרות", title: "פותחים סטודיו בחינם", items: ["בלי כרטיס אשראי", "עד 5 מוצרים במסלול החינמי"], foot: "" },
    { kind: "about-end", title: "אז מי את?", buyer: ["קונה?", "likelink2.vercel.app"], creator: ["יוצרת?", "likelink2.vercel.app/join"],
      ask: `כתבי "${ABOUT_KEYWORD}" ואשלח לך את הקישור`, disclosure: "LikeLink2 הוא המיזם שלי · באתר יש קישורי שותפים (#פרסומת)" },
  ];
}

export function aboutCaption() {
  return [
    "ראית מוצר בסרטון ולא מצאת אותו? 🤯",
    "",
    "בשביל זה בניתי את LikeLink2:",
    "🛍️ לקונות: רואים את המוצר בסרטון ולוחצים ישר לחנות המקורית. בלי להירשם ובלי תוספת למחיר.",
    "🏷️ כל תמונה מסומנת: תמונת המוכר, צילום אמיתי או אנימציה.",
    "📏 בחינם: מודד מידות מהמסך ו־8 בדיקות לפני שקונים באלי.",
    "",
    "✨ ליוצרות ולמוכרות: הקישור בביו שלך יכול להיות חנות קטנה.",
    "מדביקים קישור למוצר, ומקבלים דף מוצר, קישור עם מעקב ופוסט מוכן ל־9 רשתות, עם גילוי נאות.",
    "פותחים סטודיו בחינם, בלי כרטיס אשראי.",
    "",
    `כתבי "${ABOUT_KEYWORD}" ואשלח לך את הקישור 💌`,
    "שמרי, ושלחי לחברה שתמיד שואלת \"מאיפה זה?\"",
    "",
    "LikeLink2 הוא המיזם שלי. באתר יש קישורי שותפים (#פרסומת): אם תקני דרכם ייתכן שאקבל עמלה, בלי עלות נוספת לך.",
    "",
    "#LikeLink2 #קניותחכמות #אליאקספרס #יוצרות #לינקבביו",
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
    const photo = (p, big) => p.photo ? `<figure class="${big ? "pk big" : "pk"}"><img src="data:image/jpeg;base64,${readFileSync(p.photo.file).toString("base64")}">
      <figcaption>${esc(p.photo.label)}</figcaption>${big ? `<div class="nm">${esc(p.name)}</div>` : ""}</figure>` : "";
    const img = (ph) => `data:image/${ph.type || "jpeg"};base64,${readFileSync(ph.file).toString("base64")}`;
    if (s.kind === "aboutcover") return `<section class="s acover"><div class="brand">LikeLink2</div>
      <div class="emoji">🤯</div><h1>${esc(s.title)}</h1><div class="line"></div><div class="note">${esc(s.sub)}</div><div class="swipe">החליקי ←</div></section>`;
    if (s.kind === "phone") return `<section class="s aphone"><div class="tag">${esc(s.tag)}</div><h2>${esc(s.title)}</h2>
      ${s.lines.map((l) => `<p class="al">${esc(l)}</p>`).join("")}
      ${s.shot ? `<div class="frame"><img src="${img(s.shot)}"></div>` : ""}<div class="brand bottom">LikeLink2</div></section>`;
    if (s.kind === "list") return `<section class="s alist"><div class="tag">${esc(s.tag)}</div><h2>${esc(s.title)}</h2><div class="line"></div>
      <div class="items">${s.items.map((t) => `<div class="it">${esc(t)}</div>`).join("")}</div>
      ${s.foot ? `<div class="foot">${esc(s.foot)}</div>` : ""}<div class="brand bottom">LikeLink2</div></section>`;
    if (s.kind === "about-end") return `<section class="s end aend"><div class="brand">LikeLink2</div><h2>${esc(s.title)}</h2>
      <div class="pill rtl">${esc(s.buyer[0])} ← <bdi dir="ltr">${esc(s.buyer[1])}</bdi></div><div class="pill alt rtl">${esc(s.creator[0])} ← <bdi dir="ltr">${esc(s.creator[1])}</bdi></div>
      <div class="ask">${esc(s.ask)}</div><div class="disc">${esc(s.disclosure)}</div></section>`;
    if (s.kind === "pickscover") return `<section class="s pcover${s.compact ? " compact" : ""}"><div class="ad">${esc(s.ad)}</div>
      <div class="big1111 small">${esc(s.sale)}</div><h1>${esc(s.title)}</h1><div class="kicker2">${esc(s.sub)}</div>
      <div class="quad">${s.picks.map((p) => p.photo ? `<div class="q" style="background-image:url('${img(p.photo)}')"></div>` : "").join("")}</div>
      <div class="qlabel">תמונות המוכרים</div><div class="swipe">החליקי ←</div></section>`;
    if (s.kind === "pick") return `<section class="s pick"><div class="ph" style="background-image:url('${img(s.photo)}');${s.frame}">
      <div class="ad">${esc(s.ad)}</div><div class="lbl">${esc(s.photo.label)}</div></div>
      <div class="info"><div class="num">${s.num}/${s.of}</div><div class="pname">${esc(s.name)}</div>
      ${s.note ? `<div class="pnote">${esc(s.note)}</div>` : ""}</div></section>`;
    if (s.kind === "salecover") return `<section class="s sale"><div class="ad">${esc(s.ad)}</div>
      <div class="big1111">${esc(s.sale)}</div><h1>${esc(s.title)}</h1><div class="kicker2">${esc(s.sub)}</div>
      <div class="strip">${s.picks.map((p) => photo(p, false)).join("")}</div><div class="swipe">החליקי ←</div></section>`;
    if (s.kind === "picks") return `<section class="s picks"><div class="ad">${esc(s.ad)}</div><h2>${esc(s.title)}</h2>
      <div class="grid">${s.picks.map((p) => photo(p, true)).join("")}</div><div class="note2">${esc(s.note)}</div>
      <div class="ask">${esc(s.ask)}</div></section>`;
    return `<section class="s end"><div class="brand">LikeLink2</div><h2>${esc(s.title)}</h2>
      <div class="sub">${esc(s.sub)}</div><div class="pill${s.link.length > 28 ? " long" : ""}">${esc(s.link)}</div>
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
  .ad{font-weight:800;font-size:34px;color:#0f1924;background:#fff;border-radius:999px;padding:12px 30px}
  .big1111{margin-top:40px;font-weight:800;font-size:210px;line-height:1;letter-spacing:4px;direction:ltr;
     background:linear-gradient(180deg,#fff 0%,#7cc4ff 100%);-webkit-background-clip:text;color:transparent}
  .sale h1{margin-top:22px;font-size:84px;color:#fff}
  .kicker2{margin-top:22px;font-weight:800;font-size:52px;color:#7cc4ff}
  .strip{position:absolute;bottom:130px;left:50px;right:50px;display:flex;gap:20px;justify-content:center}
  .pk{position:relative;flex:1;border-radius:28px;overflow:hidden;border:3px solid #2b5277;aspect-ratio:4/5}
  .pk img{width:100%;height:100%;object-fit:cover;display:block}
  .pk figcaption{position:absolute;left:0;right:0;bottom:0;padding:8px 10px;font-weight:500;font-size:20px;color:#fff;background:rgba(0,0,0,.55)}
  .sale .swipe{bottom:70px}
  .picks h2{margin-top:30px;font-size:68px}
  .grid{margin-top:40px;display:flex;gap:22px;width:100%}
  .pk.big{display:flex;flex-direction:column;aspect-ratio:auto;background:#0b1420}
  .pk.big img{height:500px}
  .pk.big figcaption{bottom:auto;top:452px;font-size:18px;padding:6px 8px}
  .nm{padding:18px 12px 22px;font-weight:800;font-size:34px;line-height:1.25;color:#fff}
  .note2{margin-top:26px;font-weight:500;font-size:32px;color:#9fb3c8}
  .picks .ask{position:absolute;bottom:70px;left:60px;right:60px;margin:0;font-size:50px}
  .big1111.small{font-size:150px;margin-top:30px}
  .pcover h1{margin-top:10px;font-size:96px;color:#fff}
  .quad{position:absolute;left:60px;right:60px;bottom:150px;height:560px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:16px}
  .q{border-radius:26px;background-size:cover;background-position:center;border:3px solid #2b5277}
  .qlabel{position:absolute;bottom:112px;font-weight:500;font-size:24px;color:#9fb3c8}
  .pcover .swipe{bottom:56px}
  .pick{padding:0}
  .pick .ph{position:relative;width:1080px;height:1050px;background-size:cover;background-position:center}
  .pick .ph .ad{position:absolute;top:40px;right:40px}
  .pick .lbl{position:absolute;left:0;right:0;bottom:0;padding:10px 20px;font-weight:500;font-size:26px;color:#fff;background:rgba(0,0,0,.5);text-align:right}
  .pick .info{width:100%;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
  .pick .num{font-weight:800;font-size:34px;color:#7cc4ff}
  .pick .pname{font-weight:800;font-size:74px;color:#fff}
  .pick .pnote{font-weight:500;font-size:28px;color:#9fb3c8}
  .acover .emoji{margin-top:150px;font-size:150px;line-height:1}
  .acover h1{margin-top:40px;font-size:98px;color:#fff}
  .acover .note{font-size:56px;color:#7cc4ff}
  .tag{font-weight:800;font-size:34px;color:#0f1924;background:#7cc4ff;border-radius:999px;padding:10px 30px}
  .aphone h2,.alist h2{margin-top:34px;font-size:76px;color:#fff}
  .al{margin-top:14px;font-weight:500;font-size:40px;color:#c9d6e3}
  .frame{position:absolute;bottom:-40px;width:560px;height:720px;border-radius:56px;border:14px solid #e9eef4;overflow:hidden;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .frame img{width:100%;display:block}
  .brand.bottom{position:absolute;bottom:40px;right:60px;font-size:30px;color:#9fb3c8}
  .aphone .brand.bottom{right:auto;left:60px}
  .items{width:100%;display:flex;flex-direction:column;gap:30px;margin-top:20px}
  .it{border:3px solid #2b5277;border-radius:32px;padding:40px 46px;background:rgba(124,196,255,.06);font-weight:800;font-size:50px;text-align:right}
  .foot{margin-top:50px;font-weight:500;font-size:38px;color:#9fb3c8}
  .aend h2{margin-top:200px;font-size:110px}
  .pill.alt{margin-top:30px;background:#7cc4ff}
  .pill.rtl{direction:rtl}
  .aend .pill{font-size:44px;padding:26px 46px}
  .pcover.compact h1{font-size:76px}
  .pcover.compact .kicker2{font-size:40px}
  .pill.long{font-size:38px;padding:28px 44px}
  .alist .foot{font-size:32px}
  .alist .brand.bottom{right:auto;left:60px}
  </style></head><body>${list.map(page).join("")}</body></html>`;
}

async function main(out, edition = "") {
  mkdirSync(out, { recursive: true });
  const sale = edition === "1111";
  const picks = edition === "picks";
  const about = edition === "about";
  const hanukkah = edition === "hanukkah";
  const list = hanukkah ? hanukkahSlides() : about ? aboutSlides() : picks ? picksSlides() : sale ? saleSlides() : slides();
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
  writeFileSync(resolve(out, "caption.txt"), (hanukkah ? hanukkahCaption() : about ? aboutCaption() : picks ? picksCaption() : sale ? saleCaption() : caption()) + "\n", "utf8");
  console.log(`${list.length} slides → ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(resolve(process.argv[2] || "carousel-guide"), process.argv[3] || "").catch((e) => { console.error(e); process.exit(1); });
}
