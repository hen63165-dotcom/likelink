/**
 * Likelink AutoPilot — מנוע האוטומציה הגאוני.
 * האתר מתכנן לעצמו שבוע שלם של קמפיינים: יודע לאיזה ערוץ ללכת בכל יום,
 * באיזו שעה הקהל הכי פעיל, וכותב את הטקסט בעברית — מוכרת לוחצת "הרצה".
 */

export const AUTOPILOT_VERSION = "1.0.0";

/** שעות שיא פעילות לפי ערוץ (מחקר התנהגות קהל ישראלי) */
export const BEST_TIMES = {
  whatsapp: "20:30",
  instagram: "19:00",
  tiktok: "21:00",
  telegram: "12:30",
  facebook: "13:00",
  x: "18:00",
};

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** זוויות שיווקיות מתחלפות — כל יום זווית אחרת כדי שלא ישעמם */
function pickAngle(index, product, storeName) {
  const angles = [
    `🔥 הפריט שכולן שואלות עליו: ${product?.title || "הקולקציה החדשה"}`,
    `💜 ${storeName}: נוספו מוצרים חדשים לחנות`,
    `✨ מבצע פתיחה לשבוע — כדאי להיות הראשונות`,
    `🛍️ המומלצת שלי השבוע: ${product?.title || ""}`,
    `⭐ לקוחות מרוצות מחזירות — המלאי מתאזל`,
    `🎁 רעיון מושלם למתנה: ${product?.title || ""}`,
    `🌙 סוף שבוע בסטייל — הקולקציה המלאה בלינק`,
  ];
  return angles[index % angles.length];
}

function waUrl(text, link) {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`;
}
function tgUrl(text, link) {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}
function xUrl(text, link) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

/**
 * בונה תוכנית שבועית מלאה — 7 ימים, 7 ערוצים/זוויות.
 * מחזיר מערך: { id, dayLabel, channelLabel, timeLabel, caption, mode, url }
 */
export function buildWeeklyPlan({ storeName = "החנות שלי", products = [], link = "" }) {
  const rotate = [...(products || [])];
  const take = () => (rotate.length ? rotate.shift() : null);

  // סדר הערוצים לשבוע — מיקס חכם של פניות ישירות + חשיפה
  const week = [
    { channel: "whatsapp", label: "WhatsApp", mode: "url" },
    { channel: "instagram", label: "Instagram Story", mode: "instagram" },
    { channel: "tiktok", label: "TikTok", mode: "tiktok" },
    { channel: "whatsapp", label: "WhatsApp", mode: "url" },
    { channel: "telegram", label: "Telegram", mode: "url" },
    { channel: "x", label: "X (Twitter)", mode: "url" },
    { channel: "facebook", label: "Facebook", mode: "url" },
  ];

  return week.map((slot, i) => {
    const product = take();
    const caption = pickAngle(i, product, storeName);
    const fullCaption = `${caption}${link ? `\n${link}` : ""}`;
    return {
      id: `day-${i}`,
      dayLabel: `יום ${DAYS_HE[i]}`,
      channelLabel: slot.label,
      timeLabel: BEST_TIMES[slot.channel] || "19:00",
      caption,
      mode: slot.mode,
      product,
      url:
        slot.mode === "whatsapp" || slot.channel === "whatsapp"
          ? waUrl(fullCaption, "")
          : slot.channel === "telegram"
            ? tgUrl(caption, link)
            : slot.channel === "x"
              ? xUrl(caption, link)
              : slot.channel === "facebook"
                ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(caption)}`
                : "",
    };
  });
}

/** אינדקס היום בשבוע העברי (ראשון=0) להדגשת "היום" */
export function todayHebrewIndex() {
  return new Date().getDay(); // JS: Sunday=0 ✅ matches Hebrew week
}

/** דוח "אוטו-פיילוט" — כמה קמפיינים הוכנו וכמה יצאו לדרך */
export function summarizePlan(plan = [], executedIds = new Set()) {
  return {
    total: plan.length,
    executed: plan.filter((p) => executedIds.has(p.id)).length,
    remaining: plan.filter((p) => !executedIds.has(p.id)).length,
    channelsCovered: new Set(plan.map((p) => p.channelLabel)).size,
  };
}

// ─── AutoPilot Cloud — פרסום אוטומטי אמיתי מהשרת (api/autopilot.mjs) ────────
//
// בניגוד ל-buildWeeklyPlan (שמכין תוכנית והמוכרת לוחצת), השכבה הזו מפרסמת
// לבד: Cron שרץ כל 30 דקות בודק מי "חייב" פוסט, מייצר טקסט (עם AI אופציונלי)
// ושולח ישר ל-Telegram / Facebook Page / Webhook גנרי (Make/Zapier/n8n).

async function call(mode, marketerId, config) {
  const res = await fetch("/api/autopilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, marketerId, config }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `http_${res.status}`);
  return data;
}

export const getAutoPilotConfig = (marketerId) => call("get", marketerId);
export const saveAutoPilotConfig = (marketerId, config) => call("save", marketerId, config);
export const runAutoPilotNow = (marketerId) => call("run", marketerId);

export const AUTOPILOT_INTERVALS = [
  { minutes: 30, label: "כל חצי שעה" },
  { minutes: 60, label: "כל שעה" },
  { minutes: 180, label: "כל 3 שעות" },
  { minutes: 720, label: "פעמיים ביום" },
  { minutes: 1440, label: "פעם ביום" },
];

export const TEMPLATE_VARS = ["{name}", "{price}", "{category}", "{description}", "{link}"];

export function defaultTemplate() {
  return "🔥 {name}\nבמחיר מיוחד: {price} ₪\n{description}\nלרכישה 👉 {link}";
}

// ─── Browser tick — Hobby-plan cron compensation ────────────────────────────
// Vercel's Hobby plan only allows daily crons, but the autopilot API exposes
// a `tick` mode (POST, no secrets, no marketerId) that publishes whatever is
// due. Every open browser nudges it — so posts still go out at each creator's
// chosen interval, even though the server cron only runs once a day.
const TICK_MIN_INTERVAL_MS = 10 * 60 * 1000; // at most once per 10 minutes per device
const TICK_STORAGE_KEY = "sch:local:autopilot:lastTick";

export function startAutoPilotTick() {
  if (typeof window === "undefined") return;

  const tick = () => {
    // Only tick while the tab is actually open and visible.
    if (document.visibilityState !== "visible") return;
    // Local throttle — the endpoint itself is safe to call, but there is no
    // reason to hammer it from every open tab.
    try {
      const last = Number(sessionStorage.getItem(TICK_STORAGE_KEY) || 0);
      if (Date.now() - last < TICK_MIN_INTERVAL_MS) return;
      sessionStorage.setItem(TICK_STORAGE_KEY, String(Date.now()));
    } catch {
      /* private mode — proceed anyway */
    }
    fetch("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "tick" }),
      keepalive: true,
    }).catch(() => {
      /* best-effort: cron will catch it tomorrow */
    });
  };

  // Nudge shortly after the first visitor lands, then on every re-focus.
  setTimeout(tick, 3000);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
}


// Premium gating — חבילת "הכל כלול": מנוי פרימיום, או סטודיו פעיל (5+ מוצרים
// מאושרים). אדמין יכול להעניק plan === "premium" ידנית.
export function checkAutoPilotAccess(marketer, myProducts = []) {
  if (marketer?.plan === "premium") return { allowed: true, reason: "plan" };
  const approved = myProducts.filter((p) => p.status === "approved").length;
  if (approved >= 5) return { allowed: true, reason: "active_studio" };
  return { allowed: false, reason: "needs_premium_or_5_products", approved };
}

