// Sale-season answer pages (/11-11, /black-friday, /hanukkah-gifts): the weeks
// people search "11.11 אליאקספרס", "בלאק פריידיי" or "מתנות לחנוכה", one page
// each that answers what to check before filling the cart — the guide's own
// checks, word for word, and a few of the site's listed picks. Nothing here is
// a claim about a price, a discount, a date the store did not announce or
// stock; the products are the catalog's own (buildPublicGraph decides what is
// listed), each with its affiliate disclosure on the card. `show` is when the
// home page links the season (Israel dates): a window of ours, never the
// store's sale dates.
import { guideCheck, guideCheckPath } from "./guide.js";

export const SALE_SEASONS = Object.freeze({
  "11-11": Object.freeze({
    id: "11-11",
    name: "11.11",
    title: { he: "11.11 באליאקספרס: 5 בדיקות לפני שממלאים עגלה", en: "11.11 on AliExpress: 5 checks before you fill your cart" },
    kicker: { he: "לפני 11.11", en: "Before 11.11" },
    intro: {
      he: "עונת המבצעים הגדולה של אליאקספרס. לפני שמוסיפים לעגלה: איך יודעים שהמבצע אמיתי, שהקישור מוביל למוצר, מה המידה, מתי להזמין מתנה ומה עושים כשחבילה לא מגיעה.",
      en: "AliExpress's big sale season. Before you add to cart: is the sale real, does the link open the product, which size, when to order a gift, and what to do if a parcel does not arrive.",
    },
    checks: Object.freeze(["real-sale", "link-check", "ring-size", "gift", "protection"]),
    picks: Object.freeze([
      "ae-1005012013972716", "ae-1005008660374263", "ae-1005007805729113", "ae-1005012221742613",
      "p-live-03", "p-live-04", "p-live-05", "ae-1005009695987191",
    ]),
    show: Object.freeze({ from: "2026-10-20", to: "2026-11-11" }),
  }),
  "black-friday": Object.freeze({
    id: "black-friday",
    name: { he: "בלאק פריידיי", en: "Black Friday" },
    title: { he: "בלאק פריידיי באליאקספרס: 5 בדיקות לפני שקונים", en: "Black Friday on AliExpress: 5 checks before you buy" },
    kicker: { he: "לפני בלאק פריידיי", en: "Before Black Friday" },
    intro: {
      he: "עוד עונת מבצעים גדולה. לפני שקונים: איך יודעים שהמבצע אמיתי, שהקישור מוביל למוצר, מה עושים כשחבילה לא מגיעה, איזו מידה לבחור ומתי להזמין מתנה.",
      en: "Another big sale season. Before you buy: is the sale real, does the link open the product, what to do if a parcel does not arrive, which size to choose and when to order a gift.",
    },
    checks: Object.freeze(["real-sale", "link-check", "protection", "ring-size", "gift"]),
    picks: Object.freeze([
      "ae-1005010089139584", "ae-1005009960233694", "ae-1005011865423878", "ae-1005010044052123",
      "ae-1005007038743218", "ae-1005007171107355", "ae-1005006678126295", "ae-1005009806969082",
    ]),
    show: Object.freeze({ from: "2026-11-12", to: "2026-11-30" }),
  }),
  "hanukkah-gifts": Object.freeze({
    id: "hanukkah-gifts",
    name: { he: "חנוכה", en: "Hanukkah" },
    title: { he: "מתנות לחנוכה מאליאקספרס: מה בודקים לפני שמזמינים", en: "Hanukkah gifts from AliExpress: what to check before you order" },
    kicker: { he: "מתנות לחנוכה", en: "Hanukkah gifts" },
    intro: {
      he: "משלוח מחו״ל לוקח זמן, אז מתנה לחנוכה מזמינים מוקדם ובודקים בעמוד המוצר את זמן המשלוח המשוער. כאן: מתי להזמין, איך בוחרים מידת טבעת ואורך צמיד, איך בודקים לאן הקישור מוביל ומה עושים אם חבילה לא הגיעה.",
      en: "Shipping from abroad takes time, so order a Hanukkah gift early and check the estimated delivery on the product page. Here: when to order, how to pick a ring size and bracelet length, where a link really goes, and what to do if a parcel does not arrive.",
    },
    checks: Object.freeze(["gift", "ring-size", "wrist", "link-check", "protection"]),
    picks: Object.freeze([
      "ae-1005011587273406", "ae-1005012814888164", "ae-1005009384325747", "ae-1005012475039011",
      "ae-1005012013972716", "p-live-03", "ae-1005009832709994", "ae-1005013266250549",
    ]),
    note: { he: "צעצועים: בודקים בעמוד המוצר לאיזה גיל הם מתאימים.", en: "Toys: check the age range on the product page." },
    show: Object.freeze({ from: "2026-11-05", to: "2026-12-13" }),
  }),
});

/** The season's name in a language ("11.11" is the same in both). */
export const seasonName = (season, lang = "he") => {
  const n = season?.name;
  return typeof n === "string" ? n : (n?.[lang] || n?.he || "");
};

/** The seasons the home page links on a day (Israel date), in SALE_SEASONS order. */
export function activeSeasons(now = Date.now()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return Object.values(SALE_SEASONS).filter((s) => s.show && day >= s.show.from && day <= s.show.to);
}

export const salePath = (id) => `/${id}`;
export const SALE_PATHS = Object.freeze(Object.keys(SALE_SEASONS).map(salePath));
export const saleSeason = (id) => SALE_SEASONS[id] || null;

/** The season's checks, as the guide words them (unknown ids dropped). */
export function saleChecks(season) {
  return (season?.checks || []).map((id) => guideCheck(id)).filter(Boolean).map((c) => ({ ...c, path: guideCheckPath(c.id) }));
}

/** The season's picks that the public site lists, in the season's order. */
export function salePicks(season, byId) {
  return (season?.picks || []).map((id) => byId?.get?.(id)).filter(Boolean);
}
