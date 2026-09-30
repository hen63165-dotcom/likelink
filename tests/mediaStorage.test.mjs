// Private media storage — the product-images bucket.
//
// The bucket is private; the site reads through /api/og?mode=media, which asks
// Storage with the PUBLIC anon key so the storage.objects RLS policies are the
// only gate. Uploads go to <kind>/<owner>/<file> with an allowed extension.
// The Luna system check reports GREEN only with a private bucket, all 5
// policies and a fresh REAL upload → readback → anonymous-denied self-test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.VITE_SUPABASE_ANON_KEY = "anon-public-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, sent: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    json(o) { this.body = o; },
    end(b) { this.sent = b; },
    writeHead(c) { this.statusCode = c; },
  };
}

test("media paths: only <products|reels|ugc>/<id>/<file.ext>; uploads refuse scriptable types", async () => {
  const M = await import("../src/lib/cloud/mediaStore.js");
  assert.equal(M.isValidMediaPath("products/m1/1700-abc.jpg"), true);
  for (const bad of ["products/m1/../x.jpg", "products/m1/a/b.jpg", "health/probe.png", "products/m1/x", "etc/passwd", "products//x.jpg", ""]) {
    assert.equal(M.isValidMediaPath(bad), false, bad);
  }
  assert.match(M.newMediaPath("products", "m1", "png", 1700, "abc123"), /^products\/m1\/1700-abc123\.png$/);
  assert.equal(M.newMediaPath("products", "m1", "svg"), null, "a creator can never upload an SVG");
  assert.equal(M.newMediaPath("products", "../m1", "png"), null);
  assert.equal(M.mediaUrl("products/m1/1-a.png", "https://likelink2.vercel.app/"), "https://likelink2.vercel.app/api/og?mode=media&path=products/m1/1-a.png");
});

test("media proxy: asks Storage with the PUBLIC key; denied and missing are indistinguishable", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} });
    const u = String(url);
    if (u.endsWith("/products/m1/1-ok.png")) return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    if (u.endsWith("/ugc/p1/1-a.svg")) return new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", { status: 200, headers: { "content-type": "image/svg+xml" } });
    if (u.endsWith("/products/m1/1-html.png")) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    return new Response(JSON.stringify({ error: "not_found" }), { status: 400 });
  };
  const { default: og } = await import("../api/og.mjs");
  const get = async (path) => { const res = mockRes(); await og({ method: "GET", url: `/api/og?mode=media&path=${path}`, headers: { host: "likelink2.vercel.app" } }, res); return res; };

  let res = await get("products/m1/1-ok.png");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(calls.at(-1).url, `${SB}/storage/v1/object/authenticated/product-images/products/m1/1-ok.png`);
  assert.equal(calls.at(-1).headers.Authorization, "Bearer anon-public-key", "the proxy never uses the service role — RLS decides");
  res = await get("products/m1/1-denied.png");
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["cache-control"], "no-store", "a not-yet-approved image is not cached as missing");
  res = await get("ugc/p1/1-a.svg");
  assert.match(res.headers["content-security-policy"], /sandbox/, "a stored SVG is inert");
  res = await get("products/m1/1-html.png");
  assert.equal(res.statusCode, 415);
  const before = calls.length;
  res = await get("health/probe.png");
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, before, "an invalid path never reaches Storage");
});

test("system check: storage GREEN needs a private bucket, 5 policies and a fresh real self-test", async () => {
  const { evaluateSystem } = await import("../src/lib/discovery/systemCheck.js");
  const now = Date.now();
  const storageOf = (storage, audience = "owner") => evaluateSystem({ storage }, { audience, now }).areas.find((a) => a.id === "storage");
  const missing = storageOf({ checked: true, bucketExists: false });
  assert.equal(missing.color, "YELLOW");
  assert.match(missing.ownerAction, /20260930000000_product_images_bucket\.sql/);
  assert.doesNotMatch(JSON.stringify(storageOf({ checked: true, bucketExists: false }, "public")), /\.sql|migrations/);
  assert.equal(storageOf({ checked: true, bucketExists: true, bucketPublic: true, policies: 5 }).color, "RED", "a public bucket is a fault");
  assert.equal(storageOf({ checked: true, bucketExists: true, bucketPublic: false, policies: 3 }).color, "RED");
  const ok = { at: now - 3600e3, upload: true, readback: true, anonDenied: true };
  assert.equal(storageOf({ checked: true, bucketExists: true, bucketPublic: false, policies: 5, selftest: ok }).color, "GREEN");
  assert.equal(storageOf({ checked: true, bucketExists: true, bucketPublic: false, policies: 5, selftest: { ...ok, at: now - 72 * 3600e3 } }).color, "YELLOW", "an old proof expires");
  assert.equal(storageOf({ checked: true, bucketExists: true, bucketPublic: false, policies: 5, selftest: { ...ok, anonDenied: false } }).color, "YELLOW");
  assert.equal(storageOf({ checked: false }).color, "UNVERIFIED");
});

test("storage self-test: real upload → readback → anon denied, once per day", async () => {
  const { createDiscoveryHandler } = await import("../api/_utils/discoveryHandler.mjs");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  let uploads = 0;
  let stored = null;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const auth = String((init.headers || {}).Authorization || "");
    if (u.endsWith("/storage/v1/bucket/product-images")) return new Response(JSON.stringify({ id: "product-images", public: false }), { status: 200 });
    if (u.endsWith("/rest/v1/rpc/likelink_media_policy_status")) return new Response(JSON.stringify({ bucket_exists: true, bucket_public: false, policies: ["a", "b", "c", "d", "e"] }), { status: 200 });
    if (u.endsWith("/storage/v1/object/product-images/health/probe.png") && init.method === "POST") { uploads++; stored = Buffer.from(init.body); return new Response("{}", { status: 200 }); }
    if (u.endsWith("/storage/v1/object/authenticated/product-images/health/probe.png")) {
      return auth === "Bearer service-role-test-key" && stored ? new Response(stored, { status: 200, headers: { "content-type": "image/png" } }) : new Response("{}", { status: 400 });
    }
    return new Response("[]", { status: 200 });
  };
  const store = new Map();
  const handler = createDiscoveryHandler({
    kvGet: async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb),
    kvSet: async (k, v) => { store.set(k, structuredClone(v)); },
    verifyToken: async () => null, verifyAdminToken: () => null, fetchImpl,
    env: { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "anon-public-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key" },
  });
  const res = mockRes();
  await handler({ method: "GET", url: "/api/store?mode=discovery&action=system-check", headers: {} }, res);
  const storage = res.body.check.areas.find((a) => a.id === "storage");
  assert.equal(storage.color, "GREEN", JSON.stringify(storage));
  assert.equal(uploads, 1);
  assert.ok(stored.equals(png), "the probe object is the fixed 1×1 PNG");
  assert.equal(store.get("storage:selftest:last").anonDenied, true);
  assert.doesNotMatch(JSON.stringify(res.body), /service-role-test-key|anon-public-key/, "no key ever leaves");

  const handler2 = createDiscoveryHandler({
    kvGet: async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb),
    kvSet: async (k, v) => { store.set(k, structuredClone(v)); },
    verifyToken: async () => null, verifyAdminToken: () => null, fetchImpl,
    env: { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "anon-public-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key" },
  });
  await handler2({ method: "GET", url: "/api/store?mode=discovery&action=system-check", headers: {} }, mockRes());
  assert.equal(uploads, 1, "the self-test runs at most once a day");
});

test("the bucket migration is additive and never touches the kv lockdown", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260930000000_product_images_bucket.sql", import.meta.url), "utf8");
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(body, /\bdrop\s+policy|\balter\s+policy|kv_select_public_allowlist|financial_private|intelligence_private|on\s+public\.kv\b/i);
  assert.match(body, /values \(\s*'product-images', 'product-images', false/, "the bucket is created PRIVATE");
  const policies = body.match(/create policy "likelink_media_[a-z_]+"/g) || [];
  assert.equal(policies.length, 5);
  assert.match(body, /revoke all on function likelink_private\.kv_json\(text\) from public, anon, authenticated/, "clients cannot read kv through the helper");
});
