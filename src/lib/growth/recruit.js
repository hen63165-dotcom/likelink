// Creator recruitment: the second half of the free growth loop. The daily drop
// (dailyDrop.js) brings buyers; this brings the people who bring buyers —
// small creators, whom brands now favour for trust and engagement, and who
// want a shoppable page of their own. No other company's name or brand is
// used in the posts.
//
// One post a day, rotating angles, for the owner to post from her own
// account (LikeLink2 is her project — the posts say so). Every line describes
// something live today: a free shop page with video posts, labelled AI, the
// share kit, the size meter. Never income promises, numbers of users, "spots
// left", or anything DROP_FORBIDDEN / HOOK_FORBIDDEN blocks. The link goes to
// /join with its own UTM, so the owner sees which network brings sign-ups.
import { DROP_FORBIDDEN } from "./dailyDrop.js";
import { HOOK_FORBIDDEN } from "./likeloop.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { israelDay } from "../moments.js";

// Promises a recruitment post must never make (on top of the drop rules).
export const RECRUIT_FORBIDDEN = /(תרוויח|להרוויח|הכנסה|הכנסות|פסיבי|כסף קל|מיליון|אלפי|מאות|יוצרות כבר|מקומות|מוגבל|בלעדי|מובטח|הצלחה מובטחת|\d{2,}\s*(יוצר|משתמש|עוקב))/;

/** Each angle is one true thing about the free Studio, said to a creator. */
export const CREATOR_ANGLES = Object.freeze([
  {
    id: "link_in_bio",
    hook: "הקישור בביו שלך יכול להיות חנות קטנה",
    body: "ב־LikeLink2 כל מוצר שאת ממליצה עליו מקבל דף משלו, עם סרטון, קישור ישיר לחנות וסימון #פרסומת אוטומטי.",
  },
  {
    id: "shop_page",
    hook: "דף שאפשר לקנות ממנו כל פוסט, בעברית",
    body: "דף יוצרת עם פוסטים שאפשר לקנות מהם: הסרטון למעלה, המוצר מתחת. נבנה ב־LikeLink2, וזה מתחיל בחינם.",
  },
  {
    id: "honest_labels",
    hook: "ממליצה על מוצרים? הקהל שלך רוצה לדעת מה אמיתי",
    body: "ב־LikeLink2 כל סרטון מסומן: צילום שלך, סרטון של המוכר או אנימציה. בלי דירוגים מומצאים ובלי מונים מזויפים.",
  },
  {
    id: "share_kit",
    hook: "פוסט מוכן לכל רשת, מכל מוצר שאת אוהבת",
    body: "מדביקים קישור למוצר, ו־LikeLink2 מכין דף מוצר, קישור עם מעקב וטקסט לאינסטגרם, טיקטוק ווואטסאפ, עם הגילוי הנדרש.",
  },
  {
    id: "free_tools",
    hook: "כלי חינמי שהעוקבות שלך באמת ישתמשו בו",
    body: "מודד מידות לטבעות ולצמידים ישר מהמסך, ומדריך של 8 בדיקות לפני קנייה. הכול ב־LikeLink2, בחינם, לשתף מהדף שלך.",
  },
]);

function link(source, campaign, origin) {
  const u = new URL(`${origin}/join`);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign);
  return u.href;
}

/** True when a text breaks none of the claim rules. */
export function recruitSafe(text) {
  const t = String(text || "");
  return !DROP_FORBIDDEN.test(t) && !HOOK_FORBIDDEN.test(t) && !RECRUIT_FORBIDDEN.test(t);
}

/** Today's creator-recruitment post for every network. */
export function buildCreatorPost({ now = Date.now(), origin = PRODUCTION_ORIGIN } = {}) {
  const { date, index } = israelDay(now);
  const angle = CREATOR_ANGLES[index % CREATOR_ANGLES.length];
  const campaign = `creators_${date.replace(/-/g, "")}_${angle.id}`;
  const who = "(LikeLink2 הוא המיזם שלי)";
  const tags = "#יוצרות #משפיעניות #לינקבביו #LikeLink2";
  const posts = {
    instagram: { onScreen: [angle.hook], caption: [angle.hook, "", angle.body, "", "רוצה דף כזה? הקישור בביו.", who, "", tags].join("\n"), bioLink: link("instagram", campaign, origin) },
    tiktok: { onScreen: [angle.hook], caption: [angle.hook, angle.body, "הקישור בביו 🔗", who, tags].join("\n"), bioLink: link("tiktok", campaign, origin) },
    whatsapp: { text: [`✨ ${angle.hook}`, angle.body, link("whatsapp", campaign, origin), who].join("\n") },
    facebook: { text: [angle.hook, "", angle.body, "", "מי שרוצה לנסות:", link("facebook", campaign, origin), "", who].join("\n") },
  };
  const unsafe = [angle.hook, angle.body].filter((t) => !recruitSafe(t));
  return { date, campaign, angle: angle.id, hook: angle.hook, posts, safe: unsafe.length === 0 };
}
