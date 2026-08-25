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
