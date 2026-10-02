// The owner's AliExpress affiliate account is the only source of a new tracked
// link. Nothing runs without its credentials; every import is read back and
// idempotent; a product without a real link, image or price is never imported.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signParams, toProduct, importHotProducts, repairSharedLinks, aeStatus, dailyAffiliateImport } from "../api/_utils/aliexpressAffiliate.mjs";
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

test("without the owner's credentials nothing is called", async () => {
  assert.deepEqual(aeStatus({}).missing, ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"]);
  let called = false;
  const r = await importHotProducts({ ...kvOf({}), env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(r.error, "requires_connection"); assert.equal(called, false);
  assert.equal((await dailyAffiliateImport({ ...kvOf({}), env: {} })).outcome, "REQUIRES_CONNECTION");
});

test("hot products import: real fields only, own link, read back, idempotent", async () => {
  assert.equal(toProduct(item("1", { promotion_link: "https://www.aliexpress.com/" }), { marketerId: "m" }), null, "no own tracked link → never imported");
  assert.equal(toProduct(item("1", { target_sale_price: "0" }), { marketerId: "m" }), null);
  const kv = kvOf({ "marketplace:products": [{ id: "x", affiliateUrl: "https://s.click.aliexpress.com/e/_own2" }] });
  const payload = { aliexpress_affiliate_hotproduct_query_response: { resp_result: { resp_code: 200, result: { products: { product: [item("1"), item("2"), item("3")] } } } } };
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl: fetchWith(payload), now: NOW });
  assert.equal(r.ok, true); assert.deepEqual(r.ids, ["ae-1", "ae-3"], "a link we already have is not imported twice");
  assert.match(fetchWith.last.body, /tracking_id=t/); assert.match(fetchWith.last.body, /ship_to_country=IL/);
  const p = kv.db.get("marketplace:products").find((x) => x.id === "ae-1");
  assert.equal(p.marketerId, "msd6go4kff49s5"); assert.equal(p.category, "Accessories"); assert.equal(p.imageSource.provenance, "merchant_photo");
  const again = await importHotProducts({ ...kv, env: ENV, fetchImpl: fetchWith(payload), now: NOW });
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
