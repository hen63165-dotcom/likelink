// "מצאי לי באלי" (the second tab of /magic). The owner, 2026-11-06: "put in the
// find-me-on-AliExpress button too". A shopper writes in Hebrew what she wants
// ("עגילי זהב עד 30 ש״ח"); the server asks the owner's affiliate account
// (product.query, ILS, shipping to Israel) and shows only items that pass the
// site's own rules, each with the store's photo, its "from" price, a buy button
// through LikeLink2's tracked link and a "check" button (/magic).
//
// Truth rules:
//   - the words are translated by a small fixed dictionary, never guessed; the
//     store is asked in English when every word is known, else in Hebrew too;
//   - a budget counts only the store's own ILS price;
//   - AliExpress's rating and recent orders choose (FIND_RULES), and are never shown;
//   - a brand or character name, or a kind the site does not list, is left out;
//   - nothing is stored: a search is the address (?q=).
import { cleanStoreTitle, dealTitle, guessCategory, hasBrandName, isNotListedKind, orderCount, positivePct } from "./deals.js";
import { MAGIC_PATH, brandTitle, storePage } from "./magic.js";

export const FIND_RULES = Object.freeze({ minPositivePct: 90, minOrders: 50, minPrice: 2, max: 12 });
export const FIND_QUERY_MAX = 80;

// Two-word phrases first, then single words. Hebrew → the store's English words.
const PHRASES = Object.freeze({
  "בגד ים": "swimsuit", "משקפי שמש": "sunglasses", "שעון חכם": "smart watch", "כיסוי לטלפון": "phone case", "כיסוי טלפון": "phone case",
  "בקבוק מים": "water bottle", "שרשרת יד": "hand chain", "כסף 925": "925 silver", "מגן מסך": "screen protector", "מברשות איפור": "makeup brushes",
  "גומיות שיער": "hair scrunchies", "קשת לשיער": "headband", "תיק גב": "backpack", "תיק צד": "crossbody bag", "ארגונית איפור": "makeup organizer",
});
const WORDS = Object.freeze({
  // jewellery and accessories
  "טבעת": "ring", "טבעות": "rings", "עגיל": "earring", "עגילים": "earrings", "חישוק": "hoop", "חישוקים": "hoops", "שרשרת": "necklace", "שרשראות": "necklaces",
  "תליון": "pendant", "צמיד": "bracelet", "צמידים": "bracelets", "שעון": "watch", "שעונים": "watches", "תיק": "bag", "תיקים": "bags", "ארנק": "wallet",
  "כובע": "hat", "צעיף": "scarf", "חגורה": "belt", "סיכה": "brooch", "קליפס": "hair clip", "גומייה": "scrunchie", "גומיה": "scrunchie",
  // construct forms ("עגילי זהב", "נעלי ספורט")
  "עגילי": "earrings", "צמידי": "bracelets", "שעוני": "watches", "נעלי": "shoes", "תיקי": "bags", "כיסויי": "cases", "מכנסי": "pants", "בגדי": "clothes",
  "צעצועי": "toys", "משקפי": "glasses", "שמלת": "dress", "חולצת": "shirt",
  // clothes and shoes
  "שמלה": "dress", "שמלות": "dresses", "חצאית": "skirt", "חולצה": "shirt", "חולצות": "shirts", "טישרט": "t-shirt", "מכנסיים": "pants", "מכנס": "pants",
  "גינס": "jeans", "ג'ינס": "jeans", "טייץ": "leggings", "לגינס": "leggings", "סווטשירט": "sweatshirt", "קפוצ'ון": "hoodie", "ז'קט": "jacket", "גקט": "jacket",
  "מעיל": "coat", "פיג'מה": "pajamas", "ביקיני": "bikini", "נעליים": "shoes", "נעל": "shoe", "סניקרס": "sneakers", "סנדלים": "sandals", "מגפיים": "boots", "גרביים": "socks",
  // beauty
  "איפור": "makeup", "שפתון": "lipstick", "מברשות": "brushes", "מברשת": "brush", "לק": "nail polish", "ציפורניים": "nails", "שיער": "hair", "מסרק": "comb", "מראה": "mirror",
  // tech
  "טלפון": "phone", "כיסוי": "case", "אוזניות": "earphones", "מטען": "charger", "כבל": "cable", "רמקול": "speaker", "מעמד": "stand",
  // home and kitchen
  "מנורה": "lamp", "לד": "led", "נר": "candle", "נרות": "candles", "כרית": "pillow", "שמיכה": "blanket", "מטבח": "kitchen", "כוס": "cup", "כוסות": "cups",
  "ספל": "mug", "בקבוק": "bottle", "קופסה": "box", "אחסון": "storage", "מארגן": "organizer", "שטיח": "rug", "וילון": "curtain", "תמונה": "wall art", "עציץ": "pot", "בית": "home",
  // kids, pets, sport
  "צעצוע": "toy", "צעצועים": "toys", "בובה": "doll", "בובות": "dolls", "פאזל": "puzzle", "תינוק": "baby", "תינוקות": "baby", "ילדים": "kids", "ילדה": "girl", "ילד": "boy",
  "כלב": "dog", "כלבים": "dog", "חתול": "cat", "חתולים": "cat", "קולר": "collar", "רצועה": "leash", "יוגה": "yoga", "כושר": "fitness", "ספורט": "sport", "מזרן": "mat",
  "חנוכה": "hanukkah", "חנוכייה": "menorah", "חנוכיה": "menorah", "מתנה": "gift", "מתנות": "gifts",
  // colours and materials
  "לבן": "white", "לבנה": "white", "שחור": "black", "שחורה": "black", "אדום": "red", "אדומה": "red", "ורוד": "pink", "ורודה": "pink", "כחול": "blue", "כחולה": "blue",
  "ירוק": "green", "ירוקה": "green", "צהוב": "yellow", "סגול": "purple", "זהב": "gold", "זהוב": "gold", "כסף": "silver", "כסוף": "silver", "חום": "brown", "אפור": "gray",
  "בז'": "beige", "תכלת": "light blue", "שקוף": "transparent", "עור": "leather", "כותנה": "cotton", "נירוסטה": "stainless steel", "פנינה": "pearl", "פנינים": "pearl",
  "זירקון": "zircon", "קריסטל": "crystal", "מואסניט": "moissanite", "עץ": "wooden", "קטיפה": "velvet", "סאטן": "satin", "סרוג": "knitted",
  // who and how
  "נשים": "women", "גברים": "men", "ילדות": "girls", "קטן": "small", "קטנה": "small", "גדול": "large", "גדולה": "large", "ארוך": "long", "ארוכה": "long", "קצר": "short", "קצרה": "short",
  "חמוד": "cute", "חמודה": "cute", "אלגנטי": "elegant", "אלגנטית": "elegant", "וינטג'": "vintage", "מינימליסטי": "minimalist", "עדין": "dainty", "עדינה": "dainty",
  "חורף": "winter", "קיץ": "summer", "חתונה": "wedding", "ערב": "evening", "לב": "heart", "פרח": "flower", "פרחים": "flower", "כוכב": "star", "ירח": "moon", "פרפר": "butterfly", "נחש": "snake",
});
// The kind of item a store word names (the deals categories, src/lib/growth/deals.js):
// a search for earrings shows earrings only, not a ring or a watch set that mentions one.
const KIND_OF = Object.freeze({
  earring: "earrings", earrings: "earrings", hoop: "earrings", hoops: "earrings",
  ring: "rings", rings: "rings", necklace: "necklaces", necklaces: "necklaces", pendant: "necklaces",
  bracelet: "bracelets", bracelets: "bracelets", "hand chain": "bracelets", watch: "watches", watches: "watches", "smart watch": "tech",
  bag: "bags", bags: "bags", wallet: "bags", backpack: "bags", "crossbody bag": "bags",
  makeup: "beauty", lipstick: "beauty", "makeup brushes": "beauty", "nail polish": "beauty", "makeup organizer": "beauty",
  "hair clip": "hair", scrunchie: "hair", "hair scrunchies": "hair", headband: "hair", comb: "hair",
  lamp: "home", candle: "home", candles: "home", pillow: "home", blanket: "home", rug: "home", curtain: "home", "wall art": "home",
  kitchen: "kitchen", cup: "kitchen", cups: "kitchen", mug: "kitchen",
  toy: "kids", toys: "kids", doll: "kids", dolls: "kids", puzzle: "kids", baby: "kids",
  "phone case": "tech", earphones: "tech", charger: "tech", cable: "tech", speaker: "tech", "screen protector": "tech",
  dog: "pets", cat: "pets", collar: "pets", leash: "pets", yoga: "fitness", fitness: "fitness", mat: "fitness",
});
// Words that also mark a kind when the store's category words are missing ("כיסוי לאייפון").
const KIND_WORDS = Object.freeze({
  tech: /כיסוי|מגן\s*מסך|מטען|כבל|אוזניות|רמקול|\b(case|cover|protector|charger|cable|earphones?|headphones?|speaker)\b/i,
  hair: /שיער|קליפס|גומי|קשת|\b(hair|clip|scrunchie|headband)\b/i,
  home: /מנורה|נר|כרית|שמיכה|שטיח|וילון|\b(lamp|candle|pillow|blanket|rug|curtain|decor)\b/i,
});
// The store also calls a key ring, a watch strap loop or a fishing swivel a "ring":
// a search for jewellery leaves out an item whose title names one of those.
const JEWELLERY_KINDS = new Set(["rings", "earrings", "necklaces", "bracelets"]);
const NOT_JEWELLERY = /מפתחות|מחזיק\s*מפתח|שעון|דיג|דייג|וילון|לרכב|\b(key\s*rings?|keyrings?|keychains?|key\s*chains?|watch|watches|fishing|swivels?|curtains?)\b/iu;

/** Whether a store item is the kind asked for (by the store's own words). */
function kindMatches(x, kind) {
  if (JEWELLERY_KINDS.has(kind) && NOT_JEWELLERY.test(String(x?.product_title || ""))) return false;
  if (guessCategory(x)?.key === kind) return true;
  return Boolean(KIND_WORDS[kind]?.test(String(x?.product_title || "")));
}

// Supplies for making jewellery (hooks, findings, beads), not the item itself.
const SUPPLIES = /ממצאים|ממצא(?!\p{L})|חרוזים|לעבודת\s*יד|בעבודת\s*יד|לייצור\s*תכשיטים|ליצירת\s*תכשיטים|ציוד\s*ליצירת|סיכות\s*(?:ראש|עין)|\b(findings|diy|beads|jewelry\s*making|jewellery\s*making)\b/iu;

// Words that carry no item: asked-for, filler, currency.
const FILLER = new Set(["אני", "מחפשת", "מחפש", "רוצה", "צריכה", "צריך", "לי", "של", "עם", "בלי", "את", "משהו", "יפה", "יפים", "יפות", "זול", "זולה", "זולים", "שח", "ש״ח", "ש\"ח", "שקל", "שקלים", "ב", "על", "גם", "או", "מאלי", "באלי", "אליאקספרס", "מאליאקספרס", "שלי", "שלה", "שלו", "לה", "לו", "בשביל", "למישהי", "למישהו", "ממש", "הכי", "טוב", "טובה", "מתאים", "מתאימה"]);
const PREFIX = /^[הולבמש]/;

/** One Hebrew word → its English store word ("" when the dictionary does not know it). */
function wordFor(w) {
  if (WORDS[w]) return WORDS[w];
  // A prefix letter attaches to the word ("לנשים", "הורוד", "ושרשרת").
  if (w.length > 3 && PREFIX.test(w) && WORDS[w.slice(1)]) return WORDS[w.slice(1)];
  if (w.length > 4 && PREFIX.test(w) && PREFIX.test(w.slice(1)) && WORDS[w.slice(2)]) return WORDS[w.slice(2)];
  return "";
}

/**
 * What a shopper wrote → the store's keywords and the budget.
 *   { text, maxPrice, en, he, known, unknown }
 * `en` is "" unless at least one word is known; `complete` is true when every word is.
 */
export function parseFind(raw = "") {
  let text = String(raw || "").replace(/[״"]/g, "״").replace(/\s+/g, " ").trim().slice(0, FIND_QUERY_MAX);
  let maxPrice = 0;
  const budget = text.match(/(?:עד|פחות\s*מ[־-]?|מתחת\s*ל[־-]?|max)\s*₪?\s*(\d{1,5})\s*(?:₪|ש״ח|שח|שקל(?:ים)?)?/i) || text.match(/₪\s*(\d{1,5})|(\d{1,5})\s*(?:₪|ש״ח|שקל(?:ים)?)/);
  if (budget) {
    maxPrice = Number(budget[1] || budget[2]) || 0;
    text = text.replace(budget[0], " ").replace(/\s+/g, " ").trim();
  }
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}'״-]+/u).map((t) => t.replace(/^['-]+|['-]+$/g, "")).filter(Boolean);
  const en = [];
  const known = [];
  const unknown = [];
  const kinds = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const two = `${tokens[i]} ${tokens[i + 1] || ""}`;
    const twoNoPrefix = PREFIX.test(tokens[i]) ? `${tokens[i].slice(1)} ${tokens[i + 1] || ""}` : "";
    const phrase = PHRASES[two] || PHRASES[twoNoPrefix];
    if (phrase) { en.push(phrase); known.push(two); if (KIND_OF[phrase]) kinds.push(KIND_OF[phrase]); i += 1; continue; }
    const t = tokens[i];
    if (FILLER.has(t) || /^\d+$/.test(t)) continue;
    if (/^[a-z][a-z0-9-]*$/.test(t)) { en.push(t); known.push(t); if (KIND_OF[t]) kinds.push(KIND_OF[t]); continue; }
    const w = wordFor(t);
    if (w) { en.push(w); known.push(t); if (KIND_OF[w]) kinds.push(KIND_OF[w]); } else unknown.push(t);
  }
  const words = [...new Set(en.join(" ").split(" "))].join(" ");
  // One kind asked for (the first named): results must be that kind; two different kinds → no filter.
  const kind = [...new Set(kinds)].length === 1 ? kinds[0] : "";
  return { text, maxPrice, kind, en: words, he: tokens.filter((t) => !FILLER.has(t) && !/^\d+$/.test(t)).join(" "), known, unknown, complete: known.length > 0 && unknown.length === 0 };
}

/** The keyword attempts, in order: English when complete, Hebrew, then English from what is known. */
export function findAttempts(parsed) {
  const out = [];
  if (parsed.complete && parsed.en) out.push({ keywords: parsed.en, lang: "en" });
  if (parsed.he) out.push({ keywords: parsed.he, lang: "he" });
  if (!parsed.complete && parsed.en) out.push({ keywords: parsed.en, lang: "en" });
  return out.slice(0, 2);
}

const https = (u) => String(u || "").trim().replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;

/** Why one store item is left out ("" when it passes). */
export function findCheck(x = {}, { maxPrice = 0, kind = "", rules = FIND_RULES } = {}) {
  const price = String(x.target_sale_price_currency || "") === "ILS" ? Number(x.target_sale_price) : NaN;
  if (!(price > 0)) return "no_ils_price";
  if (price < rules.minPrice) return "price_too_low";
  if (maxPrice > 0 && price > maxPrice) return "over_budget";
  const pos = positivePct(x);
  const orders = orderCount(x);
  if (pos === null || pos < rules.minPositivePct) return "rating_below_rule";
  if (orders === null || orders < rules.minOrders) return "orders_below_rule";
  if (hasBrandName(brandTitle(x.product_title))) return "brand_name";
  if (isNotListedKind(x.product_title)) return "not_listed_kind";
  if (SUPPLIES.test(String(x.product_title || ""))) return "supplies";
  if (kind && !kindMatches(x, kind)) return "other_kind";
  if (!OWN_LINK.test(String(x.promotion_link || ""))) return "no_own_link";
  if (!/^https:\/\/\S+$/.test(https(x.product_main_image_url))) return "no_photo";
  return "";
}

/** The items to show: passing ones in the store's own order, each with only the store's facts. */
export function findResults(items = [], { maxPrice = 0, kind = "", rules = FIND_RULES, now = Date.now() } = {}) {
  const seen = new Set();
  const out = [];
  const left = {};
  for (const x of Array.isArray(items) ? items : []) {
    const id = String(x?.product_id || "");
    if (!/^\d{6,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const why = findCheck(x, { maxPrice, kind, rules });
    if (why) { left[why] = (left[why] || 0) + 1; continue; }
    const category = guessCategory(x);
    const title = String(x.product_title || "").replace(/\s+/g, " ").trim();
    out.push({
      id,
      title: (category?.noun ? dealTitle(x, category) : cleanStoreTitle(title)) || title.slice(0, 56),
      storeTitle: title.slice(0, 200),
      image: https(x.product_main_image_url),
      price: Math.round(Number(x.target_sale_price) * 100) / 100,
      currency: "ILS",
      priceFrom: true,
      priceSource: "aliexpress_api",
      checkedAt: new Date(now).toISOString(),
      buy: String(x.promotion_link),
      check: `${MAGIC_PATH}?u=${encodeURIComponent(storePage(id))}`,
    });
    if (out.length >= rules.max) break;
  }
  return { items: out, left };
}
