// Studio ⇄ /api/store?mode=growth-engine. Every call carries the verified
// Supabase session, and the server decides the scope (own studio only) and the
// plan. The results are the server's own states. Nothing here is optimistic.
import { getSessionToken } from "./auth.js";

async function call(op, { method = "GET", body } = {}) {
  const token = await getSessionToken().catch(() => null);
  if (!token) return { ok: false, error: "authentication_required" };
  try {
    const res = await fetch(`/api/store?mode=growth-engine&op=${op}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
    return { ...json, httpStatus: res.status };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export const engineStatus = () => call("status");
export const engineControl = (op, settings) => call(op, { method: "POST", body: settings ? { settings } : {} });
export const engineRun = () => call("run", { method: "POST", body: {} });

const ERRORS_HE = {
  authentication_required: "צריך להתחבר לסטודיו.",
  marketer_not_found: "לחשבון הזה עוד אין סטודיו.",
  plan_required: "מנוע השיווק כלול במסלולי Starter ו-Professional.",
  quota_exceeded: "נוצלו כל מחזורי השיווק של החודש במסלול שלך.",
  rate_limited: "יותר מדי בקשות בדקה. נסי שוב בעוד רגע.",
  state_not_persisted: "השינוי לא נקרא בחזרה מהשרת, ולכן לא נשמר. נסי שוב.",
  network_error: "אין חיבור לשרת. לא בוצע שינוי.",
};
export const engineErrorHe = (code) => ERRORS_HE[code] || `הפעולה לא הושלמה (${code || "unknown"}).`;

/** Hebrew labels for the server's item states. */
export const ITEM_STATUS_HE = Object.freeze({
  PUBLISHED: "פורסם · מזהה נקרא בחזרה",
  MANUAL_SHARE_READY: "מוכן לשיתוף ידני עם לינק מעקב",
  APPROVAL_REQUIRED: "ממתין לאישור שלך",
  DAILY_CAP_REACHED: "הגיע למכסה היומית",
  FAILED: "נכשל",
});
