/**
 * Likelink Growth Engine — מנוע גיוס היוצרות 🚀
 *
 * מזהה את הפרופיל של כל מוכרת/משפיענית פוטנציאלית (שם, תחום, פלטפורמה,
 * גודל קהל) ומנסח לה פנייה אישית בעברית עם הוקים שקשה להתעלם מהם:
 * סקרנות (curiosity gap), FOMO, וסיפור רגשי בסגנון פיקסאר —
 * כשהערך המלא של "הכל בקליק אחד, בלי CapCut" מושתל בכל פנייה.
 */

export const GROWTH_ENGINE_VERSION = "1.0.0";

export const NICHES = [
  { id: "fashion",    label: "אופנה וסטיילינג",   emoji: "👗", value: "הקהל שלך מבקש קישור לכל פריט שאת מעלה — עכשיו הוא קונה בקליק, ואת מרוויחה על כל מכירה" },
  { id: "beauty",     label: "יופי וקוסמטיקה",     emoji: "💄", value: "תכשירים הם הקטגוריה שממירה הכי חזק באינסטגרם — דמייני עמלה אוטומטית על כל אחת" },
  { id: "jewelry",    label: "תכשיטים ואקססוריז",  emoji: "💎", value: "פריט קטן, מחיר קל להחלטה, ועמלה שנצברת אצלך אוטומטית" },
  { id: "home",       label: "בית ועיצוב",         emoji: "🏠", value: "עוקבות תמיד שואלות \"מאיפה הקנה?\" — מעכשיו התשובה מרוויחה לך כסף" },
  { id: "fitness",    label: "כושר ואורח חיים",    emoji: "🏋️‍♀️", value: "אביזרי כושר נמכרים בזמסים — תהיי שם עם הקישור המוכן, ותקבלי עמלה בלי לגעת בכלום" },
  { id: "kids",       label: "ילדים ותינוקות",     emoji: "🧸", value: "אמהות קונות מהמלצה של אמהות — ההמלצה שלך שווה עמלה אוטומטית" },
  { id: "general",    label: "לייפסטייל כללי",     emoji: "✨", value: "כל מה שאת כבר משתפת יכול להרוויח לך — בלי לשנות כלום בשגרה" },
];

export const PLATFORMS = [
  { id: "instagram", label: "Instagram", tip: "שלחי לה בדיירקט את סיפור הפיקסאר — הוא עובד הכי חזק בפרטי" },
  { id: "tiktok",    label: "TikTok",    tip: "הפניית הסקרנות מתאימה לקהל צעיר — קצר, ישיר, בלי מבוא" },
  { id: "whatsapp",  label: "WhatsApp",  tip: "בוואטסאפ פנייה אישית מנצחת — פתחי בשם שלה ובסיפור" },
  { id: "facebook",  label: "Facebook",  tip: "קבוצות נשים = FOMO קולקציות — הדגישי שהמלאי מתאזל" },
];

function tierOf(followers) {
  const n = Number(followers) || 0;
  if (n >= 50000) return { id: "large", label: "משפיענית גדולה", angle: "בקנה המידה שלך זה כבר ערוץ הכנסה שני — ואנחנו עושים את זה בלי עבודה נוספת" };
  if (n >= 5000) return { id: "mid", label: "יוצרת מבוססת", angle: "את כבר משפיעה — עכשיו ההשפעה תתחיל להרוויח בפועל" };
  return { id: "micro", label: "מיקרו-משפיענית", angle: "דווקא בגודל שלך הקהל הכי סומך על ההמלצות — וזה בדיוק מה שממיר למכירות" };
}

function first(name) {
  return String(name || "").trim().split(/\s+/)[0] || "היי";
}

function storefrontLink(storeUrl) {
  const u = String(storeUrl || "").trim();
  return u && /^https?:\/\//i.test(u) ? `\n${u}` : "";
}

/** בונה 3 פניות מותאמות אישית: סקרנות / FOMO / סיפור פיקסאר */
export function buildRecruitPitches(prospect = {}) {
  const niche = NICHES.find((n) => n.id === prospect.niche) || NICHES[NICHES.length - 1];
  const platform = PLATFORMS.find((p) => p.id === prospect.platform) || PLATFORMS[0];
  const tier = tierOf(prospect.followers);
  const name = first(prospect.name);
  const link = storefrontLink(prospect.storeUrl);

  const curiosity = [
    `היי ${name} 🤫`,
    `שאלה קטנה: כמה פעמים השבוע מישהי שאלה אותך "מאיפה?!"`,
    `${niche.emoji} ${niche.value}.`,
    `אצלנו בלייקלינק זה לוקח 5 דקות להקים, וכל מכירה נספרת לך אוטומטית. ${tier.angle}.`,
    `רוצה שאראה לך איך זה נראה בשבילך אישית?${link}`,
  ].join("\n");

  const fomo = [
    `${name}, זה קצר ⏳`,
    `יוצרות שפתחו סטודיו אצלנו כבר מקבלות עמלות על מה שהן עשו גם ככה — המליצו, שיתפו, הראו.`,
    `${niche.emoji} בתחום שלך זה עובד מהר במיוחד: ${niche.value}.`,
    `הכל בקליק אחד: בלי CapCut, בלי עורכים חיצוניים, בלי מכירות ידניות — הפלטפורמה מפרסמת לבד והכסף נכנס ל-PayPal.`,
    `${tier.angle}. המקומות בדף הפתיחה מוגבלים${tier.id === "large" ? " (ואני שומרת לך מקום)" : ""}. ניכנס יחד?${link}`,
  ].join("\n");

  const story = [
    `${name}, סיפור קטן 💛`,
    `הייתה איתנו יוצרת כמוך ב-${platform.label}. כל יום היא העלתה פריטים, כל יום קיבלה שאלות — וכל יום הכסף "היה שם באוויר".`,
    `היום: היא פותחת את הסטודיו שלה, הפלטפורמה מפרסמת לה אוטומטית, והעמלות זורמות ישר ל-PayPal. שינוי אחד. אפס עבודה נוספת.`,
    `${niche.emoji} בשבילך זה אפילו פשוט יותר: ${niche.value}.`,
    `${tier.angle}. אשמח לפתוח לך סטודיו היום — חמש דקות ואת באוויר.${link}`,
  ].join("\n");

  return {
    pitches: [
      { id: "curiosity", label: "🎣 סקרנות", text: curiosity },
      { id: "fomo", label: "⏳ FOMO", text: fomo },
      { id: "story", label: "💛 סיפור פיקסאר", text: story },
    ],
    tier,
    channelTip: platform.tip,
    niche,
    platform,
  };
}

/** קישור שיתוף וואטסאפ מוכן לפנייה */
export function whatsappShare(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** בחירת הפנייה המומלצת לפי פלטפורמה וגודל קהל */
export function recommendedPitchId(prospect = {}) {
  if (prospect.platform === "tiktok") return "curiosity";
  if ((Number(prospect.followers) || 0) >= 5000) return "story";
  return "curiosity";
}
