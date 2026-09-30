// Creator privacy — the public creators / payouts rows carry no personal data.
//
// marketplace:marketers and marketplace:payouts are on the public read
// allowlist (kv_lockdown). Contact and payout fields therefore live in the
// server-only keys marketplace:marketers:private / marketplace:payouts:recipients.
// Server reads merge them back (ownership + payouts keep working), writes split
// them out, and an empty value from a client can never erase a stored one.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.ADMIN_SESSION_SECRET = "admin-session-secret-for-tests-only";
const kv = new Map();
const USERS = {
  "tok-owner": { id: "u-owner", email: "owner@likelink.test" },
  "tok-other": { id: "u-other", email: "other@likelink.test" },
};
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
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
  if (u.startsWith(`${SB}/rest/v1/`)) return jsonResponse(200, []);
  return jsonResponse(404, {});
};
const read = (key) => (kv.has(key) ? JSON.parse(kv.get(key)) : null);
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    json(o) { this.body = o; },
    end() {},
    writeHead(c) { this.statusCode = c; },
  };
}
function mockReq({ method = "GET", url, token = "", body = null } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
}

test("split / merge: public rows lose private fields; empty values never erase stored ones", async () => {
  const P = await import("../src/lib/cloud/marketerPrivacy.js");
  const { publicList, privateById } = P.splitMarketers([
    { id: "m1", name: "A", slug: "a", email: "a@x.com", payPalEmail: "pay@x.com", bankDetails: { bankName: "", account: "" }, bio: "hi" },
    { id: "m2", name: "B", slug: "b" },
  ]);
  assert.deepEqual(publicList[0], { id: "m1", name: "A", slug: "a", bio: "hi" });
  assert.deepEqual(privateById, { m1: { email: "a@x.com", payPalEmail: "pay@x.com" } }, "empty bank details are not stored");
  assert.equal(P.countEmailLike(publicList), 0);
  assert.equal(P.mergeMarketers(publicList, privateById)[0].email, "a@x.com");
  const kept = P.mergePrivateMaps(privateById, { m1: { payPalEmail: "", email: "" } }, ["m1"]);
  assert.equal(kept.m1.payPalEmail, "pay@x.com", "a client that never loaded its private fields cannot erase them");
  assert.deepEqual(P.mergePrivateMaps(privateById, {}, []), {}, "a removed creator's private fields are dropped");

  const pay = P.splitPayouts([{ id: "po1", marketerId: "m1", amount: 10, recipient: { payPalEmail: "pay@x.com" } }]);
  assert.equal(pay.publicPayouts[0].recipient, undefined);
  assert.deepEqual(pay.recipientsById.po1, { payPalEmail: "pay@x.com" });
  assert.equal(P.mergePayouts(pay.publicPayouts, pay.recipientsById)[0].recipient.payPalEmail, "pay@x.com");
});

test("createPrivateKv: any server's raw helpers become privacy-safe (payouts + read guard)", async () => {
  const { createPrivateKv, PAYOUTS_KEY, PAYOUT_RECIPIENTS_KEY } = await import("../src/lib/cloud/marketerPrivacy.js");
  const store = new Map();
  let failPrivateRead = false;
  const blocked = new Set();
  const pkv = createPrivateKv({
    get: async (k, fb) => { if (failPrivateRead && k === PAYOUT_RECIPIENTS_KEY) { blocked.add(k); return fb; } return store.has(k) ? structuredClone(store.get(k)) : fb; },
    set: async (k, v) => { store.set(k, structuredClone(v)); },
    assertWritable: (k) => { if (blocked.has(k)) throw new Error(`kv_read_failed:${k}`); },
  });
  await pkv.set(PAYOUTS_KEY, [{ id: "po1", marketerId: "m1", amount: 10, recipient: { payPalEmail: "pay@x.com" } }]);
  assert.equal(store.get(PAYOUTS_KEY)[0].recipient, undefined, "the public payouts row has no recipient");
  assert.equal(store.get(PAYOUT_RECIPIENTS_KEY).po1.payPalEmail, "pay@x.com");
  assert.equal((await pkv.get(PAYOUTS_KEY, []))[0].recipient.payPalEmail, "pay@x.com", "server reads get it back");
  failPrivateRead = true;
  await assert.rejects(pkv.set(PAYOUTS_KEY, [{ id: "po1", marketerId: "m1", amount: 10, status: "paid" }]), /kv_read_failed/, "an unreadable private map is never overwritten");
});

test("store: creator writes split; ownership still works; mode=me returns only the caller's fields", async () => {
  kv.clear();
  kv.set("marketplace:marketers", JSON.stringify([{ id: "m1", name: "Owner", slug: "owner", email: "owner@likelink.test", payPalEmail: "paid@likelink.test" }]));
  const { default: store, kvGet } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };

  // The owner saves their bio; the client did not load its PayPal e-mail (empty).
  let res = await call({ method: "POST", url: "/api/store", token: "tok-owner", body: { key: "marketplace:marketers", value: JSON.stringify([{ id: "m1", name: "Owner", slug: "owner", email: "owner@likelink.test", payPalEmail: "", bio: "new bio" }]) } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const pub = read("marketplace:marketers");
  assert.equal(pub[0].bio, "new bio");
  assert.equal(pub[0].email, undefined, "no e-mail in the public row");
  assert.equal(pub[0].payPalEmail, undefined);
  const priv = read("marketplace:marketers:private");
  assert.equal(priv.m1.email, "owner@likelink.test");
  assert.equal(priv.m1.payPalEmail, "paid@likelink.test", "the stored PayPal e-mail survived an empty client value");
  assert.equal((await kvGet("marketplace:marketers"))[0].email, "owner@likelink.test", "server reads are merged");

  // Another signed-in user still cannot change m1 (ownership uses the private e-mail).
  res = await call({ method: "POST", url: "/api/store", token: "tok-other", body: { key: "marketplace:marketers", value: JSON.stringify([{ id: "m1", name: "Hacked", slug: "owner" }]) } });
  assert.equal(read("marketplace:marketers")[0].name, "Owner");

  // A new signup's e-mail goes straight to the private map.
  res = await call({ method: "POST", url: "/api/store", token: "tok-other", body: { key: "marketplace:marketers", value: JSON.stringify([...read("marketplace:marketers"), { id: "m2", name: "Other", slug: "other", email: "other@likelink.test" }]) } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(read("marketplace:marketers").find((m) => m.id === "m2").email, undefined);
  assert.equal(read("marketplace:marketers:private").m2.email, "other@likelink.test");

  // mode=me
  res = await call({ url: "/api/store?mode=me" });
  assert.equal(res.statusCode, 401);
  res = await call({ url: "/api/store?mode=me", token: "tok-owner" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.marketers, [{ id: "m1", email: "owner@likelink.test", payPalEmail: "paid@likelink.test" }]);
  res = await call({ url: "/api/store?mode=me", token: "tok-other" });
  assert.deepEqual(res.body.marketers.map((m) => m.id), ["m2"], "never another creator's record");
  const { makeAdminToken } = await import("../api/_utils/adminAuth.js");
  res = await call({ url: "/api/store?mode=me", token: makeAdminToken() });
  assert.equal(res.body.admin, true);
  assert.deepEqual(res.body.marketers.map((m) => m.id).sort(), ["m1", "m2"]);

  const { countEmailLike } = await import("../src/lib/cloud/marketerPrivacy.js");
  assert.equal(countEmailLike(kv.get("marketplace:marketers")), 0, "the public row carries no e-mail at all");
});
