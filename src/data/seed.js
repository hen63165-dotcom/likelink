// Premium luxury seed data for Likelink2 — high-end creator recommendations that
// match the visual product cards and feel like a real social-commerce brand.

const now = Date.now();
const DAY = 86400000;
const HOUR = 3600000;

const DEFAULT_TRACKING_IDS = {
  "msd6go4kff49s5": "trk-maya",
  "msd6go4kff49s5": "trk-noa",
  "msd6go4kff49s5": "trk-dana",
  "msd6go4kff49s5": "trk-shira",
};

export const SEED_MARKETERS = [
  {
    id: "msd6go4kff49s5",
    name: "ALYOSTYLE",
    email: "hen63165@gmail.com",
    trackingId: "trk-noa",
    slug: "alyostyle",
    color: "#C1356C",
    bio: "LikeLink Official — curated by ALYOSTYLE. Luxury staples, beauty, and tech essentials.",
    createdAt: now - 6 * DAY,
  },
  {
    id: "cr-maya",
    name: "Maya Levin",
    email: "noa@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["msd6go4kff49s5"] || "",
    slug: "noa-sloane",
    color: "#D98A2B",
    bio: "Minimal beauty rituals and elevated essentials with a polished finish.",
    createdAt: now - 5 * DAY,
  },
  {
    id: "msd6go4kff49s5",
    name: "Dana Hart",
    email: "dana@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["msd6go4kff49s5"] || "",
    slug: "dana-hart",
    color: "#2F7E77",
    bio: "Refined home details and smart styling pieces that feel quietly luxurious.",
    createdAt: now - 4 * DAY,
  },
  {
    id: "msd6go4kff49s5",
    name: "Shira Vale",
    email: "shira@likelink.test",
    trackingId: DEFAULT_TRACKING_IDS["msd6go4kff49s5"] || "",
    slug: "shira-vale",
    color: "#6B5BC4",
    bio: "Polished everyday essentials designed for an effortless premium lifestyle.",
    createdAt: now - 3 * DAY,
  },
];

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
  createProductRow(
    "p-01",
    "msd6go4kff49s5",
    "צמיד טניס מואסניט עם גימור זהב 18K",
    "צמיד טניס יוקרתי עם אבני מואסניט זוהרות וגימור זהב מלוטש שמחמיא לכל לוק יומיומי.",
    "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=80",
    389,
    28,
    "Accessories",
    542,
    1
  ),
  createProductRow(
    "p-02",
    "msd6go4kff49s5",
    "משקפי שמש רטרו בגזרה אוברסייז",
    "משקפיים מוצהרים עם צללית רטרו רכה ומשקל קל — מושלמים לצילומים ולערב בעיר.",
    "https://images.unsplash.com/photo-1577803947579-9f7ea5f6b8a5?auto=format&fit=crop&w=900&q=80",
    178,
    18,
    "Accessories",
    398,
    2
  ),
  createProductRow(
    "p-03",
    "msd6go4kff49s5",
    "תיק כתף מיני מעור נאפה",
    "מבנה אלגנטי, מרקם רך ואבזרי מתכת מלוטשים למעברים מיום לערב.",
    "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80",
    429,
    32,
    "Accessories",
    286,
    3
  ),
  createProductRow(
    "p-04",
    "msd6go4kff49s5",
    "שמלת סליפ משי באורך מידי",
    "צללית זורמת עם נגיעה חלקה ומחשוף תפור בעדינות — לערבים אלגנטיים ומיוחדים.",
    "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80",
    342,
    26,
    "Fashion",
    261,
    4
  ),
  createProductRow(
    "p-05",
    "msd6go4kff49s5",
    "סרום ויטמין C לזוהר",
    "מבהיר, מחליק ומזין לעומק — משאיר את העור רענן וזוהר בלי כבדות.",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
    129,
    19,
    "Beauty",
    488,
    1
  ),
  createProductRow(
    "p-06",
    "msd6go4kff49s5",
    "עגילי חישוק זהב, גימור 18K",
    "פריט יומיומי מלוטש עם תחושת משקל נוחה וברק רך שמשדרג כל לוק פשוט.",
    "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?auto=format&fit=crop&w=900&q=80",
    154,
    22,
    "Accessories",
    276,
    2
  ),
  createProductRow(
    "p-07",
    "msd6go4kff49s5",
    "ערכת קליפסים לשיער עם קריסטלים",
    "נגיעה עדינה של גלאם עם ברק קריסטלי — לתסרוקת מעוצבת ולאירועים.",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
    92,
    14,
    "Beauty",
    205,
    5
  ),
  createProductRow(
    "p-08",
    "msd6go4kff49s5",
    "אגרטל קרמיקה בעבודת יד",
    "פריט נייטרלי מעוצב שמוסיף מרקם ושלווה למדף או לשולחן.",
    "https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=900&q=80",
    166,
    20,
    "Home",
    184,
    3
  ),
  createProductRow(
    "p-09",
    "msd6go4kff49s5",
    "כיסוי לפטופ בעיצוב עור",
    "מינימלי, מסודר ומוגבה לנשיאה יומיומית — מלוטש לעבודה וקריר לנסיעות.",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
    214,
    24,
    "Tech",
    239,
    4
  ),
  createProductRow(
    "p-10",
    "msd6go4kff49s5",
    "ג'קט עור אופנוען קרופד",
    "צללית אדג'ית בעור רך במיוחד, תפור להרגיש עשיר, חלק ובלי טעות.",
    "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
    528,
    36,
    "Fashion",
    315,
    6
  ),
  createProductRow(
    "p-11",
    "msd6go4kff49s5",
    "סוודר פולו סריג בגוון אבן",
    "סריג יוקרתי עם צווארון נקי וחתכה רגועה — קל לעיצוב, נוח ותמיד מלוטש.",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
    198,
    24,
    "Fashion",
    229,
    2
  ),
  createProductRow(
    "p-12",
    "msd6go4kff49s5",
    "סט בכור סאטן באספרסו",
    "סט מחמיא עם ברק סאטני וקווים מודרניים שמעניקים ללוק מראה עורכי.",
    "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
    378,
    29,
    "Fashion",
    339,
    3
  ),
  createProductRow(
    "p-13",
    "msd6go4kff49s5",
    "שרשרת פנינים בשכבות",
    "ערימה עדינה של פנינים וטונים זהביים ללוק מינימלי עם אנרגיה רכה.",
    "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=80",
    132,
    17,
    "Accessories",
    188,
    5
  ),
  createProductRow(
    "p-14",
    "msd6go4kff49s5",
    "תיק טוטה מעוצב בגוון קמל",
    "תיק לנשיאה יומיומית עם קווים נקיים ומקום מספק לפריטים חיוניים בלי לאבד צורה.",
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80",
    312,
    26,
    "Accessories",
        214,
    7
  ),
  // ── Live AliExpress products (verified tracking IDs, pre-marketed) ──
  {
    id: "p1_mini_fan_live",
    marketerId: "msd6go4kff49s5",
    title: "מאוורר USB ניתן לטעינה למחשב נייד — ₪69.99",
    description:
      "מאוורר USB קומפקטי עם סוללה רחבה וטעינה מהירה. מתאים למחשבים ניידים, קורא אלחוטיים וטלפונים חכמים. שקט, קל, ומתקיר קירור מיידי — בכיסך, בכל מקום.",
    image:
      "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&h=800&fit=crop",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c2JrC8fJ",
    category: "Tech",
    price: 69.99,
    commission: 7,
    status: "approved",
    clicks: 0,
    createdAt: now - 1 * DAY,
    marketingTitle: "הצעירות שלך — בכיס אחד",
    lunaHook: "הבחירה שלי היום — לא רק מוצר, זה שייך לי.",
  },
  {
    id: "p2_wireless_earbuds_live",
    marketerId: "msd6go4kff49s5",
    title: "אוזניות אלחוטיות TWS עם מיקרופון — ₪89.50",
    description:
      "אוזניות אלחוטיות בלוטות' 5.0 עם צ׳רג'ר קומפקטי. צליל נקי, מיקרופון בנוי לשיחות ברורות, ונוחות לשימוש יומיומי.",
    image:
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&h=800&fit=crop",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c2wFWkxn",
    category: "Tech",
    price: 89.50,
    commission: 7,
    status: "approved",
    clicks: 0,
    createdAt: now - 2 * DAY,
    marketingTitle: "הצליל שלך — בלי חוטים",
    lunaHook: "הבחירה שלי היום — צליל שלם בכיס.",
  },
  {
    id: "p3_phone_case_live",
    marketerId: "msd6go4kff49s5",
    title: "כיסוי טלפון עמיד בנפילות עם תמיכה — ₪35.00",
    description:
      "כיסוי טלפון עמיד בנפילות עם טבעת תמיכה משולבת. מגן על המצלמה, קצוות מרופדים, ותאימות מלאה לטלפונים נפוצים.",
    image:
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600&h=800&fit=crop",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c3TSpOjP",
    category: "Tech",
    price: 35.00,
    commission: 7,
    status: "approved",
    clicks: 0,
    createdAt: now - 3 * DAY,
    marketingTitle: "ההגנה שלך — בלי להסתיר את הסגנון",
    lunaHook: "הבחירה שלי היום — מגן שנראה טוב.",
  },
  {
    id: "p4_smart_watch_live",
    marketerId: "msd6go4kff49s5",
    title: "שעון חכם עם מעקב בריאות וספורט — ₪129.00",
    description:
      "שעון חכם עם מסך גדול, מעקב דופק, שינה, ופעילת ספורט. עמיד במים, סוללה ל-7 ימים, והתראות חכמות.",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=800&fit=crop",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c4CoPLhr",
    category: "Tech",
    price: 129.00,
    commission: 7,
    status: "approved",
    clicks: 0,
    createdAt: now - 4 * DAY,
    marketingTitle: "השליטה שלך — על פרק יד",
    lunaHook: "הבחירה שלי היום — שליטה על הגוף שלך.",
  },
];
