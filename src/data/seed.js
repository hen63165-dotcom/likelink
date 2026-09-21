// Likelink2 — canonical seed data: REAL catalog only.
// ─────────────────────────────────────────────────────────────
// Contains ONLY real products with verified AliExpress affiliate links
// (p-live-*). The 14 legacy demo products (p-01..p-14, placeholder
// likelink.example URLs) were REMOVED from the source of truth.
// After deploying, run once:  POST /api/store?mode=force-bootstrap
// → it rewrites marketplace:products in the cloud WITHOUT the demo rows,
//   and seeds one Luna story per real product (brand_pulse:posts v2).
// Rule: never re-add placeholder products. An empty catalog is honest;
// a fake product is broken trust (and a broken tracking link).

const now = Date.now();
const DAY = 86400000;

// Single real owner — the verified studio behind every product here.
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
];

export const SEED_PRODUCTS = [
  {
    id: "p-live-01",
    marketerId: "msd6go4kff49s5",
    title: "טבעת כסף 925 קלאסית עם זרקון מרקיז",
    description: "טבעת אלגנטית מכסף סטרלינג 925 עם אבן זרקון בחיתוך מרקיז. עיצוב קלאסי ונקי, מתאימה לאירוסין, חתונה, או כפריט יומיומי.",
    image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=80",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c2JrC8fJ",
    category: "Accessories",
    price: 10.62,
    commission: 8,
    status: "approved",
    clicks: 0,
    createdAt: now - 1 * DAY,
  },
  {
    id: "p-live-02",
    marketerId: "msd6go4kff49s5",
    title: "צמיד טניס מואסניט ATTAGEMS מצופה זהב לבן",
    description: "צמיד טניס מרשים מכסף סטרלינג 925 עם אבני מואסניט DVVS1 בחיתוך עגול. גימור זהב לבן מלוטש שמעניק ברק יהלום אמיתי.",
    image: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=80",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c2wFWkxn",
    category: "Accessories",
    price: 378.40,
    commission: 8,
    status: "approved",
    clicks: 0,
    createdAt: now - 2 * DAY,
  },
  {
    id: "p-live-03",
    marketerId: "msd6go4kff49s5",
    title: "צמיד טניס מואסניט Smyoue מצופה פלטינה",
    description: "צמיד טניס עדין מכסף 925 עם אבני מואסניט אמיתיות, מצופה פלטינה. אפשרות לבחור עובי אבן מ-2 עד 6.5 מ״מ.",
    image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c3TSpOjP",
    category: "Accessories",
    price: 228.96,
    commission: 8,
    status: "approved",
    clicks: 0,
    createdAt: now - 3 * DAY,
  },
  {
    id: "p-live-04",
    marketerId: "msd6go4kff49s5",
    title: "שרשרת יד Smyoue מצופה 14K עם תליוני מואסניט",
    description: "שרשרת יד עדינה מכסף 925 מצופה 14K, עם תליוני מואסניט קטנים לאורך השרשרת. מתכווננת מ-14 עד 21 ס״מ.",
    image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=80",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c4CoPLhr",
    category: "Accessories",
    price: 85.36,
    commission: 8,
    status: "approved",
    clicks: 0,
    createdAt: now - 4 * DAY,
  },
  {
    id: "p-live-05",
    marketerId: "msd6go4kff49s5",
    title: "עגילי Smyoue מואסניט ורודים 0.2-3 קראט",
    description: "עגילי חן קלאסיים מכסף סטרלינג 925 עם אבני מואסניט בגוון רוז גולד. 4.8 כוכבים מעל 1,400 ביקורות.",
    image: "https://ae01.alicdn.com/kf/S64b18d3ceaf04dfbb7b8134ebdcc4faam.jpg",
    affiliateUrl: "https://s.click.aliexpress.com/e/_c45JuVY5",
    category: "Accessories",
    price: 47.17,
    commission: 8,
    status: "approved",
    clicks: 0,
    createdAt: now - 5 * DAY,
  },
  // LikeLink2 Self-Marketing Product (internal — LikeLink2 markets itself)
  {
    id: "like-marketing-01",
    marketerId: "msd6go4kff49s5",
    title: "LikeLink2 Native Self-Marketing Engine",
    description: "מנוע שיווק עצמי נייטיב של LikeLink2: מוצר/קישור → לונה מבינה → תוכן → אמון → פרסום → מדידה → אופטימיזציה. גילוי נאות: זהו מוצר פנימי של LikeLink2 למערכת שיווק עצמי. קישור שיווקי affiliate גילוי נאות sponsored.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80",
    affiliateUrl: "https://likelink2.vercel.app",
    category: "Marketing",
    price: 0,
    commission: 0,
    status: "approved",
    clicks: 0,
    createdAt: now,
  },
];
