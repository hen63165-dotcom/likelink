// Luna Autonomous Discovery Engine — contract tests.
//
// Locks in: truthful passports (only real data), an explainable score that is
// not a forecast, Merchant evaluation identical to the real feed, media truth,
// content from real fields only, idempotent/duplicate-safe execution, owner
// scoping, fail-closed auth, a channel registry that never infers a
// connection, and the /p/:id SEO that the engine audits.
import test from "node:test";
import assert from "node:assert/strict";

// ── in-memory Supabase REST + Auth stub (same shape as productionHardening) ──
const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
const kv = new Map();
const USERS = {
  "tok-owner": { id: "u-owner", email: "owner@likelink.test" },
  "tok-other": { id: "u-other", email: "other@likelink.test" },
  "tok-stranger": { id: "u-stranger", email: "nobody@likelink.test" },
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
const put = (key, value) => kv.set(key, JSON.stringify(value));
const read = (key) => (kv.has(key) ? JSON.parse(kv.get(key)) : undefined);

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
function mockReq({ method = "GET", url, token = "", body = null, headers = {} } = {}) {
  return {
    method, url, body,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    [Symbol.asyncIterator]: async function* () {},
  };
}

const MARKETERS = [
  { id: "m-owner", name: "ALYOSTYLE", slug: "alyostyle", email: "owner@likelink.test" },
  { id: "m-other", name: "Other Studio", slug: "other", email: "other@likelink.test" },
];
const PRODUCTS = [
  { id: "p1", title: "צמיד זהב עדין", description: "צמיד זהב עדין בעיצוב מינימליסטי שמתאים לכל יום, קל ונוח לענידה.", price: 89, currency: "ILS", image: "https://images.unsplash.com/photo-1", affiliateUrl: "https://store.example/1", category: "Accessories", status: "approved", marketerId: "m-owner" },
  { id: "p2", title: "שקית ואקום לנסיעות", description: "קצר מדי", price: 39, currency: "ILS", image: "https://images.unsplash.com/photo-2", affiliateUrl: "https://store.example/2", category: "Travel", status: "approved", marketerId: "m-owner" },
  { id: "p3", title: "מוצר של יוצר אחר", description: "מוצר ששייך ליוצר אחר ולכן אסור שלונה תפעל עליו מטעם הבעלים.", price: 120, image: "https://images.unsplash.com/photo-3", affiliateUrl: "https://store.example/3", category: "Home", status: "approved", marketerId: "m-other" },
  { id: "p4", title: "טיוטה לא מאושרת", description: "מוצר שעדיין לא אושר ולכן לא אמור להופיע באף משטח ציבורי בכלל.", price: 10, image: "https://images.unsplash.com/photo-4", affiliateUrl: "https://store.example/4", status: "pending", marketerId: "m-owner" },
];
function seed() {
  kv.clear();
  put("marketplace:products", PRODUCTS);
  put("marketplace:marketers", MARKETERS);
  put("marketplace:clicks", [{ id: "c1", productId: "p1", marketerId: "m-owner", ts: Date.now() - 3600_000 }]);
  put("publish:log", []);
  put("ugc:assets:p1", [{ id: "u1", imageUrl: "https://cdn.example/u1.png", synthetic: true, videoStatus: null, videoUrl: null }]);
}

// ── pure engine ──────────────────────────────────────────────────────────────
test("passport: score is explainable, sums its components and is not a forecast", async () => {
  const { buildPassport, SCORE_WEIGHTS, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const channels = buildChannelRegistry({ env: {} });
  const p = buildPassport({ product: PRODUCTS[0], marketers: MARKETERS, clicks: [{ productId: "p1", ts: 1 }], channels });
  assert.equal(p.score.components.reduce((s, c) => s + c.earned, 0), p.score.score);
  for (const c of p.score.components) assert.ok(c.evidence, `${c.id} carries evidence`);
  assert.match(p.score.meaning, /לא תחזית/);
  assert.equal(p.signals.clicks, 1, "clicks are counted, never invented");
  assert.equal(p.signals.sales, 0);
  for (const o of p.opportunities) {
    for (const f of ["what", "why", "evidence", "action", "channel", "status", "safety"]) assert.ok(o[f] !== undefined, `${o.kind}.${f}`);
    assert.ok("result" in o);
  }
});

test("merchant evaluation matches the real Google feed rules exactly", async () => {
  const { merchantStatus } = await import("../src/lib/discovery/surfaces.js");
  const { collectFeedItems, DEFAULT_BASE_URL } = await import("../src/lib/googleFeed.js");
  const direct = { ...PRODUCTS[0], id: "d1", merchantEligible: true, checkoutUrl: `${DEFAULT_BASE_URL}/checkout/d1` };
  for (const p of [...PRODUCTS, direct, { ...direct, id: "d2", price: 0 }, { ...direct, id: "d3", image: "" }]) {
    const inFeed = collectFeedItems({ products: [p], marketers: MARKETERS }).length === 1;
    assert.equal(merchantStatus(p, MARKETERS).eligible, inFeed, `product ${p.id}`);
  }
  const affiliate = merchantStatus(PRODUCTS[0], MARKETERS);
  assert.equal(affiliate.reasons[0].id, "not_direct_checkout");
  assert.equal(affiliate.requiresOwner, true);
});

test("media truth never upgrades an image, SVG or queued job to a video", async () => {
  const { productMediaTruth, classifyMediaRecord, MEDIA_TRUTH } = await import("../src/lib/discovery/mediaTruth.js");
  assert.equal(productMediaTruth({ image: "https://x/a.jpg" }).state, MEDIA_TRUTH.STATIC_IMAGE);
  assert.equal(productMediaTruth({}).state, MEDIA_TRUTH.MISSING_MEDIA);
  assert.equal(classifyMediaRecord({ videoUrl: "data:image/svg+xml;base64,AA", videoStatus: "available_as_motion_svg" }).state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.equal(classifyMediaRecord({ videoJobId: "job1", videoStatus: "queued" }).state, MEDIA_TRUTH.RENDER_JOB_ACTIVE);
  assert.equal(classifyMediaRecord({ videoJobId: "job1", videoStatus: "failed" }).state, MEDIA_TRUTH.MISSING_MEDIA);
  assert.equal(classifyMediaRecord({ videoUrl: "https://cdn.example/v.mp4" }).state, MEDIA_TRUTH.REAL_VIDEO);
  const synth = productMediaTruth({ image: "https://x/a.jpg" }, [{ imageUrl: "https://x/u.png", synthetic: true }]);
  assert.equal(synth.inventory.syntheticImages, 1, "synthetic visuals are counted as synthetic, not as UGC");
});

test("content drafts use only real fields and are labelled drafts", async () => {
  const { canonicalProduct, buildContentDrafts, buildShareAsset } = await import("../src/lib/discovery/surfaces.js");
  const c = canonicalProduct({ id: "x", title: "כוס", status: "approved" }, MARKETERS[0]);
  const d = buildContentDrafts(c);
  assert.equal(d.status, "DRAFT");
  assert.doesNotMatch(JSON.stringify(d), /₪|מחיר/, "no price is invented when the product has none");
  assert.doesNotMatch(JSON.stringify(d), /ביקורות|דירוג|כוכבים|reviews|rating/i, "no reviews/ratings are invented");
  const share = buildShareAsset(c, d);
  assert.ok(share.whatsappUrl.startsWith("https://wa.me/?text="));
  assert.ok(share.url.endsWith("/p/x"));
});

test("prioritization says so when real evidence is insufficient", async () => {
  const { buildPassport, prioritize, buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const channels = buildChannelRegistry({ env: {} });
  const passports = PRODUCTS.slice(0, 2).map((product) => buildPassport({ product, marketers: MARKETERS, channels }));
  const r = prioritize(passports);
  assert.equal(r.evidence, "insufficient");
  assert.match(r.evidenceNote, /אין עדיין מספיק נתוני ביצועים/);
});

test("channel registry never infers a connection", async () => {
  const { buildChannelRegistry } = await import("../src/lib/discovery/engine.js");
  const off = Object.fromEntries(buildChannelRegistry({ env: {} }).map((c) => [c.provider, c]));
  assert.equal(off.telegram.state, "REQUIRES_CONFIGURATION");
  assert.equal(off.telegram.connected, false);
  assert.equal(off.social_apis.state, "NOT_CONNECTED");
  assert.equal(off.ads_apis.connected, false);
  assert.equal(off.google_merchant.state, "REQUIRES_CONFIGURATION", "no eligible products → not ready");
  const on = Object.fromEntries(buildChannelRegistry({ env: { telegram: true } }).map((c) => [c.provider, c]));
  assert.equal(on.telegram.state, "CONNECTED");
});

// ── orchestrator (idempotency) ────────────────────────────────────────────────
test("commands execute only safe actions and are idempotent + duplicate-safe", async () => {
  const { runCommand } = await import("../src/lib/discovery/orchestrator.js");
  const store = new Map([
    ["marketplace:products", PRODUCTS], ["marketplace:marketers", MARKETERS],
    ["marketplace:clicks", [{ productId: "p1", ts: Date.now() }]], ["publish:log", []],
  ]);
  const writes = [];
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const kvSet = async (k, v) => { writes.push(k); store.set(k, structuredClone(v)); };
  const scope = { marketerIds: ["m-owner"], actor: "test" };
  const r1 = await runCommand({ kvGet, kvSet, command: "increase_exposure", scope });
  assert.equal(r1.ok, true);
  assert.ok(r1.executed.some((e) => e.kind === "create_share_asset" && e.status === "executed"));
  assert.ok(!r1.passports.some((p) => p.productId === "p3"), "another creator's product is never touched");
  assert.ok(r1.approvals.every((a) => a.safety === "approval"));
  assert.ok(!writes.some((k) => k.startsWith("marketplace:")), "products/marketers are never modified");
  assert.ok(writes.includes("discovery:assets:p1"));
  const firstWrites = writes.length;
  writes.length = 0;
  const r2 = await runCommand({ kvGet, kvSet, command: "increase_exposure", scope });
  assert.equal(writes.length, 0, `unchanged data → no writes (first run wrote ${firstWrites})`);
  assert.equal(r2.log.duplicate, true);
  assert.ok(r2.executed.filter((e) => e.kind === "create_share_asset").length === 0 || r2.executed.every((e) => e.status !== "executed"));
});

test("a product edit makes the share asset stale and the next run refreshes it", async () => {
  const { runCommand } = await import("../src/lib/discovery/orchestrator.js");
  const products = structuredClone(PRODUCTS);
  const store = new Map([["marketplace:products", products], ["marketplace:marketers", MARKETERS], ["publish:log", []]]);
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const kvSet = async (k, v) => { store.set(k, structuredClone(v)); };
  const scope = { marketerIds: ["m-owner"] };
  await runCommand({ kvGet, kvSet, command: "prepare_distribution", productId: "p1", scope });
  const before = store.get("discovery:assets:p1").fingerprint;
  products[0].price = 99;
  store.set("marketplace:products", products);
  const r = await runCommand({ kvGet, kvSet, command: "prepare_distribution", productId: "p1", scope });
  assert.notEqual(store.get("discovery:assets:p1").fingerprint, before);
  assert.ok(r.executed.some((e) => e.kind === "create_share_asset" && e.status === "executed"));
  assert.match(store.get("discovery:assets:p1").share.text, /₪99/);
});

// ── API through the real /api/store wiring ────────────────────────────────────
test("API: public passport, fail-closed commands, owner scope, no secrets", async () => {
  seed();
  const { default: store } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };

  let res = await call({ url: "/api/store?mode=discovery&action=passport&productId=p1" });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.passport.score.score > 0);
  assert.equal(JSON.stringify(res.body).includes("owner@likelink.test"), false, "no email in public output");
  res = await call({ url: "/api/store?mode=discovery&action=passport&productId=p4" });
  assert.equal(res.statusCode, 404, "unapproved products have no public passport");

  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=command", body: { command: "increase_exposure" } });
  assert.equal(res.statusCode, 401);
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=command", token: "tok-stranger", body: { command: "increase_exposure" } });
  assert.equal(res.statusCode, 403);
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=command", token: "tok-owner", body: { command: "promote_product", productId: "p3" } });
  assert.equal(res.statusCode, 403, "cannot act on another creator's product");
  assert.equal(read("discovery:assets:p3"), undefined);

  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=command", token: "tok-owner", body: { command: "promote_product", productId: "p1" } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.executed.some((e) => e.kind === "create_share_asset" && e.status === "executed"));
  const assets = read("discovery:assets:p1");
  assert.ok(assets.share.trackingLink.includes("/r?pid=p1"));
  assert.equal(assets.provenance.fingerprint, assets.fingerprint);
  assert.ok(read("discovery:log:m-owner").length === 1);
  assert.ok(read("discovery:passport:p1").history.length >= 1);

  process.env.BRAND_TELEGRAM_BOT = "secret-bot-token-value";
  process.env.BRAND_TELEGRAM_CHAT = "secret-chat-id";
  res = await call({ url: "/api/store?mode=discovery&action=channels" });
  const tg = res.body.channels.find((c) => c.provider === "telegram");
  assert.equal(tg.state, "CONNECTED");
  assert.equal(JSON.stringify(res.body).includes("secret-bot-token-value"), false, "secret values never leave the server");
  delete process.env.BRAND_TELEGRAM_BOT;
  delete process.env.BRAND_TELEGRAM_CHAT;
});

test("daily sweep is registered with the scheduler and idempotent", async () => {
  seed();
  const { AUTONOMOUS_JOBS } = await import("../src/lib/cloud/autonomousJobs.js");
  assert.ok(AUTONOMOUS_JOBS.includes("discovery-sweep"));
  const { runSweep } = await import("../src/lib/discovery/orchestrator.js");
  const store = new Map([["marketplace:products", PRODUCTS], ["marketplace:marketers", MARKETERS], ["publish:log", []]]);
  const writes = [];
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const kvSet = async (k, v) => { writes.push(k); store.set(k, structuredClone(v)); };
  const s1 = await runSweep({ kvGet, kvSet });
  assert.equal(s1.products, 3, "only public (approved + attributed) products");
  assert.equal(s1.assetsWritten, 3);
  writes.length = 0;
  const s2 = await runSweep({ kvGet, kvSet });
  assert.equal(s2.assetsWritten, 0);
  assert.equal(s2.snapshotsWritten, 0);
  assert.deepEqual(writes, ["discovery:sweep:last"], "a repeat sweep only refreshes its summary");
});

test("/p/:id serves the SEO the engine audits (meta description, JSON-LD, OG)", async () => {
  seed();
  const { default: og } = await import("../api/og.mjs");
  const res = mockRes();
  await og(mockReq({ url: "/api/og?id=p1", headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" } }), res);
  const html = String(res.ended || "");
  assert.equal(res.statusCode, 200);
  assert.match(html, /<meta name="description" content="צמיד זהב עדין בעיצוב מינימליסטי/);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"offers"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/mylikelink\.netlify\.app\/p\/p1"/);
  const { canonicalProduct, buildProductSeo } = await import("../src/lib/discovery/surfaces.js");
  const seo = buildProductSeo(canonicalProduct(PRODUCTS[0], MARKETERS[0]));
  assert.ok(html.includes(`<title>${seo.title}</title>`), "served title == audited title");
});
