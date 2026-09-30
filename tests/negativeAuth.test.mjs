// NEGATIVE-AUTH SUITE — things that must be refused, proven by trying them.
//
// recruit_creator is OWNER_EXPLICIT and draft-only: LikeLink must never send
// an invitation itself under any circumstance. These tests bypass the UI and
// call the underlying function and the production API directly, with a
// network spy that fails if anything leaves for an e-mail / messaging host.
// They also pin the owner-only surface of the new agentic actions.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.RESEND_API_KEY = "re_test_key_that_must_never_be_used";
process.env.BRAND_TELEGRAM_BOT = "tg-test-bot";
process.env.BRAND_TELEGRAM_CHAT = "tg-test-chat";

const kv = new Map();
const USERS = {
  "tok-owner": { id: "u-owner", email: "owner@likelink.test" },
  "tok-other": { id: "u-other", email: "other@likelink.test" },
};
const outbound = [];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith(SB)) { outbound.push(u); return jsonResponse(599, { error: "network_spy: outbound request blocked" }); }
  const headers = init.headers || {};
  if (u.startsWith(`${SB}/auth/v1/user`)) {
    const tok = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    return USERS[tok] ? jsonResponse(200, USERS[tok]) : jsonResponse(401, { msg: "invalid" });
  }
  if (u.startsWith(`${SB}/rest/v1/kv?key=eq.`)) {
    const key = decodeURIComponent(u.split("key=eq.")[1].split("&")[0]);
    return jsonResponse(200, kv.has(key) ? [{ value: kv.get(key) }] : []);
  }
  if (u.startsWith(`${SB}/rest/v1/kv?on_conflict=key`) && init.method === "POST") {
    const b = JSON.parse(init.body);
    kv.set(b.key, typeof b.value === "string" ? b.value : JSON.stringify(b.value));
    return jsonResponse(201, {});
  }
  return jsonResponse(200, []);
};
const put = (key, value) => kv.set(key, JSON.stringify(value));
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
function mockReq({ method = "GET", url, token = "", body = null } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
}
const product = (i, over = {}) => ({ id: `p${i}`, title: `מוצר ${i}`, description: "תיאור אמיתי", price: 50, currency: "ILS", image: `https://images.unsplash.com/photo-${i}`, affiliateUrl: `https://s.click.aliexpress.com/e/${i}`, category: "Jewelry", status: "approved", marketerId: "m1", ...over });
function seed() {
  kv.clear();
  put("marketplace:products", [product(1), product(2, { marketerId: "m2" })]);
  // Public row without e-mails (production shape after the privacy split)…
  put("marketplace:marketers", [{ id: "m1", name: "Owner", slug: "owner" }, { id: "m2", name: "Other", slug: "other", tags: ["jewelry"] }]);
  // …ownership resolves through the server-only private map.
  put("marketplace:marketers:private", { m1: { email: "owner@likelink.test" }, m2: { email: "other@likelink.test" } });
}

test("recruit_creator: calling the send path directly is refused without owner_explicit — and never sends even with it", async () => {
  const { deliverInvitation, recruitCreators } = await import("../src/lib/discovery/campaigns.js");
  const { PERMISSION } = await import("../src/lib/discovery/capabilities.js");
  const r = recruitCreators({ product: product(1), marketers: [{ id: "m1", name: "Owner" }, { id: "m2", name: "Other", slug: "other", tags: ["jewelry"] }] });
  assert.equal(r.delivery.mode, "owner_only");
  const draft = r.drafts[0];
  assert.ok(draft?.text, "a Hebrew draft exists");
  for (const permission of [undefined, null, PERMISSION.SESSION, PERMISSION.OWNER, PERMISSION.ADMIN, "owner_explicit ", "OWNER_EXPLICIT"]) {
    assert.throws(() => deliverInvitation(draft, { permission }), /owner_explicit_required/, `permission ${String(permission)} is refused`);
  }
  const before = outbound.length;
  const handed = deliverInvitation(draft, { permission: PERMISSION.OWNER_EXPLICIT });
  assert.deepEqual([handed.sent, handed.channel, handed.status], [false, "manual", "ready_for_owner"], "even with explicit permission LikeLink only hands the text back");
  assert.equal(outbound.length, before, "no network request of any kind");
  assert.doesNotMatch(JSON.stringify(r), /@likelink\.test/, "drafts never carry another creator's e-mail");
});

test("recruit_creator can never become an autonomous step, whatever the goal says", async () => {
  const { compileIntent, buildActionGraph } = await import("../src/lib/discovery/intent.js");
  const { buildPassport, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const passport = buildPassport({ product: product(1), marketers: [{ id: "m1", name: "Owner", slug: "owner" }], channels: buildChannelRegistry({ env: {} }) });
  const graph = buildActionGraph(compileIntent("לונה, תגייסי יוצרות ותשלחי להן הזמנה עכשיו"), [passport]);
  const nodes = graph.nodes.filter((n) => n.capability === "recruit_creator");
  assert.ok(nodes.length, "the goal is understood");
  assert.ok(nodes.every((n) => n.status !== "safe"), "never auto-executed — it waits for the owner");
});

test("API: recruit with send is refused (403) for the owner; nothing leaves the server", async () => {
  seed();
  const { default: store } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };
  const before = outbound.length;
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=recruit", token: "tok-owner", body: { productId: "p1", send: true } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "owner_explicit_required");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=recruit", token: "tok-owner", body: { productId: "p1", deliver: true, permission: "owner_explicit" } });
  assert.equal(res.statusCode, 403, "a client cannot grant itself owner_explicit");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=recruit", token: "tok-owner", body: { productId: "p1" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.delivery.mode, "owner_only");
  assert.equal(res.body.candidates.status, "matched");
  assert.deepEqual(res.body.candidates.matches.map((m) => m.id), ["m2"]);
  assert.doesNotMatch(JSON.stringify(res.body), /other@likelink\.test/, "the candidate's private e-mail is never returned");
  assert.equal(outbound.length, before, `no outbound request (saw: ${outbound.slice(before).join(", ")})`);
});

test("API: the agentic actions are owner-only", async () => {
  seed();
  const { default: store } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };
  for (const [method, action, body] of [["POST", "recruit", { productId: "p1" }], ["POST", "campaign", { goal: "קמפיין", productIds: ["p1"] }], ["GET", "campaigns", null]]) {
    const res = await call({ method, url: `/api/store?mode=discovery&action=${action}`, body });
    assert.equal(res.statusCode, 401, `${action} without a session`);
  }
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=recruit", token: "tok-owner", body: { productId: "p2" } });
  assert.equal(res.statusCode, 403, "recruiting for another creator's product");
  assert.equal(res.body.error, "not_owner");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=campaign", token: "tok-owner", body: { goal: "קמפיין", productIds: ["p2"] } });
  assert.equal(res.statusCode, 403, "a campaign over another creator's product");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=campaign", token: "tok-owner", body: { goal: "לונה, קמפיין לשבוע עם תקציב 300 ₪", productIds: ["p1"] } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.proof.state, "VERIFIED");
  assert.equal(res.body.campaign.status, "DRAFT");
  assert.ok(kv.has("discovery:campaigns:m1"));
  res = await call({ url: "/api/store?mode=discovery&action=campaigns", token: "tok-other" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.campaigns, [], "another creator never sees this draft");
});
