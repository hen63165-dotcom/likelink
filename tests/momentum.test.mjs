// Demand momentum (the owner, 2026-10-26: "only items that are viral and hot
// while the market is not yet saturated — the next hit"). AliExpress's own
// order count, read on different days: rising demand first, cooling never
// added, one reading proves nothing, and no number reaches a product.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOMENTUM, byMomentum, momentumIndex, momentumOf, momentumSummary, recordReadings } from "../src/lib/growth/momentum.js";
import { importHotProducts } from "../api/_utils/aliexpressAffiliate.mjs";
import { DEAL_CATEGORIES } from "../src/lib/growth/deals.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-26T12:00:00Z");
const ago = (d) => NOW - d * DAY;
const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
const deal = (id, v, extra = {}) => ({
  product_id: id, product_title: `טבעת ${id}`, product_main_image_url: `https://ae01.alicdn.com/kf/${id}.jpg`,
  target_sale_price: "19.90", target_sale_price_currency: "ILS", target_original_price: "39.80", evaluate_rate: "97.5%", lastest_volume: v,
  promotion_link: `https://s.click.aliexpress.com/e/_own${id}`, product_detail_url: `https://www.aliexpress.com/item/${id}.html`, ...extra,
});

test("one reading per item per day; the newest readings kept; bad rows and old items dropped", () => {
  let s = recordReadings(null, [deal("1005001", 100), deal("bad", 5), deal("1005002", undefined)], { category: "rings", now: ago(3) });
  assert.deepEqual(Object.keys(s.items), ["1005001"], "an id that is not an item number, or no order count, is not recorded");
  // A missing count the same day never replaces a real reading with zero (Number(null) is 0).
  for (const v of [null, "", "  ", "abc"]) {
    const same = recordReadings(s, [deal("1005001", v)], { category: "rings", now: ago(3) + 60_000 });
    assert.deepEqual(same.items["1005001"].r, [["2026-10-23", 100]], JSON.stringify(v));
  }
  assert.deepEqual(recordReadings(null, [deal("1005003", 0)], { now: NOW }).items["1005003"].r, [["2026-10-26", 0]], "a real zero is a reading");
  s = recordReadings(s, [deal("1005001", 110)], { category: "rings", now: ago(3) + 3_600_000 });
  assert.deepEqual(s.items["1005001"].r, [["2026-10-23", 110]], "a later reading the same day replaces it");
  for (let d = 2; d >= 0; d--) s = recordReadings(s, [deal("1005001", 120 + d)], { category: "rings", now: ago(d) });
  assert.equal(s.items["1005001"].r.length, 4);
  let many = s;
  for (let d = 0; d < MOMENTUM.maxReadings + 4; d++) many = recordReadings(many, [deal("1005001", d)], { now: NOW + d * DAY });
  assert.equal(many.items["1005001"].r.length, MOMENTUM.maxReadings);
  assert.equal(many.items["1005001"].c, "rings", "the category stays when a later read does not name one");
  const old = recordReadings({ items: { "1005009": { c: "rings", r: [["2026-09-01", 50]] } } }, [deal("1005001", 1)], { now: NOW });
  assert.equal(old.items["1005009"], undefined, `not seen for ${MOMENTUM.forgetDays}+ days → forgotten`);
  const big = recordReadings(null, Array.from({ length: 30 }, (_, i) => deal(String(1005100 + i), i)), { now: NOW, rules: { ...MOMENTUM, maxItems: 10 } });
  assert.equal(Object.keys(big.items).length, 10);
});

test("rising, steady, cooling — and one reading, or an old one, is not known", () => {
  const e = (...r) => ({ r });
  assert.equal(momentumOf(e(["2026-10-26", 500]), { now: NOW }).state, "UNVERIFIED", "one reading says nothing");
  assert.equal(momentumOf(e(["2026-10-25", 400], ["2026-10-26", 600]), { now: NOW }).state, "UNVERIFIED", `under ${MOMENTUM.minDays} days apart`);
  assert.deepEqual(momentumOf(e(["2026-10-23", 400], ["2026-10-26", 520]), { now: NOW }), { state: "RISING", growth: 30, days: 3, readings: 2 });
  assert.equal(momentumOf(e(["2026-10-23", 400], ["2026-10-26", 440]), { now: NOW }).state, "STEADY");
  assert.equal(momentumOf(e(["2026-10-23", 400], ["2026-10-26", 300]), { now: NOW }).state, "COOLING");
  assert.equal(momentumOf(e(["2026-10-01", 100], ["2026-10-05", 900]), { now: NOW }).state, "UNVERIFIED", "a week-old reading is not current");
  assert.equal(momentumOf(e(["2026-10-01", 100], ["2026-10-26", 900]), { now: NOW }).state, "UNVERIFIED", `nothing inside ${MOMENTUM.windowDays} days to compare`);
  assert.equal(momentumOf(e(["2026-10-23", 0], ["2026-10-26", 400]), { now: NOW }).state, "RISING", "from zero is growth, never a division by zero");
  assert.equal(momentumOf({ r: [["x", "y"], null] }, { now: NOW }).state, "UNVERIFIED");
});

test("re-ordering: rising first by growth, cooling dropped, the rest in the deals order", () => {
  const index = new Map([
    ["1005002", { state: "RISING", growth: 25 }], ["1005003", { state: "RISING", growth: 80 }],
    ["1005004", { state: "COOLING", growth: -30 }], ["1005005", { state: "STEADY", growth: 2 }],
  ]);
  const list = ["1005001", "1005002", "1005003", "1005004", "1005005"].map((id) => deal(id, 1000));
  assert.deepEqual(byMomentum(list, index).map((x) => x.product_id), ["1005003", "1005002", "1005001", "1005005"]);
  assert.deepEqual(momentumSummary(index), { tracked: 4, RISING: 2, STEADY: 1, COOLING: 1, UNVERIFIED: 0 });
});

test("the daily import: every category read, rising demand anywhere first, cooling never added, no number on a product", async () => {
  const pets = DEAL_CATEGORIES.find((c) => c.key === "pets");
  const rings = DEAL_CATEGORIES.find((c) => c.key === "rings");
  const byKeywords = {
    [rings.keywords]: [deal("1005010", 5000), deal("1005011", 4000), deal("1005012", 3000)],
    [pets.keywords]: [deal("1005020", 900, { product_title: "קערה לכלב" }), deal("1005021", 800, { product_title: "צעצוע לחתול" })],
  };
  const asked = [];
  const fetchImpl = async (url, init) => {
    const kw = new URLSearchParams(String(init.body)).get("keywords");
    asked.push(kw);
    const product = byKeywords[kw] || [];
    return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product } } } } }) };
  };
  const db = new Map([
    ["marketplace:products", [{ id: "x", affiliateUrl: "https://s.click.aliexpress.com/e/_x" }]],
    // Three days ago: the pet bowl had 600 orders (now 900: rising), the ring 1005010 had 7000 (now 5000: cooling).
    ["deals:momentum", { v: 1, items: { "1005020": { c: "pets", r: [["2026-10-23", 600]] }, "1005010": { c: "rings", r: [["2026-10-23", 7000]] } } }],
  ]);
  const kv = { kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb), kvSet: async (k, v) => { db.set(k, structuredClone(v)); } };
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl, now: NOW, limit: 3, perCategory: 2, categoryCount: 1 });
  assert.equal(r.ok, true);
  assert.equal(asked.length, DEAL_CATEGORIES.length, "every category is read once (each one's readings, every day)");
  assert.equal(asked[0], rings.keywords, "the rotation's category is read first");
  assert.deepEqual(r.ids, ["ae-1005020", "ae-1005011", "ae-1005012"], "the rising pet bowl first, though pets is not in today's rotation; the cooling ring never");
  assert.deepEqual(r.why, { "ae-1005020": "rising", "ae-1005011": "rotation", "ae-1005012": "rotation" });
  assert.equal(r.rules, "deals-v2-momentum");
  assert.deepEqual({ ...r.momentum }, { tracked: 5, RISING: 1, STEADY: 0, COOLING: 1, UNVERIFIED: 3, saved: true });
  const store = db.get("deals:momentum");
  assert.deepEqual(store.items["1005020"].r, [["2026-10-23", 600], ["2026-10-26", 900]]);
  assert.equal(store.items["1005011"].c, "rings");
  const added = db.get("marketplace:products").filter((p) => p.id.startsWith("ae-"));
  assert.equal(added.length, 3);
  assert.doesNotMatch(JSON.stringify(added), /lastest_volume|evaluate_rate|momentum|growth|RISING|900|97\.5/, "no order count, rating or momentum on a product");
  assert.doesNotMatch(JSON.stringify(db.get("affiliate:aliexpress:last")), /"1005020"|\b900\b|\b600\b/, "the import log names products, never their numbers");
});

test("a momentum store that could not be read is never written over; the import still runs", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: [deal("1005030", 1000)] } } } } }) });
  const db = new Map([["marketplace:products", [{ id: "x", affiliateUrl: "https://s.click.aliexpress.com/e/_x" }]]]);
  const kv = {
    kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb),
    kvSet: async (k, v) => { if (k === "deals:momentum") throw Object.assign(new Error("kv_read_failed:deals:momentum"), { code: "kv_read_failed" }); db.set(k, structuredClone(v)); },
  };
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl, now: NOW, categoryCount: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.momentum.saved, false);
  assert.deepEqual(r.ids, ["ae-1005030"]);
  assert.equal(db.has("deals:momentum"), false);
});

test("a slow AliExpress never stalls the job: reads stop at the time budget, the rotation first", async () => {
  let calls = 0;
  const signals = [];
  const fetchImpl = async (url, init) => { calls += 1; signals.push(init.signal); await new Promise((ok) => setTimeout(ok, 30)); return { ok: true, status: 200, json: async () => ({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: [] } } } } }) }; };
  const db = new Map([["marketplace:products", [{ id: "x" }]]]);
  const kv = { kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb), kvSet: async (k, v) => { db.set(k, structuredClone(v)); } };
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl, now: NOW, budgetMs: 10 });
  assert.ok(calls < DEAL_CATEGORIES.length, `${calls} reads`);
  assert.ok(r.searched.some((s) => s.error === "time_budget"));
  assert.ok(!r.searched.slice(0, 3).some((s) => s.error), "the rotation's categories were read");
  assert.ok(signals.every((x) => x instanceof AbortSignal), "every request carries a timeout");
});

test("each request gets only what is left of the budget", async () => {
  // A request that never answers is cut at the budget, not after AliExpress's usual 15 s.
  const hang = (url, init) => new Promise((_, fail) => init.signal.addEventListener("abort", () => fail(init.signal.reason)));
  const db = new Map([["marketplace:products", [{ id: "x" }]]]);
  const kv = { kvGet: async (k, fb) => (db.has(k) ? structuredClone(db.get(k)) : fb), kvSet: async (k, v) => { db.set(k, structuredClone(v)); } };
  const t0 = Date.now();
  // Node does not keep the process alive for AbortSignal.timeout alone; a server does.
  const alive = setInterval(() => {}, 50);
  const r = await importHotProducts({ ...kv, env: ENV, fetchImpl: hang, now: NOW, budgetMs: 300 }).finally(() => clearInterval(alive));
  const took = Date.now() - t0;
  assert.ok(took < 2_000, `the run ended in ${took} ms`);
  assert.ok(r.searched.every((s) => s.error), "nothing was read, nothing pretended");
  assert.equal(r.imported, 0);
});

test("the store is server-only and the site never shows momentum", () => {
  const lockdown = readFileSync(new URL("../supabase/migrations/20260928000000_kv_lockdown.sql", import.meta.url), "utf8");
  assert.doesNotMatch(lockdown, /deals:momentum/);
  const policy = readFileSync(new URL("../api/_utils/storeWritePolicy.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(policy, /deals:momentum/, "the browser cannot write it");
  for (const f of ["src/components/discover/kit.jsx", "src/components/discover/luxe.jsx", "src/lib/publicDiscovery.js"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /momentum|RISING/, f);
  }
});
