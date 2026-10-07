// CUSTOM GPT API — "Likelink Content Studio".
//
// Pins: the OpenAPI 3.1 spec exposes exactly the five read-mostly actions (no
// publish), each served by a vercel.json rewrite; keys are Professional-only,
// shown once, stored as a SHA-256 hash, rate-limited and revocable; a draft
// created through the API appears in the studio with a valid tracking link
// and the disclosure; the API can neither approve nor publish; invented
// testimonials are refused; nothing leaves the server.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
const kv = new Map();
const USERS = { "tok-owner": { id: "u-owner", email: "owner@likelink.test" }, "tok-other": { id: "u-other", email: "other@likelink.test" } };
const outbound = [];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith(SB)) { outbound.push(u); return jsonResponse(599, {}); }
  const headers = init.headers || {};
  if (u.startsWith(`${SB}/auth/v1/user`)) {
    const tok = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    return USERS[tok] ? jsonResponse(200, USERS[tok]) : jsonResponse(401, {});
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
const put = (k, v) => kv.set(k, JSON.stringify(v));
const read = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : undefined);
function mockRes() {
  return { statusCode: 200, headers: {}, ended: undefined, get body() { try { return JSON.parse(this.ended); } catch { return this._json; } }, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, json(o) { this._json = o; }, end(b) { this.ended = b; }, writeHead(c) { this.statusCode = c; } };
}
function mockReq({ method = "GET", url, token = "", body = null }) {
  return { method, url, body, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.71", ...(token ? { authorization: `Bearer ${token}` } : {}) }, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
async function call(opts) {
  const { default: store } = await import("../api/store.mjs");
  const res = mockRes();
  await store(mockReq(opts), res);
  return res;
}
const PRODUCT = { id: "p1", title: "שרשרת כסף עדינה", description: "שרשרת כסף 925 באורך 45 ס\"מ.", price: 89, image: "https://images.unsplash.com/photo-1", category: "תכשיטים", affiliateUrl: "https://s.click.aliexpress.com/e/1", status: "approved", marketerId: "m1" };
function seed(planId = "professional") {
  kv.clear();
  put("marketplace:products", [PRODUCT, { ...PRODUCT, id: "p2", marketerId: "m2", affiliateUrl: "https://s.click.aliexpress.com/e/2" }, { ...PRODUCT, id: "p3", status: "pending", affiliateUrl: "https://s.click.aliexpress.com/e/3" },
    // Two seed-like products sharing one link (it opens the store's home page): never offered to the GPT.
    { ...PRODUCT, id: "s1", title: "נעלי ריצה", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }, { ...PRODUCT, id: "s2", title: "סרום", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }]);
  put("marketplace:marketers", [{ id: "m1", name: "נועה", slug: "noa" }, { id: "m2", name: "Other", slug: "other" }]);
  put("marketplace:marketers:private", { m1: { email: "owner@likelink.test" }, m2: { email: "other@likelink.test" } });
  if (planId) put("marketplace:subscriptions", [{ id: "s1", userId: "u-owner", planId, billingPeriod: "monthly", status: "active", startedAt: "2026-09-01T00:00:00.000Z" }]);
}
async function newKey() {
  const r = await call({ method: "POST", url: "/api/store?mode=gpt&op=keys-create", token: "tok-owner", body: { name: "ChatGPT" } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body;
}

test("OpenAPI 3.1: exactly the five read-mostly actions, bearer auth, no publish — each path has a rewrite", async () => {
  const res = await call({ url: "/api/store?mode=gpt&op=openapi" });
  const spec = res.body;
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.servers[0].url, "http://localhost:8787");
  assert.deepEqual(spec.components.securitySchemes.ApiKey, { type: "http", scheme: "bearer", description: spec.components.securitySchemes.ApiKey.description });
  const ops = Object.entries(spec.paths).flatMap(([p, m]) => Object.entries(m).map(([method, o]) => `${method.toUpperCase()} ${p} ${o.operationId}`));
  assert.deepEqual(ops.map((o) => o.split(" ")[2]).sort(), ["create_content_draft", "get_draft_status", "get_tracking_link", "list_drafts", "list_products"]);
  assert.doesNotMatch(JSON.stringify(Object.keys(spec.paths)), /publish|approve/i);
  const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  for (const p of Object.keys(spec.paths)) {
    const source = p.replace(/\{(\w+)\}/g, ":$1");
    assert.ok(vercel.rewrites.some((r) => r.source === source && r.destination.includes("mode=gpt")), `rewrite for ${p}`);
  }
  assert.ok(vercel.rewrites.some((r) => r.source === "/api/gpt/openapi.json"));
});

test("keys: Professional only, shown once, stored as a hash, listed by prefix", async () => {
  seed("starter");
  let r = await call({ method: "POST", url: "/api/store?mode=gpt&op=keys-create", token: "tok-owner", body: {} });
  assert.equal(r.statusCode, 402);
  seed("professional");
  const { key, id } = await newKey();
  assert.match(key, /^llk_[A-Za-z0-9_-]{40,}$/);
  const everything = [...kv.values()].join("\n");
  assert.ok(!everything.includes(key), "the raw key is never stored");
  const { hashKey } = await import("../api/_utils/gptHandler.mjs");
  assert.equal(read("gpt:keys")[hashKey(key)].id, id);
  r = await call({ url: "/api/store?mode=gpt&op=keys", token: "tok-owner" });
  assert.deepEqual(r.body.keys.map((k) => [k.id, k.prefix]), [[id, key.slice(0, 8)]]);
  assert.ok(!JSON.stringify(r.body).includes(key));
});

test("actions: own approved products only; a valid tracking link with the disclosure", async () => {
  seed();
  const { key } = await newKey();
  let r = await call({ url: "/api/store?mode=gpt&op=products", token: key });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.products.map((p) => p.id), ["p1"], "not another creator's, not a pending one, not one with a shared affiliate link");
  r = await call({ url: "/api/store?mode=gpt&op=tracking-link&productId=p1&channel=tiktok", token: key });
  const link = new URL(r.body.trackingLink);
  assert.equal(link.pathname, "/r");
  assert.equal(link.searchParams.get("pid"), "p1");
  assert.equal(link.searchParams.get("src"), "gpt.tiktok");
  assert.equal(r.body.disclosure, "#פרסומת · קישור שותפים");
  r = await call({ url: "/api/store?mode=gpt&op=tracking-link&productId=p2", token: key });
  assert.equal(r.statusCode, 404, "another creator's product does not exist for this key");
});

test("a draft created through the API appears in the studio with a valid tracking link — and cannot be published or approved by the API", async () => {
  seed();
  const before = outbound.length;
  const { key } = await newKey();
  let r = await call({ method: "POST", url: "/api/store?mode=gpt&op=drafts", token: key, body: { productId: "p1", channel: "tiktok", hook: "שרשרת כסף 925 ב-₪89", caption: "שרשרת כסף 925 באורך 45 ס\"מ", hashtags: ["#תכשיטים"] } });
  assert.equal(r.statusCode, 201, JSON.stringify(r.body));
  const draft = r.body.draft;
  assert.equal(draft.status, "DRAFT");
  assert.ok(draft.caption.startsWith("#פרסומת · קישור שותפים"), "the disclosure is added");
  assert.ok(draft.caption.includes(draft.trackingLink), "the tracking link is in the caption");
  const link = new URL(draft.trackingLink);
  assert.deepEqual([link.pathname, link.searchParams.get("pid"), link.searchParams.get("src")], ["/r", "p1", `gpt.tiktok.${draft.id}`]);
  // The studio sees it.
  r = await call({ url: "/api/store?mode=gpt&op=my-drafts", token: "tok-owner" });
  assert.equal(r.body.drafts[0].id, draft.id);
  assert.equal(r.body.drafts[0].trackingLink, draft.trackingLink);
  // The API cannot publish or approve.
  r = await call({ method: "POST", url: `/api/store?mode=gpt&op=draft&draftId=${draft.id}`, token: key, body: { status: "PUBLISHED" } });
  assert.equal(r.statusCode, 405);
  r = await call({ method: "POST", url: "/api/store?mode=gpt&op=draft-approve", token: key, body: { draftId: draft.id } });
  assert.equal(r.statusCode, 401, "an API key is not a studio session");
  r = await call({ url: `/api/store?mode=gpt&op=draft&draftId=${draft.id}`, token: key });
  assert.equal(r.body.draft.status, "DRAFT");
  // Only the creator, in the studio, approves — and even then it is for a manual post.
  r = await call({ method: "POST", url: "/api/store?mode=gpt&op=draft-approve", token: "tok-owner", body: { draftId: draft.id } });
  assert.equal(r.body.draft.status, "APPROVED_FOR_MANUAL_POST");
  const { quotaStoreKey } = await import("../src/lib/discovery/quotas.js");
  assert.equal(read(quotaStoreKey("m1")).gptDrafts, 1, "counted against the plan's monthly drafts");
  assert.equal(outbound.length, before, "nothing leaves the server");
});

test("invented testimonials and guarantees are refused with an explanation", async () => {
  seed();
  const { key } = await newKey();
  const r = await call({ method: "POST", url: "/api/store?mode=gpt&op=drafts", token: key, body: { productId: "p1", channel: "instagram_reels", hook: "הכי נמכר השנה!", caption: "לקוחות אומרים שזה מדהים" } });
  assert.equal(r.statusCode, 422);
  assert.equal(r.body.error, "claims_not_allowed");
  assert.equal(read("distribution:drafts:m1"), undefined);
});

test("a revoked key is rejected; a downgraded plan loses access; bursts are rate-limited", async () => {
  seed();
  const { key, id } = await newKey();
  let r = await call({ method: "POST", url: "/api/store?mode=gpt&op=keys-revoke", token: "tok-owner", body: { id } });
  assert.equal(r.statusCode, 200);
  r = await call({ url: "/api/store?mode=gpt&op=products", token: key });
  assert.equal(r.statusCode, 401);
  r = await call({ url: "/api/store?mode=gpt&op=products", token: "llk_" + "x".repeat(43) });
  assert.equal(r.statusCode, 401, "an unknown key");
  const second = await newKey();
  put("marketplace:subscriptions", [{ id: "s1", userId: "u-owner", planId: "starter", billingPeriod: "monthly", status: "active", startedAt: "2026-09-01T00:00:00.000Z" }]);
  r = await call({ url: "/api/store?mode=gpt&op=products", token: second.key });
  assert.equal(r.statusCode, 402);
  seed();
  const third = await newKey();
  let last;
  for (let i = 0; i < 31; i++) last = await call({ url: "/api/store?mode=gpt&op=drafts", token: third.key });
  assert.equal(last.statusCode, 429);
});
