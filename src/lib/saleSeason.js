// Sale-season answer pages (/11-11): the week people search "11.11 אליאקספרס",
// one page that answers what to check before filling the cart — the guide's
// own checks, word for word, and a few of the site's listed picks. Nothing here
// is a claim about a price, a discount, a date the store did not announce or
// stock; the products are the catalog's own (buildPublicGraph decides what is
// listed), each with its affiliate disclosure on the card.
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
  }),
});

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
