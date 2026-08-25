/**
 * Likelink AI Studio — מנוע הבינה המלאכותית למוכרות ולקונות.
 * Hebrew-first, runs fully client-side (no API key required),
 * designed so every function can later be upgraded to a server LLM call
 * without changing its signature.
 */

export const AI_STUDIO_VERSION = "1.0.0";

/** מחיר פסיכולוגי: ₪149 במקום ₪150 */
export function charmPrice(price) {
  const p = Number(price) || 0;
  if (p < 50) return Math.max(1, Math.round(p) - 0.01).toFixed(2).replace(/\.00$/, "");
  const base = p > 500 ? 10 : p > 100 ? 5 : 1;
  return Math.floor(p / base) * base + (base === 1 ? 0.9 : 9);
}

/** הצעת מחיר חכמה לפי קטגוריה + מצב מלאי + ביצועי חנות */
export function suggestPrice({ price, category = "כללי", clicks = 0, sales = 0 }) {
  const p = Number(price) || 0;
  let factor = 1;
  if (sales === 0 && clicks >= 20) factor = 0.92;      // הרבה עניין, אף קנייה → הוזל קלות
  else if (sales >= 3) factor = 1.08;                   // מוכר היטב → אפשר להעלות
  else if (clicks < 5) factor = 0.97;                   // חשיפה חלשה → מחיר כניסה
  const categoryBoost = { "שמלות": 1.05, "תכשיטים": 1.12, "יופי": 1.08 }[category] || 1;
  return {
    suggested: Math.round(Number(charmPrice(p * factor * categoryBoost))),
    current: p,
    direction: factor > 1 ? "up" : factor < 1 ? "down" : "hold",
    reason:
      factor > 1
        ? `המוצר מוכר היטב (${sales} מכירות) — שווה להעלות מחיר בהדרגה`
        : clicks >= 20 && sales === 0
          ? `${clicks} קליקים בלי מכירה — מחיר כניסה יניע את הראשונות`
          : "המחיר הנוכחי מאוזן — התמקדי בתמונות משופרות",
  };
}

/** גנרטור תיאורי מוצר בעברית — סגנון לוקס, מוכן לפרסום */
export function generateHebrewDescription({ title, category = "", price = 0, traits = [] }) {
  const hooks = [
    `✨ ${title} — הפריט שישדרג לך את הלוק`,
    `💛 ${title}: הבחירה של היוצרות הכי מדוברות`,
    `🔥 ${title} — חייבות להכיר`,
  ];
  const hook = hooks[title.length % hooks.length];
  const traitLine = traits.length ? traits.join(" · ") : "איכות פרימיום · סטיילינג אישי";
  return [
    hook,
    "",
    `${category ? category + " " : ""}${traitLine}.`,
    price ? `מחיר הוגן, סטייל ללא פשרות — ₪${price} בלבד.` : "פרטי מחיר בחנות.",
    "",
    "🚚 משלוח מהיר · 💬 תמיכה אישית · ⭐ מהקהילה שסומכת עליה",
  ].join("\n");
}

/** בנאי קמפיין רב-ערוצי בעברית — מוכן להדבקה */
export function buildCampaignKit({ storeName = "החנות שלי", products = [], topProduct = null }) {
  const star = topProduct || products[0];
  const copy = {
    whatsapp: `היי! 💜 פתחתי חנות חדשה ב-Likelink — ${storeName}. ${
      star ? `הפריט שכולן מדברות עליו: ${star.title}` : "בואי לראות את הקולקציה"
    }. קנייה בקליק, בטוחה ומאובטחת 🛍️`,
    instagram: `${star ? `${star.title} 🔥` : "קולקציה חדשה"} — הכל זמין לקנייה בלינק בביו ✨ #Likelink #סטייליש #שופינג`,
    tiktok: `${star ? `POV: מצאת את ${star.title}` : "POV: גילית את החנות הכי שווה"} 🛍️ #LikTok #Likelink #FashionTok`,
    emailSubject: `${storeName}: הקולקציה החדשה הגיעה 💜`,
  };
  return { copy, productCount: products.length, readyToPost: true };
}

/** ציון בריאות חנות 0–100 עם המלצות בעברית (משדרג את buildSellerAIInsights) */
export function scoreStoreHealth({ marketer, products = [], sales = [], paypalConnected = false }) {
  const mine = products.filter((p) => !marketer?.id || p.marketerId === marketer.id);
  const mySales = sales.filter((s) => s.marketerId === marketer?.id);
  const revenue = mySales.reduce((s, x) => s + (x.marketerNet || 0), 0);
  const withImages = mine.filter((p) => p.image).length;
  const checks = [
    { key: "products", ok: mine.length >= 5, weight: 25, tip: "העלי לפחות 5 מוצרים" },
    { key: "images", ok: mine.length > 0 && withImages === mine.length, weight: 20, tip: "הוסיפי תמונה לכל מוצר" },
    { key: "paypal", ok: Boolean(paypalConnected), weight: 30, tip: "חברי אימייל PayPal לקבלת תשלומים" },
    { key: "revenue", ok: revenue > 0, weight: 15, tip: "הראשונה תגיע — שתפי את החנות!" },
    { key: "pricing", ok: mine.some((p) => p.price > 0), weight: 10, tip: "עדכני מחירים לכל המוצרים" },
  ];
  const score = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const todos = checks.filter((c) => !c.ok).map((c) => c.tip);
  return { score, grade: score >= 85 ? "A+" : score >= 70 ? "B" : score >= 40 ? "C" : "D", todos, revenue };
}

/** התאמה אישית לקונה: מדרג מוצרים לפי העדפות צפייה */
export function personalizeForShopper({ products = [], viewedCategories = [], followedIds = [] }) {
  return [...products]
    .map((p) => {
      let score = 0;
      if (viewedCategories.includes(p.category)) score += 3;
      if (followedIds.includes(p.marketerId)) score += 4;
      score += Math.min(2, (p.clicks || 0) / 50);
      return { ...p, _aiScore: score };
    })
    .sort((a, b) => b._aiScore - a._aiScore);
}
