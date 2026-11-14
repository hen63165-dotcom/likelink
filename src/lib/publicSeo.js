// One source for the <head> of the public sections. The app sets it in the
// browser (PublicSite.jsx pageSEO) and the build writes it into each section's
// static HTML (scripts/prerender-products.mjs), so Google and link previews
// read the same title, description and canonical a person gets — never the
// home page's (a section whose HTML says canonical "/" reads as a copy of the
// home page and is left out of search).
//
// Pure and dependency-light: imported by the browser and by Node scripts.
import { PRODUCTION_ORIGIN } from "../constants/domain.js";
import { SIZE_PAGE } from "./sizeTool.js";
import { GUIDE, guideCheck, guideCheckPath } from "./guide.js";
import { saleSeason, salePath, saleChecks } from "./saleSeason.js";
import { JOIN_PATH, JOIN_SEO } from "./growth/join.js";
import { MAGIC_FAQ, MAGIC_PATH } from "./growth/magic.js";

export const SEO_SUFFIX = " | LikeLink2";

// The FAQ JSON-LD is exactly the FAQ a person reads on /size.
const sizeJsonLd = (url) => [
  { "@context": "https://schema.org", "@type": "WebApplication", name: "המודד של לונה", url, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", inLanguage: "he", description: SIZE_PAGE.seoDescription, offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" } },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: SIZE_PAGE.faq.map((f) => ({ "@type": "Question", name: f.q.he, acceptedAnswer: { "@type": "Answer", text: f.a.he } })) },
];

/** The indexable public sections (no category or item): path, title (he/en), description, optional JSON-LD. */
export const SECTION_SEO = Object.freeze({
  discover: { path: "/discover", he: "גילוי מוצרים דרך יוצרים", en: "Discover products through creators", description: "פיד ויזואלי של מוצרים, יוצרים, אוספים וטרנדים בלייקלינק." },
  products: { path: "/products", he: "כל המוצרים שיוצרים בחרו", en: "Every product creators picked", description: "כל המוצרים שיוצרים בחרו בלייקלינק, לפי קטגוריה, עם קישור ישיר לחנות המקורית." },
  creators: { path: "/creators", he: "יוצרים והחנויות שלהם", en: "Creators and their shops", description: "יוצרים, החנויות והבחירות שלהם בלייקלינק." },
  reels: { path: "/reels", he: "סרטוני מוצר מהיוצרים", en: "Product reels from creators", description: "סרטונים וסיפורי מוצר מהיוצרים בלייקלינק, מסומנים בכנות." },
  trends: { path: "/trends", he: "טרנדים לפי צפיות וקליקים אמיתיים", en: "Trends from real views and clicks", description: "טרנדים שמבוססים על צפיות וקליקים שנרשמו בפועל." },
  collections: { path: "/collections", he: "אוספים של יוצרים", en: "Creator collections", description: "לוחות עריכה ואוספים של יוצרים בלייקלינק." },
  deals: { path: "/deals", he: "ירידות מחיר אמיתיות", en: "Real price drops", description: "ירידות מחיר אמיתיות בלבד: מוצג רק מה שהמחיר הקודם שלו בחנות מתועד." },
  guide: { path: "/guide", he: `המדריך החינמי: ${GUIDE.title.he}`, en: "Free guide: 8 checks before buying on AliExpress", description: "המדריך של לונה: כסף 925, מידת טבעת וצמיד, מואסניט, מתנות, מבצעים אמיתיים, בדיקת קישור והגנת קונה." },
  size: { path: "/size", he: SIZE_PAGE.seoTitle, en: "Ring and bracelet size meter, free, on your screen", description: SIZE_PAGE.seoDescription, jsonLd: sizeJsonLd },
  radar: { path: "/radar", he: "רדאר הטרנדים: מה מתחיל לעלות בעולם לפני שמגיע לארץ", en: "The trend radar: what is starting to rise abroad before it reaches Israel", description: "כל יום LikeLink2 מודדת באליאקספרס כמה מהר מזמינים וכמה מוכרים חדשים נכנסים, לכ־60 סוגי מוצרים, ובודקת בגוגל אם בישראל כבר מחפשים אותם בעברית. עולה בעולם ועוד לא כאן? חלון פתוח. הרדאר בודק את עצמו אחרי 14 יום והדיוק מוצג לכולם. חינם בתקופת הניסיון.", jsonLd: (url) => [{ "@context": "https://schema.org", "@type": "WebApplication", name: "רדאר הטרנדים של LikeLink2", url, applicationCategory: "ShoppingApplication", operatingSystem: "Any", inLanguage: "he", description: "סימנים מוקדמים לטרנדים מאליאקספרס: קצב ההזמנות, מוכרים חדשים ומחיר, נמדדים כל יום, עם בדיקה עצמית פומבית.", offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" } }] },
  magic: { path: MAGIC_PATH, he: "כפתור הקסם: בודקים מוצר מאליאקספרס לפני שקונים", en: "The magic button: check an AliExpress product before you buy", description: "מדביקים קישור מאליאקספרס, מטיקטוק או מאינסטגרם ומקבלים מיד את המחיר בחנות עכשיו, מה לבדוק לפני שקונים ואזהרה כשזה כנראה חיקוי של מותג. בחינם ובלי הרשמה.", jsonLd: (url) => [{ "@context": "https://schema.org", "@type": "WebApplication", name: "כפתור הקסם של LikeLink2", url, applicationCategory: "ShoppingApplication", operatingSystem: "Any", inLanguage: "he", description: "בדיקה של מוצר מאליאקספרס לפני שקונים: המחיר בחנות עכשיו, מה לבדוק, ואזהרה על חיקוי של מותג.", offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" } }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: MAGIC_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] },
  join: { path: JOIN_PATH, he: JOIN_SEO.title, en: "A creator page on LikeLink2: your link in bio, as a small shop", description: JOIN_SEO.description },
});

/** The head of one section: { path, title, description, canonical, jsonLd }, or null. */
export function sectionSeo(type, { lang = "he", origin = PRODUCTION_ORIGIN } = {}) {
  const s = SECTION_SEO[type];
  if (!s) return null;
  const canonical = `${String(origin).replace(/\/+$/, "")}${s.path}`;
  return {
    path: s.path,
    title: `${lang === "en" ? s.en : s.he}${SEO_SUFFIX}`,
    description: s.description,
    canonical,
    jsonLd: s.jsonLd ? s.jsonLd(canonical) : null,
  };
}

/** One guide check's answer page (/guide/<id>): its question is the title, its
 *  answer the description, and the FAQ JSON-LD is exactly what the page shows. */
export function guideCheckSeo(id, { lang = "he", origin = PRODUCTION_ORIGIN } = {}) {
  const c = guideCheck(id);
  if (!c) return null;
  const base = String(origin).replace(/\/+$/, "");
  const path = guideCheckPath(c.id);
  const canonical = `${base}${path}`;
  return {
    path,
    title: `${lang === "en" ? c.q.en : c.q.he}${SEO_SUFFIX}`,
    description: c.body.he,
    canonical,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: c.q.he, acceptedAnswer: { "@type": "Answer", text: c.body.he } }] },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: SECTION_SEO.guide.he, item: `${base}${SECTION_SEO.guide.path}` },
        { "@type": "ListItem", position: 2, name: c.q.he, item: canonical },
      ] },
    ],
  };
}

/** Every guide answer page, for the build and the sitemap. */
/** A sale-season page (/11-11): its title, the intro as description, and the FAQ
 *  JSON-LD of exactly the checks the page shows. */
export function saleSeo(id, { lang = "he", origin = PRODUCTION_ORIGIN } = {}) {
  const season = saleSeason(id);
  if (!season) return null;
  const base = String(origin).replace(/\/+$/, "");
  const path = salePath(season.id);
  const canonical = `${base}${path}`;
  const checks = saleChecks(season);
  return {
    path,
    title: `${lang === "en" ? season.title.en : season.title.he}${SEO_SUFFIX}`,
    description: lang === "en" ? season.intro.en : season.intro.he,
    canonical,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: checks.map((c) => ({ "@type": "Question", name: c.q.he, acceptedAnswer: { "@type": "Answer", text: c.body.he } })) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "LikeLink2", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: season.title.he, item: canonical },
      ] },
    ],
  };
}

export const GUIDE_CHECK_PATHS = Object.freeze(GUIDE.checks.map((c) => guideCheckPath(c.id)));
