// Studio ⇄ /api/store?mode=media-pipeline (creator ops). Every call carries the
// verified Supabase session; the server decides ownership. Results are the
// server's verified states — nothing here is assumed or optimistic.
import { getSessionToken } from "./auth.js";

async function call(op, { method = "GET", body } = {}) {
  const token = await getSessionToken().catch(() => null);
  if (!token) return { ok: false, error: "authentication_required" };
  try {
    const res = await fetch(`/api/store?mode=media-pipeline&op=${op}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
    return { ...json, httpStatus: res.status };
  } catch (e) {
    return { ok: false, error: "network_error" };
  }
}

export const studioReelState = () => call("studio-state");
export const requestCinematicReel = (productId, style = "") => call("request", { method: "POST", body: { productId, style } });
export const registerStudioReel = (sourcePath, productId) => call("studio-register", { method: "POST", body: { sourcePath, productId } });

/** reels/<id>/<file> from a media proxy URL returned by uploadReelVideo. */
export function mediaPathOf(url) {
  try {
    return new URL(String(url), "https://x").searchParams.get("path") || "";
  } catch {
    return "";
  }
}

const ERRORS_HE = {
  authentication_required: "צריך להתחבר לסטודיו כדי לבצע את הפעולה.",
  no_studio_for_this_account: "לחשבון הזה עוד אין סטודיו.",
  not_your_product: "אפשר ליצור Reel רק למוצרים שלך.",
  not_your_upload: "הקובץ לא שייך לסטודיו שלך.",
  product_not_public: "המוצר עוד לא מאושר — Reel נוצר רק למוצר מאושר.",
  product_image_required: "למוצר חסרה תמונה ציבורית (http) — בלעדיה אין ממה לרנדר.",
  stock_image: "התמונה היא תמונת מאגר — סרטון מציג רק את תמונת המוצר האמיתית מדף המוצר בחנות.",
  product_not_promotable: "הקישור של המוצר משותף לכמה מוצרים ומוביל לדף הבית של החנות — צריך קישור שותפים לדף המוצר עצמו.",
  media_readback_failed: "הקובץ הועלה אבל לא נקרא בחזרה מהאחסון הציבורי — לא פורסם.",
  not_a_playable_video: "הקובץ שהועלה אינו וידאו תקין — לא פורסם.",
  kv_read_failed: "קריאת הנתונים נכשלה — לא בוצע שינוי. נסי שוב בעוד רגע.",
  network_error: "אין חיבור לשרת — לא בוצע שינוי.",
};
export function reelErrorHe(code) {
  return ERRORS_HE[code] || `הפעולה לא הושלמה (${code || "unknown"}) — לא בוצע פרסום.`;
}
