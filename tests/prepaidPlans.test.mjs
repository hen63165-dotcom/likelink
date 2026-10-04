// Prepaid plans: a plan period bought as ONE PayPal order (card or PayPal, no
// auto-renewal) — works without billing plans. The price comes only from
// plans.js; access opens only after the server captures the order and the
// captured amount / currency / custom_id match the stored order.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
const PP = "https://api-m.paypal.com";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.PAYPAL_CLIENT_ID = "live-client-id-test";
process.env.PAYPAL_CLIENT_SECRET = "live-client-secret-test";
process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-tests-only";
process.env.OWNER_EMAIL = "owner@likelink.test";
delete process.env.PAYPAL_ENV;

const kv = new Map();
const USERS = { "tok-a": { id: "u-a", email: "a@likelink.test" }, "tok-b": { id: "u-b", email: "b@likelink.test" } };
const pp = { orders: {}, captureAmount: null, calls: [] };
let next = 1;
const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); const method = init.method || "GET"; const h = init.headers || {};
  if (u.startsWith(PP)) pp.calls.push(`${method} ${u.replace(PP, "")}`);
  if (u.startsWith(`${SB}/auth/v1/user`)) { const t = String(h.Authorization || h.authorization || "").replace(/^Bearer\s+/i, ""); return USERS[t] ? J(200, USERS[t]) : J(401, {}); }
  if (u.startsWith(`${SB}/rest/v1/kv?key=eq.`)) { const k = decodeURIComponent(u.split("key=eq.")[1].split("&")[0]); return J(200, kv.has(k) ? [{ value: kv.get(k) }] : []); }
  if (u.startsWith(`${SB}/rest/v1/kv?on_conflict=key`) && method === "POST") { const b = JSON.parse(init.body); kv.set(b.key, typeof b.value === "string" ? b.value : JSON.stringify(b.value)); return J(201, {}); }
  if (u === `${SB}/rest/v1/rpc/financial_legacy_subscriptions` && method === "POST") { kv.set("marketplace:subscriptions", JSON.stringify(JSON.parse(init.body).p_value)); return new Response(null, { status: 204 }); }
  if (u.startsWith(SB)) return J(200, []);
  if (u === `${PP}/v1/oauth2/token`) return J(200, { access_token: "t" });
  if (u === `${PP}/v2/checkout/orders` && method === "POST") {
    const b = JSON.parse(init.body); const id = `ORDER${String(next++).padStart(6, "0")}`;
    pp.orders[id] = b;
    return J(201, { id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://www.paypal.com/checkoutnow?token=${id}` }] });
  }
  const m = u.match(/\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/);
  if (m && method === "POST") {
    const o = pp.orders[m[1]]; const unit = o.purchase_units[0];
    const value = pp.captureAmount ?? unit.amount.value;
    return J(201, { id: m[1], status: "COMPLETED", purchase_units: [{ custom_id: unit.custom_id, payments: { captures: [{ id: `CAP-${m[1]}`, status: "COMPLETED", custom_id: unit.custom_id, amount: { value, currency_code: unit.amount.currency_code } }] } }] });
  }
  return J(404, {});
};

const { default: store } = await import("../api/store.mjs");
const { LEGAL_VERSION } = await import("../src/lib/legal/catalog.js");
const call = async (sub, token, body = {}) => {
  const res = { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, getHeader() {}, json(o) { this.body = o; }, end() {}, writeHead(c) { this.statusCode = c; } };
  await store({ method: "POST", url: `/api/store?mode=subs&sub=${sub}`, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41", origin: "https://likelink2.vercel.app", authorization: `Bearer ${token}` }, [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body)); } }, res);
  return res;
};
const accept = (uid) => kv.set("legal:acceptances", JSON.stringify({ ...(kv.has("legal:acceptances") ? JSON.parse(kv.get("legal:acceptances")) : {}), [uid]: { current: { version: LEGAL_VERSION, at: new Date().toISOString() } } }));

test("prepaid: the order is priced from plans.js in ILS, card-first, and the plan opens only after a verified capture", async () => {
  kv.clear(); accept("u-a");
  const r = await call("prepaid-checkout", "tok-a", { planId: "starter", billingPeriod: "monthly", amount: 1 });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const order = pp.orders[r.body.orderId];
  assert.equal(order.purchase_units[0].amount.value, "29.00", "the client's amount is ignored");
  assert.equal(order.purchase_units[0].amount.currency_code, "ILS");
  assert.equal(order.payment_source.paypal.experience_context.landing_page, "GUEST_CHECKOUT");
  assert.ok(!JSON.parse(kv.get("marketplace:subscriptions") || "[]").some((s) => s.status === "active"), "nothing active before capture");
  const c = await call("prepaid-capture", "tok-a", { orderId: r.body.orderId });
  assert.equal(c.statusCode, 200, JSON.stringify(c.body));
  assert.equal(c.body.plan, "starter");
  const sub = c.body.subscription;
  assert.equal(sub.provider, "paypal_order");
  assert.equal(sub.autoRenew, false);
  const days = (Date.parse(sub.expiresAt) - Date.parse(sub.startedAt)) / 86400000;
  assert.equal(Math.round(days), 30);
  // Idempotent: a second return does not capture again or add a record.
  const again = await call("prepaid-capture", "tok-a", { orderId: r.body.orderId });
  assert.equal(again.body.subscription.id, sub.id);
  assert.equal(pp.calls.filter((x) => x.endsWith("/capture")).length, 1);
});

test("prepaid: another user cannot capture my order; a wrong captured amount opens nothing", async () => {
  kv.clear(); accept("u-a"); accept("u-b"); pp.captureAmount = null;
  const r = await call("prepaid-checkout", "tok-a", { planId: "professional", billingPeriod: "yearly" });
  assert.equal(pp.orders[r.body.orderId].purchase_units[0].amount.value, "790.00");
  const other = await call("prepaid-capture", "tok-b", { orderId: r.body.orderId });
  assert.equal(other.statusCode, 404);
  pp.captureAmount = "1.00";
  const bad = await call("prepaid-capture", "tok-a", { orderId: r.body.orderId });
  assert.equal(bad.statusCode, 409);
  assert.equal(bad.body.error, "capture_mismatch");
  assert.ok(!JSON.parse(kv.get("marketplace:subscriptions") || "[]").some((s) => s.status === "active"));
  pp.captureAmount = null;
});

test("prepaid: legal acceptance is required and Elite cannot be bought", async () => {
  kv.clear();
  const noLegal = await call("prepaid-checkout", "tok-a", { planId: "starter" });
  assert.equal(noLegal.statusCode, 428);
  accept("u-a");
  const elite = await call("prepaid-checkout", "tok-a", { planId: "elite" });
  assert.equal(elite.statusCode, 400);
});
