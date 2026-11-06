// "כפתור הקסם" (/magic): a pasted AliExpress link → the store's own facts, what
// to check, and a buy link that keeps a creator's link hers. These tests pin
// the truth rules (src/lib/growth/magic.js) and the server's behaviour
// (api/_utils/magicHandler.mjs) with a fake store: nothing here calls a network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAGIC_PATH, buyDisclosure, catalogMatch, firstLink, isCreatorLink, isStoreLink, itemIdIn, magicBuy, magicNotes, magicReport, magicShareUrl, magicVerdict, storePage,
} from "../src/lib/growth/magic.js";
import { createMagicHandler, resolveMagicLink } from "../api/_utils/magicHandler.mjs";
import { createRateLimiter } from "../api/_utils/botGuard.mjs";
import { applyStoreWritePolicy } from "../api/_utils/storeWritePolicy.mjs";
import { growthMetrics } from "../src/lib/growth/metrics.js";
import { parsePath } from "../src/utils/routing.js";
import { SECTION_SEO, sectionSeo } from "../src/lib/publicSeo.js";

const ID = "1005006861665924";
const ENV = { ALIEXPRESS_APP_KEY: "key_77", ALIEXPRESS_APP_SECRET: "secret_77", ALIEXPRESS_TRACKING_ID: "tid_77" };
const OWN = "https://s.click.aliexpress.com/e/_owner123";

test("the first link in shared text, and which links are the store's", () => {
  assert.equal(firstLink("תראי מה מצאתי! https://a.aliexpress.com/_mKx1Ab2."), "https://a.aliexpress.com/_mKx1Ab2");
  assert.equal(firstLink("no link here"), "");
  assert.equal(isStoreLink("https://www.aliexpress.com/item/1005006861665924.html"), true);
  assert.equal(isStoreLink("https://a.aliexpress.com/_mKx1Ab2"), true);
  assert.equal(isStoreLink("https://he.aliexpress.com/item/1.html"), true);
  assert.equal(isStoreLink("https://aliexpress.com.evil.example/item/1.html"), false);
  assert.equal(isStoreLink("https://www.temu.com/x.html"), false);
});

test("a creator's link is recognised: s.click, or affiliate parameters", () => {
  assert.equal(isCreatorLink("https://s.click.aliexpress.com/e/_abc"), true);
  assert.equal(isCreatorLink(`https://www.aliexpress.com/item/${ID}.html?aff_fcid=x&aff_platform=portals-tool`), true);
  assert.equal(isCreatorLink(`https://www.aliexpress.com/item/${ID}.html?spm=a2g0o&gatewayAdapt=glo2isr`), false);
});

test("the item id, also inside an app share link's encoded redirect and for aliexpress.us", () => {
  assert.equal(itemIdIn(`https://www.aliexpress.com/item/${ID}.html?x=1`), ID);
  assert.equal(itemIdIn(`https://star.aliexpress.com/share/share.htm?redirectUrl=${encodeURIComponent(`https://www.aliexpress.com/item/${ID}.html?a=b`)}`), ID);
  assert.equal(itemIdIn(`https://m.aliexpress.com/p/x/index.html?productId=${ID}&foo=1`), ID);
  assert.equal(itemIdIn("https://www.aliexpress.us/item/3256804734954745.html"), "1005004921269497");
  assert.equal(itemIdIn("https://a.aliexpress.com/_mKx1Ab2"), "");
});

test("notes: the store's price, the guide's checks for the kind, and protection — never a rating or orders", () => {
  const notes = magicNotes({ title: "טבעת כסף 925 עם זירקון", price: 12.5, originalPrice: 40, kind: "rings" });
  const ids = notes.map((n) => n.id);
  assert.deepEqual(ids.slice(0, 2), ["price", "real-sale"]);
  assert.ok(ids.includes("silver") && ids.includes("ring-size") && ids.at(-1) === "protection");
  assert.equal(notes.find((n) => n.id === "ring-size").to, "/size");
  const all = JSON.stringify(notes);
  assert.doesNotMatch(all, /40/, "the seller's \"before\" price is never printed");
  assert.doesNotMatch(all, /דירוג|ביקורות|הזמנות\s*\d|כוכבים|rating|reviews|sold/i);
  assert.match(notes.find((n) => n.id === "real-sale").text.he, /לא בדקנו/);
  assert.equal(magicVerdict(notes), "OK");
});

test("a brand name is a warning, a kind the site does not list stops the check", () => {
  const brand = magicNotes({ title: "Pandora style bracelet", price: 20, brand: true });
  assert.equal(brand[0].id, "brand");
  assert.equal(magicVerdict(brand), "LOOK");
  const stop = magicNotes({ title: "slimming pills", price: 20, notListed: true });
  assert.deepEqual(stop.map((n) => n.id), ["not-listed"]);
  assert.equal(magicVerdict(stop), "STOP");
});

test("the buy link: a creator's stays exactly, LikeLink2's only for a clean check, never for STOP", () => {
  const pasted = "https://s.click.aliexpress.com/e/_creatorXYZ";
  assert.deepEqual(magicBuy({ pasted, creator: true, ownLink: OWN, itemId: ID, verdict: "OK" }), { url: pasted, via: "creator" });
  assert.deepEqual(magicBuy({ pasted: storePage(ID), ownLink: OWN, itemId: ID, verdict: "OK" }), { url: OWN, via: "likelink" });
  assert.deepEqual(magicBuy({ pasted: storePage(ID), ownLink: OWN, itemId: ID, verdict: "LOOK" }), { url: storePage(ID), via: "store" }, "no commission on a brand-name item");
  assert.deepEqual(magicBuy({ pasted, creator: true, ownLink: OWN, itemId: ID, verdict: "STOP" }), { url: "", via: "none" });
  assert.match(buyDisclosure("likelink").he, /^#פרסומת · קישור שותפים/);
  assert.match(buyDisclosure("creator").he, /השארנו אותו/);
  assert.equal(buyDisclosure("none"), null);
});

const storeItem = (over = {}) => ({
  product_id: ID, product_title: "עגילי חישוק זהב", product_main_image_url: "//ae01.alicdn.com/kf/a.jpg",
  product_small_image_urls: { string: ["https://ae01.alicdn.com/kf/b.jpg"] }, target_sale_price: "9.9", target_sale_price_currency: "ILS",
  target_original_price: "30", evaluate_rate: "97.1%", lastest_volume: 5000, commission_rate: "7%", promotion_link: OWN, ...over,
});

test("the report keeps only the store's own facts: no rating, orders or commission", () => {
  const r = magicReport({ x: storeItem(), category: { kind: "earrings" }, pasted: storePage(ID), ownLink: OWN, now: Date.parse("2026-11-06T12:00:00Z") });
  assert.equal(r.item.price, 9.9);
  assert.equal(r.item.image, "https://ae01.alicdn.com/kf/a.jpg");
  assert.equal(r.item.priceSource, "aliexpress_api");
  assert.equal(r.buy.via, "likelink");
  const json = JSON.stringify(r);
  assert.doesNotMatch(json, /97\.1|5000|commission_rate|evaluate|lastest|"7%"/);
});

test("a listed product is found by its store id; the share link carries the pasted link as is", () => {
  const products = [{ id: "p-live-03", aliexpressId: "1" }, { id: `ae-${ID}` }];
  assert.equal(catalogMatch(products, ID).id, `ae-${ID}`);
  assert.equal(catalogMatch(products, "2"), null);
  const pasted = "https://s.click.aliexpress.com/e/_creatorXYZ";
  const u = new URL(magicShareUrl({ pasted, origin: "https://likelink2.vercel.app", source: "whatsapp" }));
  assert.equal(u.pathname, MAGIC_PATH);
  assert.equal(u.searchParams.get("u"), pasted);
  assert.equal(u.searchParams.get("utm_medium"), "magic");
});

// ── the server, with a fake store ──

function fakeStore({ item = storeItem(), redirects = {}, ownLink = OWN } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith("https://api-sg.aliexpress.com/")) {
      const body = new URLSearchParams(String(init.body || ""));
      const method = body.get("method");
      calls.push(method);
      if (method === "aliexpress.affiliate.productdetail.get") {
        const products = item && body.get("product_ids") === String(item.product_id) ? [item] : [];
        return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: products } } } } }) };
      }
      if (method === "aliexpress.affiliate.link.generate") {
        return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_link_generate_response: { resp_result: { result: { promotion_links: { promotion_link: ownLink ? [{ promotion_link: ownLink, source_value: body.get("source_values") }] : [] } } } } }) };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    }
    calls.push(`GET ${url}`);
    assert.equal(init.redirect, "manual", "a redirect is read, never followed");
    const where = redirects[url];
    return { ok: false, status: where ? 302 : 200, headers: { get: (h) => (h === "location" ? where || null : null) }, text: async () => "" };
  };
  return { fetchImpl, calls };
}

function call(handler, { u = "", origin = "https://likelink2.vercel.app", ua = "Mozilla/5.0 (iPhone)", method = "GET", ip = "1.2.3.4" } = {}) {
  const req = { method, url: `/api/store?mode=magic&u=${encodeURIComponent(u)}`, headers: { origin, "user-agent": ua, "x-forwarded-for": ip } };
  const res = { code: 200, headers: {}, body: null, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, json(o) { this.body = o; }, end() {} };
  return handler(req, res).then(() => res);
}

test("server: a plain store link gets LikeLink2's own link from the same answer; nothing is stored", async () => {
  const { fetchImpl, calls } = fakeStore();
  const h = createMagicHandler({ env: ENV, fetchImpl });
  const res = await call(h, { u: `ראיתי בטיקטוק ${storePage(ID)}` });
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.report.buy.url, OWN);
  assert.equal(res.body.report.buy.via, "likelink");
  assert.deepEqual(calls, ["aliexpress.affiliate.productdetail.get"], "no page, no extra call");
  assert.doesNotMatch(JSON.stringify(res.body), /ALIEXPRESS_(APP|TRACKING)|key_77|secret_77|tid_77|app_key/, "no credential or tracking id in the answer");
});

test("server: a creator's s.click link is resolved once and kept exactly", async () => {
  const pasted = "https://s.click.aliexpress.com/e/_creatorXYZ";
  const { fetchImpl, calls } = fakeStore({ redirects: { [pasted]: `https://www.aliexpress.com/item/${ID}.html?aff_fcid=1` } });
  const res = await call(createMagicHandler({ env: ENV, fetchImpl }), { u: pasted });
  assert.equal(res.body.report.buy.url, pasted);
  assert.equal(res.body.report.buy.via, "creator");
  assert.equal(calls.filter((c) => c.startsWith("GET")).length, 1);
  assert.ok(!calls.includes("aliexpress.affiliate.link.generate"));
});

test("server: an app share link is followed hop by hop while it stays on AliExpress", async () => {
  const short = "https://a.aliexpress.com/_mKx1Ab2";
  const star = `https://star.aliexpress.com/share/share.htm?redirectUrl=${encodeURIComponent(`https://www.aliexpress.com/item/${ID}.html`)}`;
  const { fetchImpl } = fakeStore({ redirects: { [short]: star } });
  const r = await resolveMagicLink(short, { fetchImpl });
  assert.deepEqual(r, { itemId: ID, creator: false });
  const away = fakeStore({ redirects: { [short]: "https://evil.example/item/1005006861665924.html" } });
  const calls = [];
  await resolveMagicLink(short, { fetchImpl: async (url, init) => { calls.push(url); return away.fetchImpl(url, init); } });
  assert.deepEqual(calls, [short], "an address outside AliExpress is never requested");
});

test("server: a brand-name item gets the store page and no commission; an unlisted kind gets no button", async () => {
  const brand = fakeStore({ item: storeItem({ product_title: "Pandora style charm bracelet", promotion_link: "" }) });
  const r1 = await call(createMagicHandler({ env: ENV, fetchImpl: brand.fetchImpl }), { u: storePage(ID) });
  assert.equal(r1.body.report.verdict, "LOOK");
  assert.deepEqual([r1.body.report.buy.url, r1.body.report.buy.via], [storePage(ID), "store"]);
  assert.ok(!brand.calls.includes("aliexpress.affiliate.link.generate"));
  const stop = fakeStore({ item: storeItem({ product_title: "slimming weight loss patch" }) });
  const r2 = await call(createMagicHandler({ env: ENV, fetchImpl: stop.fetchImpl }), { u: storePage(ID) });
  assert.equal(r2.body.report.verdict, "STOP");
  assert.equal(r2.body.report.buy.url, "");
});

test("server: no own link in the answer → link.generate once, then cached", async () => {
  const { fetchImpl, calls } = fakeStore({ item: storeItem({ promotion_link: "" }) });
  const h = createMagicHandler({ env: ENV, fetchImpl });
  const a = await call(h, { u: storePage(ID) });
  const b = await call(h, { u: storePage(ID) });
  assert.equal(a.body.report.buy.url, OWN);
  assert.equal(b.body.report.buy.url, OWN);
  assert.deepEqual(calls, ["aliexpress.affiliate.productdetail.get", "aliexpress.affiliate.link.generate"]);
});

test("server: refusals — origin, method, scrapers, other stores, no connection, a burst", async () => {
  const { fetchImpl, calls } = fakeStore();
  const h = createMagicHandler({ env: ENV, fetchImpl, limiter: createRateLimiter({ windowMs: 60_000, max: 2 }) });
  assert.equal((await call(h, { u: storePage(ID), origin: "https://evil.example" })).code, 403);
  assert.equal((await call(h, { u: storePage(ID), method: "POST" })).code, 405);
  assert.equal((await call(h, { u: storePage(ID), ua: "python-requests/2.31" })).code, 403);
  assert.equal((await call(h, { u: "https://www.temu.com/x.html" })).body.reason, "not_aliexpress");
  assert.equal((await call(h, { u: "hello" })).body.reason, "no_link");
  assert.equal((await call(createMagicHandler({ env: {}, fetchImpl }), { u: storePage(ID) })).body.reason, "store_connection_required");
  await call(h, { u: storePage(ID) });
  await call(h, { u: storePage(ID) });
  const burst = await call(h, { u: storePage(ID) });
  assert.equal(burst.code, 429);
  assert.equal(burst.body.reason, "rate_limited");
  assert.ok(calls.length <= 1, "refused requests never reach the store");
});

test("the check and the exit are counted in the owner's numbers (first-party, append-only)", () => {
  const now = Date.now();
  const ctx = { now, actorEmail: "", ownedMarketerIds: new Set() };
  const r = applyStoreWritePolicy("marketplace:funnel", "[]", JSON.stringify([{ id: "m1", type: "magic_check", ts: now, place: "likelink" }]), ctx);
  assert.equal(r.value.length, 1);
  const click = applyStoreWritePolicy("marketplace:clicks", "[]", JSON.stringify([{ id: "c1", productId: `ae-${ID}`, ts: now, med: "magic", camp: "likelink" }]), ctx);
  assert.equal(click.value.length, 1);
  const m = growthMetrics({ funnel: r.value, clicks: click.value, now });
  assert.deepEqual(m.magic, { checks: 1, exits: 1 });
});

test("/magic is a page: route, rewrite, its own head, the share target, the home and the menu", () => {
  assert.deepEqual(parsePath("/magic"), { type: "magic" });
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/magic" && r.destination === "/"));
  assert.equal(SECTION_SEO.magic.path, MAGIC_PATH);
  assert.equal(sectionSeo("magic").canonical.endsWith("/magic"), true);
  assert.equal(JSON.parse(readFileSync("public/manifest.json", "utf8")).share_target.action, "/magic");
  assert.match(readFileSync("src/components/discover/luxe.jsx", "utf8"), /<MagicStrip \/>/);
  assert.match(readFileSync("src/components/discover/PublicShell.jsx", "utf8"), /to: "\/magic", type: "magic"/);
  assert.match(readFileSync("api/store.mjs", "utf8"), /mode'\) === 'magic'/);
});

// ── "מצאי לי באלי": Hebrew words → items that pass the site's rules ──
import { FIND_RULES, findAttempts, findCheck, findResults, parseFind } from "../src/lib/growth/findOnAli.js";

test("find: Hebrew words → the store's words and the budget, from a fixed dictionary only", () => {
  const a = parseFind("עגילי זהב עד 30 ש״ח");
  assert.equal(a.maxPrice, 30);
  assert.equal(a.en, "earrings gold");
  assert.equal(a.complete, true);
  assert.deepEqual(findAttempts(a).map((x) => x.lang), ["en", "he"]);
  const b = parseFind("משהו לכלב שלי עד ₪40");
  assert.equal(b.maxPrice, 40);
  assert.equal(b.en, "dog");
  const c = parseFind("גרגמל");
  assert.equal(c.en, "", "an unknown word is never translated by guess");
  assert.deepEqual(findAttempts(c), [{ keywords: "גרגמל", lang: "he" }]);
  assert.deepEqual(findAttempts(parseFind("   ")), []);
  assert.ok(parseFind("x".repeat(500)).text.length <= 80);
});

const hit = (over = {}) => ({
  product_id: "1005001111111111", product_title: "Gold hoop earrings women", product_main_image_url: "//ae01.alicdn.com/kf/h.jpg",
  target_sale_price: "12.5", target_sale_price_currency: "ILS", evaluate_rate: "96.0%", lastest_volume: 800, promotion_link: "https://s.click.aliexpress.com/e/_own1", commission_rate: "9%", ...over,
});

test("find: an item is left out for a budget, a brand, weak store numbers, no own link or no photo", () => {
  assert.equal(findCheck(hit()), "");
  assert.equal(findCheck(hit(), { maxPrice: 10 }), "over_budget");
  assert.equal(findCheck(hit({ product_title: "Pandora style earrings" })), "brand_name");
  assert.equal(findCheck(hit({ product_title: "slimming earrings" })), "not_listed_kind");
  assert.equal(findCheck(hit({ evaluate_rate: "85%" })), "rating_below_rule");
  assert.equal(findCheck(hit({ lastest_volume: undefined })), "orders_below_rule", "a missing number never passes");
  assert.equal(findCheck(hit({ promotion_link: "" })), "no_own_link");
  assert.equal(findCheck(hit({ target_sale_price_currency: "USD" })), "no_ils_price");
  assert.equal(findCheck(hit({ product_main_image_url: "" })), "no_photo");
});

test("find: results keep the store's order and facts only — no rating, orders or commission", () => {
  const items = Array.from({ length: 20 }, (_, i) => hit({ product_id: String(1005001111111100 + i) }));
  const r = findResults([hit({ product_id: "1005001111111199", evaluate_rate: "50%" }), ...items], { now: 0 });
  assert.equal(r.items.length, FIND_RULES.max);
  assert.equal(r.items[0].id, "1005001111111100");
  assert.equal(r.left.rating_below_rule, 1);
  assert.equal(r.items[0].image, "https://ae01.alicdn.com/kf/h.jpg");
  assert.equal(r.items[0].check, `${MAGIC_PATH}?u=${encodeURIComponent(storePage("1005001111111100"))}`);
  assert.doesNotMatch(JSON.stringify(r.items), /96\.0|800|9%|evaluate|lastest|commission/);
});

test("server find: English first when every word is known, Hebrew next, cached, no credentials in the answer", async () => {
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const body = new URLSearchParams(String(init.body || ""));
    asked.push({ method: body.get("method"), keywords: body.get("keywords"), max: body.get("max_sale_price") });
    const products = body.get("keywords") === "earrings gold" ? [] : [hit(), hit({ product_id: "1005002222222222", target_sale_price: "45" })];
    return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: products } } } } }) };
  };
  const h = createMagicHandler({ env: ENV, fetchImpl });
  const req = (q) => ({ method: "GET", url: `/api/store?mode=magic&q=${encodeURIComponent(q)}`, headers: { origin: "https://likelink2.vercel.app", "user-agent": "Mozilla/5.0", "x-forwarded-for": "9.9.9.9" } });
  const mk = () => ({ code: 200, headers: {}, body: null, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(o) { this.body = o; }, end() {} });
  const res = mk();
  await h(req("עגילי זהב עד 30 ש״ח"), res);
  assert.equal(res.body.ok, true);
  assert.deepEqual(asked.map((a) => a.keywords), ["earrings gold", "עגילי זהב"], "English found nothing, so Hebrew was asked");
  assert.ok(asked.every((a) => a.method === "aliexpress.affiliate.product.query" && a.max === "3000"));
  assert.deepEqual(res.body.items.map((i) => i.id), ["1005001111111111"], "the ₪45 item is over the ₪30 budget");
  assert.equal(res.body.query.asked, "he");
  assert.doesNotMatch(JSON.stringify(res.body), /ALIEXPRESS_(APP|TRACKING)|key_77|secret_77|tid_77/);
  const again = mk();
  await h(req("עגילי זהב עד 30 ש״ח"), again);
  assert.equal(asked.length, 2, "the same search is answered from the cache");
  const empty = mk();
  await h(req("   "), empty);
  assert.equal(empty.body.reason, "no_words");
});

test("site search offers the AliExpress search, and the page has both tabs", () => {
  const pages = readFileSync("src/components/discover/pages.jsx", "utf8");
  assert.match(pages, /\$\{MAGIC_PATH\}\?q=\$\{encodeURIComponent\(q\)\}/);
  const page = readFileSync("src/components/discover/magic.jsx", "utf8");
  assert.match(page, /מצאי לי באלי/);
  assert.match(page, /#פרסומת · קישורי שותפים/);
});

// ── people find it, understand it and come back ──
import { MAGIC_FAQ, RECENT_MAX, addRecent } from "../src/lib/growth/magic.js";

test("the FAQ is on the page and is exactly the FAQ JSON-LD; it promises nothing the button does not do", () => {
  const ld = sectionSeo("magic").jsonLd.find((x) => x["@type"] === "FAQPage");
  assert.deepEqual(ld.mainEntity.map((q) => q.name), MAGIC_FAQ.map((f) => f.q));
  assert.match(readFileSync("src/components/discover/magic.jsx", "utf8"), /MAGIC_FAQ\.map/);
  const all = MAGIC_FAQ.map((f) => f.a).join(" ");
  assert.match(all, /#פרסומת/);
  assert.doesNotMatch(all, /הכי זול|מובטח|100%|ויראלי|מיליון/);
});

test("recent checks: newest first, unique, capped, https photos only", () => {
  let list = [];
  for (let i = 0; i < 9; i += 1) list = addRecent(list, { link: `https://a.aliexpress.com/_${i}`, title: `t${i}`, image: i % 2 ? "https://ae01.alicdn.com/x.jpg" : "javascript:alert(1)" });
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0].link, "https://a.aliexpress.com/_8");
  assert.equal(list[0].image, "", "a non-https photo is dropped");
  list = addRecent(list, { link: "https://a.aliexpress.com/_5", title: "again" });
  assert.equal(list[0].title, "again");
  assert.equal(list.filter((x) => x.link === "https://a.aliexpress.com/_5").length, 1);
});

test("the product pages and the guide lead to the magic button", () => {
  const pages = readFileSync("src/components/discover/pages.jsx", "utf8");
  assert.match(pages, /ראית מוצר אחר באלי\? בדקי אותו בכפתור הקסם/);
  assert.match(pages, /כל 8 הבדיקות על מוצר אחד: כפתור הקסם/);
});

test("Pinterest: the magic button pin only once its real demo frame exists", async () => {
  const { buildPins } = await import("../scripts/pins-feed.mjs");
  assert.equal(buildPins({}).some((p) => p.guid === "tool-magic"), false);
  const pin = buildPins({ magicPin: "promo/magic-pin.jpg", feedBase: "https://x.github.io/likelink" }).find((p) => p.guid === "tool-magic");
  assert.equal(pin.image, "https://x.github.io/likelink/promo/magic-pin.jpg");
  assert.match(pin.link, /\/magic\?/);
  assert.match(pin.description, /#פרסומת/);
});

test("find: the asked kind only, no making supplies; a phone case names the phone it fits without being an imitation", async () => {
  const { brandTitle } = await import("../src/lib/growth/magic.js");
  assert.equal(parseFind("עגילי זהב עד 30 ש״ח").kind, "earrings");
  assert.equal(parseFind("כיסוי לטלפון ורוד").kind, "tech");
  assert.equal(parseFind("טבעת וצמיד").kind, "", "two kinds: no filter");
  const base = hit();
  assert.equal(findCheck({ ...base, product_title: "2/6 יחידות טבעת אף מפלדת אל-חלד בצבע זהב עגילי חישוק" }, { kind: "earrings" }), "other_kind");
  assert.equal(findCheck({ ...base, product_title: "שעון קוורץ נשים זהב טבעת שרשרת עגיל" }, { kind: "earrings" }), "other_kind");
  assert.equal(findCheck({ ...base, product_title: "30-100pcs נירוסטה עגילי ווים אבזם ממצאים בעבודת יד" }, { kind: "earrings" }), "supplies");
  assert.equal(findCheck({ ...base, product_title: "עגילי חישוק קטנים ועדינים בצבע זהב" }, { kind: "earrings" }), "");
  assert.equal(findCheck({ ...base, product_title: "כיסוי סיליקון ורוד לאייפון 15" }, { kind: "tech" }), "", "a case for iPhone is not an imitation");
  assert.equal(findCheck({ ...base, product_title: "Apple AirPods Pro 2 earphones" }, { kind: "tech" }), "brand_name", "the device itself still is");
  assert.equal(brandTitle("Pandora style charm bracelet"), "Pandora style charm bracelet");
});
