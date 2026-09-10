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

/**
 * Deterministic hook per product id — the same item always gets the same
 * voice, so the story, the post and the pin all tell one coherent story.
 */
export function lunaHook(productId = "") {
  let h = 0;
  const s = String(productId || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HOOKS_HE[h % HOOKS_HE.length];
}

/** Full Hebrew story text for a product, in Luna's voice. */
export function lunaStoryText(product = {}, hook) {
  const name = String(product.title || "הפריט החדש");
  const price = Number(product.price) > 0 ? `ב־${Number(product.price)} ₪` : "";
  const line = hook || lunaHook(product.id);
  return `${line}\n\n${name}${price ? ` · ${price}` : ""}\nמחכה לך בסטודיו של Likelink 💜`;
}
