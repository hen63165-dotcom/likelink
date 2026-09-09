/**
 * LikeLink Smart Catalog — Canonical Product Model & Trend Intelligence
 * ===================================================================
 * Provider-neutral product graph. External sources are adapters ONLY.
 */

// Canonical categories — each maps to Hebrew intent keywords
export const CATEGORIES = {
  Fashion: { he: "אופנה", keywords: ["בגד", "שמל", "מעיל", "טופ", "מכנס", "אופנה", "סטייל", "לבוש", "נעל", "נעליים"] },
  Beauty: { he: "יופי וטיפוח", keywords: ["טיפוח", "בישום", "לחות", "מסקרה", "סרום", "איפור", "לק", "שמפו", "יופי", "פנים", "עור"] },
  Home: { he: "בית ומטבח", keywords: ["מנור", "ספה", "מזכר", "מפית", "הבית", "סיפור", "מרכ", "טפון", "מדף", "כיבוד", "מטבח"] },
  Tech: { he: "טכנולוגיה", keywords: ["נטלמ", "אוזני", "טלפון", "מחשב", "גאגט", "טוען", "מסך", "טק", "ציוד", "מצלמ", "סלולרי"] },
  Fitness: { he: "ספורט וכושר", keywords: ["מכונת", "אימון", "ספורט", "ריץ", "יוגה", "משקולות", "חידה", "אופניים", "ריצה"] },
  Kids: { he: "ילדים ותינוקות", keywords: ["טיל", "צריכה", "משה", "תינוק", "קטנים", "חפש", "גינאות", "שינה", "צעצוע"] },
  Accessories: { he: "אקססוארים", keywords: ["תיק", "עגיל", "מזון", "שהד", "מברך", "שען", "ענק", "תכשיט", "שעון", "משקפיים"] },
  Pets: { he: "חיות מחמד", keywords: ["חיה", "כלב", "חתול", "אוכל", "צעצוע", "קושט", "ספל"] },
  Gifts: { he: "מתנות", keywords: ["מתנה", "הפתעה", "יום הולדת", "חג", "חבילה", "קופסא", "גיפט"] },
  Travel: { he: "נסיעות", keywords: ["נסיעה", "תיק נסיעות", "טרנק", "פנדול", "מזוודה", "טרוול", "קמפינג"] },
};

export const AVAILABILITY = {
  UNKNOWN: "unknown",
  LIMITED: "limited",
  AVAILABLE: "available",
  WIDELY_AVAILABLE: "widely_available",
};

/**
 * True when product.marketerId resolves to a real marketer record.
 * Never invents or remaps attribution — missing/unknown owner fails closed.
 */
export function hasValidAttribution(product, marketers = []) {
  const mid = product?.marketerId == null ? "" : String(product.marketerId).trim();
  if (!mid) return false;
  const list = Array.isArray(marketers) ? marketers : [];
  return list.some((m) => m && String(m.id) === mid);
}

/**
 * Public marketplace eligibility: approved + attributable to a known creator.
 * Quarantines orphan/legacy cloud rows (e.g. bootstrap p1–pN without owner)
 * at the presentation boundary without deleting cloud data.
 */
export function isPublicCatalogProduct(product, marketers = []) {
  return Boolean(product && product.status === "approved" && hasValidAttribution(product, marketers));
}

/** Filter to public-safe products only. Admin/studio keep the full list. */
export function filterPublicCatalog(products, marketers = []) {
  return (Array.isArray(products) ? products : []).filter((p) => isPublicCatalogProduct(p, marketers));
}

/**
 * Report quarantined rows (for ops visibility). Does not mutate storage.
 * Requires real business data (valid marketerId) before these can go public.
 */
export function catalogIntegrityReport(products, marketers = []) {
  const list = Array.isArray(products) ? products : [];
  const quarantined = list.filter((p) => p && !hasValidAttribution(p, marketers));
  return {
    total: list.length,
    publicEligible: filterPublicCatalog(list, marketers).length,
    quarantined: quarantined.length,
    quarantinedIds: quarantined.map((p) => p.id).filter(Boolean).slice(0, 50),
    requires: "real_marketerId_matching_marketplace:marketers",
  };
}

/**
 * Create a canonical product record.
 * Only fields with real evidence are populated. Never invent data.
 * marketerId is required for any product that may become public.
 */
export function createProduct({
  id,
  title,
  description,
  price,
  currency = "ILS",
  category,
  image,
  affiliateUrl,
  sourceUrl,
  source,
  brand,
  marketerId = null,
  availability = AVAILABILITY.UNKNOWN,
  markets = ["IL"],
  tags = [],
}) {
  const now = Date.now();
  const owner = marketerId == null ? null : String(marketerId).trim() || null;
  return {
    id: id || `prod_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(title || "").slice(0, 120),
    description: String(description || "").slice(0, 600),
    price: Number(price) || 0,
    currency,
    category: category || "Other",
    image: image || null,
    affiliateUrl: affiliateUrl || null,
    sourceUrl: sourceUrl || null,
    source: source || "likelink",
    brand: brand || null,
    marketerId: owner,
    availability,
    markets,
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    status: "approved",
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Trend Score — composite of demand, freshness, trust, Israel-fit.
 * Each component is evidence-based. No invented signals.
 */
export function trendScore(product, { clicks = [], sales = [], now = Date.now() } = {}) {
  const pid = String(product?.id);
  const myClicks = clicks.filter((c) => c && String(c.productId) === pid);
  const mySales = sales.filter((s) => s && String(s.productId) === pid);

  const clicks30 = myClicks.filter((c) => now - Number(c.ts || 0) <= 30 * 86400000).length;
  const demand = Math.min(clicks30 / 10, 1);

  const ageDays = product?.createdAt ? (now - new Date(product.createdAt).getTime()) / 86400000 : 30;
  const freshness = Math.max(0, 1 - ageDays / 30);

  const trust = Math.min(mySales.length / 3, 1);
  const israelFit = product?.markets?.includes("IL") ? 1 : 0.5;
  const commercial = product?.affiliateUrl ? 1 : 0.3;

  const score = (
    demand * 0.25 +
    freshness * 0.15 +
    trust * 0.25 +
    israelFit * 0.15 +
    commercial * 0.20
  );

  return {
    score: Math.round(score * 100) / 100,
    components: { demand, freshness, trust, israelFit, commercial },
    evidence: { clicks30, sales: mySales.length, ageDays: Math.round(ageDays) },
  };
}

/**
 * Deduplicate products by title similarity.
 * Returns unique products, preferring the one with more evidence.
 */
export function deduplicate(products) {
  const seen = new Map();
  for (const p of products) {
    const key = String(p.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
    const existing = seen.get(key);
    if (!existing || (p.clicks || 0) > (existing.clicks || 0)) {
      seen.set(key, p);
    }
  }
  return [...seen.values()];
}

/**
 * Bootstrap catalog samples for local/dev ONLY when a REAL marketerId is supplied.
 * Fail-closed: without a verified owner id this returns [] — never writes
 * unattributed p1–pN rows into the live cloud catalog.
 * Never invent marketer IDs; the caller must pass an existing marketplace marketer.
 */
export function bootstrapProducts({ marketerId } = {}) {
  const owner = marketerId == null ? "" : String(marketerId).trim();
  if (!owner) return [];

  return [
    createProduct({ id: "p1", marketerId: owner, title: "נעלי ריצה נשים קלות — עד ₪189", description: "נעלי ריצה נוחות עם כרית אוויר. מתאימות לריצה והליכה. מדות 36-41.", price: 189, category: "Fashion", image: "https://picsum.photos/seed/lk-shoes/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["נעליים", "ריצה", "נשים"] }),
    createProduct({ id: "p2", marketerId: owner, title: "מעיל חורף חם עם כובע — ₪129", description: "מעיף חורף מבודד עם כובע נשלף. חם וקל. מתאים לגברים ונשים.", price: 129, category: "Fashion", image: "https://picsum.photos/seed/lk-coat/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["מעיל", "חורף", "חם"] }),
    createProduct({ id: "p3", marketerId: owner, title: "סרום ויטמין C 30ml — ₪45", description: "סרום פנים עשיר בויטמין C להבהיר את העור והפחתת כתמים. לכל סוגי העור.", price: 45, category: "Beauty", image: "https://picsum.photos/seed/lk-serum/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["סרום", "ויטמין C", "טיפוח"] }),
    createProduct({ id: "p4", marketerId: owner, title: "מסקרה מגדלת מים-עמידה — ₪29", description: "מסקרא איכותית להגדלת הריסים. מים-עמידה, נוחה לשימוש יומי.", price: 29, category: "Beauty", image: "https://picsum.photos/seed/lk-mascara/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["מסקרה", "איפור", "ריסים"] }),
    createProduct({ id: "p5", marketerId: owner, title: "מנורת לילה חכמה + טעינה אלחוטית — ₪79", description: "מנורת לילה עם גווני אור מתכווננים, טעינה אלחוטית וכיבוי עתי.", price: 79, category: "Home", image: "https://picsum.photos/seed/lk-lamp/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["מנורה", "חכמה", "טעינה אלחוטית"] }),
    createProduct({ id: "p6", marketerId: owner, title: "סט כלי מטבח סטנלס 12 חלקים — ₪159", description: "סט כלי מטבח איכותי מפלדת אל-חלד. כולל סכים, כפיות, מלקחיים.", price: 159, category: "Home", image: "https://picsum.photos/seed/lk-kitchen/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["מטבח", "כלים", "סטנלס"] }),
    createProduct({ id: "p7", marketerId: owner, title: "אוזניות בלוטוט' ביטול רעש — ₪89", description: "אוזניות אלחוטיות עם ביטול רעש, עמידות במים, עד 8 שעות פעילות.", price: 89, category: "Tech", image: "https://picsum.photos/seed/lk-headphones/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["אוזניות", "בלוטות'", "רעש"] }),
    createProduct({ id: "p8", marketerId: owner, title: "מצלמת אבטחה WiFi ראיית לילה — ₪119", description: "מצלמת אבטחה חכמה עם WiFi, ראיית לילה, זיהוי תנועה והתראות.", price: 119, category: "Tech", image: "https://picsum.photos/seed/lk-camera/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["מצלמה", "אבטחה", "חכמה"] }),
    createProduct({ id: "p9", marketerId: owner, title: "משקולות כושר מתכוונות 2-20kg — ₪249", description: "זוג משקולות מתכוונות עם מנגנון סיבוב. לאימוני כוח וכושר.", price: 249, category: "Fitness", image: "https://picsum.photos/seed/lk-weights/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["משקולות", "כושר", "אימון"] }),
    createProduct({ id: "p10", marketerId: owner, title: "מזרן יוגה אנטי-החלקה 6mm — ₪59", description: "מזרן יוגה איכותי עם משטח אנטי-החלקה. ליוגה, פילאטיס ומתיחות.", price: 59, category: "Fitness", image: "https://picsum.photos/seed/lk-yoga/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["יוגה", "מזרן", "אימון"] }),
    createProduct({ id: "p11", marketerId: owner, title: "תיק גב ארגונומי כיס חשמל — ₪139", description: "תיק גב ארגונומי עם כיס לחשמל/טאבלט, רצועות נוחות, עמיד במים.", price: 139, category: "Accessories", image: "https://picsum.photos/seed/lk-backpack/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["תיק", "גב", "נסיעות"] }),
    createProduct({ id: "p12", marketerId: owner, title: "שעון יח חכם דופק + ספירמומטר — ₪199", description: "שעון חכם עם מסך צבע, דופק, ספירמומטר, מעקב שינה. 7 ימים טעינה.", price: 199, category: "Accessories", image: "https://picsum.photos/seed/lk-watch/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["שעון", "חכם", "דופק"] }),
    createProduct({ id: "p13", marketerId: owner, title: "ערכת מתנה אמה — פרחים + שוקולד — ₪89", description: "ערכת מתנה עם פרחים יבשים, שוקולד איכותי וכרטיס. אריזה יפה.", price: 89, category: "Gifts", image: "https://picsum.photos/seed/lk-gift/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DkYf8Fm", source: "aliexpress", tags: ["מתנה", "אמה", "שוקולד"] }),
    createProduct({ id: "p14", marketerId: owner, title: "בושם נשים איכותי 100ml — ₪69", description: "בושם נשים עדין עם ניחוח פרחוני. עמיד לכל היום, אריזה אלגנטית.", price: 69, category: "Gifts", image: "https://picsum.photos/seed/lk-perfume/600/800", affiliateUrl: "https://s.click.aliexpress.com/e/_DpQw3Rt", source: "aliexpress", tags: ["בושם", "מתנה", "נשים"] }),
  ];
}
