// 🏟️ One by one: the radar against every name in the field (the owner, 27.11: "check that everyone will
// depend on us, before everyone you named, one by one, Google, Exploding Topics… verify, fix, reliable").
// Each company is listed with what its own pages say it does and what it publishes about its own record,
// with the sources and the day they were read (docs/research/radar-competitive-intelligence.md, 21.11;
// docs/research/radar-gap-map.md, thirteenth check, 27.11). The radar's side is never typed in: it is
// read from the live board (the books sealed today, the graded record, and the races where an open
// door exists: Google's own search, the companies' public blog feeds). Nothing here says the radar
// "leads" or is "number one": the row says what each side publishes and what was measured. Pure.
import { recordView } from "./radarCore.js";

export const FIELD_CHECKED = "2026-11-27";

// What each company's own pages say. `claim`: the accuracy or lead it states about itself (its words,
// never ours), null when it states none. `race`: the open door the radar is timed against for it.
export const FIELD = Object.freeze([
  { id: "google-trends", name: "Google Trends", he: "עניין יחסי בחיפוש (0–100), מדגם של חיפושים; ביטוי שמחפשים מעט מקבל 0", en: "Relative search interest (0–100), a sample of searches; a low-volume term reads 0", claimHe: null, claimEn: null, race: "google", src: "https://support.google.com/trends/answer/4365533" },
  { id: "exploding-topics", name: "Exploding Topics", he: "נושאים שעולים לפני השיא, מחיפוש, רשתות ופורומים, עם אנליסטים", en: "Topics rising before they peak, from search, social and forums, with analysts", claimHe: "״12+ חודשים לפני כולם״, במילים שלה", claimEn: "\"12+ months before everyone\", in its own words", race: "google", src: "https://explodingtopics.com/methodology" },
  { id: "glimpse", name: "Glimpse", he: "טרנדים מחיפוש ומרשתות", en: "Trends from search and social", claimHe: "95%, דיוק שמדדה בעצמה", claimEn: "95%, accuracy it measured itself", race: "google", src: "https://meetglimpse.com/" },
  { id: "wgsn", name: "WGSN", he: "תחזיות אופנה וצרכנות, 2,800 מקורות ובדיקה אנושית", en: "Fashion and consumer forecasts, 2,800 sources and human review", claimHe: "94%, דיוק שמדדה בעצמה", claimEn: "94%, accuracy it measured itself", race: null, src: "https://www.wgsn.com/en/what-we-do/ai-data" },
  { id: "heuritech", name: "Heuritech", he: "אופנה מתמונות ברשתות, כ־3 מיליון תמונות ביום", en: "Fashion from social images, about 3M images a day", claimHe: "90%–92%, לפי הדפים שלה", claimEn: "90%–92%, per its own pages", race: null, src: "https://heuritech.com/fashion-data/" },
  { id: "spate", name: "Spate", he: "מדד פופולריות ליופי, אוכל ובריאות", en: "Popularity index for beauty, food and wellness", claimHe: "72% לתחזית של 12 חודשים, במילים שלה", claimEn: "72% for a 12-month forecast, in its own words", race: "google", src: "https://www.spate.nyc/teams/research-insights" },
  { id: "pinterest-predicts", name: "Pinterest Predicts", he: "החיפושים של משתמשי פינטרסט עצמם", en: "Pinterest's own users' searches", claimHe: "80%, דיוק שמדדה בעצמה", claimEn: "80%, accuracy it measured itself", race: null, src: "https://business.pinterest.com/pinterest-predicts/" },
  { id: "trendalytics", name: "Trendalytics", he: "חיפוש, רשתות ומלאי בחנויות", en: "Search, social and store stock", claimHe: null, claimEn: null, race: "rivals", src: "https://trendalytics.co/technology" },
  { id: "fastmoss", name: "FastMoss", he: "מוצרים, יוצרים וסרטונים בטיקטוק שופ", en: "TikTok Shop products, creators and videos", claimHe: null, claimEn: null, race: "rivals", src: "https://developers.fastmoss.com/home" },
  { id: "kalodata", name: "Kalodata", he: "נתוני מכירות בטיקטוק שופ", en: "TikTok Shop sales data", claimHe: "״הסכומים עשויים להשתנות מעט״, במילים שלה", claimEn: "\"amounts may vary slightly\", in its own words", race: null, src: "https://www.kalodata.com/" },
  { id: "jungle-scout", name: "Jungle Scout", he: "הערכת מכירות באמזון מדירוג המוכרים", en: "Amazon sales estimates from Amazon's sales rank", claimHe: "84%, מחקר מקרה שלה מ־2019", claimEn: "84%, its own 2019 case study", race: "rivals", src: "https://www.helium10.com/blog/helium-10-jungle-scout-amazon-sales-data-accuracy/" },
  { id: "edited", name: "EDITED", he: "מחירים ומלאי אצל קמעונאים, 5 מיליארד מוצרים", en: "Retail prices and stock, 5bn products", claimHe: null, claimEn: null, race: null, src: "https://edited.com/blog/how-to-forecast-fashion-trends-with-data-in-2026/" },
  { id: "minea", name: "Minea", he: "מעקב מודעות למוכרים", en: "Ad spy for sellers", claimHe: null, claimEn: null, race: null, src: "https://www.minea.com/ad-spy-tool" },
]);

const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.round(Number(x)) : 0);

/** The radar's own side, from the board only: books sealed today, the whole record, the two races. */
export function radarSide(board = {}) {
  const rv = recordView(board || {});
  const g = board?.googleRace?.all || null;
  const r = board?.rivals?.all || null;
  return {
    d: rv.day,
    books: rv.books,
    root: rv.root,
    block: rv.block?.height ?? null,
    sealedDays: Number.isInteger(board?.anchors?.days) ? board.anchors.days : null,
    given: rv.total.given,
    graded: rv.total.graded,
    callHits: rv.total.callHits,
    callsGraded: rv.total.callsGraded,
    google: g ? { read: n(g.read), ahead: n(g.ahead), googleFirst: n(g.googleFirst), quiet: n(g.quiet), lateRead: n(g.lateRead), since: board.googleRace?.since?.box || null } : null,
    rivals: r ? { compared: n(r.compared), ahead: n(r.ahead), rivalFirst: n(r.rivalFirst), quiet: n(r.quiet), beforeTracking: n(r.beforeTracking) } : null,
  };
}

/** One row per company: what it says about itself, and what was measured against it (never typed in). */
export function fieldView(board = {}) {
  const side = radarSide(board);
  return {
    checked: FIELD_CHECKED,
    radar: side,
    rows: FIELD.map((c) => ({
      id: c.id, name: c.name, he: c.he, en: c.en, claimHe: c.claimHe, claimEn: c.claimEn, src: c.src,
      race: c.race,
      measured: c.race === "google" ? side.google : c.race === "rivals" ? side.rivals : null,
    })),
  };
}
