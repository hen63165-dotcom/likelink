// BILLING CANCELLATION — the studio's "ביטול מנוי" must stop billing AT PAYPAL.
//
// A local "cancelled" that PayPal keeps charging is the worst possible lie,
// so these tests pin: PayPal's cancel endpoint is called and confirmed before
// anything is recorded; a PayPal failure changes nothing and says so; the
// terms (14-day cooling-off refund minus the lawful fee, yearly unused months,
// monthly access to the end of the paid month) come from one pure function;
// refunds are only ever recorded for the owner, never sent; and a customer can
// never hold two paid subscriptions at once.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
const PP = "https://api-m.sandbox.paypal.com";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.PAYPAL_ENV = "sandbox";
process.env.PAYPAL_CLIENT_ID = "test-client";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_PLAN_STARTER = "P-TEST-STARTER";
process.env.OWNER_EMAIL = "boss@likelink.test";

const kv = new Map();
const USERS = {
  "tok-user": { id: "u-1", email: "creator@likelink.test" },
  "tok-boss": { id: "u-boss", email: "boss@likelink.test" },
};
const NEXT_BILLING = "2031-02-01T00:00:00.000Z";
let PAYPAL_SUBS = {};
let cancelStatus = 204;
const calls = [];
const jsonResponse = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const headers = init.headers || {};
  if (u.startsWith(`${SB}/auth/v1/user`)) {
    const tok = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    return USERS[tok] ? jsonResponse(200, USERS[tok]) : jsonResponse(401, { msg: "invalid" });
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
  // Subscriptions are written through the financial RPC (it keeps Financial Cloud rows).
  if (u === `${SB}/rest/v1/rpc/financial_legacy_subscriptions` && method === "POST") {
    kv.set("marketplace:subscriptions", JSON.stringify(JSON.parse(init.body).p_value));
    return jsonResponse(204, null);
  }
  if (u.startsWith(`${SB}/rest/v1/`)) return jsonResponse(200, []);
  if (u === `${PP}/v1/oauth2/token`) return jsonResponse(200, { access_token: "pp-test-token", expires_in: 3600 });
  if (u.startsWith(`${PP}/v1/billing/subscriptions`)) {
    calls.push(`${method} ${u.slice(PP.length)}`);
    const m = u.match(/\/v1\/billing\/subscriptions\/([^/?]+)(\/cancel)?$/);
    if (m && m[2] && method === "POST") {
      if (cancelStatus === 204 && PAYPAL_SUBS[m[1]]) PAYPAL_SUBS[m[1]].status = "CANCELLED";
      return jsonResponse(cancelStatus, { name: "INTERNAL_SERVER_ERROR" });
    }
    if (m && method === "GET") {
      const s = PAYPAL_SUBS[m[1]];
      return s ? jsonResponse(200, { id: m[1], ...s }) : jsonResponse(404, { name: "RESOURCE_NOT_FOUND" });
    }
    return jsonResponse(201, { id: "I-NEW", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/approve" }] });
  }
  return jsonResponse(404, {});
};
const put = (key, value) => kv.set(key, JSON.stringify(value));
const read = (key) => (kv.has(key) ? JSON.parse(kv.get(key)) : undefined);
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    json(o) { this.body = o; },
    end() {}, writeHead(c) { this.statusCode = c; },
  };
}
function mockReq({ method = "POST", url, token = "", body = {} } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body || {})); },
  };
}
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
async function call(opts) {
  const { default: store } = await import("../api/store.mjs");
  const res = mockRes();
  await store(mockReq(opts), res);
  return res;
}
function seedSub(over = {}) {
  kv.clear();
  calls.length = 0;
  cancelStatus = 204;
  const sub = { id: "s1", userId: "u-1", planId: "starter", billingPeriod: "monthly", status: "active", paypalSubscriptionId: "I-1", startedAt: iso(Date.now() - 40 * DAY), lastBillingAt: iso(Date.now() - 10 * DAY), expiresAt: iso(Date.now() + 20 * DAY), createdAt: iso(Date.now() - 40 * DAY), ...over };
  PAYPAL_SUBS = { "I-1": { status: "ACTIVE", plan_id: "P-TEST-STARTER", custom_id: "u-1", billing_info: { next_billing_time: NEXT_BILLING } } };
  put("marketplace:subscriptions", [sub]);
  return sub;
}

// ── pure terms ───────────────────────────────────────────────────────────────
test("terms: 14-day cooling-off → refund minus the lawful fee (lower of 5% or ₪100); access ends now", async () => {
  const { cancellationTerms, cancellationFee } = await import("../src/lib/billing/cancellation.js");
  const now = Date.parse("2026-10-10T10:00:00Z");
  const t = cancellationTerms({ sub: { planId: "starter", billingPeriod: "monthly", status: "active", startedAt: iso(now - 3 * DAY) }, now });
  assert.equal(t.withinCoolingOff, true);
  assert.deepEqual(t.refund, { amount: 27.55, fee: 1.45, reason: "cooling_off_14d", currency: "ILS" });
  assert.equal(t.accessUntil, iso(now));
  const y = cancellationTerms({ sub: { planId: "professional", billingPeriod: "yearly", status: "active", startedAt: iso(now - 13 * DAY) }, now });
  assert.deepEqual([y.refund.amount, y.refund.fee], [750.5, 39.5]);
  assert.equal(cancellationFee(5000), 100, "the fee is capped at ₪100");
});

test("terms: monthly after 14 days — no further charges, access to the end of the paid month; yearly — unused full months refunded", async () => {
  const { cancellationTerms } = await import("../src/lib/billing/cancellation.js");
  const now = Date.parse("2026-10-10T10:00:00Z");
  const m = cancellationTerms({ sub: { planId: "starter", billingPeriod: "monthly", status: "active", startedAt: "2026-08-01T00:00:00Z" }, now, paidThrough: "2026-11-01T00:00:00Z" });
  assert.equal(m.refund, null);
  assert.equal(m.accessUntil, "2026-11-01T00:00:00.000Z");
  // Yearly bought 1 Aug 2026; on 10 Oct the 3rd month has started → access to 1 Nov, 9 months back.
  const y = cancellationTerms({ sub: { planId: "starter", billingPeriod: "yearly", status: "active", startedAt: "2026-08-01T00:00:00Z" }, now });
  assert.equal(y.accessUntil, "2026-11-01T00:00:00.000Z");
  assert.deepEqual([y.refund.amount, y.refund.unusedMonths, y.refund.reason], [217.5, 9, "yearly_unused_months"]);
  const unpaid = cancellationTerms({ sub: { planId: "starter", billingPeriod: "monthly", status: "pending" }, now });
  assert.equal(unpaid.refund, null, "nothing was charged → nothing to refund");
});

test("PayPal plans: monthly renews until cancelled; yearly is one 12-month term (no automatic renewal)", async () => {
  const { buildPlanBody, planMatches } = await import("../api/_utils/paypal.js");
  const m = buildPlanBody({ planId: "starter", billingPeriod: "monthly", priceIls: 29, productId: "PROD-1" });
  const y = buildPlanBody({ planId: "starter", billingPeriod: "yearly", priceIls: 290, productId: "PROD-1" });
  assert.equal(m.billing_cycles[0].total_cycles, 0);
  assert.equal(y.billing_cycles[0].total_cycles, 1);
  // An existing auto-renewing yearly plan is never adopted.
  const renewing = { id: "P-X", status: "ACTIVE", ...y, billing_cycles: [{ ...y.billing_cycles[0], total_cycles: 0 }] };
  assert.equal(planMatches(renewing, { name: y.name, productId: "PROD-1", price: "290.00", totalCycles: 1 }), false);
  assert.equal(planMatches({ id: "P-Y", ...y }, { name: y.name, productId: "PROD-1", price: "290.00", totalCycles: 1 }), true);
});

test("reconcile: a renewal PayPal confirms extends access even without a webhook", async () => {
  const { reconcileActiveSubscription } = await import("../src/lib/discovery/entitlements.js");
  const now = Date.parse("2026-10-10T00:00:00Z");
  const r = reconcileActiveSubscription({ status: "active", expiresAt: "2026-10-05T00:00:00Z" }, { status: "ACTIVE", nextBillingTime: "2026-11-05T00:00:00Z" }, now);
  assert.equal(r.expiresAt, "2026-11-05T00:00:00.000Z");
  const keep = reconcileActiveSubscription({ status: "active", expiresAt: "2026-12-01T00:00:00Z" }, { status: "ACTIVE", nextBillingTime: "2026-11-05T00:00:00Z" }, now);
  assert.equal(keep.expiresAt, "2026-12-01T00:00:00Z", "never shortens access");
});

// ── the API ──────────────────────────────────────────────────────────────────
test("API cancel: PayPal is cancelled first; the paid month is kept; no refund after 14 days", async () => {
  seedSub();
  const res = await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(calls.includes("POST /v1/billing/subscriptions/I-1/cancel"), "PayPal's cancel endpoint was called");
  const [s] = read("marketplace:subscriptions");
  assert.equal(s.status, "cancelled");
  assert.equal(s.providerCancelConfirmed, true);
  assert.equal(s.expiresAt, NEXT_BILLING, "access until the end of the month already paid for");
  assert.equal(res.body.terms.refund, null);
  assert.equal(read("billing:refund_requests"), undefined, "no refund owed");
  const get = await call({ url: "/api/store?mode=subs&sub=get", token: "tok-user" });
  assert.equal(get.body.plan, "starter", "the paid period is kept");
});

test("API cancel: when PayPal fails or is unreachable nothing changes and the customer is told", async () => {
  const before = seedSub();
  cancelStatus = 500;
  let res = await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "paypal_cancel_failed");
  assert.deepEqual(read("marketplace:subscriptions"), [before], "still active — never a fake cancellation");
  seedSub({ paypalSubscriptionId: "I-GONE" });
  res = await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, "paypal_unreachable");
  assert.equal(read("marketplace:subscriptions")[0].status, "active");
});

test("API cancel within 14 days: access ends, a refund request is recorded for the owner — never sent", async () => {
  seedSub({ startedAt: iso(Date.now() - 2 * DAY), lastBillingAt: iso(Date.now() - 2 * DAY) });
  const res = await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  assert.equal(res.statusCode, 200);
  const [r] = read("billing:refund_requests");
  assert.deepEqual([r.amount, r.fee, r.reason, r.status, r.userId], [27.55, 1.45, "cooling_off_14d", "pending_owner", "u-1"]);
  assert.ok(!calls.some((c) => /refund|captures/.test(c)), "no refund call of any kind");
  const get = await call({ url: "/api/store?mode=subs&sub=get", token: "tok-user" });
  assert.equal(get.body.plan, "free");
  // Repeating the request never duplicates the refund.
  await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  assert.equal(read("billing:refund_requests").length, 1);
});

test("API checkout: a second paid subscription next to an active one is refused (no double billing)", async () => {
  seedSub();
  const { LEGAL_VERSION } = await import("../src/lib/legal/catalog.js");
  put("legal:acceptances", { "u-1": { current: { version: LEGAL_VERSION, at: new Date().toISOString() } } });
  const res = await call({ url: "/api/store?mode=subs&sub=checkout", token: "tok-user", body: { planId: "professional", billingPeriod: "monthly" } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "active_subscription_exists");
  assert.ok(!calls.some((c) => c === "POST /v1/billing/subscriptions"), "nothing was created at PayPal");
  assert.equal(read("marketplace:subscriptions")[0].status, "active", "the current subscription is untouched");
});

test("API checkout: no paid plan before the current terms are accepted (428)", async () => {
  seedSub({ status: "cancelled" });
  let res = await call({ url: "/api/store?mode=subs&sub=checkout", token: "tok-user", body: { planId: "starter", billingPeriod: "monthly" } });
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.error, "legal_acceptance_required");
  put("legal:acceptances", { "u-1": { current: { version: "2000-01-01", at: new Date().toISOString() } } });
  res = await call({ url: "/api/store?mode=subs&sub=checkout", token: "tok-user", body: { planId: "starter", billingPeriod: "monthly" } });
  assert.equal(res.statusCode, 428, "an older version must be accepted again");
  assert.ok(!calls.some((c) => c === "POST /v1/billing/subscriptions"), "nothing was created at PayPal");
});

test("refund queue: owner only; marking done requires PayPal's refund id", async () => {
  seedSub({ startedAt: iso(Date.now() - DAY), lastBillingAt: iso(Date.now() - DAY) });
  await call({ url: "/api/store?mode=subs&sub=cancel", token: "tok-user" });
  let res = await call({ url: "/api/store?mode=subs&sub=refunds", token: "tok-user" });
  assert.equal(res.statusCode, 403);
  res = await call({ url: "/api/store?mode=subs&sub=refunds" });
  assert.equal(res.statusCode, 401);
  res = await call({ url: "/api/store?mode=subs&sub=refunds", token: "tok-boss" });
  assert.equal(res.statusCode, 200);
  const id = res.body.refunds[0].id;
  res = await call({ url: "/api/store?mode=subs&sub=refunds", token: "tok-boss", body: { id } });
  assert.equal(res.statusCode, 400);
  res = await call({ url: "/api/store?mode=subs&sub=refunds", token: "tok-boss", body: { id, providerRefundId: "RF-123" } });
  assert.equal(res.statusCode, 200);
  assert.equal(read("billing:refund_requests")[0].status, "refunded");
  res = await call({ url: "/api/store", token: "tok-user", body: { key: "billing:refund_requests", value: "[]" } });
  assert.equal(res.statusCode, 403, "the browser can never write the refund queue");
});
