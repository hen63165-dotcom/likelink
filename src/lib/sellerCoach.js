/**
 * SellerCoach 🧠 — "המאמן האישי של הסטודיו".
 * ---------------------------------------------------------------------------
 * מנתח את המוצרים, המכירות והקליקים של מוכרת ספציפית, ומחזיר טיפים
 * קונקרטיים ופרקטיים בעברית — מה לשפר, איך לשפר, ומה עושה עכשיו.
 *
 * פונקציה טהורה (ללא browser globals) — רצה בדפדפן, בשרת וב-CLI.
 * עוקבת אחר סגנון recommendations.js הקיים.
 */

/**
 * מנתח את הסטודיו של מוכרת ומחזיר טיפים מותאמים.
 *
 * @param {object} opts
 * @param {Array}  opts.products   - כל המוצרים של המוכרת
 * @param {Array}  opts.sales      - כל המכירות (productId, marketerId, marketerNet, ts)
 * @param {Array}  opts.clicks     - כל הקליקים (productId, ts)
 * @param {string} opts.marketerId - מזהה המוכרת
 * @returns {{ score:number, grade:string, tips:Array, summary:string }}
 */
export function analyzeSeller({ products = [], sales = [], clicks = [], marketerId } = {}) {
  const mine = products.filter((p) => !marketerId || p.marketerId === marketerId);
  const mySales = sales.filter((s) => !marketerId || s.marketerId === marketerId);
  const myClicks = clicks.filter((c) => {
    if (!c.productId) return false;
    const prod = mine.find((p) => p.id === c.productId);
    return !!prod;
  });

  const totalClicks = myClicks.length;
  const totalSales = mySales.length;
  const conversionRate = totalClicks > 0 ? (totalSales / totalClicks) * 100 : 0;
  const revenue = mySales.reduce((s, x) => s + (x.marketerNet || 0), 0);

  // מוצרים עם קליקים אבל בלי מכירות (בעיה מבנית)
  const clicksPerProduct = {};
  myClicks.forEach((c) => {
    clicksPerProduct[c.productId] = (clicksPerProduct[c.productId] || 0) + 1;
  });
  const salesProductIds = new Set(mySales.map((s) => s.productId));
  const highClicksNoSales = mine
    .filter((p) => (clicksPerProduct[p.id] || 0) >= 5 && !salesProductIds.has(p.id))
    .sort((a, b) => (clicksPerProduct[b.id] || 0) - (clicksPerProduct[a.id] || 0))
    .slice(0, 3);

  // מוצרים ללא קליקים כלל (נראות)
  const noClicks = mine.filter((p) => !clicksPerProduct[p.id] && p.status === "approved").slice(0, 3);

  // קטגוריה מובילה (כמה מכירות)
  const salesByCategory = {};
  mySales.forEach((s) => {
    const prod = mine.find((p) => p.id === s.productId);
    if (prod) salesByCategory[prod.category] = (salesByCategory[prod.category] || 0) + 1;
  });
  let bestCategory = null;
  let bestCatSales = 0;
  Object.entries(salesByCategory).forEach(([cat, n]) => {
    if (n > bestCatSales) {
      bestCatSales = n;
      bestCategory = cat;
    }
  });

  // יצירת הטיפים
  const tips = [];

  if (mine.length === 0) {
    tips.push({
      icon: "📦",
      title: "התחילי בפרסום מוצרים",
      body: "הסטודיו ריק — העלי לפחות 5 מוצרים כדי שהפיד ייראה מלא וימשוך קונים.",
      priority: "high",
    });
  }

  if (highClicksNoSales.length > 0) {
    const names = highClicksNoSales.map((p) => `"${p.title}"`).join(", ");
    tips.push({
      icon: "🎯",
      title: `${highClicksNoSales.length} מוצרים מקבלים קליקים אבל לא נמכרים`,
      body: `${names} — כנראה שהמחיר גבוה מדי או התיאור לא ברור. נסי להוריד מחיר או להוסיף תמונה נוספת.`,
      priority: "high",
    });
  }

  if (noClicks.length > 0) {
    tips.push({
      icon: "👁️",
      title: `${noClicks.length} מוצרים לא מקבלים קליקים כלל`,
      body: "התמונה או הכותרת לא מושכות. שדרגי תמונה ראשית באיכות גבוהה וכותרת קצרה וברורה יותר.",
      priority: "medium",
    });
  }

  if (conversionRate > 0 && conversionRate < 2) {
    tips.push({
      icon: "📉",
      title: `שיעור המרה נמוך (${conversionRate.toFixed(1)}%)`,
      body: "לכל 100 קליקים מתקבלות פחות מ-2 מכירות. בדקי שהמחיר תחרותי ושהקישור עובד חלק.",
      priority: "medium",
    });
  }

  if (bestCategory && bestCatSales >= 2) {
    tips.push({
      icon: "⭐",
      title: `הקטגוריה הכי מובילה שלך: ${bestCategory}`,
      body: `${bestCatSales} מכירות בקטגוריה הזו — כדאי להעלות עוד מוצרים דומים כדי להגדיל מכירות.`,
      priority: "low",
    });
  }

  if (totalClicks >= 20 && totalSales === 0) {
    tips.push({
      icon: "🔥",
      title: "הרבה קליקים, אפס מכירות",
      body: "הקהילה מתעניינת אבל לא קונה. בדקי אם המחיר הוגן, אם יש תמונות מספיק, ואם הקישור לקנייה פעיל.",
      priority: "high",
    });
  }

  if (tips.length === 0) {
    tips.push({
      icon: "✨",
      title: "הסטודיו בסדר טוב!",
      body: "מוצרים פעילים, יש קליקים. המשיכי להעלות מוצרים חדשים ולשתף ברשתות.",
      priority: "low",
    });
  }

  // ציון כללי 0-100
  let score = 0;
  score += Math.min(30, mine.length * 3); // עד 30 נקודות על מוצרים
  score += Math.min(30, totalSales * 6); // עד 30 על מכירות
  score += Math.min(20, conversionRate * 4); // עד 20 על המרה
  score += bestCategory ? 10 : 0; // 10 על קטגוריה מובילה
  score += highClicksNoSales.length === 0 ? 10 : 0; // 10 אם אין בעיות
  score = Math.round(Math.min(100, score));

  const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";

  const summary =
    totalSales > 0
      ? `נמכרו ${totalSales} מוצרים מתוך ${totalClicks} קליקים (המרה של ${conversionRate.toFixed(1)}%). רווח נטו: ₪${revenue.toFixed(0)}.`
      : totalClicks > 0
        ? `${totalClicks} קליקים אבל עדיין אין מכירות — יש מה לעבוד.`
        : "הסטודיו ממתין להתחלה — העלי מוצרים והתחילי לשתף.";

  return { score, grade, tips, summary };
}

/**
 * טיפ יומי אקראי — לעודד פעילות (שולח כהתראה).
 */
export function dailyTip() {
  const TIPS = [
    "📸 סרטון קצר של 15 שניות עם המוצר יכול להכפיל קליקים.",
    "🔗 שיתוף בסטורי עם סטיקר 'קנייה' מגדיל מכירות ב-30%.",
    "📊 בדקי איזה מוצר מקבל הכי הרבה קליקים — והעלי עוד כאלה.",
    "🎬 צרי סרטון ראשון בסטודיו הווידאו — בקליק אחד, בלי עריכה.",
    "⭐ המוצרים הכי נמכרים צריכים להיות למעלה בפרופיל.",
    "💡 כותרת קצרה וברורה עובדת יותר מתיאור ארוך.",
    "🔄 שיתוף חוזר של מוצר טוב כל 3-4 ימים מגדיל חשיפה.",
  ];
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}