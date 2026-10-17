// Pure catalog rules shared by the skills (src/lib/skills/catalog.js) and the
// site (/products order): where a price may come from and how fresh it is,
// which media is tied to which product and on what evidence, and an
// explainable product order from data quality only (never popularity).
import { catalogIssues, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { SELLER_MEDIA_LOOKS, SELLER_REVIEWED, SELLER_SKIP, feedLook } from "../reelsFeed.js";
import { LOOKS, STORE_GALLERY_PICKS } from "../looks.js";

export const STORE_LINK = /^https:\/\/(s\.click\.aliexpress\.com|([a-z0-9-]+\.)*aliexpress\.(com|us|ru))\/\S+$/i;
// Fields that would claim social proof. LikeLink has no verified source for any of them.
export const CLAIM_FIELDS = ["rating", "ratingCount", "reviews", "reviewCount", "sold", "soldCount", "orders", "salesCount"];

/** Approved price sources: a price is shown only from one of these, with its check time. Add a source here, with its own reader. */
export const PRICE_SOURCES = Object.freeze({
  aliexpress_api: Object.freeze({ he: "ממשק AliExpress הרשמי", maxAgeHours: 48 }),
});

export const arr = (v) => (Array.isArray(v) ? v : []);
export const listed = (products) => arr(products).filter((p) => p && p.id && (p.status === "approved" || !p.status));

/** Price state of one product: FRESH / STALE (a source, but old) / NONE (no approved source: never shown as a price). */
export function priceState(p, now = Date.now()) {
  const src = PRICE_SOURCES[p?.priceSource];
  const at = Date.parse(p?.priceCheckedAt || "");
  if (!src || !(Number(p?.price) > 0) || !Number.isFinite(at)) return { state: "NONE", he: "אין מחיר ממקור מאושר: באתר כתוב «המחיר המעודכן בחנות»" };
  const ageH = Math.round((now - at) / 3_600_000);
  return ageH <= src.maxAgeHours
    ? { state: "FRESH", ageH, source: p.priceSource, he: `נבדק לפני ${ageH} שעות (${src.he})` }
    : { state: "STALE", ageH, source: p.priceSource, he: `נבדק לפני ${ageH} שעות — ישן, צריך בדיקה חוזרת` };
}

/** Every media item of the catalog, with a verdict and its evidence. Pure. */
export function matchMedia({ products = [], reels = null, looks = LOOKS } = {}) {
  const ids = new Set(listed(products).map((p) => p.id));
  const items = [];
  for (const e of arr(reels)) {
    const id = String(e?.productId || "");
    const base = { media: String(e?.id || e?.video || ""), productId: id, kind: feedLook(e?.look).kind };
    if (!ids.has(id)) items.push({ ...base, verdict: "REJECTED", he: "המוצר לא ברשימת המוצרים באתר" });
    else if (e?.look === "seller" && SELLER_SKIP[id]) items.push({ ...base, verdict: "REJECTED", he: "בסרטון רואים פריט אחר מהמוצר", reason: SELLER_SKIP[id] });
    else if (e?.look === "seller") items.push(SELLER_REVIEWED[id] ? { ...base, verdict: "MATCHED", he: `נבדק בעין ב־${SELLER_REVIEWED[id]}: המוצר הוא נושא הסרטון` } : { ...base, verdict: "UNCERTAIN", he: "סרטון של המוכר שעוד לא נבדק בעין" });
    else if (e?.look === "real") items.push({ ...base, verdict: "MATCHED", he: "צילום שהועלה עם המוצר שנבחר" });
    // The Creative Engine uses only photos checked by eye (STORE_GALLERY_PICKS) and a seller clip a person checked.
    else if (SELLER_MEDIA_LOOKS.includes(e?.look)) items.push(STORE_GALLERY_PICKS[id] && (e.look === "lookbook_photos" || (SELLER_REVIEWED[id] && !SELLER_SKIP[id])) ? { ...base, verdict: "MATCHED", he: "תמונות המוכר שנבדקו בעין, וסרטון שנבדק אם יש" } : { ...base, verdict: "UNCERTAIN", he: "מדיה של המוכר שעוד לא נבדקה בעין" });
    else items.push({ ...base, verdict: "LABELLED_SYNTHETIC", he: "אנימציה של לונה עם תמונת המוצר, מסומנת כ־AI" });
  }
  for (const [id, spec] of Object.entries(looks || {})) {
    const base = { media: `looks/${id}.jpg`, productId: id, kind: "clean_frame" };
    if (!ids.has(id)) items.push({ ...base, verdict: "REJECTED", he: "המוצר לא ברשימת המוצרים באתר" });
    else if (spec.source === "seller_video" && SELLER_REVIEWED[id] && !SELLER_SKIP[id]) items.push({ ...base, verdict: "MATCHED", he: `פריים מסרטון המוכר שנבדק ב־${SELLER_REVIEWED[id]}` });
    else items.push({ ...base, verdict: "UNCERTAIN", he: "פריים מסרטון שלא נבדק בעין" });
  }
  return items;
}

/** Explainable order for buyers: data quality only, never popularity. Pure; /products uses it. */
export function rankProducts(products = [], { reels = [], verifiedVideoIds = null, now = Date.now() } = {}) {
  // verifiedVideoIds: the site passes the products whose playable video a person checked (from its graph).
  const verified = verifiedVideoIds || new Set(matchMedia({ products, reels }).filter((m) => m.verdict === "MATCHED" && m.kind !== "clean_frame").map((m) => m.productId));
  const shared = sharedAffiliateLinks(products);
  return listed(products)
    .map((p, i) => {
      const reasons = [];
      if (STORE_LINK.test(String(p.affiliateUrl || "")) && !catalogIssues(p, products, shared).some((x) => x.blocking)) reasons.push({ w: 3, he: "קישור משלו לדף המוצר בחנות" });
      if (verified.has(p.id)) reasons.push({ w: 3, he: "סרטון של המוצר שנבדק" });
      if (LOOKS[p.id] && SELLER_REVIEWED[p.id]) reasons.push({ w: 1, he: "תמונה נקייה של המוצר" });
      if (priceState(p, now).state === "FRESH") reasons.push({ w: 2, he: "מחיר שנבדק מול החנות" });
      return { id: p.id, score: reasons.reduce((s, r) => s + r.w, 0), reasons: reasons.map((r) => r.he), i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i, ...rest }) => rest);
}

