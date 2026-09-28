// Production-hardening regression tests (2026-09-28 audit).
//
// Locks in the fixes for the Critical/High findings:
//   • kv read-failure guard — a failed read can never become a destructive write
//   • store write policy — owner-scoped merge, no anonymous creation, server-only keys
//   • cron auth — only Bearer secrets; x-vercel-cron / ?secret= are not proof
//   • checkout pricing — the catalog, not the client, decides price and owner
//   • price-watch parsing, SSRF guard, /r redirect (no open redirect)
//   • /api/store wiring end-to-end against an in-memory Supabase stub
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── in-memory Supabase REST + Auth stub ─────────────────────────────────────
const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
const kv = new Map();
const USERS = {
  "tok-owner": { id: "u-owner", email: "owner@likelink.test" },
  "tok-other": { id: "u-other", email: "other@likelink.test" },
};
let failReadsFor = new Set();
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
    if (failReadsFor.has(key)) return jsonResponse(503, { message: "unavailable" });
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

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    json(o) { this.body = o; },
    end(b) { this.ended = b; },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); },
  };
}
function mockReq({ method = "POST", url = "/api/store", token = "", body = null, headers = {} } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    [Symbol.asyncIterator]: async function* () {},
  };
}
const read = (key) => (kv.has(key) ? JSON.parse(kv.get(key)) : undefined);

// ── kv read-failure guard ────────────────────────────────────────────────────
test("kvReadGuard: a failed read blocks writes to that key until a read succeeds", async () => {
  const g = await import("../src/lib/cloud/kvReadGuard.js");
  g._resetKvReadGuard();
  assert.doesNotThrow(() => g.assertKvWritable("k1"));
  const failed = await g.readKvResponse("k1", new Response("{}", { status: 500 }));
  assert.equal(failed.failed, true);
  assert.throws(() => g.assertKvWritable("k1"), (e) => g.isKvReadFailure(e));
  const missing = await g.readKvResponse("k1", jsonResponse(200, []));
  assert.equal(missing.found, false, "a missing row is not a failure");
  assert.doesNotThrow(() => g.assertKvWritable("k1"));
  const garbled = await g.readKvResponse("k2", new Response("not json", { status: 200 }));
  assert.equal(garbled.failed, true);
  assert.throws(() => g.assertKvWritable("k2"));
});

// ── store write policy (pure) ────────────────────────────────────────────────
test("storeWritePolicy: anonymous visitors cannot create products but can bump clicks by one", async () => {
  const { applyStoreWritePolicy } = await import("../api/_utils/storeWritePolicy.mjs");
  const stored = [{ id: "p1", marketerId: "m1", title: "Bag", clicks: 4, status: "approved" }];
  const anon = { ownedMarketerIds: new Set(), now: Date.now() };
  const create = applyStoreWritePolicy("marketplace:products", stored, [...stored, { id: "p2", marketerId: "m1", title: "X" }], anon);
  assert.equal(create.rejectedCreates, 1);
  const bump = applyStoreWritePolicy("marketplace:products", stored, [{ ...stored[0], clicks: 99, title: "hacked" }], anon);
  assert.equal(bump.value[0].clicks, 5, "counter moves by at most one");
  assert.equal(bump.value[0].title, "Bag", "non-owners cannot edit fields");
  const wipe = applyStoreWritePolicy("marketplace:products", stored, [], anon);
  assert.equal(wipe.value.length, 1, "a non-owner (or stale snapshot) can never delete");
});

test("storeWritePolicy: owners manage only their own records; moderation and trust fields are protected", async () => {
  const { applyStoreWritePolicy } = await import("../api/_utils/storeWritePolicy.mjs");
  const stored = [
    { id: "p1", marketerId: "m1", title: "Mine", status: "flagged", merchantEligible: false },
    { id: "p2", marketerId: "m2", title: "Theirs", status: "approved" },
  ];
  const owner = { ownedMarketerIds: new Set(["m1"]), now: Date.now() };
  const next = [
    { id: "p1", marketerId: "m1", title: "Mine v2", status: "approved", merchantEligible: true },
    { id: "p3", marketerId: "m1", title: "New", merchantEligible: true },
  ];
  const r = applyStoreWritePolicy("marketplace:products", stored, next, owner);
  const byId = Object.fromEntries(r.value.map((p) => [p.id, p]));
  assert.equal(byId.p1.title, "Mine v2");
  assert.equal(byId.p1.status, "flagged", "a moderation decision cannot be reversed by the owner");
  assert.equal(byId.p1.merchantEligible, false, "trust fields stay server-controlled");
  assert.ok(byId.p2, "another creator's product survives a snapshot that omits it");
  assert.ok(byId.p3 && !("merchantEligible" in byId.p3), "new products cannot forge trust fields");
  const steal = applyStoreWritePolicy("marketplace:products", stored, [{ ...stored[1], marketerId: "m1" }], owner);
  assert.equal(steal.value.find((p) => p.id === "p2").marketerId, "m2", "ownership cannot be taken");
});

test("storeWritePolicy: marketers — signup allowed once per e-mail, payout details need a verified owner", async () => {
  const { applyStoreWritePolicy, ownedMarketerIdsFor } = await import("../api/_utils/storeWritePolicy.mjs");
  const stored = [{ id: "m1", email: "a@x.com", name: "A", payPalEmail: "a@pay.com", tier: "starter" }];
  const anon = { ownedMarketerIds: new Set(), now: Date.now() };
  const signup = applyStoreWritePolicy("marketplace:marketers", stored, [...stored, { id: "m2", email: "b@x.com", name: "B", payPalEmail: "evil@pay.com", tier: "pro" }], anon);
  const m2 = signup.value.find((m) => m.id === "m2");
  assert.ok(m2 && !m2.payPalEmail && !m2.tier, "anonymous signup cannot set payout e-mail or tier");
  const dup = applyStoreWritePolicy("marketplace:marketers", stored, [...stored, { id: "m9", email: "A@x.com" }], anon);
  assert.equal(dup.rejectedCreates, 1, "an existing e-mail cannot be registered twice");
  const hijack = applyStoreWritePolicy("marketplace:marketers", stored, [{ ...stored[0], payPalEmail: "evil@pay.com" }], anon);
  assert.equal(hijack.value[0].payPalEmail, "a@pay.com", "nobody but the owner changes the payout e-mail");
  const ownerCtx = { ownedMarketerIds: ownedMarketerIdsFor({ email: "A@X.com" }, stored), actorEmail: "a@x.com", now: Date.now() };
  const own = applyStoreWritePolicy("marketplace:marketers", stored, [{ ...stored[0], payPalEmail: "new@pay.com", email: "z@x.com", tier: "pro" }], ownerCtx);
  assert.equal(own.value[0].payPalEmail, "new@pay.com");
  assert.equal(own.value[0].email, "a@x.com", "the owner cannot move the studio to another e-mail");
  assert.equal(own.value[0].tier, "starter", "tier is server-managed");
});

test("storeWritePolicy: server-only keys, append-only clicks and immutable charges", async () => {
  const { applyStoreWritePolicy, mergeSignedSale } = await import("../api/_utils/storeWritePolicy.mjs");
  const anon = { ownedMarketerIds: new Set(), now: Date.now() };
  for (const key of ["marketplace:autopilot", "marketplace:vapid", "marketplace:pushsubs", "growth:job:x", "checkout:order:1"]) {
    assert.equal(applyStoreWritePolicy(key, [], [], anon).error, "server_only_key", key);
  }
  const clicks = [{ id: "c1", productId: "p1", ts: Date.now() }];
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, productId: "p1", ts: Date.now() }));
  const r = applyStoreWritePolicy("marketplace:clicks", clicks, [...many], anon);
  assert.equal(r.value.length, 1 + 5, "at most 5 new events per write, and old ones are never dropped");
  const old = applyStoreWritePolicy("marketplace:clicks", [], [{ id: "z", productId: "p1", ts: 1 }], anon);
  assert.equal(old.value.length, 0, "back-dated events are refused");
  const owner = { ownedMarketerIds: new Set(["m1"]), now: Date.now() };
  const charges = [{ id: "ch1", marketerId: "m1", amount: 25 }];
  const c = applyStoreWritePolicy("marketplace:charges", charges, [], owner);
  assert.equal(c.value.length, 1, "a creator cannot delete a charge to restore balance");
  const sale = { id: "s2", marketerId: "m1", saleAmount: 10 };
  assert.deepEqual(mergeSignedSale([{ id: "s1" }], sale).value.map((s) => s.id), ["s1", "s2"]);
  assert.equal(mergeSignedSale([{ id: "s2" }], sale).ok, false, "the same signed sale twice is refused");
});

// ── cron auth ────────────────────────────────────────────────────────────────
test("cronAuth: only a Bearer secret authorizes; x-vercel-cron and ?secret= do not", async () => {
  const { isAuthorizedCron } = await import("../api/_utils/cronAuth.mjs");
  process.env.CRON_SECRET = "cron-secret-1";
  assert.equal(isAuthorizedCron({ headers: { "x-vercel-cron": "1" } }, []), false);
  assert.equal(isAuthorizedCron({ headers: {}, url: "/api/x?secret=cron-secret-1" }, []), false);
  assert.equal(isAuthorizedCron({ headers: { authorization: "Bearer cron-secret-1" } }, []), true);
  assert.equal(isAuthorizedCron({ headers: { authorization: "Bearer fn-secret" } }, ["fn-secret"]), true);
  assert.equal(isAuthorizedCron({ headers: { authorization: "Bearer " } }, [""]), false);
  delete process.env.CRON_SECRET;
  assert.equal(isAuthorizedCron({ headers: { authorization: "Bearer anything" } }, [undefined, ""]), false, "unset secrets never match");
});

test("adminAuth: with no admin secret configured, no token is issued or accepted", () => {
  const script = "import('./api/_utils/adminAuth.js').then(m => { let issued = true; try { m.makeAdminToken(); } catch { issued = false; } console.log(JSON.stringify({ issued, accepted: Boolean(m.verifyAdminToken('eyJleHAiOjk5OTk5OTk5OTk5OTksInYiOjF9.x')) })); })";
  const env = { ...process.env };
  delete env.ADMIN_SESSION_SECRET;
  delete env.ADMIN_CODE;
  const out = JSON.parse(execFileSync(process.execPath, ["-e", script], { cwd: ROOT, env }).toString().trim());
  assert.deepEqual(out, { issued: false, accepted: false });
});

// ── checkout pricing ─────────────────────────────────────────────────────────
test("checkoutCatalog: prices come from the catalog; the capture must match the stored order", async () => {
  const { priceCart, captureMatchesOrder } = await import("../api/_utils/checkoutCatalog.mjs");
  const catalog = [
    { id: "p1", marketerId: "m1", title: "Bag", price: 120, status: "approved" },
    { id: "p2", marketerId: "m2", title: "Hidden", price: 50, status: "flagged" },
    { id: "p3", marketerId: "m3", title: "USD", price: 9, status: "approved", currency: "USD" },
  ];
  const ok = priceCart([{ productId: "p1", quantity: 2, price: 0.01, marketerId: "attacker" }], catalog);
  assert.equal(ok.total, 240);
  assert.equal(ok.lines[0].marketerId, "m1", "the credited creator comes from the catalog");
  assert.equal(priceCart([{ productId: "p2" }], catalog).error, "product_not_available");
  assert.equal(priceCart([{ productId: "nope" }], catalog).error, "product_not_found");
  assert.equal(priceCart([{ productId: "p3" }], catalog).error, "currency_unsupported");
  assert.equal(priceCart([{ productId: "p1", quantity: 11 }], catalog).error, "invalid_quantity");
  const record = { total: 240, currency: "ILS", checkoutId: "co_1" };
  const capture = (value, currency = "ILS", custom_id = "co_1") => ({ purchase_units: [{ payments: { captures: [{ amount: { value, currency_code: currency }, custom_id }] } }] });
  assert.equal(captureMatchesOrder(capture("240.00"), record), true);
  assert.equal(captureMatchesOrder(capture("1.00"), record), false);
  assert.equal(captureMatchesOrder(capture("240.00", "USD"), record), false);
  assert.equal(captureMatchesOrder(capture("240.00", "ILS", "co_other"), record), false);
});

test("client checkout sends only product ids and quantities", () => {
  const src = readFileSync(path.join(ROOT, "src/lib/paymentFlow.js"), "utf8");
  const create = src.slice(src.indexOf("export function createPayPalCheckout"), src.indexOf("export function capturePayPalCheckout"));
  assert.doesNotMatch(create, /price:/, "the browser must not send prices to create-order");
  const capture = src.slice(src.indexOf("export function capturePayPalCheckout"));
  assert.doesNotMatch(capture, /items:/, "capture sends only the order id");
});

// ── price watch + SSRF guard ─────────────────────────────────────────────────
test("price-watch parses prices correctly and reads the declared currency", async () => {
  const { parsePriceNumber, extractPrice } = await import("../api/price-watch.mjs");
  assert.equal(parsePriceNumber("1,299.00"), 1299);
  assert.equal(parsePriceNumber("1.299,00"), 1299);
  assert.equal(parsePriceNumber("249,90"), 249.9);
  assert.equal(parsePriceNumber("₪ 1,299"), 1299);
  assert.equal(parsePriceNumber("abc"), null);
  assert.deepEqual(extractPrice('<meta property="og:price:amount" content="12.5"><meta property="og:price:currency" content="USD">'), { raw: "12.5", currency: "USD" });
  const src = readFileSync(path.join(ROOT, "api/price-watch.mjs"), "utf8");
  assert.match(src, /newNotifications > 0 \? notifications\.slice\(-newNotifications\) : \[\]/, "slice(-0) would re-push every stored notification");
  assert.match(src, /kvSet\(ANNOUNCED_KEY, announced\)/, "announced drops must be persisted");
});

test("safeUrl blocks internal targets", async () => {
  const { checkUrlSyntax, assertPublicUrl } = await import("../api/_utils/safeUrl.mjs");
  for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://10.1.2.3/", "http://169.254.169.254/latest", "http://[::1]/", "ftp://example.com/", "https://example.com:22/", "http://printer.local/"]) {
    assert.throws(() => checkUrlSyntax(bad), undefined, bad);
  }
  assert.doesNotThrow(() => checkUrlSyntax("https://www.aliexpress.com/item/1.html"));
  await assert.rejects(assertPublicUrl("http://127.0.0.1:8080/"));
});

// ── /api/store wiring (in-memory Supabase) ──────────────────────────────────
test("/api/store: anonymous create → 401, owner create → saved, click bump merged, server-only key refused", async () => {
  kv.clear();
  kv.set("marketplace:marketers", JSON.stringify([{ id: "m1", email: "owner@likelink.test", name: "Owner" }]));
  kv.set("marketplace:products", JSON.stringify([{ id: "p1", marketerId: "m1", title: "Bag", clicks: 0, status: "approved" }]));
  const { default: store } = await import("../api/store.mjs");
  const products = () => read("marketplace:products");

  let res = mockRes();
  await store(mockReq({ body: { key: "marketplace:products", value: JSON.stringify([...products(), { id: "p2", marketerId: "m1", title: "Fake" }]) } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(products().length, 1, "nothing written");

  res = mockRes();
  await store(mockReq({ body: { key: "marketplace:products", value: JSON.stringify([{ ...products()[0], clicks: 1, title: "defaced" }]) } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(products()[0].clicks, 1);
  assert.equal(products()[0].title, "Bag");

  res = mockRes();
  await store(mockReq({ token: "tok-owner", body: { key: "marketplace:products", value: JSON.stringify([...products(), { id: "p2", marketerId: "m1", title: "Real", status: "approved" }]) } }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(products().length, 2);

  res = mockRes();
  await store(mockReq({ token: "tok-other", body: { key: "marketplace:products", value: JSON.stringify([...products(), { id: "p9", marketerId: "m1", title: "Spoof" }]) } }), res);
  assert.equal(res.statusCode, 403);

  res = mockRes();
  await store(mockReq({ body: { key: "marketplace:vapid", value: { publicKey: "x", privateKey: "y" } } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "server_only_key");

  res = mockRes();
  await store(mockReq({ url: "/api/store?mode=force-bootstrap" }), res);
  assert.equal(res.statusCode, 403, "force-bootstrap is admin-only");
  assert.equal(products().length, 2, "catalog untouched");
});

test("/api/store: a failed catalog read refuses the write instead of overwriting", async () => {
  const { default: store } = await import("../api/store.mjs");
  const before = kv.get("marketplace:products");
  failReadsFor = new Set(["marketplace:products"]);
  const res = mockRes();
  await store(mockReq({ token: "tok-owner", body: { key: "marketplace:products", value: JSON.stringify([]) } }), res);
  failReadsFor = new Set();
  assert.equal(res.statusCode, 503);
  assert.equal(kv.get("marketplace:products"), before);
});

// ── image proxy allowlist (used by the reel renderer) ───────────────────────
test("image proxy serves catalog image hosts and refuses everything else", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (/^https:\/\/(images\.unsplash\.com|ae01\.alicdn\.com)\//.test(String(url))) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    }
    return realFetch(url, init);
  };
  try {
    const { default: og } = await import("../api/og.mjs");
    for (const img of ["https://images.unsplash.com/photo-1?w=900", "https://ae01.alicdn.com/kf/x.jpg"]) {
      const res = mockRes();
      await og(mockReq({ method: "GET", url: "/api/og?mode=image&u=" + encodeURIComponent(img) }), res);
      assert.equal(res.statusCode, 200, img);
    }
    const blocked = mockRes();
    await og(mockReq({ method: "GET", url: "/api/og?mode=image&u=" + encodeURIComponent("https://evil.example/x.png") }), blocked);
    assert.equal(blocked.statusCode, 403);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── /r affiliate forwarder ───────────────────────────────────────────────────
test("/r redirects only to catalog destinations; anything else gets an interstitial", async () => {
  kv.set("marketplace:products", JSON.stringify([{ id: "p1", marketerId: "m1", affiliateUrl: "https://www.aliexpress.com/item/1.html", status: "approved" }]));
  kv.set("marketplace:clicks", JSON.stringify([]));
  const { default: og } = await import("../api/og.mjs");
  let res = mockRes();
  await og(mockReq({ method: "GET", url: "/api/og?mode=r&pid=p1&u=" + encodeURIComponent("https://evil.example/phish") }), res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "https://www.aliexpress.com/item/1.html", "the stored affiliate URL wins over ?u=");
  assert.equal(read("marketplace:clicks").length, 1, "the outbound click is recorded");
  assert.equal(read("marketplace:clicks")[0].marketerId, "m1", "attribution comes from the catalog");

  res = mockRes();
  await og(mockReq({ method: "GET", url: "/api/og?mode=r&u=" + encodeURIComponent("https://evil.example/phish") }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.location, undefined, "no automatic redirect to an unknown site");
  assert.match(String(res.ended), /evil\.example/);
});
