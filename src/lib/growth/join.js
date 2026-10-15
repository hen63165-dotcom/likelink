// /join — the creator landing page the recruitment posts (recruit.js) link to.
// Pure helpers, so the page and its tests read the same truth:
//   • what the free plan includes comes from plans.js (live features only);
//   • while Studio sign-up is paused (the cloud refuses), a creator writes to
//     the site's public contact address. A mail link, not a form: nothing is
//     stored by LikeLink or a new provider, and it costs nothing.
import { FEATURES } from "../plans.js";
import { CONTACT_EMAIL } from "../../constants/contact.js";

export const JOIN_PATH = "/join";
export const JOIN_SEO = Object.freeze({
  title: "דף יוצרת ב־LikeLink2: הקישור בביו שלך, כחנות קטנה",
  description: "פוסטים עם סרטון, וכל מוצר עם קישור ישיר לחנות וסימון #פרסומת. בעברית, ומתחילים בחינם.",
});

/** The free plan, from plans.js: only live features, with their limit. */
export function freePlanFeatures() {
  return FEATURES.filter((f) => f.status === "live" && f.plans.free).map((f) => {
    const v = f.plans.free;
    const note = typeof v === "string" ? v : v && typeof v === "object" ? (v.total ? `עד ${v.total}` : v.monthly ? `${v.monthly} בחודש` : "") : "";
    return { id: f.id, he: f.he, note };
  });
}

/** A mail to the owner, with where the visit came from (utm_source / campaign) when known. */
export function joinMailto({ source = "", campaign = "" } = {}) {
  const clip = (v) => String(v || "").replace(/[^\w.-]/g, "").slice(0, 60);
  const from = clip(source);
  const body = [
    "היי, אשמח לפתוח דף יוצרת ב־LikeLink2.",
    "",
    "השם שלי או של הדף:",
    "הקישור לאינסטגרם או לטיקטוק שלי:",
    "על מה אני ממליצה (תכשיטים, בית, ביוטי…):",
    ...(from ? ["", `הגעתי מ: ${from}${clip(campaign) ? ` (${clip(campaign)})` : ""}`] : []),
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("רוצה דף יוצרת ב־LikeLink2")}&body=${encodeURIComponent(body)}`;
}
