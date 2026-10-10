// "המדריך של לונה": the free shopping guide (the site's /guide page).
// One source for the page, the Instagram comment bot (comment "מדריך" → a
// private reply with the guide link) and the Luna reel that invites the
// comment. Every check is general shopping advice or the site's own rule;
// nothing here is a claim about a product, a price or a result.

export const GUIDE_PATH = "/guide";
export const GUIDE_KEYWORD = "מדריך";

export const GUIDE = Object.freeze({
  title: { he: "8 בדיקות לפני שקונים באליאקספרס", en: "8 checks before you buy on AliExpress" },
  kicker: { he: "המדריך החינמי של לונה", en: "Luna's free guide" },
  intro: {
    he: "קצר, ברור ובלי הפתעות: מה בודקים לפני שמזמינים תכשיט, מתנה או כל מוצר מחנות בחו״ל. אפשר לשמור כ־PDF ולשלוח לחברה.",
    en: "Short and clear: what to check before you order jewelry, a gift or anything from an overseas store. Save it as a PDF or send it to a friend.",
  },
  checks: Object.freeze([
    {
      id: "silver",
      title: { he: "כסף 925: חותמת ומגנט", en: "Silver 925: stamp and magnet" },
      body: { he: "מחפשים חותמת 925 בצד הפנימי. כסף אמיתי לא נמשך למגנט, אז תכשיט שנדבק למגנט הוא לא כסף. ובכל מקרה קוראים בתיאור של המוכר ממה התכשיט עשוי.", en: "Look for a 925 stamp inside. Real silver is not attracted to a magnet. Always read what the seller says it is made of." },
      match: /925|כסף/,
    },
    {
      id: "ring-size",
      title: { he: "מידת טבעת בלי לנחש", en: "Ring size without guessing" },
      body: { he: "לוקחים טבעת שיושבת טוב ומודדים את הקוטר הפנימי במילימטרים. משווים לטבלת המידות שבעמוד המוצר. נופלת בין שתי מידות? בוחרים את הגדולה.", en: "Measure the inner diameter of a ring that fits, in millimeters, and compare it with the size table on the product page. Between two sizes? Take the larger." },
      match: /טבעת/,
    },
    {
      id: "wrist",
      title: { he: "אורך צמיד: פס נייר אחד", en: "Bracelet length: one strip of paper" },
      body: { he: "כורכים פס נייר סביב פרק היד, מסמנים ומודדים בסרגל. בדרך כלל מוסיפים סנטימטר או שניים כדי שיהיה נוח. בשרשרת מתכווננת בודקים בעמוד מה הטווח שלה.", en: "Wrap a strip of paper around your wrist, mark it and measure. Usually add a centimeter or two for comfort. For an adjustable chain, check its range on the page." },
      match: /צמיד|שרשרת יד/,
    },
    {
      id: "moissanite",
      title: { he: "מואסניט זה לא יהלום", en: "Moissanite is not diamond" },
      body: { he: "מואסניט היא אבן אחרת, מבריקה מאוד, אבל היא לא יהלום. בודקים שבתיאור כתוב מואסניט, ממה עשוי הבסיס ומה הציפוי, כי ציפוי יכול להישחק עם הזמן.", en: "Moissanite is a different, very sparkly stone, not diamond. Check that the listing says moissanite, what the base is and what the plating is; plating can wear over time." },
      match: /מואסניט/,
    },
    {
      id: "gift",
      title: { he: "מתנה? מזמינים עם מרווח", en: "A gift? Order with time to spare" },
      body: { he: "זמן המשלוח המשוער מופיע בעמוד המוצר. מזמינים עם מרווח, ובעגילים בודקים ממה עשוי הנעץ, במיוחד לאוזניים רגישות.", en: "The estimated delivery time is on the product page. Order early, and for earrings check what the post is made of, especially for sensitive ears." },
      match: /עגיל/,
    },
    {
      id: "real-sale",
      title: { he: "מבצע אמיתי או רק מספרים?", en: "A real sale or just numbers?" },
      body: { he: "מחיר „לפני ואחרי” הוא לא תמיד הנחה אמיתית. שומרים את המוצר בעגלה כמה ימים ורואים אם המחיר זז, ומשווים את המחיר הסופי כולל משלוח. בלייקלינק הנחה מוצגת רק כשיש מחיר קודם אמיתי מהחנות.", en: "A before/after price is not always a real discount. Keep the item in your cart for a few days and compare the final price including shipping. On LikeLink a discount shows only with a real previous store price." },
      match: null,
    },
    {
      id: "link-check",
      title: { he: "הקישור באמת מוביל למוצר?", en: "Does the link open the product?" },
      body: { he: "לחיצה ארוכה על קישור מראה לאן הוא מוביל. נפתח דף הבית של החנות ולא המוצר עצמו? משהו לא בסדר. ובודקים שהתמונה בעמוד היא אותו מוצר מהסרטון. בלייקלינק לכל מוצר יש קישור משלו.", en: "Long-press a link to see where it goes. If it opens the store's home page instead of the product, something is off. Check the photo matches the video. On LikeLink every product has its own link." },
      match: null,
    },
    {
      id: "protection",
      title: { he: "החבילה לא הגיעה? יש תאריך יעד", en: "Parcel didn't arrive? There is a deadline" },
      body: { he: "נכנסים להזמנה ובודקים עד מתי הגנת הקונה. לא הגיעה עד אז? פותחים מחלוקת ומצרפים צילום מסך של מעקב המשלוח. ולא מאשרים קבלה של חבילה שעוד לא הגיעה.", en: "Open the order and check when buyer protection ends. Not here by then? Open a dispute with a screenshot of the tracking. Never confirm receipt of a parcel that has not arrived." },
      match: null,
    },
  ]),
});

/** Catalog products a check talks about (by the product's own title/description). */
export function guideExamples(check, products = [], limit = 4) {
  if (!check?.match) return [];
  return products.filter((p) => check.match.test(`${p.displayTitle || p.title || ""} ${p.description || ""}`)).slice(0, limit);
}

/** The private reply the comment bot sends to "מדריך" (a plain link to the site's own page). */
export function guideMessage(origin) {
  const url = `${String(origin).replace(/\/+$/, "")}${GUIDE_PATH}?utm_source=instagram&utm_medium=dm&utm_campaign=guide`;
  return [
    "היי! הנה המדריך החינמי של לונה, 8 בדיקות לפני שקונים באליאקספרס:",
    url,
    "",
    "במדריך יש גם דוגמאות למוצרים עם קישורי שותפים (#פרסומת): אם תקנו דרכם ייתכן שאקבל עמלה, בלי עלות נוספת לכם.",
  ].join("\n");
}
