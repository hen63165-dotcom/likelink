// LikeLink native operating system — the Luna Operating Laws in code.
//
// Truth records, intent compilation, capability resolution, action graphs,
// verified execution, failure recovery, rollback, structured memory,
// entitlements (incl. the PayPal self-heal end-to-end), publication proof and
// the evidence-backed system check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── in-memory Supabase + PayPal sandbox stub ─────────────────────────────────
const SB = "https://sb.test";
const PP = "https://api-m.sandbox.paypal.com";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.PAYPAL_ENV = "sandbox";
process.env.PAYPAL_CLIENT_ID = "test-client";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_PLAN_STARTER = "P-TEST-STARTER";
const kv = new Map();
const USERS = { "tok-owner": { id: "u-owner", email: "owner@likelink.test" } };
const PAYPAL_SUBS = {
  "I-ACTIVE-OK": { status: "ACTIVE", plan_id: "P-TEST-STARTER", custom_id: "u-owner" },
  "I-ACTIVE-WRONG-PLAN": { status: "ACTIVE", plan_id: "P-SOMETHING-ELSE", custom_id: "u-owner" },
  "I-APPROVAL-PENDING": { status: "APPROVAL_PENDING", plan_id: "P-TEST-STARTER", custom_id: "u-owner" },
  "I-CANCELLED": { status: "CANCELLED", plan_id: "P-TEST-STARTER", custom_id: "u-owner" },
  "I-SUSPENDED": { status: "SUSPENDED", plan_id: "P-TEST-STARTER", custom_id: "u-owner" },
  "I-RENEWED": { status: "ACTIVE", plan_id: "P-TEST-STARTER", custom_id: "u-owner", billing_info: { next_billing_time: "2031-01-01T00:00:00Z" } },
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
  if (u === `${PP}/v1/oauth2/token`) return jsonResponse(200, { access_token: "pp-test-token", expires_in: 3600 });
  if (u.startsWith(`${PP}/v1/billing/subscriptions/`)) {
    const id = decodeURIComponent(u.split("/v1/billing/subscriptions/")[1]);
    return PAYPAL_SUBS[id] ? jsonResponse(200, { id, ...PAYPAL_SUBS[id] }) : jsonResponse(404, { name: "RESOURCE_NOT_FOUND" });
  }
  return jsonResponse(404, {});
};
const put = (key, value) => kv.set(key, JSON.stringify(value));
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
function mockReq({ method = "GET", url, token = "", body = null } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    [Symbol.asyncIterator]: async function* () {},
  };
}

const MARKETERS = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle", email: "owner@likelink.test" }];
const product = (i, over = {}) => ({
  id: `p${i}`, title: `מוצר ${i} לבדיקה`, description: "תיאור אמיתי ומלא של המוצר שמתאים לבדיקות, ארוך מספיק כדי לעבור את בדיקות ה-SEO.",
  price: 50 + i, currency: "ILS", image: `https://images.unsplash.com/photo-${i}`, affiliateUrl: `https://store.example/${i}`,
  category: "Home", status: "approved", marketerId: "m1", ...over,
});
function memStore(entries) {
  const store = new Map(entries);
  const writes = [];
  return {
    store, writes,
    kvGet: async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb),
    kvSet: async (k, v) => { writes.push(k); store.set(k, structuredClone(v)); },
  };
}

// ── LAW 01 / 03 / 15 — truth layer ───────────────────────────────────────────
test("truth: no positive status without evidence, and expired proof downgrades", async () => {
  const { evidence, effectiveState, isProven, TRUTH } = await import("../src/lib/discovery/truth.js");
  assert.throws(() => evidence({ state: TRUTH.VERIFIED, source: "x" }), /truth_without_evidence/);
  assert.throws(() => evidence({ state: TRUTH.OBSERVED, evidence: "y" }), /truth_without_evidence/);
  const ev = evidence({ state: TRUTH.VERIFIED, source: "provider", evidence: "message id 42", verifiedAt: 1000, ttlMs: 500 });
  assert.equal(effectiveState(ev, 1200), TRUTH.VERIFIED);
  assert.equal(effectiveState(ev, 1600), TRUTH.STALE, "an expired proof becomes STALE on its own");
  assert.equal(isProven(ev, 1600), false);
});

// ── the laws exist in code ───────────────────────────────────────────────────
test("all 15 Luna Operating Laws point at code that exists", async () => {
  const { LAWS } = await import("../src/lib/discovery/laws.js");
  assert.equal(LAWS.length, 15);
  const files = { "truth.js": "src/lib/discovery/truth.js", "orchestrator.js": "src/lib/discovery/orchestrator.js", "intent.js": "src/lib/discovery/intent.js", "engine.js": "src/lib/discovery/engine.js", "entitlements.js": "src/lib/discovery/entitlements.js", "capabilities.js": "src/lib/discovery/capabilities.js", "surfaces.js": "src/lib/discovery/surfaces.js", "systemCheck.js": "src/lib/discovery/systemCheck.js", "store.mjs": "api/store.mjs" };
  for (const law of LAWS) {
    assert.ok(law.enforcedBy.length, law.id);
    for (const ref of law.enforcedBy) {
      const file = Object.keys(files).find((f) => ref.startsWith(f));
      assert.ok(file, `${law.id}: ${ref} names a known module`);
      assert.ok(existsSync(path.join(ROOT, files[file])), `${law.id}: ${files[file]} exists`);
      const fn = ref.split(":")[1]?.split(" ")[0];
      if (fn && /^[A-Za-z]+$/.test(fn) && !["permission", "rollback", "PERMISSION"].includes(fn)) {
        assert.match(readFileSync(path.join(ROOT, files[file]), "utf8"), new RegExp(`\\b${fn}\\b`), `${law.id}: ${fn} exists in ${file}`);
      }
    }
  }
});

// ── LAW 02 — intent compilation ──────────────────────────────────────────────
test("goals compile into structured intents; unknown goals are not guessed", async () => {
  const { compileIntent } = await import("../src/lib/discovery/intent.js");
  const google = compileIntent("Luna, prepare this store for Google.");
  assert.deepEqual(google.outcomes.sort(), ["merchant", "organic_search"]);
  assert.ok(google.requiredFacts.includes("merchant_eligible"));
  for (const k of ["goal", "subject", "desiredOutcome", "constraints", "permissions", "priority", "evidenceRequirements"]) assert.ok(k in google, k);
  const fix = compileIntent("לונה, תקני כל מה שמונע מהמוצר להתגלות", { productId: "p1" });
  assert.equal(fix.outcomes[0], "repair");
  assert.deepEqual(fix.subject, { type: "product", ids: ["p1"] });
  const unknown = compileIntent("בוקר טוב");
  assert.equal(unknown.understood, false);
  assert.equal(unknown.analyzeOnly, true, "an unknown goal analyzes only — it never executes a guess");
});

// ── capability resolver / action graph (LAW 06 / 10 / 14) ────────────────────
test("the action graph is derived from real state, prefers native, never auto-runs high risk", async () => {
  const { compileIntent, buildActionGraph } = await import("../src/lib/discovery/intent.js");
  const { buildPassport, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const channels = buildChannelRegistry({ env: {} });
  const good = buildPassport({ product: product(1), marketers: MARKETERS, channels });
  const weak = buildPassport({ product: product(2, { description: "קצר" }), marketers: MARKETERS, channels });
  const intent = compileIntent("לונה, תפיצי את המוצרים בכל מקום");
  const graph = buildActionGraph(intent, [good, weak], { externalConnected: false });
  assert.ok(graph.nodes.some((n) => n.capability === "create_share_asset" && n.status === "safe" && n.native));
  assert.ok(!graph.nodes.some((n) => n.status === "safe" && ["owner_explicit", "admin"].includes(n.permission)), "no high-risk node is ever 'safe'");
  // LAW 10: external channels are blocked → the native manual-share alternative exists.
  assert.ok(graph.nodes.some((n) => n.capability === "manual_share" && n.alternativeFor));
  const repair = buildActionGraph(compileIntent("לונה, תקני הכול"), [good, weak]);
  const weakFix = repair.nodes.filter((n) => n.productId === "p2" && n.capability === "fix_product_data");
  const goodFix = repair.nodes.filter((n) => n.productId === "p1" && n.capability === "fix_product_data");
  assert.ok(weakFix.length > goodFix.length, "missing data creates owner steps only where the data is really missing");
});

test("entitlement limits how many products one goal acts on (analysis is never limited)", async () => {
  const { compileIntent, buildActionGraph } = await import("../src/lib/discovery/intent.js");
  const { buildPassport, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const { resolveEntitlement } = await import("../src/lib/discovery/entitlements.js");
  const channels = buildChannelRegistry({ env: {} });
  const passports = Array.from({ length: 7 }, (_, i) => buildPassport({ product: product(i + 1), marketers: MARKETERS, channels }));
  const free = resolveEntitlement({ subscription: null });
  const graph = buildActionGraph(compileIntent("לונה, תגדילי חשיפה"), passports, { entitlement: free });
  const safeProducts = new Set(graph.nodes.filter((n) => n.status === "safe").map((n) => n.productId));
  assert.equal(safeProducts.size, 5, "free plan: Luna acts on 5 products per goal");
  assert.ok(graph.nodes.some((n) => n.status === "entitlement"), "the rest is shown, not silently dropped");
  const owner = resolveEntitlement({ isPlatformOwner: true });
  const ownerGraph = buildActionGraph(compileIntent("לונה, תגדילי חשיפה"), passports, { entitlement: owner });
  assert.equal(new Set(ownerGraph.nodes.filter((n) => n.status === "safe").map((n) => n.productId)).size, 7);
});

// ── self-extension ───────────────────────────────────────────────────────────
test("capabilities can be added without changing Luna core — but never without a verifier", async () => {
  const { registerCapability, CAPABILITIES, classifyFailure, FAILURE } = await import("../src/lib/discovery/capabilities.js");
  assert.throws(() => registerCapability("x_no_verify", { he: "x", reason: "r", risk: "low", permission: "session", executor: "internal", satisfies: [], preconditions: () => [], expected: "e" }), /capability_incomplete/);
  registerCapability("test_native_capability", { he: "בדיקה", reason: "r", risk: "low", permission: "session", executor: "internal", satisfies: ["test_fact"], preconditions: () => [], expected: "e", verification: "reread" });
  assert.equal(CAPABILITIES.test_native_capability.native, true);
  assert.equal(classifyFailure(new Error("kv_upsert_failed_503")).class, FAILURE.RETRYABLE);
  assert.equal(classifyFailure(new Error("kv_read_failed:marketplace:products")).class, FAILURE.SECURITY);
  assert.equal(classifyFailure(new Error("not_owner")).class, FAILURE.AUTHORIZATION);
});

// ── execution engine: proof, failure recovery, rollback, memory, laws ────────
test("execution: every executed step is verified by read-back and the run passes the law audit", async () => {
  const { runIntent, memoryAnswer } = await import("../src/lib/discovery/orchestrator.js");
  const m = memStore([["marketplace:products", [product(1), product(2)]], ["marketplace:marketers", MARKETERS], ["publish:log", []], ["marketplace:clicks", [{ productId: "p1", ts: Date.now() }]]]);
  const scope = { marketerIds: ["m1"], actor: "t" };
  const r = await runIntent({ ...m, goal: "לונה, תגדילי את החשיפה", scope });
  assert.equal(r.ok, true);
  const executed = r.steps.filter((s) => s.status === "executed");
  assert.ok(executed.length >= 2);
  for (const s of executed) assert.equal(s.proof.state, "VERIFIED", `${s.id} has read-back proof`);
  assert.equal(r.laws.ok, true, JSON.stringify(r.laws.rows.filter((x) => !x.ok)));
  const mem = await memoryAnswer({ kvGet: m.kvGet, scope });
  assert.ok(mem.tried.length && mem.happened.length && mem.next, "memory answers what was tried / happened / next");
});

test("failure recovery: a failed write is classified, dead-lettered and never reported as success", async () => {
  const { runIntent } = await import("../src/lib/discovery/orchestrator.js");
  const m = memStore([["marketplace:products", [product(1)]], ["marketplace:marketers", MARKETERS], ["publish:log", []]]);
  const kvSet = async (k, v) => { if (String(k).startsWith("discovery:assets:")) throw new Error("kv_upsert_failed_503"); m.store.set(k, structuredClone(v)); };
  const r = await runIntent({ kvGet: m.kvGet, kvSet, goal: "לונה, תגדילי את החשיפה", scope: { marketerIds: ["m1"] } });
  const failed = r.steps.find((s) => s.capability === "create_share_asset");
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.class, "retryable");
  assert.ok(failed.next);
  assert.equal(r.deadLetters, 1);
  assert.equal(m.store.get("discovery:deadletter").length, 1);
  assert.equal(r.laws.rows.find((x) => x.id === "LAW_09").ok, true);
  assert.ok(!r.passports[0].surfaces.find((s) => s.id === "share_asset" && s.status === "ready"), "no success state after a failed write");
});

test("rollback restores the previous asset version (LAW 13)", async () => {
  const { runIntent, rollbackAssets } = await import("../src/lib/discovery/orchestrator.js");
  const products = [product(1)];
  const m = memStore([["marketplace:products", products], ["marketplace:marketers", MARKETERS], ["publish:log", []]]);
  const scope = { marketerIds: ["m1"] };
  await runIntent({ ...m, goal: "לונה, תגדילי את החשיפה", scope });
  const first = m.store.get("discovery:assets:p1").fingerprint;
  m.store.set("marketplace:products", [{ ...products[0], price: 99 }]);
  await runIntent({ ...m, goal: "לונה, תגדילי את החשיפה", scope });
  assert.notEqual(m.store.get("discovery:assets:p1").fingerprint, first);
  const rb = await rollbackAssets({ ...m, productId: "p1", scope });
  assert.equal(rb.ok, true);
  assert.equal(m.store.get("discovery:assets:p1").fingerprint, first);
  // The restore sticks: the next autonomous run does not overwrite it while the product is unchanged.
  const again = await runIntent({ ...m, goal: "לונה, תגדילי את החשיפה", scope });
  assert.equal(m.store.get("discovery:assets:p1").fingerprint, first, "a manual restore is not overwritten by the next run");
  assert.equal(again.passports[0].surfaces.find((s) => s.id === "share_asset").status, "ready");
  // …until the product really changes.
  m.store.set("marketplace:products", [{ ...products[0], price: 120 }]);
  await runIntent({ ...m, goal: "לונה, תגדילי את החשיפה", scope });
  assert.notEqual(m.store.get("discovery:assets:p1").fingerprint, first, "new product data → new share pack");
  const other = await rollbackAssets({ ...m, productId: "p1", scope: { marketerIds: ["someone-else"] } });
  assert.equal(other.error, "not_owner");
});

// ── LAW 04 — publication proof ───────────────────────────────────────────────
test("publication counts only with provider confirmation or verifiable public state", async () => {
  const { verifyPublication } = await import("../src/lib/discovery/engine.js");
  const feed = new Set(["bp_1"]);
  assert.equal(verifyPublication({ status: "PUBLISHED", channel: "web", externalId: "bp_1" }, { publicFeedIds: feed }).verified, true);
  assert.equal(verifyPublication({ status: "PUBLISHED", channel: "web", externalId: "bp_gone" }, { publicFeedIds: feed }).verified, false);
  assert.equal(verifyPublication({ status: "PUBLISHED", channel: "telegram" }).verified, false, "no provider id → not published");
  assert.equal(verifyPublication({ status: "QUEUED", channel: "telegram", externalId: "1" }).verified, false, "queued is not published");
  assert.equal(verifyPublication({ status: "PUBLISHED", channel: "telegram", externalId: "4711" }).verified, true);
});

// ── LAW 05 — entitlements + the PayPal self-heal end-to-end ──────────────────
test("entitlements: pending never unlocks, cancelled keeps paid time, provider outages never revoke", async () => {
  const { resolveEntitlement, pickSubscription } = await import("../src/lib/discovery/entitlements.js");
  const now = Date.now();
  assert.equal(resolveEntitlement({ subscription: { planId: "professional", status: "pending" }, now }).plan, "free");
  assert.equal(resolveEntitlement({ subscription: { planId: "professional", status: "active" }, now }).plan, "professional");
  assert.equal(resolveEntitlement({ subscription: { planId: "starter", status: "active", expiresAt: new Date(now - 1).toISOString() }, now }).plan, "free");
  assert.equal(resolveEntitlement({ subscription: { planId: "enterprise", status: "cancelled", expiresAt: new Date(now + 86400000).toISOString() }, now }).plan, "enterprise");
  const src = readFileSync(path.join(ROOT, "src/lib/discovery/entitlements.js"), "utf8");
  assert.doesNotMatch(src, /\bfetch\(/, "the resolver never calls a provider, so a timeout can never revoke access");
  const all = [{ userId: "u", status: "pending", planId: "starter", createdAt: "2026-01-01" }, { userId: "x", status: "active", planId: "enterprise" }];
  assert.equal(pickSubscription(all, "u").status, "pending", "a pending record is found so it can be verified");
});

test("subs get: a pending PayPal subscription activates only on ACTIVE + custom_id + plan_id", async () => {
  const { default: store } = await import("../api/store.mjs");
  const call = async () => { const res = mockRes(); await store(mockReq({ method: "POST", url: "/api/store?mode=subs&sub=get", token: "tok-owner", body: {} }), res); return res; };
  const cases = [
    ["I-ACTIVE-OK", "active", "starter"],
    ["I-ACTIVE-WRONG-PLAN", "pending", "free"],
    ["I-APPROVAL-PENDING", "pending", "free"],
  ];
  for (const [ppId, expectStatus, expectPlan] of cases) {
    kv.clear();
    put("marketplace:subscriptions", [{ id: `s-${ppId}`, userId: "u-owner", planId: "starter", billingPeriod: "monthly", status: "pending", paypalSubscriptionId: ppId, createdAt: new Date().toISOString() }]);
    const res = await call();
    assert.equal(res.statusCode, 200, ppId);
    assert.equal(res.body.subscription.status, expectStatus, `${ppId}: subscription status`);
    assert.equal(res.body.plan, expectPlan, `${ppId}: plan comes from the entitlement resolver`);
    assert.equal(res.body.entitlement.plan, expectPlan);
  }
});

test("subs get: an ACTIVE subscription is reconciled with PayPal — cancel keeps the paid period, a failed lookup never revokes", async () => {
  const { default: store } = await import("../api/store.mjs");
  const call = async () => { const res = mockRes(); await store(mockReq({ method: "POST", url: "/api/store?mode=subs&sub=get", token: "tok-owner", body: {} }), res); return res; };
  const startedAt = new Date(Date.now() - 5 * 86400000).toISOString();
  const cases = [
    // [paypal id, lastReconciledAt, expected status, expected plan]
    ["I-CANCELLED", 0, "cancelled", "starter"],
    ["I-SUSPENDED", 0, "suspended", "free"],
    ["I-RENEWED", 0, "active", "starter"],
    ["I-DOES-NOT-EXIST", 0, "active", "starter"],
    ["I-SUSPENDED", Date.now() - 60000, "active", "starter"],
  ];
  for (const [ppId, lastReconciledAt, expectStatus, expectPlan] of cases) {
    kv.clear();
    put("marketplace:subscriptions", [{ id: `s-${ppId}`, userId: "u-owner", planId: "starter", billingPeriod: "monthly", status: "active", paypalSubscriptionId: ppId, startedAt, lastReconciledAt, createdAt: startedAt }]);
    const res = await call();
    assert.equal(res.statusCode, 200, ppId);
    assert.equal(res.body.subscription.status, expectStatus, `${ppId} (last check ${lastReconciledAt ? "recent" : "old"}): status`);
    assert.equal(res.body.plan, expectPlan, `${ppId}: plan`);
  }
  // cancelled keeps access exactly until the paid period ends
  kv.clear();
  put("marketplace:subscriptions", [{ id: "s-c", userId: "u-owner", planId: "starter", billingPeriod: "monthly", status: "active", paypalSubscriptionId: "I-CANCELLED", startedAt, lastReconciledAt: 0 }]);
  const res = await call();
  const end = Date.parse(res.body.subscription.expiresAt);
  assert.ok(end > Date.now() && end <= Date.parse(startedAt) + 32 * 86400000, "expiresAt = end of the month already paid for");
  const { reconcileActiveSubscription } = await import("../src/lib/discovery/entitlements.js");
  const renewed = reconcileActiveSubscription({ status: "active" }, { status: "ACTIVE", nextBillingTime: "2031-01-01T00:00:00Z" }, 1);
  assert.equal(renewed.paidThrough, "2031-01-01T00:00:00.000Z", "renewal records the next billing time");
});

// ── LAW 15 — system check ────────────────────────────────────────────────────
test("system check: every color has evidence; open RLS is RED; the public view hides private data", async () => {
  const { evaluateSystem } = await import("../src/lib/discovery/systemCheck.js");
  const probes = {
    db: { ok: true, ms: 120 }, auth: { configured: true, reachable: true },
    payments: { paypalConfigured: true, webhookConfigured: false, pending: 2, active: 1 },
    publishing: { verified: 3, unverified: 0, externalConnected: false },
    merchant: { eligible: 0, total: 28, topReason: "מוצר שותפים", avgReadiness: 70 },
    autopilot: { lastBeatAt: Date.now() - 3600e3, lastMode: "light", lastDailyAt: Date.now() - 5 * 3600e3, cronSecret: false, total: 14, failed: 0, overdue: 3 },
    ugc: { realVideos: 0, syntheticImages: 6, images: 28 }, storage: { checked: true, ok: true },
    tracking: { clicks: 2, lastClickAt: Date.now() - 86400e3 }, publicPages: { publicProducts: 28, seoComplete: 20 },
    channels: [{ provider: "web", label: "פיד האתר", connected: true, stateHe: "מחובר" }],
    security: { rlsOpen: true, secretsTotal: 8, secretsPresent: 4, missing: ["CRON_SECRET", "PAYOUTS_SECRET"] },
    deployment: { sha: "abc1234def", env: "production" },
  };
  const pub = evaluateSystem(probes, { audience: "public" });
  for (const a of pub.areas) { assert.ok(a.evidence.length, `${a.id} has evidence`); assert.ok(["GREEN", "YELLOW", "RED", "UNVERIFIED"].includes(a.color)); }
  const byId = Object.fromEntries(pub.areas.map((a) => [a.id, a]));
  assert.equal(byId.security.color, "RED");
  assert.equal(byId.autopilot.color, "YELLOW");
  assert.equal(byId.studio.color, "UNVERIFIED", "the server never claims to have checked the UI");
  assert.equal(pub.overall, "RED");
  const pubText = JSON.stringify(pub);
  assert.doesNotMatch(pubText, /[A-Z]+_(SECRET|ID)\b|kv_lockdown|anon|RLS|2 מנויים ממתינים|2 קליקים/, "public view: no env names, no vulnerability details, no private counts");
  const owner = JSON.stringify(evaluateSystem(probes, { audience: "owner" }));
  assert.match(owner, /PAYOUTS_SECRET/, "owner sees the missing secret NAMES even while RLS is RED");
  assert.match(owner, /kv_lockdown\.sql/);
});

test("system check: RLS 'locked' needs proof; private fields in a public row are reported", async () => {
  const { classifyRlsProbe, publicPiiCounts, evaluateSystem } = await import("../src/lib/discovery/systemCheck.js");
  const seen = { reached: true, httpOk: true, rows: 1 };
  const hidden = { reached: true, httpOk: true, rows: 0 };
  assert.equal(classifyRlsProbe({ privateProbe: seen, controlProbe: seen, privateKeyExists: true }), true, "anon sees a server-only row → open");
  assert.equal(classifyRlsProbe({ privateProbe: hidden, controlProbe: seen, privateKeyExists: true }), false, "row exists, anon key works, row hidden → locked");
  assert.equal(classifyRlsProbe({ privateProbe: hidden, controlProbe: seen, privateKeyExists: false }), null, "a missing row is not proof of a lock");
  assert.equal(classifyRlsProbe({ privateProbe: hidden, controlProbe: hidden, privateKeyExists: true }), null, "a broken anon key is not proof of a lock");
  assert.equal(classifyRlsProbe({ privateProbe: { reached: false }, controlProbe: seen, privateKeyExists: true }), null);

  assert.deepEqual(publicPiiCounts([{ email: "a@b.c", bankDetails: { account: "", holder: "" } }, { email: "", payPalEmail: "p@q.r" }]), { emails: 1, payment: 1 });
  const base = { db: { ok: true, ms: 1 }, auth: { reachable: true }, payments: { paypalConfigured: true, webhookConfigured: true }, deployment: { sha: "x" } };
  const emailOnly = evaluateSystem({ ...base, security: { rlsOpen: false, publicEmails: 1, publicPaymentDetails: 0, secretsTotal: 1, secretsPresent: 1 } }, { audience: "owner" });
  const sec = emailOnly.areas.find((a) => a.id === "security");
  assert.equal(sec.color, "YELLOW");
  assert.match(sec.evidence.join(" "), /אימיילים של יוצרים/);
  assert.match(sec.ownerAction, /marketplace:marketers/);
  const payment = evaluateSystem({ ...base, security: { rlsOpen: false, publicEmails: 1, publicPaymentDetails: 1, secretsTotal: 1, secretsPresent: 1 } }, { audience: "public" });
  const pubSec = payment.areas.find((a) => a.id === "security");
  assert.equal(pubSec.color, "RED", "public payment details are a real fault");
  assert.doesNotMatch(JSON.stringify(pubSec), /marketplace:marketers|payPalEmail|bankDetails|אימייל/, "the public view does not describe the exposure");
  const unknown = evaluateSystem({ ...base, security: { rlsOpen: null, secretsTotal: 1, secretsPresent: 1 } }, { audience: "owner" });
  assert.notEqual(unknown.areas.find((a) => a.id === "security").color, "GREEN", "an unverified lock is never GREEN");
});

test("system check: payments are judged on PayPal evidence — never a guessed failure", async () => {
  const { evaluateSystem } = await import("../src/lib/discovery/systemCheck.js");
  const base = { paypalConfigured: true, webhookConfigured: false, plansTotal: 3, plansConfigured: 0, missingPlans: ["PAYPAL_PLAN_STARTER", "PAYPAL_PLAN_PROFESSIONAL", "PAYPAL_PLAN_ENTERPRISE"], tokenOk: true, paypalEnv: "live", provisioned: 0, provisionedVerified: 0 };
  const at = (payments, audience = "owner") => evaluateSystem({ payments }, { audience }).areas.find((a) => a.id === "payments");
  // Plans were never provisioned (they are created on the first sub=create): not tried ≠ broken.
  const untried = at(base);
  assert.equal(untried.color, "YELLOW");
  assert.match(untried.evidence.join(" "), /עוד לא נוסה/);
  assert.match(untried.ownerAction, /PAYPAL_PLAN_STARTER/);
  assert.match(untried.ownerAction, /PAYPAL_WEBHOOK_ID/);
  assert.doesNotMatch(JSON.stringify(at(base, "public")), /[A-Z]+_(SECRET|ID|STARTER|PROFESSIONAL|ENTERPRISE)/);
  // PayPal itself rejects the credentials (401/403) → a proven fault; a network error proves nothing.
  const rejected = at({ ...base, tokenOk: false, tokenRejected: true, tokenStatus: 401, paypalEnvSource: "inferred" });
  assert.equal(rejected.color, "RED");
  assert.match(rejected.ownerAction, /PAYPAL_ENV=sandbox/);
  assert.doesNotMatch(JSON.stringify(at({ ...base, tokenOk: false, tokenRejected: true, tokenStatus: 401 }, "public")), /[A-Z]+_(SECRET|ID|ENV)|HTTP/);
  assert.equal(at({ ...base, tokenOk: false, tokenRejected: false }).color, "YELLOW", "a timeout is not a rejection");
  // Self-provisioned plans verified ACTIVE at PayPal + webhook → GREEN.
  assert.equal(at({ ...base, provisioned: 3, provisionedVerified: 3, webhookConfigured: true }).color, "GREEN");
  assert.equal(at({ ...base, provisioned: 3, provisionedVerified: 2, webhookConfigured: true }).color, "YELLOW", "one plan not ACTIVE at PayPal is not ready");
  assert.equal(at({ ...base, plansConfigured: 3, missingPlans: [], webhookConfigured: true }).color, "GREEN");
});

test("API: goal compiles + executes for the owner, fails closed for anonymous callers", async () => {
  kv.clear();
  put("marketplace:products", [product(1), product(2)]);
  put("marketplace:marketers", MARKETERS);
  put("publish:log", []);
  const { default: store } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=goal", body: { goal: "לונה, תגדילי חשיפה" } });
  assert.equal(res.statusCode, 401);
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=goal", token: "tok-owner", body: { goal: "Luna, increase discovery for this product.", productId: "p1" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.intent.subject.type, "product");
  assert.ok(res.body.graph.nodes.length > 0);
  assert.equal(res.body.laws.ok, true);
  res = await call({ url: "/api/store?mode=discovery&action=memory", token: "tok-owner" });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.tried.length >= 1);
  res = await call({ url: "/api/store?mode=discovery&action=system-check" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.audience, "public");
  assert.ok(res.body.check.areas.length >= 14);
  assert.doesNotMatch(JSON.stringify(res.body), /service-role-test-key|test-secret/, "no secret value ever leaves");
  res = await call({ url: "/api/store?mode=discovery&action=laws" });
  assert.equal(res.body.laws.length, 15);
});

test("capability contract: every capability is complete, versioned and discoverable; bad ones are refused", async () => {
  const { CAPABILITIES, listCapabilities, validateCapability, registerCapability, dependencyDepth } = await import("../src/lib/discovery/capabilities.js");
  for (const [id, c] of Object.entries(CAPABILITIES)) {
    assert.deepEqual(validateCapability(id, c), [], `${id} passes the contract`);
    for (const k of ["dependencies", "evidence", "recovery", "version", "verification"]) assert.ok(c[k] !== undefined, `${id}.${k}`);
  }
  const catalog = listCapabilities();
  assert.ok(catalog.length >= 12);
  assert.ok(catalog.every((c) => typeof c.preconditions === "undefined"), "the catalog is data only");
  assert.deepEqual(catalog.filter((c) => c.autonomous && !c.id.startsWith("test_")).map((c) => c.id).sort(), ["agent_commerce_readiness", "build_campaign", "create_share_asset", "record_passport", "verify_product_seo"].sort(), "only native low-risk internal steps (drafts / verification) run by themselves");
  assert.equal(dependencyDepth("publish_external"), 1);
  const base = { he: "x", reason: "r", risk: "low", permission: "owner", executor: "owner", satisfies: [], preconditions: () => [], expected: "e", verification: "v" };
  assert.throws(() => registerCapability("bad_permission", { ...base, permission: "god" }), /permission_value/);
  assert.throws(() => registerCapability("bad_dependency", { ...base, dependencies: ["does_not_exist"] }), /dependency:does_not_exist/);
  assert.throws(() => registerCapability("risky_autonomous", { ...base, permission: "session", executor: "internal", risk: "high" }), /autonomous_must_be_native_low_risk/);
  assert.throws(() => registerCapability("failing_self_test", { ...base, selfTest: () => false }), /capability_self_test_failed/);
  const ok = registerCapability("owner_checklist_test", { ...base, dependencies: ["fix_product_data"], selfTest: () => true });
  assert.equal(ok.version, 1);
  assert.ok(listCapabilities().some((c) => c.id === "owner_checklist_test" && c.available), "registered → available to Luna");
});

test("action graph: edges come from declared dependencies, not per-workflow wiring", async () => {
  const { compileIntent, buildActionGraph } = await import("../src/lib/discovery/intent.js");
  const { buildPassport, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const channels = buildChannelRegistry({ env: {} });
  const passport = buildPassport({ product: product(1), marketers: MARKETERS, channels });
  const graph = buildActionGraph(compileIntent("לונה, תפרסמי את כל מה שאישרתי"), [passport], { externalConnected: false });
  const publish = graph.nodes.find((n) => n.capability === "publish_external");
  if (publish) {
    const into = graph.edges.filter((e) => e.to === publish.id && e.type === "requires").map((e) => graph.nodes.find((n) => n.id === e.from)?.capability);
    assert.ok(into.includes("connect_channel"), "publishing requires a connected channel");
  }
  const idx = (cap) => graph.nodes.findIndex((n) => n.capability === cap);
  if (idx("connect_channel") >= 0 && idx("publish_external") >= 0) assert.ok(idx("connect_channel") < idx("publish_external"), "dependencies are ordered first");
  assert.ok(graph.nodes.some((n) => n.capability === "manual_share"), "LAW 10: a blocked channel always offers the legitimate manual path");
});
