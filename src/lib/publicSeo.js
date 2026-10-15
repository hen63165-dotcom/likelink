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
import { GUIDE } from "./guide.js";
import { JOIN_PATH, JOIN_SEO } from "./growth/join.js";

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
