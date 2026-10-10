// "המודד של לונה" (/size): ring and bracelet sizes, measured at home.
// Pure math, shared by the page and its tests. Nothing here is sent anywhere:
// the page measures on the visitor's own screen.
//
// Ring sizes follow the common conversion tables:
//   EU / Israel (ISO 8653) = inner circumference in millimeters
//   US/Canada              = (inner diameter mm − 11.63) / 0.8128
// A screen measurement is an estimate; the page says so, and a seller's own
// size table on the product page decides.

export const SIZE_PATH = "/size";

// A bank / ID / club card (ISO/IEC 7810 ID-1). It is calibrated by its long
// side held upright: that fits a phone screen, where the short side
// (~330 CSS px) is wider than the page column.
export const CARD_MM = Object.freeze({ long: 85.6, short: 53.98 });
export const CARD_PX = Object.freeze({ min: 200, max: 720, start: 324 });

export const RING_DIAMETER_MM = Object.freeze({ min: 14, max: 24 });
export const WRIST_CM = Object.freeze({ min: 11, max: 25 });
// General jewelry advice, not a product fact: add about 1.5–2 cm to the wrist.
export const BRACELET_EASE_CM = Object.freeze({ min: 1.5, max: 2 });

const round = (v, step) => Number((Math.round(v / step) * step).toFixed(2));

/** CSS pixels per millimeter, from the on-screen height that matched the card's long side. */
export function pxPerMm(cardLongSidePx) {
  const px = Number(cardLongSidePx);
  return Number.isFinite(px) && px > 0 ? px / CARD_MM.long : 0;
}

/** Sizes for a ring's inner diameter in millimeters; null outside the usual range. */
export function ringFromDiameter(diameterMm) {
  const d = Number(diameterMm);
  if (!Number.isFinite(d) || d < RING_DIAMETER_MM.min || d > RING_DIAMETER_MM.max) return null;
  const circumference = Math.PI * d;
  return {
    diameter: round(d, 0.1),
    circumference: round(circumference, 0.1),
    eu: Math.round(circumference),
    us: round((d - 11.63) / 0.8128, 0.5),
  };
}

/** Sizes from the length of a strip of paper / string wrapped around the finger (mm). */
export function ringFromCircumference(circumferenceMm) {
  const c = Number(circumferenceMm);
  return Number.isFinite(c) && c > 0 ? ringFromDiameter(c / Math.PI) : null;
}

/** A bracelet length range for a wrist circumference in centimeters; null outside the usual range. */
export function braceletFromWrist(wristCm) {
  const w = Number(wristCm);
  if (!Number.isFinite(w) || w < WRIST_CM.min || w > WRIST_CM.max) return null;
  return { wrist: round(w, 0.1), min: round(w + BRACELET_EASE_CM.min, 0.5), max: round(w + BRACELET_EASE_CM.max, 0.5) };
}

/** An adjustable chain's range as the seller states it ("מתכווננת מ-14 עד 21"), in cm. */
export function statedRange(text = "") {
  const m = String(text).match(/(\d{2}(?:\.\d)?)\s*(?:-|–|עד)\s*(\d{2}(?:\.\d)?)\s*(?:ס["״]?מ|cm)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= 8 && b > a && b <= 30 ? { from: a, to: b } : null;
}

const RING = /טבעת|\bring\b/i;
const BRACELET = /צמיד|שרשרת יד|bracelet/i;

/** Catalog products for a kind ("ring" | "bracelet"), from the public graph only. */
export function sizeProducts(products = [], kind = "ring", limit = 6) {
  const re = kind === "bracelet" ? BRACELET : RING;
  return (Array.isArray(products) ? products : [])
    .filter((p) => re.test(`${p?.displayTitle || p?.title || ""} ${Array.isArray(p?.tags) ? p.tags.join(" ") : ""}`))
    .slice(0, limit);
}

export const SIZE_PAGE = Object.freeze({
  title: { he: "מה מידת הטבעת שלך? מודדים מהמסך תוך דקה", en: "What's your ring size? Measure it on your screen in a minute" },
  kicker: { he: "המודד החינמי של לונה", en: "Luna's free size meter" },
  intro: {
    he: "בלי סרגל ובלי לנחש: כרטיס בגודל כרטיס אשראי וטבעת שיושבת עליך טוב. יש גם מדידה עם פס נייר, ואורך צמיד לפי פרק היד. הכול נמדד אצלך במכשיר, ושום דבר לא נשלח.",
    en: "No ruler, no guessing: a card the size of a credit card and a ring that fits you. There's also a paper-strip method and a bracelet length from your wrist. Everything stays on your device.",
  },
  seoTitle: "מה מידת הטבעת שלי? מודד מידת טבעת וצמיד חינמי מהמסך",
  seoDescription: "מודדים מידת טבעת מהמסך עם כרטיס וטבעת שיש לך, או עם פס נייר, ומקבלים מידה אירופאית (ישראלית) ואמריקאית לאליאקספרס. וגם: איזה אורך צמיד לבחור.",
  faq: Object.freeze([
    {
      q: { he: "איך יודעים מידת טבעת בבית?", en: "How do I find my ring size at home?" },
      a: { he: "מודדים את הקוטר הפנימי של טבעת שיושבת טוב, או כורכים פס נייר סביב האצבע ומודדים את האורך שלו. המודד כאן עושה את החישוב ונותן מידה אירופאית ואמריקאית.", en: "Measure the inner diameter of a ring that fits, or wrap a strip of paper around your finger and measure it. The meter here does the math and gives EU and US sizes." },
    },
    {
      q: { he: "מה ההבדל בין מידה אירופאית לאמריקאית?", en: "What's the difference between EU and US sizes?" },
      a: { he: "המידה האירופאית, שנהוגה גם בישראל, היא ההיקף הפנימי במילימטרים (למשל 52). באליאקספרס רוב המוכרים כותבים מידה אמריקאית (למשל 6). תמיד בודקים גם את טבלת המידות בעמוד המוצר.", en: "The EU size, also used in Israel, is the inner circumference in millimeters (e.g. 52). On AliExpress most sellers use US sizes (e.g. 6). Always check the product page's size table too." },
    },
    {
      q: { he: "יצא לי בין שתי מידות. מה בוחרים?", en: "I'm between two sizes. Which one?" },
      a: { he: "בוחרים את הגדולה. אצבעות מתנפחות קצת בחום ובסוף היום.", en: "Take the larger one. Fingers swell a little in the heat and at the end of the day." },
    },
    {
      q: { he: "כמה מדויקת מדידה מהמסך?", en: "How accurate is a screen measurement?" },
      a: { he: "זו הערכה טובה כשמכיילים עם כרטיס אמיתי, אבל לא מדידה של צורף. אם המידה חשובה מאוד, כמו בטבעת אירוסין, כדאי למדוד גם אצל צורף.", en: "A good estimate when calibrated with a real card, but not a jeweler's measurement. For an engagement ring, check with a jeweler too." },
    },
  ]),
});
