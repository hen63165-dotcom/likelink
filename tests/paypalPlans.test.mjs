// PayPal subscription plans — provisioned in ILS at exactly the site's prices.
//
// The customer must be billed what the site shows (₪29 / ₪79 / ₪199 and the
// yearly prices), not a USD conversion. Provisioning is idempotent: PayPal
// does not reject duplicate plan names, so an existing ACTIVE plan with the
// same name/currency/price is looked up and adopted before anything is
// created; a failed lookup creates nothing; failed plans are retried later.
// Only Starter + Professional exist at PayPal (4 plans); Elite is a waitlist
// teaser and is never created. It never creates a subscription and never charges. The provisioning action
// is admin / platform-owner only.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
const PP = "https://api-m.paypal.com"; // live base (no PAYPAL_ENV, live-looking secret)
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.PAYPAL_CLIENT_ID = "live-client-id-test";
process.env.PAYPAL_CLIENT_SECRET = "live-client-secret-test";
process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-tests-only";
process.env.OWNER_EMAIL = "owner@likelink.test";
delete process.env.PAYPAL_ENV;

const kv = new Map();
const USERS = { "tok-owner": { id: "u-owner", email: "owner@likelink.test" }, "tok-user": { id: "u-user", email: "someone@likelink.test" } };
const paypal = { products: [], plans: [], calls: [], failPlanPost: new Set(), failList: false };
let nextId = 1;
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const headers = init.headers || {};
  if (u.startsWith(PP)) paypal.calls.push(`${method} ${u.replace(PP, "")}`);
  if (u.startsWith(`${SB}/auth/v1/user`)) {
    const tok = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    return USERS[tok] ? jsonResponse(200, USERS[tok]) : jsonResponse(401, {});
  }
  if (u.startsWith(`${SB}/rest/v1/kv?key=eq.`)) {
    const key = decodeURIComponent(u.split("key=eq.")[1].split("&")[0]);
    return jsonResponse(200, kv.has(key) ? [{ value: kv.get(key) }] : []);
  }
  if (u.startsWith(`${SB}/rest/v1/kv?on_conflict=key`) && method === "POST") {
    const b = JSON.parse(init.body);
    kv.set(b.key, typeof b.value === "string" ? b.value : JSON.stringify(b.value));
    return jsonResponse(201, {});
  }
  if (u.startsWith(SB)) return jsonResponse(200, []);
  if (u === `${PP}/v1/oauth2/token`) return jsonResponse(200, { access_token: "pp-live-token" });
  if (u.startsWith(`${PP}/v1/catalog/products`) && method === "GET") return jsonResponse(200, { products: paypal.products });
  if (u === `${PP}/v1/catalog/products` && method === "POST") {
    const p = { id: `PROD-${nextId++}`, ...JSON.parse(init.body) };
    paypal.products.push(p);
    return jsonResponse(201, p);
  }
  if (u.startsWith(`${PP}/v1/billing/plans?`) && method === "GET") {
    if (paypal.failList) return jsonResponse(500, { name: "INTERNAL_SERVER_ERROR" });
    const productId = new URL(u).searchParams.get("product_id");
    return jsonResponse(200, { plans: paypal.plans.filter((p) => p.product_id === productId).map(({ id, name, status, product_id }) => ({ id, name, status, product_id })) });
  }
  if (u.startsWith(`${PP}/v1/billing/plans/`) && method === "GET") {
    const id = decodeURIComponent(u.split("/v1/billing/plans/")[1]);
    const p = paypal.plans.find((x) => x.id === id);
    return p ? jsonResponse(200, p) : jsonResponse(404, {});
  }
  if (u === `${PP}/v1/billing/plans` && method === "POST") {
    const body = JSON.parse(init.body);
    if ([...paypal.failPlanPost].some((n) => body.name.includes(n))) return jsonResponse(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "TEST_FAILURE" }] });
    const p = { id: `P-${nextId++}`, status: "ACTIVE", ...body };
    paypal.plans.push(p);
    return jsonResponse(201, p);
  }
  return jsonResponse(404, {});
};

function reset() {
  kv.clear();
  paypal.products = []; paypal.plans = []; paypal.calls = []; paypal.failPlanPost = new Set(); paypal.failList = false;
}

test("plans are created in ILS at exactly the site's prices, with PayPal idempotency keys", async () => {
  reset();
  const { ensureBillingPlans, _resetPayPalCaches, PLAN_CURRENCY } = await import("../api/_utils/paypal.js");
  _resetPayPalCaches();
  const report = { created: [], adopted: [], failed: [] };
  const kvGet = async (k, fb) => (kv.has(k) ? JSON.parse(kv.get(k)) : fb);
  const kvSet = async (k, v) => { kv.set(k, JSON.stringify(v)); };
  const map = await ensureBillingPlans({ kvGet, kvSet, report });
  assert.equal(PLAN_CURRENCY, "ILS");
  assert.equal(report.created.length, 4);
  assert.equal(report.failed.length, 0);
  const prices = Object.fromEntries(paypal.plans.map((p) => [p.name, `${p.billing_cycles[0].pricing_scheme.fixed_price.value} ${p.billing_cycles[0].pricing_scheme.fixed_price.currency_code}`]));
  assert.deepEqual(prices, {
    "LikeLink Starter Monthly (ILS)": "29.00 ILS", "LikeLink Starter Yearly (ILS)": "290.00 ILS",
    "LikeLink Professional Monthly (ILS)": "79.00 ILS", "LikeLink Professional Yearly (ILS)": "790.00 ILS",
  });
  assert.equal(paypal.products.length, 1);
  assert.equal(JSON.parse(kv.get("marketplace:paypal_plans")).currency, "ILS");
  assert.equal(map["starter:monthly"], paypal.plans.find((p) => p.name === "LikeLink Starter Monthly (ILS)").id);
  assert.ok(!paypal.calls.some((c) => /billing\/subscriptions|\/v2\/checkout|\/v1\/payments/.test(c)), "no subscription, order or payment is ever created");
});

test("idempotent: a second run (even after a cold start and a lost kv cache) creates nothing", async () => {
  const { ensureBillingPlans, _resetPayPalCaches } = await import("../api/_utils/paypal.js");
  const kvGet = async (k, fb) => (kv.has(k) ? JSON.parse(kv.get(k)) : fb);
  const kvSet = async (k, v) => { kv.set(k, JSON.stringify(v)); };
  const before = paypal.plans.length;
  _resetPayPalCaches();
  kv.delete("marketplace:paypal_plans"); // the cache is lost — PayPal is the truth
  const report = { created: [], adopted: [], failed: [] };
  await ensureBillingPlans({ kvGet, kvSet, report });
  assert.equal(paypal.plans.length, before, "no duplicate plans");
  assert.equal(report.adopted.length, 4);
  assert.equal(report.created.length, 0);
});

test("a USD plan with the same name is not adopted; a failed lookup creates nothing; failures retry", async () => {
  reset();
  const { ensureBillingPlans, _resetPayPalCaches } = await import("../api/_utils/paypal.js");
  const kvGet = async (k, fb) => (kv.has(k) ? JSON.parse(kv.get(k)) : fb);
  const kvSet = async (k, v) => { kv.set(k, JSON.stringify(v)); };
  paypal.products.push({ id: "PROD-X", name: "LikeLink Cloud" });
  paypal.plans.push({ id: "P-USD", product_id: "PROD-X", name: "LikeLink Starter Monthly (ILS)", status: "ACTIVE", billing_cycles: [{ tenure_type: "REGULAR", pricing_scheme: { fixed_price: { value: "7.83", currency_code: "USD" } } }] });
  _resetPayPalCaches();
  paypal.failList = true;
  let report = { created: [], adopted: [], failed: [] };
  await ensureBillingPlans({ kvGet, kvSet, report });
  assert.equal(report.created.length, 0, "cannot verify existing plans → create nothing");
  assert.equal(report.failed.length, 4);
  paypal.failList = false;
  paypal.failPlanPost = new Set(["Professional Yearly"]);
  _resetPayPalCaches();
  report = { created: [], adopted: [], failed: [] };
  const map = await ensureBillingPlans({ kvGet, kvSet, report });
  assert.notEqual(map["starter:monthly"], "P-USD", "a USD plan is never reused for ILS billing");
  assert.equal(report.created.length, 3);
  assert.deepEqual(report.failed.map((f) => f.key), ["professional:yearly"]);
  paypal.failPlanPost = new Set();
  _resetPayPalCaches();
  report = { created: [], adopted: [], failed: [] };
  const again = await ensureBillingPlans({ kvGet, kvSet, report });
  assert.deepEqual(report.created.map((c) => c.key), ["professional:yearly"], "only the missing plan is retried");
  assert.ok(again["professional:yearly"]);
});

test("provision-plans is admin / platform-owner only and reports PayPal-verified results", async () => {
  reset();
  const { _resetPayPalCaches } = await import("../api/_utils/paypal.js");
  _resetPayPalCaches();
  const { default: store } = await import("../api/store.mjs");
  const call = async (token) => {
    const res = { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader() {}, json(o) { this.body = o; }, end() {}, writeHead(c) { this.statusCode = c; } };
    await store({ method: "POST", url: "/api/store?mode=subs&sub=provision-plans", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.30", ...(token ? { authorization: `Bearer ${token}` } : {}) }, [Symbol.asyncIterator]: async function* () { yield Buffer.from("{}"); } }, res);
    return res;
  };
  assert.equal((await call("")).statusCode, 401);
  const user = await call("tok-user");
  assert.equal(user.statusCode, 403);
  assert.equal(user.body.error, "admin_required");
  assert.equal(paypal.calls.filter((c) => c.startsWith("POST /v1/billing/plans")).length, 0, "a refused caller creates nothing");
  const owner = await call("tok-owner");
  assert.equal(owner.statusCode, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.ok, true);
  assert.equal(owner.body.currency, "ILS");
  assert.equal(owner.body.verified.filter((v) => v.ok).length, 4, "each plan verified at PayPal: ACTIVE, ILS, site price");
  assert.equal(Object.keys(owner.body.plans).length, 4);
  const { makeAdminToken } = await import("../api/_utils/adminAuth.js");
  const admin = await call(makeAdminToken());
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.created.length, 0, "a repeated run only verifies");
  assert.ok(!paypal.calls.some((c) => /billing\/subscriptions|\/v2\/checkout|\/v1\/payments/.test(c)));
});

test("the owner's other PayPal plans are never adopted, requested, changed or billed against", async () => {
  reset();
  const { ensureBillingPlans, resolvePayPalPlanId, verifyBillingPlans, _resetPayPalCaches, FOREIGN_PLAN_IDS, _addForeignPlanIdForTest } = await import("../api/_utils/paypal.js");
  // Stand-ins for the owner's real foreign plans (only their hashes live in the code).
  _addForeignPlanIdForTest("P-FOREIGNTESTA00000000000000");
  _addForeignPlanIdForTest("P-FOREIGNTESTB00000000000000");
  assert.ok(FOREIGN_PLAN_IDS.has("P-FOREIGNTESTA00000000000000") && !FOREIGN_PLAN_IDS.has("P-SOMETHING-ELSE"));
  const kvGet = async (k, fb) => (kv.has(k) ? JSON.parse(kv.get(k)) : fb);
  const kvSet = async (k, v) => { kv.set(k, JSON.stringify(v)); };
  // The live account as it is: two ACTIVE plans of OTHER products — one even
  // renamed like a LikeLink ILS plan to try to fool the duplicate lookup.
  const ils = (v) => [{ tenure_type: "REGULAR", pricing_scheme: { fixed_price: { value: v, currency_code: "ILS" } } }];
  paypal.products.push({ id: "PROD-OTHER-A", name: "Other business — product A" }, { id: "PROD-OTHER-B", name: "Other business — product B" });
  paypal.plans.push(
    { id: "P-FOREIGNTESTA00000000000000", product_id: "PROD-OTHER-A", name: "LikeLink Starter Monthly (ILS)", status: "ACTIVE", billing_cycles: ils("29.00") },
    { id: "P-FOREIGNTESTB00000000000000", product_id: "PROD-OTHER-B", name: "Other business — membership", status: "ACTIVE", billing_cycles: ils("49.00") },
  );
  // Even a foreign id planted in kv is dropped.
  kv.set("marketplace:paypal_plans", JSON.stringify({ currency: "ILS", "starter:monthly": "P-FOREIGNTESTA00000000000000" }));
  _resetPayPalCaches();
  const report = { created: [], adopted: [], failed: [] };
  const map = await ensureBillingPlans({ kvGet, kvSet, report });
  assert.equal(report.adopted.length, 0, "no foreign plan is adopted");
  assert.equal(report.created.length, 4);
  for (const id of ["P-FOREIGNTESTA00000000000000", "P-FOREIGNTESTB00000000000000"]) {
    assert.ok(!Object.values(map).includes(id), `${id} is not LikeLink's plan`);
    assert.ok(!paypal.calls.some((c) => c.includes(id)), `${id} is never requested, patched or deactivated`);
  }
  assert.ok(paypal.products.some((p) => p.name === "LikeLink Cloud"), "LikeLink uses its own product");
  assert.ok(!paypal.calls.some((c) => /^PATCH |\/deactivate|\/activate|update-pricing-schemes/.test(c)), "no plan is ever modified");
  assert.equal(paypal.plans.find((p) => p.id === "P-FOREIGNTESTA00000000000000").status, "ACTIVE", "the foreign plans stay exactly as they were");
  process.env.PAYPAL_PLAN_STARTER = "P-FOREIGNTESTA00000000000000";
  assert.notEqual(await resolvePayPalPlanId("starter", "monthly", { kvGet, kvSet }), "P-FOREIGNTESTA00000000000000", "never billed against, even via env");
  delete process.env.PAYPAL_PLAN_STARTER;
  const v = await verifyBillingPlans({ ...map, "starter:monthly": "P-FOREIGNTESTA00000000000000" });
  assert.equal(v.find((x) => x.key === "starter:monthly").reason, "foreign_plan_not_used");
});

test("a product list that cannot be read creates no product (no duplicate LikeLink Cloud)", async () => {
  reset();
  const { ensurePayPalProduct, _resetPayPalCaches } = await import("../api/_utils/paypal.js");
  _resetPayPalCaches();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes("/v1/catalog/products") && (init?.method || "GET") === "GET" ? new Response("{}", { status: 500 }) : realFetch(url, init));
  const id = await ensurePayPalProduct({});
  globalThis.fetch = realFetch;
  assert.equal(id, null);
  assert.equal(paypal.products.length, 0);
});
