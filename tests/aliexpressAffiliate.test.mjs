// The owner's AliExpress affiliate account is the only source of a new tracked
// link. Nothing runs without its credentials; every import is read back and
// idempotent; a product without a real link, image or price is never imported.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signParams, toProduct, importHotProducts, repairSharedLinks, aeEnv, aeStatus, dailyAffiliateImport } from "../api/_utils/aliexpressAffiliate.mjs";
import { sharedAffiliateLinks } from "../src/lib/discovery/catalogIntegrity.js";

const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
const NOW = Date.parse("2026-10-02T10:00:00Z");
const item = (id, extra = {}) => ({ product_id: id, product_title: `Ring ${id}`, product_main_image_url: `https://ae01.alicdn.com/kf/${id}.jpg`, target_sale_price: "19.90", target_sale_price_currency: "ILS", promotion_link: `https://s.click.aliexpress.com/e/_own${id}`, product_detail_url: `https://www.aliexpress.com/item/${id}.html`, first_level_category_name: "Jewelry & Accessories", ...extra });
const kvOf = (seed) => { const db = new Map(Object.entries(seed)); return { db, kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb), kvSet: async (k, v) => { db.set(k, structuredClone(v)); } }; };
const fetchWith = (payload) => async (url, init) => { fetchWith.last = { url, body: String(init.body) }; return { ok: true, status: 200, json: async () => payload }; };

test("signature = HMAC-SHA256 over the sorted key+value pairs, upper hex, sign excluded", () => {
  const sig = signParams({ b: "2", a: "1", sign: "x", empty: "" }, "secret");
  assert.equal(sig, crypto.createHmac("sha256", "secret").update("a1b2").digest("hex").toUpperCase());
});

test("pasted credentials are trimmed: a line break around the key is not an InvalidAppKey (2026-10-16)", async () => {
  const padded = { ALIEXPRESS_APP_KEY: "\nk  ", ALIEXPRESS_APP_SECRET: "\r\ns\n", ALIEXPRESS_TRACKING_ID: " t\n" };
  assert.deepEqual(aeEnv(padded), ENV);
  assert.equal(aeStatus({ ALIEXPRESS_APP_KEY: " \n", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" }).configured, false, "whitespace only is missing");
  const payload = { aliexpress_affiliate_hotproduct_query_response: { resp_result: { resp_code: 200, result: { products: { product: [] } } } } };
  await importHotProducts({ ...kvOf({ "marketplace:products": [{ id: "x" }] }), env: padded, fetchImpl: fetchWith(payload), now: NOW });
  const sent = Object.fromEntries(new URLSearchParams(fetchWith.last.body));
  assert.equal(sent.app_key, "k"); assert.equal(sent.tracking_id, "t");
  const { sign, ...rest } = sent;
  assert.equal(sign, signParams(rest, "s"), "signed with the trimmed secret");
});

test("the sync report says none for a missing previous price, never ₪NaN or ₪0", async () => {
  const { previousPrice } = await import("../scripts/catalog/sync-aliexpress.mjs");
  for (const v of [undefined, null, "", "   ", "abc"]) assert.equal(previousPrice(v), "none", JSON.stringify(v));
  assert.equal(previousPrice(39.9), "₪39.9");
  assert.equal(previousPrice(" 12 "), "₪12");
});

test("without the owner's credentials nothing is called", async () => {
  assert.deepEqual(aeStatus({}).missing, ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"]);
  let called = false;
  const r = await importHotProducts({ ...kvOf({}), env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(r.error, "requires_connection"); assert.equal(called, false);
  assert.equal((await dailyAffiliateImport({ ...kvOf({}), env: {} })).outcome, "REQUIRES_CONNECTION");
});

test("deals import: real fields only, own link, cheap + well rated by AliExpress, read back, idempotent", async () => {
  assert.equal(toProduct(item("1", { promotion_link: "https://www.aliexpress.com/" }), { marketerId: "m" }), null, "no own tracked link → never imported");
  assert.equal(toProduct(item("1", { target_sale_price: "0" }), { marketerId: "m" }), null);
  // 2026-10-26, the owner: cheap, hot, high-rated deals in every category. The
  // numbers are AliExpress's own (evaluate_rate, lastest_volume), used to choose only.
  const deal = (id, extra = {}) => item(id, { evaluate_rate: "97.5%", lastest_volume: 1500, target_original_price: "39.80", ...extra });
  const kv = kvOf({ "marketplace:products": [{ id: "x", affiliateUrl: "https://s.click.aliexpress.com/e/_own1005002" }] });
  const payload = { aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: [
    deal("1005001"), deal("1005002"), deal("1005003"),
    deal("1005004", { evaluate_rate: "93.8%" }), deal("1005005", { lastest_volume: 40 }), deal("1005006", { target_sale_price: "120" }),
    deal("1005007", { product_title: "Pandora style charm ring" }), deal("1005008", { evaluate_rate: undefined }),
  ] } } } } };
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl: fetchWith(payload), now: NOW, perCategory: 5, categoryCount: 1 });
  assert.equal(r.ok, true); assert.deepEqual(r.ids, ["ae-1005001", "ae-1005003"], "a link we already have is not imported twice; below 95%, few orders, above the category's price, a brand's name or no rating → not imported");
  assert.match(fetchWith.last.body, /tracking_id=t/); assert.match(fetchWith.last.body, /ship_to_country=IL/); assert.match(fetchWith.last.body, /target_currency=ILS/);
  const p = kv.db.get("marketplace:products").find((x) => x.id === "ae-1005001");
  assert.equal(p.marketerId, "msd6go4kff49s5"); assert.equal(p.category, "Accessories"); assert.equal(p.kind, "rings"); assert.equal(p.imageSource.provenance, "merchant_photo");
  assert.equal(p.priceSource, "aliexpress_api"); assert.equal(p.originalPrice, 39.8);
  assert.doesNotMatch(JSON.stringify(p), /evaluate_rate|lastest_volume|97\.5|1500|commission/, "the rating, orders and commission are never stored");
  assert.equal(kv.db.get("affiliate:aliexpress:last").cursor, 1, "the next run searches the next category");
  const again = await importHotProducts({ ...kv, env: ENV, fetchImpl: fetchWith(payload), now: NOW, perCategory: 5, categoryCount: 1 });
  assert.equal(again.imported, 0);
});

test("shared-link repair: only products with a known store page, previous link kept; the rest named for the owner", async () => {
  const shared = "https://s.click.aliexpress.com/e/_shared";
  const kv = kvOf({ "marketplace:products": [
    { id: "a", affiliateUrl: shared, imageSource: { itemUrl: "https://www.aliexpress.com/item/11.html" } },
    { id: "b", affiliateUrl: shared },
  ] });
  const payload = { aliexpress_affiliate_link_generate_response: { resp_result: { result: { promotion_links: { promotion_link: [{ source_value: "https://www.aliexpress.com/item/11.html", promotion_link: "https://s.click.aliexpress.com/e/_new11" }] } } } } };
  const r = await repairSharedLinks({ ...kv, env: ENV, fetchImpl: fetchWith(payload), now: NOW, sharedAffiliateLinks });
  assert.deepEqual([r.repaired, r.needsOwnerLink], [1, ["b"]]);
  const a = kv.db.get("marketplace:products")[0];
  assert.equal(a.affiliateUrl, "https://s.click.aliexpress.com/e/_new11"); assert.equal(a.affiliateSource.previous, shared);
});

test("the scheduled marketing-engine job runs the daily affiliate import (keys alone must be enough)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/cloud/autonomousJobs.js", import.meta.url), "utf8");
  const job = src.slice(src.indexOf('registerJob("marketing-engine"'));
  assert.match(job.slice(0, 1500), /dailyAffiliateImport\(/);
});

// The Studio's "בדיקת הקישור" (/api/fetch-product-info): the store's page answers
// servers with a slider check, so an AliExpress link is read from the owner's
// affiliate account instead (2026-10-17: a pasted s.click link filled nothing).
test("Studio link check: an AliExpress link → the store's title, photos and ILS price from productdetail.get", async () => {
  const { aliexpressProductInfo, aliexpressItemId, aliexpressItemFromLink } = await import("../api/_utils/aliexpressAffiliate.mjs");
  assert.equal(aliexpressItemId("https://he.aliexpress.com/item/1005004921269497.html?spm=x"), "1005004921269497");
  assert.equal(aliexpressItemId("https://www.aliexpress.us/item/3256804734954745.html"), "1005004921269497", "aliexpress.us ids are the global id + 2^51");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), redirect: init.redirect });
    if (String(url).startsWith("https://s.click.aliexpress.com/")) {
      return { ok: false, status: 302, headers: new Headers({ location: "https://www.aliexpress.com/item/1005004921269497.html?aff=x" }), text: async () => "" };
    }
    const sent = Object.fromEntries(new URLSearchParams(String(init.body)));
    assert.equal(sent.method, "aliexpress.affiliate.productdetail.get");
    assert.equal(sent.product_ids, "1005004921269497");
    assert.equal(sent.target_currency, "ILS");
    return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: [
      item("1005004921269497", { product_title: "טבעת מויסנייט", product_main_image_url: "//ae01.alicdn.com/kf/main.jpg", product_small_image_urls: { string: ["https://ae01.alicdn.com/kf/2.jpg", "//ae01.alicdn.com/kf/main.jpg"] }, target_sale_price: "130.39" }),
    ] } } } } }) };
  };
  const info = await aliexpressProductInfo("https://s.click.aliexpress.com/e/_c3qcPQUv", { env: ENV, fetchImpl, now: NOW });
  assert.equal(info.title, "טבעת מויסנייט");
  assert.equal(info.image, "https://ae01.alicdn.com/kf/main.jpg", "protocol-relative photo addresses become https");
  assert.deepEqual(info.images, ["https://ae01.alicdn.com/kf/main.jpg", "https://ae01.alicdn.com/kf/2.jpg"]);
  assert.equal(info.price, 130.39);
  assert.equal(info.currency, "ILS");
  assert.equal(info.source, "aliexpress_api");
  assert.equal(calls[0].redirect, "manual", "the tracked link is asked once; its redirect is not followed");
  assert.equal(calls.length, 2);

  // Not connected → nothing is called; another store → nothing is called; a host that only looks like AliExpress → nothing is called.
  calls.length = 0;
  assert.equal(await aliexpressProductInfo("https://s.click.aliexpress.com/e/_x", { env: {}, fetchImpl, now: NOW }), null);
  assert.equal(await aliexpressProductInfo("https://www.amazon.com/dp/B000", { env: ENV, fetchImpl, now: NOW }), null);
  assert.equal(await aliexpressItemFromLink("https://s.click.aliexpress.com.evil.example/e/_x", fetchImpl), "");
  assert.equal(await aliexpressItemFromLink("http://s.click.aliexpress.com/e/_x", fetchImpl), "", "https only");
  assert.equal(calls.length, 0);

  // A price that is not in shekels is not shown as one.
  const usd = async (url, init = {}) => (String(url).includes("/item/") || init.method !== "POST"
    ? { ok: false, status: 302, headers: new Headers({}), text: async () => "" }
    : { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: [item("1005004921269497", { target_sale_price_currency: "USD" })] } } } } }) });
  const noIls = await aliexpressProductInfo("https://www.aliexpress.com/item/1005004921269497.html", { env: ENV, fetchImpl: usd, now: NOW });
  assert.equal(noIls.price, null);
  assert.equal(noIls.currency, null);
});

// 2026-10-25: the owner pasted an AliExpress link and got "could not fetch" — the
// affiliate keys were in GitHub only, not on the server. The answer now says why,
// and the page ladder (which AliExpress always blocks) is never tried for these links.
test("Studio link check: an AliExpress link gets the store's data or the exact reason, never the page ladder", async () => {
  const { aliexpressLinkPreview, isAliExpressLink } = await import("../api/_utils/aliexpressAffiliate.mjs");
  assert.equal(isAliExpressLink("https://s.click.aliexpress.com/e/_c3qcPQUv"), true);
  assert.equal(isAliExpressLink("https://he.aliexpress.com/item/1005004921269497.html"), true);
  assert.equal(isAliExpressLink("https://s.click.aliexpress.com.evil.example/e/_x"), false);
  assert.equal(isAliExpressLink("https://www.amazon.com/dp/B000"), false);
  let called = 0;
  const silent = async () => { called += 1; throw new Error("must not be called"); };
  const missing = await aliexpressLinkPreview("https://s.click.aliexpress.com/e/_x", { env: {}, fetchImpl: silent, now: NOW });
  assert.deepEqual(missing, { reason: "store_connection_required", store: "aliexpress" });
  assert.doesNotMatch(JSON.stringify(missing), /ALIEXPRESS_|APP_KEY|SECRET/, "no credential names reach the browser");
  assert.equal(await aliexpressLinkPreview("https://www.amazon.com/dp/B000", { env: ENV, fetchImpl: silent, now: NOW }), null, "other stores keep the page ladder");
  assert.equal(called, 0);
  const notReturned = async (url, init = {}) => (init.method === "POST"
    ? { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: [] } } } } }) }
    : { ok: false, status: 302, headers: new Headers({}), text: async () => "" });
  assert.deepEqual(await aliexpressLinkPreview("https://www.aliexpress.com/item/1005004921269497.html", { env: ENV, fetchImpl: notReturned, now: NOW }),
    { reason: "store_not_returned", store: "aliexpress" });
  const down = async () => { throw new Error("network"); };
  assert.equal((await aliexpressLinkPreview("https://www.aliexpress.com/item/1005004921269497.html", { env: ENV, fetchImpl: down, now: NOW })).reason, "store_not_returned");
});

test("wiring: /api/fetch-product-info answers AliExpress links before the page ladder, with the reason", async () => {
  const { readFileSync } = await import("node:fs");
  const og = readFileSync(new URL("../api/og.mjs", import.meta.url), "utf8");
  const handler = og.slice(og.indexOf("async function fetchProductInfoHandler"));
  const at = handler.indexOf("aliexpressLinkPreview(");
  assert.ok(at > 0 && at < handler.indexOf("for (const strategy of FPI_STRATEGIES)"));
  assert.match(handler.slice(at, handler.indexOf("for (const strategy of FPI_STRATEGIES)")), /reason: ae\.reason/);
  // The Studio says why, by reason.
  const studio = readFileSync(new URL("../src/components/studio/AddProductLink.jsx", import.meta.url), "utf8");
  assert.match(studio, /store_connection_required/);
  assert.match(studio, /store_not_returned/);
  const client = readFileSync(new URL("../src/lib/productInfo.js", import.meta.url), "utf8");
  assert.match(client, /info\.reason/);
});
