/**
 * Luna — Likelink's digital brand ambassador ("הפנים הדיגיטליות של Likelink").
 * A Pixar-style virtual it-girl who presents the marketplace across every
 * channel: the daily Brand Pulse post, per-product Google Web Stories
 * ("סטורי, אבל בגוגל") and future video.
 *
 * Pure data + deterministic generators — no browser globals, so the exact same
 * module runs in the browser bundle, in Vercel serverless functions and in CLI
 * scripts.
 */

export const AMBASSADOR = {
  name: "לונה",
  nameEn: "Luna",
  tagline: "הפנים הדיגיטליות של Likelink",
  bioHe:
    "לונה — הדוגמנית הדיגיטלית של Likelink. חיה בין הסטוריות, בוחרת את הפריטים החמים ביותר ומספרת עליהם לפני שכולן.",
  // Optional: generate Luna's portrait with any AI image tool and save it as
  // /public/ambassador/luna.jpg — everything that references her picks it up
  // automatically. Until then, every surface falls back to the product image.
  portraitPath: "/ambassador/luna.jpg",
};

const HOOKS_HE = [
  "רגע לפני שתמשיכי בגלילה 👀 יש משהו ששווה עצירה",
  "סוד הסטייל שלי השבוע ✨",
  "הקליק הכי משתלם שתעשי היום",
  "שאלתן מה אני לובשת? קיבלתן תשובה",
  "מצאתי. בדקתי. והנה זה.",
  "הפריט שהייתי שמה בסל של כל חברה שלי",
  "התשובה לשאלה \"מה לובשים עכשיו\" 💜",
  "יש דברים שפשוט שווים את הקליק — הנה אחד כזה",
  "רגע, זה בדיוק מה שחיפשת? תראי",
  "פינוק קטן שעושה את היום 🤍",
];

// Category-aware Luna hooks (2026) — the SAME catalog categories the rest of
// the platform uses. When a product's category is known, Luna speaks to the
// exact audience pain instead of a generic fashion/POV line. Each lineup is
// >1 so product-id hashing still varies within the category.
const CATEGORY_HOOKS_HE = {
  Fashion: ["פריט ששווה עצירה באמצע הגלילה 👗", "הלוק שמשלים כל אאוטפיט — בלי לחשוב", "נגיע לאירוע, בלי לבלות שעה על מלתחה"],
  Beauty: ["מרכיבים שאף פעם לא מספרים לכן עליהם 💄", "פנים רעננות בלי 5 שכבות", "הטיפוח שמרגיש כמו פינוק, לא שגרה"],
  Home: ["הפרט הקטן שמשדרג כל חדר 🏠", "בית מסודר בלי מאמץ — אפשר?", "הפריט שכל מי שנכנס שואל איפה קנינו"],
  Tech: ["הגאדג'ט שמבטיחים עליו הרבה — הנה מבחן אמיתי 📱", "איכות בלי להרוס את התקציב", "פותר בעיה אמיתית, לא סתם קישוט לשולחן"],
  Fitness: ["אימון ביתי בלי מכון — אפשר 👟", "הציוד שיעשה את ההבדל בשגרה", "כושר שפשוט נשאר בשגרה"],
  Kids: ["הפריט שהילדים מרותקים אליו 🧸", "בדיוק מה שהורים צריכים בשגרה", "כיף וגם נשמע לי נכון"],
  Accessories: ["הפרט הקטן שעושה את כל הלוק 🕶️", "משלים כל אאוטפיט בלי לשבור תקציב", "בדיוק מה שחסר לך בארסנל"],
  Pets: ["המתוק שמגיע הביתה מאושר 🐾", "פריט שחיית המחמד באמת תשתמש בו", "אהבה קטנה בפריט אחד"],
  Gifts: ["מתנה שכולם מתלהבים ממנה 🎁", "רגע של הפתעה — בתקציב הגיוני", "המתנה שתחייך את הפרצוף הכי קרוב אליך"],
  Travel: ["נסיעה קלה בלי בלגן 🧳", "הציוד שמשאיר מקום לכל דבר", "החופשה מתחילה מהארגון"],
  Other: ["מצאתי. בדקתי. והנה זה.", "הקליק הכי משתלם שתעשי היום", "רגע לפני הגלילה הבאה — עצרי פה"],
};

const HASH_ID = (s) => {
  let h = 0;
  const x = String(s || "");
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Deterministic hook per product id — the same item always gets the same
 * voice, so the story, the post and the pin all tell one coherent story.
 */
export function lunaHook(productId = "") {
  return HOOKS_HE[HASH_ID(productId) % HOOKS_HE.length];
}

/**
 * Category-aware Luna hook for a product record.
 * Falls back to the generic lunaHook when the category is unknown —
 * fully backward-compatible with existing lunaHook(product.id) call sites.
 */
export function lunaHookForProduct(product = {}) {
  const cat = String(product?.category || "");
  const list = CATEGORY_HOOKS_HE[cat];
  if (!list || !list.length) return lunaHook(product?.id);
  return list[HASH_ID(String(product?.id || "")) % list.length];
}

/** Full Hebrew story text for a product, in Luna's voice. */
export function lunaStoryText(product = {}, hook) {
  const name = String(product.title || "הפריט החדש");
  const price = Number(product.price) > 0 ? `ב־${Number(product.price)} ₪` : "";
  const line = hook || lunaHook(product.id);
  return `${line}\n\n${name}${price ? ` · ${price}` : ""}\nמחכה לך בסטודיו של Likelink 💜`;
}

/**
 * Luna Face for the floating LunaAssistant — composes the "headline + reasoning"
 * straight from the live Cloud Home pick. Used so Luna's floating bubble speaks
 * the *real* daily pick (not just a local product guess) whenever CloudHomeStrip
 * couldn't load it (e.g. cold cache / no currentMarketer).
 */
export function composeLunaFaceForAssistant(pick) {
  if (!pick || !pick.productId) return null;
  const headline = lunaHookForProduct(pick) || lunaHook(pick.productId);
  return {
    hook: headline,
    productId: pick.productId,
    title: pick.title || null,
    image: pick.image || null,
    price: Number(pick.price) || 0,
    badge: pick.badges?.[0] || pick.category || null,
  };
}
