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
// Hooks in the deals groups' voice: excitement about the look, never a claim (no "original", no stock, no price).
const HOOKS = Object.freeze([
  (n) => `${n} 😍 אמאלה איזה יפה!!`,
  (n) => `תקשיבו איזה ${n} 🔥`,
  (n) => `${n} 💜 איזה לוק!!`,
  (n) => `מה אומרות על ${n}? 👀`, // no "הזה": "הגרביים הזה" (19.11) — the name may be plural or feminine
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

/**
 * Today's products: the radar's HOT looks, then the looks added in the last `days`, then the radar's other
 * HOT products (its keep list order, newest first for the added ones).
 */
export function pickKit({ products = [], keepIds = [], now = Date.now(), days = 3, max = 12 } = {}) {
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
  for (const p of hot.filter(isLook)) add(p, "hot");
  for (const p of fresh.filter(isLook)) add(p, "new");
  for (const p of hot) add(p, "hot");
  for (const p of fresh) add(p, "new");
  return out;
}

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
  return out.join(" ");
}

/** The store's own description (its title's later phrases), said as the seller's words. */
function sellerWords(p) {
  const phrases = clean(p.storeTitle).split(/[,،]+/).map((x) => x.trim()).filter(Boolean).slice(1, 3);
  const text = phrases.join(", ").slice(0, 110);
  return text ? `לפי תיאור המוכר: ${text}` : "";
}

/**
 * One post in the deals groups' format (the owner's examples, 19.11): the hook, the seller's own words,
 * a tip, the dated store price, "לרכישה 👇" and the link, then the disclosure on its own line; up to 4 photos.
 */
export function waPost(p, { now = Date.now(), origin = PRODUCTION_ORIGIN, i = 0, why = "new" } = {}) {
  const day = ymd(now);
  const link = `${origin}/p/${encodeURIComponent(p.id)}?utm_source=whatsapp&utm_medium=group&utm_campaign=wa_${day}`;
  const name = shortName(p.title) || clean(p.title);
  const hook = HOOKS[(Math.floor(now / DAY_MS) + i) % HOOKS.length](name);
  const tip = TIPS[p.kind] || TIP_DEFAULT;
  const price = Number(p.price);
  const checked = Date.parse(p.priceCheckedAt);
  const fresh = Number.isFinite(checked) && now - checked <= PRICE_FRESH_DAYS * DAY_MS && checked <= now + DAY_MS;
  const priceLine = price > 0 && p.priceSource === "aliexpress_api" && fresh && dm(p.priceCheckedAt)
    ? `מחיר בחנות: מ־₪${Math.round(price * 100) / 100} (נבדק ב־${dm(p.priceCheckedAt)})`
    : "המחיר המעודכן מופיע בחנות";
  const seller = sellerWords(p);
  const lines = [hook, "", ...(seller ? [seller] : []), tip, priceLine, "", WA_BUY, link, "", WA_AD];
  const images = [p.image, ...(Array.isArray(p.images) ? p.images : [])]
    .map((u) => String(u || "").trim())
    .filter((u, k, a) => HTTPS_IMG.test(u) && a.indexOf(u) === k)
    .slice(0, 4);
  return { id: p.id, why, title: clean(p.title), text: lines.join("\n"), link, images, safe: waSafe(`${hook.replace(name, "")}\n${tip}`) };
}

/** The lines we write ourselves pass the hook rules and this kit's own list. */
export function waSafe(text) {
  return !HOOK_FORBIDDEN.test(text) && !WA_FORBIDDEN.test(text);
}

/** The day's kit. */
export function kitOf({ products = [], keepIds = [], now = Date.now(), origin = PRODUCTION_ORIGIN, max = 12 } = {}) {
  const picks = pickKit({ products, keepIds, now, max });
  const posts = picks.map(({ product, why }, i) => waPost(product, { now, origin, i, why })).filter((x) => x.safe && x.images.length);
  return { day: ymd(now), posts };
}
