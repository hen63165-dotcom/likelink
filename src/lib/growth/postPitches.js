// The words a post says about one product, written by a person for each item
// (the owner, 2026-11-08: "at that level", pointing to a channel whose posts are
// an album of the item's photos and a few warm lines: what it is, why it's nice,
// one practical tip). Only what the store's own photos and listing show: no
// "I tried it", no stock, prices, discounts, rankings or urgency; a material is
// the seller's word ("לפי המוכר"). tests/postPitches.test.mjs runs every line
// through the site's claim rules (HOOK_FORBIDDEN, DROP_FORBIDDEN).
//
// Keys are the AliExpress item ids (the catalog id is "ae-<item id>").

export const PITCHES = Object.freeze({
  "1005006994477824": {
    title: "סוודר סרוג שחור עם צווארון גבוה",
    text: "סוודר בסיסי שהולך עם הכול: ג'ינס, חצאית משובצת או מתחת לבלייזר.\n💡 לפני שמזמינים: בודקים את טבלת המידות בעמוד, לא את המידה שרגילים אליה בארץ.",
  },
  "1005012011243048": {
    title: "סוודר אפור עם כתף חשופה",
    text: "גזרה רפויה וכתף אחת חשופה, נראה מעולה עם ג'ינס כהה ותיק שחור.\n💡 בוחרים מידה לפי טבלת המידות של המוכר.",
  },
  "1005008248098577": {
    title: "ארנק כרטיסים נשלף",
    text: "ארנק דק שמוציא את הכרטיסים החוצה בלחיצה. רעיון למתנה לגבר שלא אוהב ארנק עבה בכיס.\n💡 בעמוד כתוב כמה כרטיסים נכנסים.",
  },
  "1005008248182129": {
    title: "ארנק קטן ודק לגברים",
    text: "ארנק קומפקטי שנכנס לכיס הקדמי בלי לבלוט. החומר לפי המוכר: עור PU.\n💡 יש כמה צבעים, בוחרים בעמוד.",
  },
  "1005007171036530": {
    title: "משחק דיג מגנטי מעץ",
    text: "משחק לשבת עליו ביחד על השטיח, בלי מסכים.\n💡 בודקים בעמוד את הגיל המומלץ: יש בו חלקים קטנים.",
  },
  "1005007345430335": {
    title: "משחק קוביות פרצופים",
    text: "הופכים את הקוביות עד שהפרצוף זהה לכרטיס, ומי שמסיים ראשון מצלצל בפעמון. משחק לערב משפחתי.\n💡 הגיל המומלץ כתוב בעמוד.",
  },
  "1005013266260514": {
    title: "רשת נגד התזות למחבת",
    text: "מניחים על המחבת, והשמן לא משפריץ על הכיריים ועל הידיים.\n💡 בודקים בעמוד את הקוטר שמתאים למחבת שלכם.",
  },
  "1005013266094825": {
    title: "שקיות ואקום לאחסון",
    text: "לבגדי חורף ולשמיכות: מקטינות את הנפח ומפנות מקום בארון. לפי המוכר לא צריך משאבה.\n💡 בודקים בעמוד את המידות של השקיות.",
  },
  "1005012613833998": {
    title: "מעמד טלפון לרכב",
    text: "נתפס בפתח המזגן, והניווט מול העיניים ולא על הברכיים.\n💡 בודקים בעמוד שהוא מתאים לגודל הטלפון.",
  },
  "1005012986704439": {
    title: "רצועה נשלפת לכלב",
    text: "ארוכה כשהכלב רוצה לרחרח, וקצרה בלחיצה כשמגיעים לכביש.\n💡 בוחרים אורך לפי המשקל של הכלב, לפי הטבלה בעמוד.",
  },
});

/** The written words for a catalog product, or null. */
export function pitchFor(product) {
  const raw = String(product?.aliexpressId || product?.id || "").replace(/^ae-/, "");
  return PITCHES[raw] || null;
}
