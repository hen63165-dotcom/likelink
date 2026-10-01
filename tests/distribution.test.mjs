// DISTRIBUTION — content plans from real products, honest by construction.
//
// Pins: every word comes from the product's own fields (no testimonials, no
// "best seller", no invented experience); the affiliate disclosure opens every
// caption; each post has its own /r tracking link (src=<channel>.<postId>);
// image prompts ask for ORIGINAL characters and never name a studio/brand;
// quotas and plan features are enforced on the server; "publish" is refused
// without a provider-verified connection and a creator-reported post never
// becomes PUBLISHED; nothing leaves the server.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
const kv = new Map();
const USERS = { "tok-owner": { id: "u-owner", email: "owner@likelink.test" }, "tok-other": { id: "u-other", email: "other@likelink.test" } };
const outbound = [];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
// A stand-in for Telegram's real API (no network): records every call.
const TG = { calls: [], status: 200, messageId: 42, username: "noa_channel" };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.telegram.org/bot")) {
    TG.calls.push({ method: u.split("/").pop(), body: JSON.parse(init.body || "{}") });
    if (TG.status !== 200) return jsonResponse(TG.status, { ok: false, error_code: TG.status, description: "Unauthorized" });
    return jsonResponse(200, { ok: true, result: { message_id: TG.messageId, chat: { id: -100123, type: "channel", username: TG.username } } });
  }
  if (u.startsWith(`https://t.me/${TG.username}/`)) {
    const id = u.split("/").pop().split("?")[0];
    return new Response(`<div class="tgme_widget_message" data-post="${TG.username}/${id}">…</div>`, { status: 200 });
  }
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
  return { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, json(o) { this.body = o; }, end() {}, writeHead(c) { this.statusCode = c; } };
}
function mockReq({ method = "GET", url, token = "", body = null }) {
  return { method, url, body, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.61", ...(token ? { authorization: `Bearer ${token}` } : {}) }, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
const PRODUCT = { id: "p1", title: "שרשרת כסף עדינה עם תליון לב", description: "שרשרת כסף 925 באורך 45 ס\"מ. תליון לב קטן בגודל 1 ס\"מ. מגיעה בקופסת מתנה.", price: 89, currency: "ILS", image: "https://ae01.alicdn.com/kf/S-real-product-photo.jpg", category: "תכשיטים", affiliateUrl: "https://s.click.aliexpress.com/e/1", status: "approved", marketerId: "m1" };
function seed(planId = null) {
  kv.clear();
  put("marketplace:products", [PRODUCT, { ...PRODUCT, id: "p2", marketerId: "m2", affiliateUrl: "https://s.click.aliexpress.com/e/2" }]);
  put("marketplace:marketers", [{ id: "m1", name: "נועה", slug: "noa" }, { id: "m2", name: "Other", slug: "other" }]);
  put("marketplace:marketers:private", { m1: { email: "owner@likelink.test" }, m2: { email: "other@likelink.test" } });
  if (planId) put("marketplace:subscriptions", [{ id: "s1", userId: "u-owner", planId, billingPeriod: "monthly", status: "active", startedAt: "2026-09-01T00:00:00.000Z" }]);
}
async function call(opts) {
  const { default: store } = await import("../api/store.mjs");
  const res = mockRes();
  await store(mockReq(opts), res);
  return res;
}

// ── the engine ───────────────────────────────────────────────────────────────
test("a plan is built from real fields only — disclosure first, a tracking link per post, no invented claims", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { generateDistributionPlan, FORBIDDEN_CLAIMS, POST_STATE } = await import("../src/lib/discovery/distribution.js");
  const c = canonicalProduct(PRODUCT, { id: "m1", name: "נועה", slug: "noa" });
  const plan = generateDistributionPlan(c, { now: Date.parse("2026-10-01T08:00:00Z") });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, "DRAFT");
  assert.doesNotMatch(JSON.stringify(plan), FORBIDDEN_CLAIMS, "no testimonials, rankings or guarantees");
  const sources = new Set();
  for (const post of plan.calendar) {
    assert.ok(post.caption.startsWith("#פרסומת · קישור שותפים"), `${post.channel}: disclosure opens the caption`);
    const link = new URL(post.link);
    assert.equal(link.pathname, "/r");
    assert.equal(link.searchParams.get("pid"), "p1");
    assert.equal(link.searchParams.get("src"), `${post.channel}.${post.postId}`);
    sources.add(link.searchParams.get("src"));
    assert.ok(post.caption.includes(post.link), "the caption carries the post's own link");
    assert.equal(post.state, POST_STATE.DRAFT);
    assert.equal(post.publish.permission, "owner_explicit");
    assert.ok(post.aiLabel && post.disclosureTool);
  }
  assert.equal(sources.size, plan.calendar.length, "every post is attributed separately");
  assert.match(JSON.stringify(plan.scripts), /אין להמציא חוויה/, "a personal line is only an instruction, never invented");
  assert.ok(plan.scripts[0].beats.every((b) => !/ניסיתי|התאהבתי|הכי טוב/.test(b.voice)), "no first-person experience is written for the creator");
  assert.ok(plan.fit.note.includes("לא תחזית"));
});

test("a store's rating or review count in the description never reaches a post", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { generateDistributionPlan, FORBIDDEN_CLAIMS } = await import("../src/lib/discovery/distribution.js");
  const plan = generateDistributionPlan(canonicalProduct({ ...PRODUCT, description: "עגילים מכסף 925 עם אבני מואסניט. 4.8 כוכבים מעל 1,400 ביקורות. מגיעים בקופסה." }));
  assert.equal(plan.ok, true);
  assert.doesNotMatch(JSON.stringify(plan), FORBIDDEN_CLAIMS);
  assert.match(JSON.stringify(plan.calendar), /עגילים מכסף 925/, "the real facts stay");
});

test("image prompts ask for original characters and never name a studio, brand or person", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { buildImagePrompts } = await import("../src/lib/discovery/distribution.js");
  const prompts = buildImagePrompts(canonicalProduct(PRODUCT));
  for (const p of prompts) {
    assert.match(p.prompt, /original/i);
    assert.match(p.prompt, /must not resemble any existing/i);
    assert.match(p.prompt, /reference photo/i, "the real product photo is the reference");
    assert.doesNotMatch(p.prompt, /pixar|disney|dreamworks|marvel|ghibli|nintendo|mickey|elsa|barbie/i);
  }
});

test("catalog integrity: a stock photo is never shown as the product; a shared affiliate link blocks the plan", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { generateDistributionPlan } = await import("../src/lib/discovery/distribution.js");
  const { catalogIssues, isPromotable, imageProvenance } = await import("../src/lib/discovery/catalogIntegrity.js");
  assert.equal(imageProvenance("https://images.unsplash.com/photo-1?w=900"), "stock_photo");
  assert.equal(imageProvenance("https://ae01.alicdn.com/kf/S1.jpg"), "merchant_photo");
  assert.equal(imageProvenance("/api/og?mode=media&path=products/m1/a.jpg"), "own_upload");
  const stock = generateDistributionPlan(canonicalProduct({ ...PRODUCT, image: "https://images.unsplash.com/photo-1" }));
  assert.ok(stock.ok);
  assert.ok(stock.calendar.every((p) => !["instagram_reels", "tiktok", "youtube_shorts", "pinterest"].includes(p.channel)), "no visual post from a stock photo");
  assert.equal(stock.media.provenance, "stock_photo");
  assert.ok(stock.storyboard.every((f) => f.reference === null));
  const catalog = [PRODUCT, { ...PRODUCT, id: "x1", title: "נעלי ריצה", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }, { ...PRODUCT, id: "x2", title: "סרום", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }];
  assert.equal(isPromotable(catalog[0], catalog), true);
  assert.equal(isPromotable(catalog[1], catalog), false);
  const issues = catalogIssues(catalog[1], catalog);
  const blocked = generateDistributionPlan(canonicalProduct(catalog[1]), { issues });
  assert.equal(blocked.ok, false);
  assert.match(blocked.blockers.join(" "), /אותו קישור שותפים משמש 2 מוצרים/);
});

test("no image → no video or pin posts; not approved → no plan", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { generateDistributionPlan } = await import("../src/lib/discovery/distribution.js");
  const plan = generateDistributionPlan(canonicalProduct({ ...PRODUCT, image: "" }));
  assert.ok(plan.calendar.length > 0);
  assert.ok(plan.calendar.every((p) => !["instagram_reels", "tiktok", "youtube_shorts", "pinterest"].includes(p.channel)));
  const draft = generateDistributionPlan(canonicalProduct({ ...PRODUCT, status: "pending" }));
  assert.equal(draft.ok, false);
  assert.equal(draft.error, "product_not_ready");
});

test("click stats: totals for everyone, breakdown by channel and post only when detailed", async () => {
  const { clickStats } = await import("../src/lib/discovery/distribution.js");
  const clicks = [
    { type: "outbound_click", productId: "p1", source: "tiktok.dp_x-2" },
    { type: "outbound_click", productId: "p1", source: "tiktok.dp_x-2" },
    { type: "outbound_click", productId: "p1", source: "whatsapp.dp_x-3" },
    { type: "outbound_click", productId: "p9", source: "tiktok.dp_y-1" },
  ];
  assert.deepEqual(clickStats(clicks, ["p1"]), { total: 3, byProduct: { p1: 3 }, detailed: false });
  const d = clickStats(clicks, ["p1"], { detailed: true });
  assert.deepEqual(d.byChannel, { tiktok: 2, whatsapp: 1 });
  assert.deepEqual(d.byPost, { "dp_x-2": 2, "dp_x-3": 1 });
});

test("content pack export: CSV (UTF-8 with BOM for Excel) with one row per post, or JSON", async () => {
  const { canonicalProduct } = await import("../src/lib/discovery/surfaces.js");
  const { generateDistributionPlan, exportContentPack } = await import("../src/lib/discovery/distribution.js");
  const plan = generateDistributionPlan(canonicalProduct(PRODUCT));
  const csv = exportContentPack(plan, "csv");
  assert.equal(csv.content.charCodeAt(0), 0xfeff);
  assert.match(csv.content, new RegExp(`^${String.fromCharCode(0xfeff)}"date","time","channel"`));
  assert.equal(csv.content.split("\r\n").length, plan.calendar.length + 1 + plan.calendar.reduce((n, p) => n + (p.caption.match(/\r\n/g) || []).length, 0));
  assert.equal(JSON.parse(exportContentPack(plan, "json").content).id, plan.id);
});

test("channel catalog: nothing is 'connected' without provider verification; each has the exact owner action", async () => {
  const { distributionChannels } = await import("../src/lib/discovery/distribution.js");
  const list = distributionChannels();
  for (const ch of list) {
    assert.notEqual(ch.state, "CONNECTED", ch.id);
    if (ch.state === "REQUIRES_CONNECTION") assert.ok(ch.ownerAction && ch.api, `${ch.id} names the API and the owner action`);
  }
  assert.equal(distributionChannels({ connections: { tiktok: { verifiedAt: null } } }).find((c) => c.id === "tiktok").state, "REQUIRES_CONNECTION", "an unverified token is not a connection");
});

test("capabilities: fit is autonomous-safe, the plan needs the creator, publishing is owner-explicit external", async () => {
  await import("../src/lib/discovery/distribution.js");
  const { CAPABILITIES, validateCapability, PERMISSION } = await import("../src/lib/discovery/capabilities.js");
  for (const id of ["analyze_distribution_fit", "generate_distribution_plan", "publish_distribution_post"]) {
    assert.ok(CAPABILITIES[id], id);
    assert.deepEqual(validateCapability(id, CAPABILITIES[id]), [], id);
  }
  assert.equal(CAPABILITIES.generate_distribution_plan.permission, PERMISSION.OWNER, "uses quota → never autonomous");
  assert.equal(CAPABILITIES.publish_distribution_post.permission, PERMISSION.OWNER_EXPLICIT);
  assert.equal(CAPABILITIES.publish_distribution_post.verification, "provider_post_id");
});

// ── the API ──────────────────────────────────────────────────────────────────
test("API: Free is refused with the plan that includes it; Starter builds, stores and counts", async () => {
  seed();
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, "plan_required");
  assert.equal(res.body.upgrade.id, "starter");
  seed("starter");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.verified, true);
  assert.equal(read("distribution:plans:m1").length, 1);
  const { quotaStoreKey } = await import("../src/lib/discovery/quotas.js");
  assert.equal(read(quotaStoreKey("m1")).distributionPlans, 1);
  put(quotaStoreKey("m1"), { distributionPlans: 20 });
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  assert.equal(res.statusCode, 429);
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p2" } });
  assert.equal(res.statusCode, 403, "another creator's product is refused before any quota is read");
  assert.equal(read(quotaStoreKey("m1")).distributionPlans, 20, "a refused request never counts");
});

test("API: publish is refused without a verified connection; a reported post is never PUBLISHED; nothing leaves the server", async () => {
  seed("professional");
  const before = outbound.length;
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  const plan = res.body.plan;
  const post = plan.calendar.find((p) => p.channel === "tiktok");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", permission: "owner_explicit", confirm: true } });
  assert.equal(res.statusCode, 400, "a generic 'confirm: true' is not the owner's approval of THIS post");
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", confirm: post.postId } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "channel_requires_connection");
  assert.match(res.body.ownerAction, /TikTok for Developers/);
  res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "reported", postUrl: "https://www.tiktok.com/@noa/video/1" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.post.state, "REPORTED_BY_CREATOR");
  const stored = read("distribution:plans:m1")[0].calendar.find((p) => p.postId === post.postId);
  assert.notEqual(stored.state, "PUBLISHED");
  assert.equal(outbound.length, before, `no outbound request (saw: ${outbound.slice(before).join(", ")})`);
});

test("API: export needs Starter; click stats break down only on Starter+", async () => {
  seed("starter");
  let res = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  const id = res.body.plan.id;
  res = await call({ url: `/api/store?mode=discovery&action=distribution-export&id=${id}&format=csv`, token: "tok-owner" });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.file.content, /"date","time","channel"/);
  put("marketplace:clicks", [{ type: "outbound_click", productId: "p1", source: `tiktok.${id}-2` }, { type: "outbound_click", productId: "p2", source: "x.other" }]);
  res = await call({ url: "/api/store?mode=discovery&action=click-stats", token: "tok-owner" });
  assert.deepEqual([res.body.total, res.body.byChannel], [1, { tiktok: 1 }], "only my products, broken down");
  kv.delete("marketplace:subscriptions");
  res = await call({ url: `/api/store?mode=discovery&action=distribution-export&id=${id}&format=csv`, token: "tok-owner" });
  assert.equal(res.statusCode, 402);
  res = await call({ url: "/api/store?mode=discovery&action=click-stats", token: "tok-owner" });
  assert.equal(res.body.byChannel, undefined, "Free sees totals only");
  assert.equal(res.body.total, 1);
});

// ── real publication (Telegram) ─────────────────────────────────────────────
const BOT = "123456789:AAFakeTokenForTestsOnly_abcdefghijklmnopq";
async function telegramPlan() {
  seed("professional");
  put("marketplace:autopilot", { m1: { enabled: false, channels: [{ type: "telegram", botToken: BOT, chatId: "@noa_channel" }] } });
  TG.calls.length = 0; TG.status = 200;
  const r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-plan", token: "tok-owner", body: { productId: "p1" } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.plan;
}

test("Telegram: publishes ONE post only with explicit per-post confirmation; PUBLISHED needs the provider's message_id; public page verified; idempotent", async () => {
  const plan = await telegramPlan();
  const post = plan.calendar.find((p) => p.channel === "telegram");
  assert.equal(post.publish.mode, "api", "credentials saved → the post can go through the API");
  let r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish" } });
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error, "explicit_confirmation_required");
  assert.equal(TG.calls.length, 0, "nothing was sent without confirmation");
  r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", confirm: post.postId } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.post.state, r.body.post.provider, r.body.post.providerPostId, r.body.post.verification, r.body.post.publicUrl], ["PUBLISHED", "telegram", "42", "PUBLIC_VERIFIED", "https://t.me/noa_channel/42"]);
  assert.equal(TG.calls.length, 1);
  assert.equal(TG.calls[0].method, "sendPhoto", "the real product photo is attached");
  assert.equal(TG.calls[0].body.photo, PRODUCT.image);
  assert.ok(TG.calls[0].body.caption.startsWith("#פרסומת · קישור שותפים"), "disclosure first");
  assert.ok(TG.calls[0].body.caption.includes(post.link), "the post's own tracking link");
  assert.doesNotMatch(JSON.stringify(r.body), new RegExp(BOT.split(":")[1]), "the bot token never leaves the server");
  r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", confirm: post.postId } });
  assert.equal(r.body.idempotent, true);
  assert.equal(TG.calls.length, 1, "never published twice");
  r = await call({ url: "/api/store?mode=discovery&action=distribution-channels", token: "tok-owner" });
  assert.equal(r.body.channels.find((c) => c.id === "telegram").state, "CONNECTED", "verified by a real provider post");
  assert.doesNotMatch(JSON.stringify(r.body), new RegExp(BOT.split(":")[1]));
});

test("Telegram: a provider failure changes nothing and is reported; other networks still need a connection", async () => {
  const plan = await telegramPlan();
  const post = plan.calendar.find((p) => p.channel === "telegram");
  TG.status = 401;
  let r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", confirm: post.postId } });
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.error, "telegram_bad_token");
  const stored = read("distribution:plans:m1")[0].calendar.find((p) => p.postId === post.postId);
  assert.notEqual(stored.state, "PUBLISHED");
  assert.equal(stored.lastError.code, "telegram_bad_token");
  const tiktok = plan.calendar.find((p) => p.channel === "tiktok");
  r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: tiktok.postId, step: "publish", confirm: tiktok.postId } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.error, "channel_requires_connection");
  // No credentials at all → the exact owner action, nothing sent.
  kv.delete("marketplace:autopilot");
  TG.calls.length = 0; TG.status = 200;
  r = await call({ method: "POST", url: "/api/store?mode=discovery&action=distribution-post", token: "tok-owner", body: { planId: plan.id, postId: post.postId, step: "publish", confirm: post.postId } });
  assert.equal(r.statusCode, 409);
  assert.match(r.body.ownerAction, /BotFather/);
  assert.equal(TG.calls.length, 0);
});
