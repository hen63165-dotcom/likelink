// Shopping moments: the Israeli calendar moment the site is in right now.
//
// The home page re-themes itself by date with no deploy and no human: Jewish
// holidays come from the Hebrew calendar (Intl, so the dates move with each
// year), plus a few fixed shopping dates and the season as a fallback.
//
// Truth rule: a moment is a fact about the DATE, never about demand. It is
// labelled "לפי לוח השנה", it never says "hot", "best-selling" or "everyone is
// buying", and products are matched only by their own category/title/tags.

const IL_TZ = "Asia/Jerusalem";

// Hebrew months as Intl names them ("Adar" in a regular year, "Adar II" in a leap year).
function hebrewDate(now) {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", { month: "long", day: "numeric", timeZone: IL_TZ }).formatToParts(new Date(now));
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return Number.isFinite(day) ? { month, day } : null;
  } catch {
    return null;
  }
}

function civilDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "numeric", day: "numeric", timeZone: IL_TZ }).formatToParts(new Date(now));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const inHeb = (h, month, from, to) => Boolean(h) && h.month === month && h.day >= from && h.day <= to;
const isAdarOfPurim = (h) => Boolean(h) && (h.month === "Adar" || h.month === "Adar II");

/**
 * Each moment: when it applies, its copy, and what fits it. `categories` and
 * `words` are matched against the product's own fields only.
 */
export const MOMENTS = Object.freeze([
  {
    id: "tishrei",
    when: ({ h }) => inHeb(h, "Tishri", 1, 22) || inHeb(h, "Elul", 15, 29),
    he: { title: "חגי תשרי", line: "מתנות לחג, משהו חדש לבית ולוק לארוחת החג." },
    en: { title: "The High Holidays", line: "Holiday gifts, something new for the home, a look for the holiday dinner." },
    categories: ["Gifts", "Home", "Accessories", "Fashion"],
    words: ["מתנה", "שולחן", "חג", "כלי", "תכשיט", "עגיל", "שרשרת"],
  },
  {
    id: "hanukkah",
    when: ({ h }) => inHeb(h, "Kislev", 20, 30) || inHeb(h, "Tevet", 1, 3),
    he: { title: "חנוכה", line: "מתנות לשמונה לילות — לילדים, לבית ולמי שאוהבים." },
    en: { title: "Hanukkah", line: "Gifts for eight nights — for kids, for home, for the people you love." },
    categories: ["Gifts", "Kids", "Tech", "Accessories"],
    words: ["מתנה", "ילד", "משחק", "צעצוע", "תכשיט"],
  },
  {
    id: "purim",
    when: ({ h }) => isAdarOfPurim(h) && h.day >= 1 && h.day <= 15,
    he: { title: "פורים", line: "תחפושות, אקססוריז ומשלוחי מנות." },
    en: { title: "Purim", line: "Costumes, accessories and gift baskets." },
    categories: ["Kids", "Accessories", "Gifts", "Fashion"],
    words: ["תחפושת", "כובע", "פאה", "משקפי", "ילד"],
  },
  {
    id: "pesach",
    when: ({ h }) => inHeb(h, "Nisan", 1, 22) || (isAdarOfPurim(h) && h.day >= 20),
    he: { title: "פסח", line: "ניקיון, מטבח, טיולים ולוק חדש לחג האביב." },
    en: { title: "Passover", line: "Cleaning, kitchen, trips and a fresh spring look." },
    categories: ["Home", "Travel", "Fashion", "Kids"],
    words: ["מטבח", "ניקוי", "כלי", "טיול", "מזוודה"],
  },
  {
    id: "singles_day",
    when: ({ c }) => c.month === 11 && c.day >= 1 && c.day <= 11,
    he: { title: "11.11", line: "יום הקניות הגדול של אלי־אקספרס. המחיר באתר הוא מחיר קטלוג — בדקו את המחיר בחנות." },
    en: { title: "11.11", line: "AliExpress's big shopping day. Prices here are catalog prices — check the store." },
    categories: [],
    words: [],
    sources: ["aliexpress"],
  },
  {
    id: "black_friday",
    when: ({ c }) => (c.month === 11 && c.day >= 20) || (c.month === 12 && c.day <= 2),
    he: { title: "בלאק פריידיי", line: "עונת המבצעים. הנחה מוצגת כאן רק כשיש מחיר קודם אמיתי." },
    en: { title: "Black Friday", line: "Deal season. A discount shows here only with a real previous price." },
    categories: ["Tech", "Fashion", "Beauty", "Home"],
    words: [],
  },
  {
    id: "valentines",
    when: ({ c }) => c.month === 2 && c.day >= 1 && c.day <= 14,
    he: { title: "ולנטיין", line: "מתנה קטנה שאומרת הרבה." },
    en: { title: "Valentine's", line: "A small gift that says a lot." },
    categories: ["Accessories", "Gifts", "Beauty"],
    words: ["תכשיט", "עגיל", "שרשרת", "צמיד", "טבעת", "בושם"],
  },
  {
    id: "back_to_school",
    when: ({ c }) => (c.month === 8 && c.day >= 10) || (c.month === 9 && c.day <= 3),
    he: { title: "חזרה ללימודים", line: "תיקים, ציוד וכל מה שצריך לבוקר הראשון." },
    en: { title: "Back to school", line: "Bags, gear and everything for the first morning." },
    categories: ["Kids", "Tech", "Fashion"],
    words: ["תיק", "קלמר", "בקבוק", "ילד", "אוזניות"],
  },
  {
    id: "summer",
    when: ({ c }) => c.month >= 6 && c.month <= 8,
    he: { title: "קיץ", line: "ים, טיסות ובגדים קלים." },
    en: { title: "Summer", line: "Beach, flights and light clothes." },
    categories: ["Travel", "Fashion", "Fitness", "Beauty"],
    words: ["קיץ", "שמש", "מזוודה", "בגד", "משקפי"],
  },
  {
    id: "autumn",
    when: ({ c }) => c.month >= 9 && c.month <= 11,
    he: { title: "מעבר לחורף", line: "שכבות ראשונות, טיפוח לעור יבש ופינוק לבית." },
    en: { title: "Into winter", line: "First layers, care for dry skin and something cozy for home." },
    categories: ["Fashion", "Beauty", "Home", "Accessories"],
    words: ["מעיל", "סוודר", "קרם", "שמיכה", "חורף"],
  },
  {
    id: "winter",
    when: ({ c }) => c.month === 12 || c.month <= 2,
    he: { title: "חורף", line: "חם בבית, חם בחוץ." },
    en: { title: "Winter", line: "Warm at home, warm outside." },
    categories: ["Fashion", "Home", "Beauty"],
    words: ["מעיל", "סוודר", "שמיכה", "חורף", "גרביים"],
  },
  {
    id: "spring",
    when: () => true,
    he: { title: "אביב", line: "צבעים חדשים לארון ולבית." },
    en: { title: "Spring", line: "New colours for the wardrobe and the home." },
    categories: ["Fashion", "Home", "Fitness", "Accessories"],
    words: ["פרח", "אביב", "צבע"],
  },
]);

/** The moment for `now` (first match wins: holidays, shopping dates, then season). */
export function currentMoment(now = Date.now()) {
  const ctx = { h: hebrewDate(now), c: civilDate(now) };
  const m = MOMENTS.find((x) => x.when(ctx)) || MOMENTS[MOMENTS.length - 1];
  return { id: m.id, he: m.he, en: m.en, categories: m.categories, words: m.words, sources: m.sources || [], basis: "calendar" };
}

const stem = (w) => String(w || "").toLowerCase().slice(0, 4);

/**
 * Products that fit a moment, by their own fields only. A category hit scores
 * 2, a word in the title/tags 1; ties keep catalog order. Nothing fits → [].
 */
export function momentProducts(moment, products = [], limit = 10) {
  if (!moment) return [];
  const cats = new Set(moment.categories || []);
  const sources = new Set(moment.sources || []);
  // Whole-word prefix match, 3+ letters ("ים" would hit every Hebrew plural).
  const stems = (moment.words || []).flatMap((w) => String(w).split(/\s+/)).map(stem).filter((s) => s.length >= 3);
  const scored = (Array.isArray(products) ? products : []).map((p, i) => {
    const words = `${p?.title || p?.displayTitle || ""} ${(Array.isArray(p?.tags) ? p.tags : []).join(" ")}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    let score = 0;
    if (cats.has(p?.category)) score += 2;
    if (sources.size && sources.has(String(p?.source || "").toLowerCase())) score += 2;
    if (stems.some((s) => words.some((w) => w.startsWith(s)))) score += 1;
    return { p, i, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.p);
}
