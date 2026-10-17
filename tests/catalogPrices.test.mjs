// Store prices → the cloud copy the live site reads (src/lib/cloud/catalogPrices.js,
// op=catalog-prices, scripts/catalog/push-prices.mjs). Since the live pages read
// marketplace:products from the cloud (#118), the daily AliExpress sync must
// reach it too — but only the store fields, only newer checks, only products
// that exist, gallery only from the store's CDN, and verified by read-back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyStorePrices, syncStorePrices, validatePriceUpdate } from "../src/lib/cloud/catalogPrices.js";
import { _resetKvReadGuard } from "../src/lib/cloud/kvReadGuard.js";
import { priceUpdates } from "../scripts/catalog/push-prices.mjs";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const STORED = [
  { id: "p1", title: "טבעת", affiliateUrl: "https://s.click.aliexpress.com/e/_a", status: "approved", marketerId: "m1", price: 130.39, originalPrice: 260.78, currency: "ILS", priceFrom: true, priceSource: "aliexpress_api", priceCheckedAt: "2026-10-16T21:05:56.376Z", images: ["https://ae-pic-a1.aliexpress-media.com/kf/a.png"] },
  { id: "p2", title: "צמיד", affiliateUrl: "https://s.click.aliexpress.com/e/_b", status: "approved", marketerId: "m1", price: 53.31, currency: "ILS", priceSource: "aliexpress_api", priceCheckedAt: "2026-10-16T21:05:56.376Z" },
];
const NEWER = { id: "p1", price: 117.84, originalPrice: 260.37, currency: "ILS", priceFrom: true, priceSource: "aliexpress_api", priceCheckedAt: "2026-10-17T09:18:10.701Z", images: ["https://ae-pic-a1.aliexpress-media.com/kf/b.png"] };

test("only store-API prices, newer than the stored check, for a product that exists, gallery from the store CDN", () => {
  const s = STORED[0];
  assert.equal(validatePriceUpdate(NEWER, s, NOW).ok, true);
  assert.equal(validatePriceUpdate(NEWER, null, NOW).error, "unknown_product");
  assert.equal(validatePriceUpdate({ ...NEWER, priceSource: "catalog" }, s, NOW).error, "price_source_not_store_api");
  assert.equal(validatePriceUpdate({ ...NEWER, priceCheckedAt: s.priceCheckedAt }, s, NOW).error, "not_newer", "an older or equal check never overwrites");
  assert.equal(validatePriceUpdate({ ...NEWER, priceCheckedAt: "2026-10-18T00:00:00Z" }, s, NOW).error, "bad_checked_at", "no check from the future");
  assert.equal(validatePriceUpdate({ ...NEWER, price: 0 }, s, NOW).error, "bad_price");
  assert.equal(validatePriceUpdate({ ...NEWER, currency: "USD" }, s, NOW).error, "bad_currency");
  assert.equal(validatePriceUpdate({ ...NEWER, originalPrice: 100 }, s, NOW).error, "bad_original_price", "a 'was' price is only ever higher");
  assert.equal(validatePriceUpdate({ ...NEWER, images: ["https://images.unsplash.com/x.jpg"] }, s, NOW).error, "bad_image_url");
  assert.equal(validatePriceUpdate({ ...NEWER, images: ["http://ae-pic-a1.aliexpress-media.com/kf/b.png"] }, s, NOW).error, "bad_image_url");
});

test("apply: store fields only, the previous price kept, nothing else touched", () => {
  const sneaky = { ...NEWER, title: "שם אחר", affiliateUrl: "https://evil.example/", status: "pending", marketerId: "m2", videoUrl: "https://x/v.mp4" };
  const r = applyStorePrices(STORED, [sneaky, { ...NEWER, id: "ghost" }], { now: NOW });
  assert.deepEqual(r.refused, [{ id: "ghost", error: "unknown_product" }]);
  const p1 = r.products[0];
  assert.equal(p1.price, 117.84);
  assert.equal(p1.originalPrice, 260.37);
  assert.deepEqual(p1.pricePrevious, { price: 130.39, originalPrice: 260.78, priceCheckedAt: "2026-10-16T21:05:56.376Z" });
  for (const k of ["title", "affiliateUrl", "status", "marketerId"]) assert.equal(p1[k], STORED[0][k], k);
  assert.equal(p1.videoUrl, undefined);
  assert.deepEqual(r.products[1], STORED[1], "a product without an update is untouched");
  // No "was" price in the new check → the stale one is dropped, never kept as a fake discount.
  const { originalPrice: _o, ...noWas } = NEWER;
  assert.equal(applyStorePrices(STORED, [noWas], { now: NOW }).products[0].originalPrice, undefined);
});

function fakeCloud(initial) {
  const kv = new Map([["marketplace:products", JSON.stringify(initial)]]);
  const env = { VITE_SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "SERVICE" };
  const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  const calls = [];
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    calls.push(`${opts.method || "GET"} ${u.hostname}`);
    if (u.pathname === "/rest/v1/kv" && (opts.method || "GET") === "GET") {
      const k = u.searchParams.get("key").replace(/^eq\./, "");
      return json(kv.has(k) ? [{ value: kv.get(k) }] : []);
    }
    if (u.pathname === "/rest/v1/kv" && opts.method === "POST") {
      const { key, value } = JSON.parse(opts.body);
      kv.set(key, value);
      return json({});
    }
    return new Response("unexpected", { status: 500 });
  }
  return { env, fetchImpl, calls, get: (k) => JSON.parse(kv.get(k)) };
}

test("sync: write → read back → VERIFIED, logged; a second run with the same check changes nothing", async () => {
  _resetKvReadGuard();
  const f = fakeCloud(STORED);
  const r = await syncStorePrices({ products: [NEWER] }, { env: f.env, fetchImpl: f.fetchImpl, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.proof.status, "VERIFIED");
  assert.equal(f.get("marketplace:products")[0].price, 117.84);
  assert.equal(f.get("catalog:prices:log").at(-1).status, "VERIFIED");
  assert.ok(f.calls.every((c) => c.endsWith("sb.test")), "only the cloud is contacted — never the store or a provider");
  const again = await syncStorePrices({ products: [NEWER] }, { env: f.env, fetchImpl: f.fetchImpl, now: NOW });
  assert.equal(again.proof.status, "NOTHING_NEWER");
  assert.deepEqual(again.refused, [{ id: "p1", error: "not_newer" }]);
});

test("sync: a failed read writes nothing (503)", async () => {
  _resetKvReadGuard();
  const writes = [];
  const fetchImpl = async (url, opts = {}) => { if (opts.method === "POST") writes.push(url); return new Response("down", { status: 402 }); };
  const r = await syncStorePrices({ products: [NEWER] }, { env: { VITE_SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "S" }, fetchImpl, now: NOW });
  assert.equal(r.status, 503);
  assert.deepEqual(writes, []);
  _resetKvReadGuard();
});

test("wiring: machine auth only, the sync calls it after the copy is committed, the runner sends only store fields", () => {
  const handler = readFileSync(new URL("../api/_utils/mediaPipelineHandler.mjs", import.meta.url), "utf8");
  const gate = handler.indexOf('if (!isAuthorizedCron(req, [process.env.AUTOPILOT_SECRET])) return send(res, 401');
  assert.ok(gate > 0 && handler.indexOf('op === "catalog-prices"') > gate, "op=catalog-prices sits behind the machine-secret gate");
  const wf = readFileSync(new URL("../.github/workflows/catalog-sync.yml", import.meta.url), "utf8");
  assert.ok(wf.indexOf("node scripts/catalog/push-prices.mjs") > wf.indexOf("git push origin HEAD:main"));
  assert.match(wf, /AUTOPILOT_SECRET: \$\{\{ secrets\.AUTOPILOT_SECRET \}\}/);
  const kv = { keys: { "marketplace:products": [{ ...STORED[0], status: "approved" }, { id: "draft", status: "pending", price: 9, priceSource: "aliexpress_api" }, { id: "hand", status: "approved", price: 9, priceSource: "catalog" }] } };
  const rows = priceUpdates(kv);
  assert.deepEqual(rows.map((r) => r.id), ["p1"]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["currency", "id", "images", "originalPrice", "price", "priceCheckedAt", "priceFrom", "priceSource"]);
});
