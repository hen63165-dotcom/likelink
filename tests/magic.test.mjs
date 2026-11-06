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
