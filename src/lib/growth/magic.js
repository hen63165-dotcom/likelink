// "כפתור הקסם" (/magic). The owner, 2026-11-06: "make a magic button that
// nobody has invented yet". A shopper sees something on TikTok, Instagram or in
// the AliExpress app, pastes the link here (or shares it straight to the site),
// and in one tap gets:
//   - the store's own facts now (title, photos, the "from" price in ILS);
//   - what to check before buying (the free guide's checks for this kind of item);
//   - a plain warning when the name carries a brand (on AliExpress: an imitation);
//   - a buy button.
//
// Truth rules:
//   - every fact is the store's own answer (productdetail.get) at the moment of the check;
//   - a "before" price is the seller's claim: it is never shown as a discount;
//     the check says it was not verified;
//   - ratings, order counts and commission are never shown;
//   - a link that already belongs to a creator (an s.click link or one carrying
//     aff_* parameters) is kept exactly as pasted, so her commission stays hers;
//   - LikeLink2's own affiliate link is offered only for a plain store link, and
//     always says so; never for a brand-name item or a kind the site does not list;
//   - nothing is stored: the check is the link.
import { GUIDE, guideCheckPath } from "../guide.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

export const MAGIC_PATH = "/magic";
export const MAGIC_SOURCE = "magic";

const URL_IN_TEXT = /https?:\/\/[^\s<>"'״”“]+/i;
// Hosts the check reads (the store's own pages and links, nothing else).
const AE_HOST = /(^|\.)aliexpress\.(com|us|ru)$/i;
const CREATOR_HOST = /^s\.click\.aliexpress\.com$/i;
const CREATOR_PARAM = /^(aff_\w+|afsmartredirect|sk)$/i;

/** The first web address in what was pasted or shared ("Look what I found! https://a.aliexpress.com/_m…"). */
export function firstLink(text = "") {
  const m = String(text || "").match(URL_IN_TEXT);
  if (!m) return "";
  return m[0].replace(/[).,;!?\]}]+$/, "").slice(0, 2000);
}

/** An address on AliExpress (a product page, an app share link or a tracked link). */
export function isStoreLink(link = "") {
  try {
    const u = new URL(String(link || "").trim());
    return (u.protocol === "https:" || u.protocol === "http:") && AE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * A link that already belongs to someone's affiliate account: an s.click link,
 * or a store address carrying affiliate parameters. Such a link is never
 * replaced: whoever shared it keeps her commission.
 */
export function isCreatorLink(link = "") {
  try {
    const u = new URL(String(link || "").trim());
    if (CREATOR_HOST.test(u.hostname)) return true;
    return [...u.searchParams.keys()].some((k) => CREATOR_PARAM.test(k));
  } catch {
    return false;
  }
}

const decode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};
const US_OFFSET = 2n ** 51n;
const toGlobal = (raw) => {
  const n = BigInt(raw);
  return String(n >= US_OFFSET + 1000000000000000n ? n - US_OFFSET : n);
};

/**
 * The store item id in an address or in a redirect's text, also when the
 * address is wrapped in another one (an app share link names the product page
 * in an encoded parameter). "" when there is none.
 */
export function itemIdIn(text = "") {
  let s = String(text || "");
  for (let i = 0; i < 3; i += 1) {
    const page = s.match(/\/item\/(\d{10,20})\.html/);
    if (page) return toGlobal(page[1]);
    const param = s.match(/[?&](?:productId|itemId|product_id|productIds)=(\d{10,20})(?!\d)/i);
    if (param) return toGlobal(param[1]);
    const next = decode(s);
    if (next === s) break;
    s = next;
  }
  return "";
}

/** The store's product page for an item (no affiliate parameters). */
export const storePage = (itemId) => `https://www.aliexpress.com/item/${itemId}.html`;

const CLOTHES = /חולצ|שמל|מכנס|טייץ|לגינס|חצאית|ג'קט|ז'קט|סווטשירט|קפוצ|בגד\s*ים|פיג'מ|\b(dress|shirt|t-shirt|pants|leggings|skirt|jacket|hoodie|sweater|swimsuit|pajama)/i;
const ELECTRIC = /מטען|תקע|חשמלי|נטען|סוללה|USB|\b(charger|plug|electric|rechargeable|battery)\b/i;

const he = (text, en) => ({ he: text, en: en || text });

/** A shekel amount as people read it: "12", "9.90". */
export const shekel = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));

/**
 * What to check before buying this item, from the store's own title and the
 * site's own guide. Each note: { id, tone: "stop"|"warn"|"info", text: {he,en}, title?: {he,en}, to? }.
 * A note never states a fact about the item that the store did not send.
 */
export function magicNotes({ title = "", price = null, originalPrice = null, kind = "", brand = false, notListed = false } = {}) {
  const notes = [];
  const t = String(title || "");
  if (notListed) {
    notes.push({ id: "not-listed", tone: "stop", text: he("את סוג המוצר הזה אנחנו לא ממליצים לקנות: נשק, עישון, מוצרים למבוגרים או הבטחה לתוצאה בריאותית או להרזיה.", "We don't recommend buying this kind of item: weapons, smoking, adult items, or a health or weight-loss promise.") });
    return notes;
  }
  if (brand) {
    notes.push({ id: "brand", tone: "warn", text: he("בשם המוצר מופיע מותג, דמות או מפורסם. באליאקספרס זה כמעט תמיד חיקוי או מוצר בלי רישיון, לא המקור.", "The name carries a brand, character or celebrity. On AliExpress that is almost always an imitation or unlicensed, not the original.") });
  }
  if (price > 0) {
    notes.push({ id: "price", tone: "info", text: he(`המחיר בחנות עכשיו: מ־₪${shekel(price)} (האפשרות הזולה). המחיר הסופי, כולל משלוח, מופיע בעגלה לפני התשלום.`, `The store's price now: from ₪${shekel(price)} (the cheapest option). The final price, with shipping, shows in the cart before you pay.`) });
  }
  if (price > 0 && Number(originalPrice) > price) {
    notes.push({ id: "real-sale", tone: "warn", to: guideCheckPath("real-sale"), text: he("בחנות כתוב מחיר „לפני הנחה”. זה מה שהמוכר כותב, ולא בדקנו אותו. לא ממהרים בגלל טיימר: שומרים בעגלה ורואים אם המחיר זז.", "The store shows a \"before\" price. That is the seller's own number and we have not checked it. Don't rush for a timer: keep it in the cart and see if the price moves.") });
  }
  // The guide's checks for this kind of item (by the store's own words).
  for (const c of GUIDE.checks) {
    if (!c.match || !c.match.test(t)) continue;
    const to = c.id === "ring-size" || c.id === "wrist" ? "/size" : guideCheckPath(c.id);
    notes.push({ id: c.id, tone: "info", to, title: c.title, text: c.body });
    if (notes.length >= 6) break;
  }
  if (kind === "kids") notes.push({ id: "kids", tone: "info", text: he("לילדים: בודקים בעמוד המוצר לאיזה גיל הוא מתאים, ושאין בו חלקים קטנים לפעוטות.", "For kids: check the age range on the product page, and that there are no small parts for toddlers.") });
  if (CLOTHES.test(t)) notes.push({ id: "clothes", tone: "info", text: he("בגדים: משווים את טבלת המידות בסנטימטרים למידות שלך, לא לפי S/M/L.", "Clothes: compare the size chart in centimeters with your own measurements, not S/M/L.") });
  if (ELECTRIC.test(t)) notes.push({ id: "plug", tone: "info", text: he("חשמל: בודקים בעמוד איזה תקע נשלח, ושהוא מתאים לשקע בישראל (או שיש לך מתאם).", "Electric: check which plug ships, and that it fits an Israeli socket (or that you have an adapter).") });
  notes.push({ id: "protection", tone: "info", to: guideCheckPath("protection"), text: he("החבילה לא הגיעה? בהזמנה כתוב עד מתי הגנת הקונה. לא מאשרים קבלה לפני שהגיעה, ופותחים מחלוקת עם צילום של מעקב המשלוח.", "Parcel didn't arrive? The order says when buyer protection ends. Never confirm receipt before it arrives; open a dispute with a screenshot of the tracking.") });
  return notes;
}

/** STOP when the site does not recommend the item, LOOK when there is a warning, else OK. */
export function magicVerdict(notes = []) {
  if (notes.some((n) => n.tone === "stop")) return "STOP";
  if (notes.some((n) => n.tone === "warn" && n.id === "brand")) return "LOOK";
  return "OK";
}

/**
 * The buy button's link and whose it is:
 *   creator  — the pasted link already belongs to someone's affiliate account: kept exactly
 *   likelink — LikeLink2's own tracked link (s.click), said so under the button
 *   store    — the store's product page, no commission to anyone (brand-name item, or no own link)
 *   none     — the site does not recommend the item: no button
 */
export function magicBuy({ pasted = "", creator = false, ownLink = "", itemId = "", verdict = "OK" } = {}) {
  if (verdict === "STOP") return { url: "", via: "none" };
  if (creator && isStoreLink(pasted)) return { url: String(pasted).trim(), via: "creator" };
  if (verdict === "OK" && /^https:\/\/s\.click\.aliexpress\.com\/\S+$/.test(String(ownLink || ""))) return { url: ownLink, via: "likelink" };
  if (/^\d{6,20}$/.test(String(itemId || ""))) return { url: storePage(itemId), via: "store" };
  return { url: "", via: "none" };
}

/** The line under the buy button: who gets a commission, if anyone. */
export function buyDisclosure(via) {
  if (via === "likelink") return he("#פרסומת · קישור שותפים: אם תקני דרך הכפתור, LikeLink2 מקבלת עמלה קטנה מהחנות. המחיר שלך לא משתנה.", "#ad · affiliate link: if you buy through the button, LikeLink2 gets a small commission from the store. Your price does not change.");
  if (via === "creator") return he("הקישור ששלחו לך שייך ליוצר/ת שהמליצו. השארנו אותו כמו שהוא, כדי שהעמלה תגיע אליהם.", "The link you got belongs to the creator who recommended it. We kept it as it is, so the commission goes to them.");
  if (via === "store") return he("קישור רגיל לעמוד המוצר בחנות, בלי עמלה לאף אחד.", "A plain link to the product page, no commission to anyone.");
  return null;
}

/**
 * The whole check from the store's answer. `x` is one productdetail.get item;
 * `category` is the deals category the title matches (or null).
 */
export function magicReport({ x = {}, category = null, pasted = "", creator = false, ownLink = "", brand = false, notListed = false, now = Date.now() } = {}) {
  const itemId = String(x.product_id || "");
  const https = (v) => String(v || "").trim().replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  const images = [x.product_main_image_url, ...(Array.isArray(x.product_small_image_urls?.string) ? x.product_small_image_urls.string : [])]
    .map(https).filter((v, i, a) => /^https:\/\/\S+$/.test(v) && a.indexOf(v) === i).slice(0, 6);
  const ils = String(x.target_sale_price_currency || "") === "ILS";
  const price = ils && Number(x.target_sale_price) > 0 ? Math.round(Number(x.target_sale_price) * 100) / 100 : null;
  const originalPrice = ils && Number(x.target_original_price) > 0 ? Math.round(Number(x.target_original_price) * 100) / 100 : null;
  const title = String(x.product_title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const notes = magicNotes({ title, price, originalPrice, kind: category?.kind || "", brand, notListed });
  const verdict = magicVerdict(notes);
  const buy = magicBuy({ pasted, creator, ownLink, itemId, verdict });
  return {
    item: { id: itemId, title, image: images[0] || null, images, price, currency: price ? "ILS" : null, priceFrom: true, priceSource: "aliexpress_api", checkedAt: new Date(now).toISOString(), kind: category?.kind || "" },
    notes,
    verdict,
    buy: { ...buy, disclosure: buyDisclosure(buy.via) },
  };
}

/** The catalog product for the same store item, if the site already lists it. */
export function catalogMatch(products = [], itemId = "") {
  const id = String(itemId || "");
  if (!id) return null;
  return (Array.isArray(products) ? products : []).find((p) => {
    const raw = String(p?.aliexpressId || p?.imageSource?.itemId || "").trim() || String(p?.id || "").replace(/^ae-/, "");
    return raw === id;
  }) || null;
}

/** A link that opens the same check for a friend (the pasted link travels as is: a creator's stays hers). */
export function magicShareUrl({ pasted = "", origin = "", source = "" } = {}) {
  const u = new URL(MAGIC_PATH, `${String(origin || PRODUCTION_ORIGIN).replace(/\/+$/, "")}/`);
  if (pasted) u.searchParams.set("u", String(pasted).trim());
  if (source) {
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", MAGIC_SOURCE);
  }
  return u.toString();
}
