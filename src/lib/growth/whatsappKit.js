// The WhatsApp group kit (the owner, 2026-11-19: "the posts should look exactly like that deals group").
// Every day: the posts she sends to her own WhatsApp group or channel, in the format the Israeli deals
// groups use — a collage of the product's photos, a few short lines, "לרכישה 👇" and a link — but true
// and legal: only products the site lists (her own affiliate link, a real store photo, no brand name),
// the radar's HOT products first (its keep list), then the items added in the last days; the disclosure
// in every post; a store price only when the store gave one, with its date; the link to the product page
// with utm_source=whatsapp so her visits are counted.
//
// No program may post into a WhatsApp group (WhatsApp blocks numbers driven by unofficial bots), so the
// page (scripts/marketing/whatsapp-kit.mjs) sends each post with one tap through the phone's own share
// sheet: she picks the group, WhatsApp sends it. Pure; tested (tests/whatsappKit.test.mjs).
import { HOOK_FORBIDDEN } from "./likeloop.js";
import { hasBrandName, isNotListedKind } from "./deals.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

export const WA_AD = "#פרסומת · קישור שותפים";
export const WA_BUY = "לרכישה 👇";
// Never "original", "1:1", "replica": the look is the store's own item, never presented as a brand's.
export const WA_FORBIDDEN = /(רק היום|נשאר|אחרונ|מהרו|לזמן מוגבל|הכי זול|הכי טוב|מקורי|אחד לאחד|1:1|רפליקה|העתק|זהה ל)/;
// Hooks in the deals groups' voice (the owner's examples, 19.11: "אמאלה איזה יפיםםם", "תקשיבוווו",
// "לחורףףף"): excitement about the look, stretched letters — never a claim (no "original", no stock, no price).
const HOOKS = Object.freeze([
  (n) => `${n}!! אמאלה איזה יפההה 😍`,
  (n) => `תקשיבוווו איזה ${n} 🔥`,
  (n) => `${n} 💜 איזה לוקקק!!`,
  (n) => `מה אומרות על ${n}?? 👀`, // no "הזה": "הגרביים הזה" (19.11) — the name may be plural or feminine
]);
const TIPS = Object.freeze({
  clothing: "ממליצה לבדוק את טבלת המידות בחנות לפני שמזמינים",
  fitness: "ממליצה לבדוק את טבלת המידות בחנות לפני שמזמינים",
  men: "ממליצה לבדוק את טבלת המידות בחנות לפני שמזמינים",
  hair: "כל הצבעים והפרטים בקישור",
  makeup: "כל הגוונים והפרטים בקישור",
  beauty: "כל הגוונים והפרטים בקישור",
});
const TIP_DEFAULT = "כל הפרטים והתמונות של המוכר בקישור";
const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;
const HTTPS_IMG = /^https:\/\/\S+$/;
const DAY_MS = 86_400_000;
// A store price is printed only while its check is fresh (19.11: posts said "נבדק ב־26.10").
export const PRICE_FRESH_DAYS = 7;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const dm = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
};

/** A product the group may get: listed, her own store link, a real photo, a name, no brand or unlisted kind. */
export function waEligible(p = {}) {
  if (!p || p.status !== "approved") return false;
  if (!OWN_LINK.test(String(p.affiliateUrl || ""))) return false;
  if (!HTTPS_IMG.test(String(p.image || ""))) return false;
  if (p.imageProvenance === "stock_photo") return false;
  const title = clean(p.title);
  if (!title) return false;
  const words = `${title} ${p.storeTitle || ""}`;
  return !hasBrandName(words) && !isNotListedKind(words);
}

// The group is about the looks (the owner, 19.11: "מועדון הדיופים"): fashion, beauty and accessories first.
export const LOOK_KINDS = Object.freeze(new Set(["clothing", "fitness", "bags", "hair", "makeup", "beauty", "earrings", "rings", "necklaces", "bracelets", "watches", "men", "shoes"]));
const isLook = (p) => LOOK_KINDS.has(String(p?.kind || ""));
// The looks she chose herself (the trend board / her own links), as against the server's daily deals import.
const OWNER_PICK = /^aliexpress-(trend-board|owner-link)$/;
export const OWNER_PICK_DAYS = 7;

/**
 * Today's products: the radar's HOT looks, then the looks added in the last `days`, then the radar's other
 * HOT products (its keep list order, newest first for the added ones).
 */
export function pickKit({ products = [], keepIds = [], now = Date.now(), days = 3, max = 12, looksOnly = false } = {}) {
  const byId = new Map((Array.isArray(products) ? products : []).map((p) => [p?.id, p]));
  const out = [];
  const add = (p, why) => {
    if (p && waEligible(p) && !out.some((x) => x.product.id === p.id) && out.length < max) out.push({ product: p, why });
  };
  const hot = (Array.isArray(keepIds) ? keepIds : []).map((id) => byId.get(id)).filter(Boolean);
  const since = now - days * DAY_MS;
  const fresh = [...byId.values()]
    .filter((p) => Number(p?.createdAt) >= since && /^aliexpress-(trend-board|owner-link|deals)$/.test(String(p?.importSource || "")))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  if (looksOnly) {
    // מועדון הדיופים (19.11): the looks she chose come first (a week), then the radar's HOT looks, and the
    // server's automatic daily imports last (20.11: football socks and basic tees went out before her looks).
    const chosen = [...byId.values()]
      .filter((p) => Number(p?.createdAt) >= now - OWNER_PICK_DAYS * DAY_MS && OWNER_PICK.test(String(p?.importSource || "")))
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    for (const p of chosen.filter(isLook)) add(p, "new");
    for (const p of hot.filter(isLook)) add(p, "hot");
    for (const p of fresh.filter(isLook)) add(p, "new");
    return out;
  }
  for (const p of hot.filter(isLook)) add(p, "hot");
  for (const p of fresh.filter(isLook)) add(p, "new");
  for (const p of hot) add(p, "hot");
  for (const p of fresh) add(p, "new");
  return out;
}

const DANGLING = /^(עם|ללא|בלי|של|עבור|על|ב|ל|מ|ו|·|-|–)$/;

/** A short name for the hook: the first words of the product's own title. */
export function shortName(title = "") {
  const words = clean(title).replace(/[,.!?:;()"]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  let counted = 0;
  for (const w of words) {
    if (counted >= 3 || (out.join(" ") + " " + w).trim().length > 26) break;
    out.push(w);
    if (!/^(\d+|ב|x)$/i.test(w)) counted += 1; // "2 ב 1 מרסס…": the numbers ride along
    if (/^ל(נשים|גברים|ילדים|בנות|תינוקות)$/.test(w)) break; // "כפכפי פרווה לנשים", not "…לנשים מתאימים"
  }
  // A short name never ends on a word that needs the next one ("כפכפי נשים עם", "סט ספורט ללא", 19.11).
  while (out.length > 1 && DANGLING.test(out[out.length - 1])) out.pop();
  return out.join(" ");
}

// What a photo can show (cut, shape, details) may be said plainly; what only the seller can claim
// (soft, warm, quality, lifts, slims, materials like silver/gold/cotton) is left out of the post.
const SELLER_CLAIM = /(איכות|במיוחד|גמיש|מחטב|מפחית|מחליק|החלקה|אוניברסלי|חדש|רך|רכה|רכים|רכות|נעים|נעימ|עמיד|נושם|נושמ|ייבוש|מהיר|חם|חמה|חמים|חמות|מחמם|מקורי|נגד|מונע|הרמ|מרזה|מרזים|שליטה|תמיכה|אורתופד|אורגני|כותנה|משי|קשמיר|צמר|עור אמיתי|כסף|זהב|925|יוקרה|יוקרתי|%|\d+\s*(?:ס"מ|מ"מ|cm|mm))/;
const DETAIL_WORDS = 6;

/** The look in a line: the store title's later phrases that describe what the photos show. */
export function lookLine(p) {
  const phrases = clean(p.storeTitle).replace(/[.!]+$/, "").split(/[,،]+/).map((x) => x.trim()).filter(Boolean).slice(1)
    .filter((x) => !SELLER_CLAIM.test(x) && !WA_FORBIDDEN.test(x) && !HOOK_FORBIDDEN.test(x) && !hasBrandName(x))
    .filter((x) => x.split(/\s+/).length <= DETAIL_WORDS)
    .slice(0, 2);
  return phrases.join(", ");
}

/**
 * One post in the deals groups' format (the owner's examples, 19.11): the hook, the seller's own words,
 * a tip, the dated store price, "לרכישה 👇" and the link, then the disclosure on its own line; up to 4 photos.
 */
export function waPost(p, { now = Date.now(), origin = PRODUCTION_ORIGIN, i = 0, why = "new" } = {}) {
  const day = ymd(now);
  // Short, like the groups' links: the product page and where the visit came from.
  const link = `${origin}/p/${encodeURIComponent(p.id)}?utm_source=whatsapp&utm_medium=group`;
  const name = shortName(p.title) || clean(p.title);
  const hook = HOOKS[(Math.floor(now / DAY_MS) + i) % HOOKS.length](name);
  const tip = TIPS[p.kind] || TIP_DEFAULT;
  const price = Number(p.price);
  const checked = Date.parse(p.priceCheckedAt);
  const fresh = Number.isFinite(checked) && now - checked <= PRICE_FRESH_DAYS * DAY_MS && checked <= now + DAY_MS;
  const priceLine = price > 0 && p.priceSource === "aliexpress_api" && fresh && dm(p.priceCheckedAt)
    ? `מחיר בחנות: מ־₪${Math.round(price * 100) / 100} (נבדק ב־${dm(p.priceCheckedAt)})`
    : "המחיר המעודכן מופיע בחנות";
  const look = lookLine(p);
  const lines = [hook, "", ...(look ? [look] : []), tip, priceLine, "", WA_BUY, link, "", WA_AD];
  const images = [p.image, ...(Array.isArray(p.images) ? p.images : [])]
    .map((u) => String(u || "").trim())
    .filter((u, k, a) => HTTPS_IMG.test(u) && a.indexOf(u) === k)
    .slice(0, 4);
  return { id: p.id, day, why, title: clean(p.title), text: lines.join("\n"), link, images, safe: waSafe(`${hook.replace(name, "")}\n${look}\n${tip}`) };
}

/** The lines we write ourselves pass the hook rules and this kit's own list. */
export function waSafe(text) {
  return !HOOK_FORBIDDEN.test(text) && !WA_FORBIDDEN.test(text);
}

/** The day's kit. */
export function kitOf({ products = [], keepIds = [], now = Date.now(), origin = PRODUCTION_ORIGIN, max = 12 } = {}) {
  // "מועדון הדיופים" (19.11): the group gets the looks only — fashion, beauty, bags, shoes, jewellery.
  const picks = pickKit({ products, keepIds, now, max, looksOnly: true });
  const posts = picks.map(({ product, why }, i) => waPost(product, { now, origin, i, why })).filter((x) => x.safe && x.images.length);
  return { day: ymd(now), posts };
}
