// Deals (the owner, 2026-10-26: "prices the audience loves — cheap, worth it,
// reliable, high rating, deals, the hottest products in every category"):
// AliExpress's own numbers choose, nothing is invented, nothing is stored.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEAL_CATEGORIES, DEAL_RULES, cleanStoreTitle, dealCategory, dealCheck, dealTitle, guessCategory, nextCategories,
  orderCount, positivePct, rankDeals, toDealProduct,
} from "../src/lib/growth/deals.js";
import { importChosenItems } from "../api/_utils/aliexpressAffiliate.mjs";
import { circleOf } from "../src/lib/homeShowcase.js";
import { productKind } from "../src/lib/siteMap.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-26T12:00:00Z");
const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
const item = (id, extra = {}) => ({
  product_id: id, product_title: "D צבע מואסניט טניס צמיד 925 כסף מצופה זהב לנשים 2026 חדש", product_main_image_url: `//ae-pic-a1.aliexpress-media.com/kf/${id}.jpg`,
  target_sale_price: "24.90", target_sale_price_currency: "ILS", target_original_price: "49.80", evaluate_rate: "97.6%", lastest_volume: 2100,
  promotion_link: `https://s.click.aliexpress.com/e/_own${id}`, product_detail_url: `https://www.aliexpress.com/item/${id}.html`, commission_rate: "7.0%", ...extra,
});
const bracelets = dealCategory("bracelets");

test("AliExpress's own numbers choose: 95%+ positive, 300+ orders, cheap for the category; a missing number never passes", () => {
  assert.equal(positivePct({ evaluate_rate: "93.8%" }), 93.8);
  assert.equal(positivePct({}), null);
  assert.equal(orderCount({ lastest_volume: 1711 }), 1711);
  assert.ok(dealCheck(item("1005001"), bracelets).ok);
  const why = (extra) => dealCheck(item("1005001", extra), bracelets).reason;
  assert.equal(why({ evaluate_rate: "94.9%" }), "rating_below_rule");
  assert.equal(why({ evaluate_rate: undefined }), "rating_below_rule");
  assert.equal(why({ lastest_volume: 120 }), "orders_below_rule");
  assert.equal(why({ target_sale_price: "41" }), "price_above_cap", "a bracelet over ₪40 is not cheap");
  assert.equal(why({ target_sale_price: "1.05" }), "price_too_low", "a ₪1 bait price is not a deal");
  assert.equal(why({ target_sale_price_currency: "USD" }), "no_ils_price");
  assert.equal(why({ product_title: "Pandora style bracelet" }), "brand_name", "on AliExpress a brand's name is an imitation");
  assert.equal(why({ product_title: "צמיד בסגנון קרטייה" }), "brand_name");
  assert.equal(why({ product_title: "tactical knife bracelet" }), "not_listed_kind");
  // 2026-10-26, the first candidates: a celebrity doll and anime stickers (no licence), "anti-anxiety, ADHD", "wrinkle lifting", a "tactical" water gun.
  for (const t of [
    "בובת קוספליי של מייקל ג'קסון", "מדבקות פוסטר דמויות אנימה Chainsaw Man", "כדור לחץ נגד חרדה ו-ADHD", "סרט פנים להרמת קמטים", "רובה מים טקטי",
    // The second run, by eye: fan merchandise of a rapper, of TV series and of a TV show's prop.
    "דגל אסאפ רוקי קישוט חדר ראפר", "100 מדבקות מצחיקות של סדרות טלוויזיה אמריקאיות", "שרשרת הסרט יומני הערפדים אלנה", "50 יחידות מדבקות מצוירות של Tokidoki",
  ]) {
    assert.notEqual(why({ product_title: t }), undefined, t);
    assert.equal(dealCheck(item("1005001", { product_title: t }), bracelets).ok, false, t);
  }
  assert.equal(dealCheck(item("1005001", { product_title: "תיק מיני לנשים" }), dealCategory("bags")).ok, true, "mini is not a forbidden word");
  assert.deepEqual(DEAL_RULES, { minPositivePct: 95, minOrders: 300, minPrice: 4 });
  for (const c of DEAL_CATEGORIES) assert.ok(c.maxPrice > 0 && c.kind && c.category && c.keywords, c.key);
});

test("ranking: real discounts first, then AliExpress's recent orders; duplicates and listed items out", () => {
  const list = [
    item("1005001", { target_original_price: "24.90", lastest_volume: 9000 }),
    item("1005002", { lastest_volume: 800 }),
    item("1005003", { lastest_volume: 5000 }),
    item("1005003"),
    item("1005004", { evaluate_rate: "90%" }),
    item("1005005"),
  ];
  assert.deepEqual(rankDeals(list, bracelets, { exclude: new Set(["1005005"]) }).map((x) => x.product_id), ["1005003", "1005002", "1005001"]);
});

test("a short, clean Hebrew name from the store's own words only", () => {
  // "925 silver / gold plated / moissanite" at a deals price is the seller's claim and often not true: never in our name.
  assert.equal(dealTitle(item("1005001"), bracelets), "צמיד טניס");
  assert.doesNotMatch(dealTitle(item("1005001", { product_title: "moissanite 925 sterling silver gold plated heart necklace" }), dealCategory("necklaces")), /925|מואסניט|זהב|כסף/);
  assert.equal(dealTitle(item("1005001", { product_title: "earrings hoop moon" }), dealCategory("earrings")), "עגילים · חישוק · ירח");
  assert.equal(dealTitle(item("1005001", { product_title: "ring zircon heart adjustable" }), dealCategory("rings")), "טבעת · זרקון · לב · מתכוונן");
  assert.equal(dealTitle(item("1005001", { product_title: "plain ring" }), dealCategory("rings")), "טבעת", "no detail is invented");
  const home = dealTitle(item("1005001", { product_title: "2026 New Hot Sale ATTAGEMS מנורת לילה LED מנורת לילה ירח לחדר שינה משלוח חינם" }), dealCategory("home"));
  assert.doesNotMatch(home, /2026|ATTAGEMS|משלוח חינם|Hot|Sale/);
  assert.match(home, /מנורת לילה LED/);
  assert.ok(home.length <= 56);
  assert.equal(cleanStoreTitle("A A b b"), "A b");
  // 2026-10-26, the first batch: "חם" (hot) inside "לחם" (bread) left "בצורת ל"; long titles were cut mid-phrase.
  assert.equal(cleanStoreTitle("עוגת יוגורט בצורת לחם, צעצוע רך ונעים למגע, מתמתח ואורך זמן"), "עוגת יוגורט בצורת לחם");
  assert.equal(cleanStoreTitle("1 יחידה, מגרדת מטבח מנירוסטה, 30 ס\"מ, מתאימה ללימון"), "מגרדת מטבח מנירוסטה");
  assert.equal(cleanStoreTitle("2/3/4 יחידות סגסוגת בסגנון סיני עתיק פרחים אלגנטיים מקל שיער"), "סגסוגת בסגנון סיני עתיק פרחים אלגנטיים מקל שיער");
  assert.equal(cleanStoreTitle("מראה שולחנית יצירתית בצורת פרח לחדר מעונות, בעלת ערך אסתטי גבוה"), "מראה שולחנית יצירתית בצורת פרח לחדר מעונות");
  assert.equal(dealTitle({ product_title: "יוקרה זוהרת מלאה בצבע זהב זירקון שרשרת תליון כנפי מלאך" }, dealCategory("necklaces")), "שרשרת · זרקון · תליון · כנפיים");
});

test("a catalog product: the store's facts, her own link, the kind; never the rating, orders or commission", () => {
  const p = toDealProduct(item("1005001"), { category: bracelets, marketerId: "m1", now: NOW });
  assert.equal(p.id, "ae-1005001");
  assert.equal(p.image, "https://ae-pic-a1.aliexpress-media.com/kf/1005001.jpg");
  assert.equal(p.price, 24.9); assert.equal(p.originalPrice, 49.8); assert.equal(p.priceSource, "aliexpress_api"); assert.equal(p.priceFrom, true);
  assert.equal(p.kind, "bracelets"); assert.equal(p.category, "Accessories");
  assert.match(p.storeTitle, /מואסניט/, "the store's own title is kept for reference");
  assert.doesNotMatch(JSON.stringify(p), /evaluate_rate|lastest_volume|97\.6|2100|commission/);
  assert.equal(toDealProduct(item("1005001", { promotion_link: "https://www.aliexpress.com/item/1.html" }), { category: bracelets, marketerId: "m1" }), null, "only her own tracked link");
  assert.equal(toDealProduct(item("12"), { category: bracelets, marketerId: "m1" }), null, "a real item number");
  assert.equal(circleOf(p).he, "צמידים");
  assert.equal(productKind({ ...p, title: "מנורת לילה", kind: "home" }), "home", "every category has its place in the shop");
});

test("every category in turn: a few a day, then round again", () => {
  const a = nextCategories(0, 3);
  assert.deepEqual(a.categories.map((c) => c.key), ["rings", "earrings", "necklaces"]);
  const last = nextCategories(DEAL_CATEGORIES.length - 1, 3);
  assert.deepEqual(last.categories.map((c) => c.key), ["pets", "rings", "earrings"]);
  assert.equal(last.cursor, 2);
});

test("the owner's picks: re-read on the server, category from the store's own words, read back, logged", async () => {
  assert.equal(guessCategory({ product_title: "שרשרת יד מואסניט" }).key, "bracelets", "a hand chain is a bracelet");
  assert.equal(guessCategory({ product_title: "Night light", second_level_category_name: "בית תפאורה" }).key, "home");
  assert.equal(guessCategory({ product_title: "something" }), null);
  const db = new Map([["marketplace:products", [{ id: "p-live-01", aliexpressId: "1005009", affiliateUrl: "https://s.click.aliexpress.com/e/_x" }]]]);
  const kv = { kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb), kvSet: async (k, v) => { db.set(k, structuredClone(v)); } };
  const products = [item("1005001"), item("1005002", { product_title: "Pandora bracelet" }), item("1005009")];
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: products } } } } }) });
  const r = await importChosenItems([{ id: "1005001" }, { id: "1005002" }, { id: "1005009" }, { id: "1005077" }, { id: "bad" }], { ...kv, env: ENV, fetchImpl, now: NOW });
  assert.deepEqual(r.report.map((x) => [x.id, x.status]), [["1005001", "ADDED"], ["1005002", "BRAND_NAME"], ["1005009", "ALREADY_ON_SITE"], ["1005077", "NOT_RETURNED"]]);
  assert.equal(r.added, 1);
  assert.equal(db.get("marketplace:products").find((p) => p.id === "ae-1005001").kind, "bracelets");
  assert.equal(db.get("catalog:import:log")[0].report.length, 4);
  assert.equal((await importChosenItems([{ id: "1005001" }], { ...kv, env: {}, fetchImpl })).error, "requires_connection");
});

test("a pick may name the category it was chosen from; the cloud step sends it", async () => {
  const { parseItems } = await import("../src/lib/growth/trendBoard.js");
  const { pickItems } = await import("../scripts/catalog/push-picks.mjs");
  assert.deepEqual(parseItems("1005007306776088@watches 1005008660374263"), [{ id: "1005007306776088", category: "watches" }, { id: "1005008660374263" }]);
  assert.throws(() => parseItems("1005007306776088@nope"), /not an AliExpress item number or link/);
  assert.deepEqual(await pickItems("1005007306776088@watches"), [{ id: "1005007306776088", category: "watches" }]);
});

test("wiring: the daily import and the trend board use the deals rules; the picks reach the cloud", () => {
  const ae = read("api/_utils/aliexpressAffiliate.mjs");
  assert.match(ae, /rankDeals\(raw, category/);
  assert.match(read("scripts/catalog/trend-finder.mjs"), /rankDeals\(await hotFor/);
  assert.match(read("api/_utils/marketingEngineHandler.mjs"), /op === "affiliate-choose" && cronAuthorized\(req\)/);
  const wf = read(".github/workflows/trend-add.yml");
  assert.match(wf, /push-picks\.mjs/);
  assert.match(wf, /AUTOPILOT_SECRET: \$\{\{ secrets\.AUTOPILOT_SECRET \}\}/);
  assert.match(read("scripts/catalog/push-picks.mjs"), /op=affiliate-choose/);
});
