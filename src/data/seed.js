// Demo seed data for Likelink — realistic Hebrew content so the feed never
// starts empty. Owners (marketer) + products are used as the fallback whenever
// shared storage has no data yet (fresh device / cleared storage).

const now = Date.now();
const DAY = 86400000;
const HOUR = 3600000;

// Default tracking IDs per marketer (used when none provided — enables
// affiliate link tracking through the platform forwarder /r path).
const DEFAULT_TRACKING_IDS = {
  "cr-maya": "trk-maya",
  "cr-noa": "trk-noa",
  "cr-dana": "trk-dana",
  "cr-shira": "trk-shira",
};

// helper to build a product row quickly. Builds a real platform tracking link
// (`/r?u=...&ref=...`) so seeded products are NOT reported by the
// `findProductsNeedingTracking` audit as needing a manual tracking-ID fix, and
// every click carries the creator's tracking id through the forwarder.
export const SEED_MARKETERS = [
  {
    id: "cr-maya",
    name: "מיה כהן",
    email: "maya@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["cr-maya"] || "",
    slug: "maya",
    color: "#C1356C",
    bio: "אופנה מינימליסטית וסטיילינג יומיומי — בדיוק מה שבאמת לובשים.",
    createdAt: now - 6 * DAY,
  },
  {
    id: "cr-noa",
    name: "נועה לוי",
    email: "noa@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["cr-noa"] || "",
    slug: "noa",
    color: "#D98A2B",
    bio: "טיפוח וסקין־קר — רק מוצרים שבדקתי על עצמי במשך חודשים.",
    createdAt: now - 5 * DAY,
  },
  {
    id: "cr-dana",
    name: "דנה אברהם",
    email: "dana@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["cr-dana"] || "",
    slug: "dana",
    color: "#2F7E77",
    bio: "הבית הוא הפרויקט — עיצוב, טכנולוגיה וסידורים חכמים לכל חדר.",
    createdAt: now - 4 * DAY,
  },
  {
    id: "cr-shira",
    name: "שירה מזרחי",
    email: "shira@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["cr-shira"] || "",
    slug: "shira",
    color: "#6B5BC4",
    bio: "כושר ורווחה — ציוד ואביזרים שבאמת עובדים בשטח.",
    createdAt: now - 3 * DAY,
  },
];

// helper to build a product row quickly. Builds a real platform tracking link
// (`/r?u=...&ref=...`) so seeded products are NOT reported by the
// `findProductsNeedingTracking` audit as needing a manual tracking-ID fix, and
// every click carries the creator's tracking id through the forwarder.
const createProductRow = (id, marketerId, title, description, image, price, commission, category, clicks, agoDays) => {
  const marketer = SEED_MARKETERS.find((x) => x.id === marketerId);
  const ref = marketer?.trackingId || "trk-demo";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const dest = `https://likelink.example/p/${id}`;
  const affiliateUrl = origin
    ? `${origin}/r?u=${encodeURIComponent(dest)}&ref=${encodeURIComponent(ref)}`
    : dest;
  return {
    id,
    marketerId,
    title,
    description,
    image,
    affiliateUrl,
    category,
    price,
    commission,
    status: "approved",
    clicks,
    createdAt: now - agoDays * DAY - Math.floor(Math.random() * 6) * HOUR,
  };
};

export const SEED_PRODUCTS = [
  createProductRow("p-01", "cr-maya", "שמלת קיץ מקסי מאריג משי",
    "שמלה קלילה וזורמת שמתאימה גם ליום על החוף וגם לערב בגינה. בד נושם ונימוח.",
    "https://picsum.photos/seed/lk-dress/600/800", 249, 35, "Fashion", 342, 1),
  createProductRow("p-02", "cr-maya", "מעיל פסים קשמיר רך",
    "מעיל שמחמם בלי להכביד — צמר מעורבב בקשמיר, גזרה נקייה שמתכתבת עם הכל.",
    "https://picsum.photos/seed/lk-coat/600/800", 689, 80, "Fashion", 215, 2),
  createProductRow("p-03", "cr-maya", "תיק עור אמיתי בסגנון בלגי",
    "התיק שמחזיק שנים: עור רך, תאים חכמים ורצועה שמתאימה לכתף או לצלב.",
    "https://picsum.photos/seed/lk-bag/600/800", 429, 55, "Accessories", 187, 3),
  createProductRow("p-04", "cr-maya", "עגילי כסף מינימליסטיים",
    "זוג עגילים עדין שגורם לכל לוק להיראות מחושב — גם עם ג'ינס פשוט.",
    "https://picsum.photos/seed/lk-earrings/600/800", 149, 22, "Accessories", 96, 5),

  createProductRow("p-05", "cr-noa", "סרום ויטמין C להבהרה",
    "הסרום שאני חוזרת אליו שלוש שנים — מהדק, מבהיר וגורם לעור לזרוח.",
    "https://picsum.photos/seed/lk-serum/600/800", 189, 28, "Beauty", 421, 1),
  createProductRow("p-06", "cr-noa", "מברשת בישום מבריקה",
    "מברישה את הסומק באלגנטיות בלי פסים — סיבים טבעיים על גב ידית כבדה.",
    "https://picsum.photos/seed/lk-brush/600/800", 119, 18, "Beauty", 158, 2),
  createProductRow("p-07", "cr-noa", "קרם לחות ל־24 שעות",
    "לחות חזקה ורכה בלי שומניות. עובד נהדר מתחת למייק־אפ.",
    "https://picsum.photos/seed/lk-cream/600/800", 139, 20, "Beauty", 233, 4),
  createProductRow("p-08", "cr-noa", "מסכת בוץ ירוק טיהור",
    "אחת לשבוע, עשר דקות, והעור נושם. מרגישה את התוצאה מיד.",
    "https://picsum.photos/seed/lk-mask/600/800", 99, 15, "Beauty", 131, 6),
  createProductRow("p-09", "cr-noa", "סט בנייה מעץ לילדים",
    "משחק פתוח שמפתח דמיון — עץ טבעי, פינות מעוגלות, שעות של כיף.",
    "https://picsum.photos/seed/lk-blocks/600/800", 199, 30, "Kids", 88, 7),

  createProductRow("p-10", "cr-dana", "מנורת שולחן חכמה עם טעינה אלחוטית",
    "תאורה חמה וטעינה אלחוטית למכשיר — השולחן שלי כבר לא מסתבך בכבלים.",
    "https://picsum.photos/seed/lk-lamp/600/800", 329, 48, "Tech", 263, 1),
  createProductRow("p-11", "cr-dana", "אוזניות אלחוטיות עם ביטול רעשים",
    "ביטול הרעשים משתיק את כל ההמולה — חיי סוללה של יום עבודה שלם.",
    "https://picsum.photos/seed/lk-buds/600/800", 399, 55, "Tech", 385, 3),
  createProductRow("p-12", "cr-dana", "ערכת סירים מנירוסטה",
    "סירים כבדים שמחממים אחיד — מושקעים, אבל מחזיקים לכם עשור.",
    "https://picsum.photos/seed/lk-pots/600/800", 549, 70, "Home", 146, 4),
  createProductRow("p-13", "cr-dana", "מדפי קיר מודולריים",
    "מערכת מדפים שאפשר לסדר ולהזיז — פתרון אלגנטי לאחסון פתוח.",
    "https://picsum.photos/seed/lk-shelf/600/800", 219, 32, "Home", 112, 6),

  createProductRow("p-14", "cr-shira", "אביזרי התנגדות לסט כושר ביתי",
    "חמש רמות התנגדות שמחליפות חצי חדר כושר — קל לאחסון ונוח לנסיעות.",
    "https://picsum.photos/seed/lk-bands/600/800", 89, 14, "Fitness", 202, 1),
  createProductRow("p-15", "cr-shira", "שטיח יוגה אקולוגי",
    "אחיזה מעולה גם בידיים מזיעות, ובא מחומרים ממוחזרים. הגב שלי אסיר תודה.",
    "https://picsum.photos/seed/lk-mat/600/800", 159, 24, "Fitness", 176, 5),
];
