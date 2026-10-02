// AUTONOMOUS MARKETING ENGINE: the proofs the owner asked for, one test each.
//   1. LikeLink itself enters the marketing loop (platform scope).
//   2. A Studio enters the loop, and only with its own products.
//   3. Subscription entitlements control Studio capabilities (402/429, limits).
//   4. Creative/video: real assets only. A render is SYNTHETIC and disclosed.
//   5. Publishing: PUBLISHED only with a provider/internal id read back.
//      Otherwise there is a tracked manual-share item with the missing connection.
//   6. Tracking: every link carries the creative id. Only those events count.
//   7. Learning changes the next recommendation only with ≥ MIN_EVIDENCE real events.
// Also: pause/resume, idempotency, safe continuation, and negative auth on the API.
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectOpportunities, chooseCreative, measure, nextActions, routeDistribution, buildCaption, trackedUrl, pickVideo,
  engineLimits, PLATFORM_OBJECTS, PLATFORM_SCOPE, studioScope, KEYS, VIDEO_DISCLOSURE, sanitizeSettings, budgetAllows,
} from "../src/lib/growth/marketingEngine.js";
import { runCycle, setControl, engineView, engineSweep } from "../src/lib/cloud/marketingEngineRunner.js";
import { resolveEntitlement } from "../src/lib/discovery/entitlements.js";
import { MIN_EVIDENCE, HOOK_FORBIDDEN, buildCreativeMatrix, buildHookSet } from "../src/lib/growth/likeloop.js";
import { createMarketingEngineHandler } from "../api/_utils/marketingEngineHandler.mjs";

const NOW = Date.parse("2026-10-02T10:00:00Z");
const img = (n) => `https://ae01.alicdn.com/kf/real-${n}.jpg`;
const mk = (id, marketerId, extra = {}) => ({ id, marketerId, status: "approved", title: `מוצר ${id}`, price: 49.9, category: "Accessories", image: img(id), affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, ...extra });
const MARKETERS = [{ id: "m1", slug: "alyo", name: "Alyo" }, { id: "m2", slug: "other", name: "Other" }];
const PRODUCTS = [
  mk("a1", "m1"), mk("a2", "m1"), mk("a3", "m1"),
  mk("b1", "m2"),
  mk("s1", "m1", { affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }), mk("s2", "m2", { affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }),
  mk("st", "m1", { image: "https://images.unsplash.com/photo-1" }),
];
const VIDEOS = [{ id: "reel_a1_ugc", videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=ugc/a1/x.mp4", source: "likelink_native_render", style: "ugc_style", productTags: [{ productId: "a1" }] }];

function memKv(seed = {}) {
  const db = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const writes = [];
  return {
    db, writes,
    kvGet: async (k, fb) => (db.has(k) ? JSON.parse(JSON.stringify(db.get(k))) : fb),
    kvSet: async (k, v) => { writes.push(k); db.set(k, JSON.parse(JSON.stringify(v))); },
  };
}
const seed = (extra = {}) => ({ "marketplace:products": PRODUCTS, "marketplace:marketers": MARKETERS, "marketplace:videos": VIDEOS, "marketplace:clicks": [], "marketplace:funnel": [], ...extra });
const OWNER = resolveEntitlement({ isPlatformOwner: true, now: NOW });
const sub = (planId, status = "active") => ({ userId: "u1", planId, status, startedAt: "2026-09-20T00:00:00Z", paypalSubscriptionId: "I-REAL" });
const STARTER = resolveEntitlement({ subscription: sub("starter"), now: NOW });
const PRO = resolveEntitlement({ subscription: sub("professional"), now: NOW });
const FREE = resolveEntitlement({ subscription: null, now: NOW });

test("1 · LikeLink itself enters the marketing loop: a LikeLink page + promotable products, site feed PUBLISHED with a read-back id", async () => {
  const kv = memKv(seed());
  const requested = [];
  const out = await runCycle(PLATFORM_SCOPE, { ...kv, now: NOW, entitlement: OWNER, requestVideo: async (pid) => { requested.push(pid); return { ok: true, request: { id: `req_${pid}` } }; } });
  assert.equal(out.ok, true);
  assert.equal(out.outcome, "RAN");
  const objects = [...new Set(out.items.map((x) => x.objectId))];
  assert.ok(objects.some((id) => PLATFORM_OBJECTS.some((o) => o.id === id)), "a LikeLink page is marketed");
  assert.ok(objects.every((id) => !["s1", "s2", "st"].includes(id)), "never a non-promotable product");
  const feed = kv.db.get("brand_pulse:posts");
  const pub = out.items.filter((x) => x.status === "PUBLISHED");
  assert.ok(pub.length >= 1);
  for (const p of pub) assert.ok(feed.some((f) => f.id === p.providerId), "the id is in the feed (read back)");
  assert.equal(pub.length, Math.min(pub.length, engineLimits(OWNER).feedPostsPerDay), "daily feed cap");
  assert.ok(out.items.some((x) => x.status === "MANUAL_SHARE_READY" && x.missingConnection), "unconnected channels → tracked manual share");
  assert.ok(kv.db.get("publish:log").some((r) => r.contentType === "marketing_engine" && r.status === "PUBLISHED" && r.externalId));
  assert.ok(out.repairs.some((r) => r.objectId === "s1") && out.repairs.some((r) => r.objectId === "st"), "broken products → REPAIR_DATA");
  assert.ok(out.summary.campaignsVerified, "campaign items read back");
  assert.ok(requested.length >= 1, "a render was requested for a marketed product");
});

test("2 · a Studio enters the loop with ONLY its own promotable products", async () => {
  const kv = memKv(seed());
  await setControl({ ...kv, scopeKey: studioScope("m2"), op: "enable", owner: { userId: "u1" }, now: NOW, sanitize: sanitizeSettings });
  const out = await runCycle(studioScope("m2"), { ...kv, now: NOW, entitlement: PRO });
  assert.equal(out.ok, true);
  assert.deepEqual([...new Set(out.items.map((x) => x.objectId))], ["b1"]);
  assert.ok(!out.items.some((x) => PLATFORM_OBJECTS.some((o) => o.id === x.objectId)), "a studio does not market LikeLink pages");
  assert.ok(kv.db.get(KEYS.index).includes(studioScope("m2")), "the enabled studio is in the cron index");
  assert.equal(kv.db.get("quota:m2:2026-10").marketingCycles, 1, "one cycle counted against the studio quota");
});

test("3 · entitlements control the Studio: free → 402, starter limits, exhausted quota → 429, a disabled studio does nothing", async () => {
  const kv = memKv(seed());
  const sk = studioScope("m1");
  assert.equal((await runCycle(sk, { ...kv, now: NOW, entitlement: STARTER })).outcome, "NOT_ENABLED", "a studio is off until its owner enables it");
  await setControl({ ...kv, scopeKey: sk, op: "enable", owner: { userId: "u1" }, now: NOW, sanitize: sanitizeSettings });
  const free = await runCycle(sk, { ...kv, now: NOW, entitlement: FREE });
  assert.equal(free.status, 402); assert.equal(free.error, "plan_required");
  const pending = resolveEntitlement({ subscription: sub("starter", "pending"), now: NOW });
  assert.equal((await runCycle(sk, { ...kv, now: NOW, entitlement: pending })).error, "plan_required", "an unverified payment unlocks nothing");
  const st = await runCycle(sk, { ...kv, now: NOW, entitlement: STARTER });
  assert.equal(st.ok, true);
  assert.ok(new Set(st.items.map((x) => x.objectId)).size <= engineLimits(STARTER).objectsPerCycle);
  assert.ok(st.items.filter((x) => x.status === "PUBLISHED").length <= engineLimits(STARTER).feedPostsPerDay);
  kv.db.set("quota:m1:2026-10", { marketingCycles: 30 });
  const over = await runCycle(sk, { ...kv, now: NOW + 86400000, entitlement: STARTER });
  assert.equal(over.status, 429); assert.equal(over.error, "quota_exceeded");
  assert.equal(engineLimits(FREE).included, false);
  assert.equal(engineLimits(OWNER).monthlyCycles, null);
});

test("4 · creative + video: real fields, no forbidden claims, a render is SYNTHETIC and the caption says so", () => {
  const p = PRODUCTS[0];
  const c = chooseCreative({ kind: "product", objectId: p.id, product: p }, { now: NOW });
  assert.ok(c && !HOOK_FORBIDDEN.test(c.hook));
  const v = pickVideo("a1", { format: "synthetic_ugc" }, VIDEOS);
  assert.equal(v.truth, "SYNTHETIC_ANIMATION");
  assert.equal(v.creativeClass, "SYNTHETIC_UGC_STYLE", "ugc_style is never REAL_UGC");
  const link = trackedUrl(c, { channel: "instagram", scopeKey: PLATFORM_SCOPE, path: `/p/${p.id}` });
  const cap = buildCaption({ creative: c, opportunity: { kind: "product", product: p }, link, video: v });
  assert.ok(cap.includes(VIDEO_DISCLOSURE) && cap.includes("#פרסומת") && cap.includes("קישור שותפים") && cap.includes("מחיר בקטלוג"));
  assert.equal(pickVideo("a2", c, VIDEOS), null, "no render → no video claimed");
  for (const o of PLATFORM_OBJECTS) for (const h of o.hooks) assert.ok(!HOOK_FORBIDDEN.test(h.text) && h.text.length <= 70, h.text);
});

test("5 · publishing: provider PUBLISHED only with its id; a failure is dead-lettered and the other channels continue; a studio needs explicit auto-publish permission", async () => {
  // platform: Telegram connected (brand bot)
  const kv = memKv(seed());
  let calls = 0;
  const out = await runCycle(PLATFORM_SCOPE, {
    ...kv, now: NOW, entitlement: OWNER,
    channelCredentials: async () => ({ telegram: { botToken: "x", chatId: "@c" } }),
    publishPost: async () => { calls += 1; return calls === 1 ? { ok: true, provider: "telegram", providerPostId: "42", publicUrl: "https://t.me/c/42", verification: "PUBLIC_VERIFIED" } : { ok: false, error: "telegram_429" }; },
  });
  const tg = out.items.filter((x) => x.channel === "telegram");
  assert.equal(tg[0].status, "PUBLISHED"); assert.equal(tg[0].providerId, "42");
  assert.ok(tg.slice(1).every((x) => x.status === "FAILED"), "a provider failure is FAILED, never PUBLISHED");
  assert.ok(out.deadLetters.length >= 1 && kv.db.get(KEYS.deadletter).length >= 1);
  assert.ok(out.items.some((x) => x.channel === "site_feed" && x.status === "PUBLISHED"), "independent channels still ran");
  // a provider "success" without an id is refused by the gate
  const kv2 = memKv(seed());
  const noId = await runCycle(PLATFORM_SCOPE, { ...kv2, now: NOW, entitlement: OWNER, channelCredentials: async () => ({ telegram: { botToken: "x", chatId: "@c" } }), publishPost: async () => ({ ok: true }) });
  assert.ok(noId.items.filter((x) => x.channel === "telegram").every((x) => x.status === "FAILED"));
  // studio routing: connected Telegram but no standing permission → APPROVAL_REQUIRED
  assert.equal(routeDistribution({ scopeKind: "studio", connected: { telegram: true }, autoChannels: true, settings: {} }).find((r) => r.channel === "telegram").mode, "APPROVAL_REQUIRED");
  assert.equal(routeDistribution({ scopeKind: "studio", connected: { telegram: true }, autoChannels: true, settings: { autoPublish: { telegram: true } } }).find((r) => r.channel === "telegram").mode, "PUBLISH_PROVIDER");
  assert.equal(routeDistribution({ scopeKind: "studio", connected: { telegram: true }, autoChannels: false, settings: { autoPublish: { telegram: true } } }).find((r) => r.channel === "telegram").mode, "APPROVAL_REQUIRED", "Starter has no autonomous external channels");
  assert.equal(routeDistribution({ scopeKind: "platform", connected: {}, settings: {} }).find((r) => r.channel === "instagram").mode, "MANUAL_SHARE");
});

test("6 · tracking: links carry utm + cid; measurement counts only recorded events with a known cid", () => {
  const c = { creativeId: "cr_x1", hookType: "question" };
  const u = new URL(trackedUrl(c, { channel: "whatsapp", scopeKey: studioScope("m1"), path: "/p/a1" }));
  assert.equal(u.searchParams.get("cid"), "cr_x1"); assert.equal(u.searchParams.get("utm_campaign"), "engine_studio");
  const m = measure({
    clicks: [{ type: "view", cid: "cr_x1" }, { type: "click", cid: "cr_x1" }, { type: "view" }, { type: "view", cid: "cr_unknown" }],
    funnel: [{ type: "landing", cid: "mk_p" }, { type: "signup_completed", cid: "mk_p" }],
    creativeIds: ["cr_x1", "mk_p"],
  });
  assert.deepEqual([m.landings, m.outbound, m.signups], [2, 1, 1]);
  assert.equal(m.status, "INSUFFICIENT_EVIDENCE");
});

test("7 · learning changes the next recommendation ONLY with real evidence", () => {
  const p = PRODUCTS[0];
  const opp = { kind: "product", objectId: p.id, product: p };
  const matrix = buildCreativeMatrix(p, { hooks: buildHookSet(p, { now: NOW }) });
  const a = matrix[0], b = matrix.find((x) => x.hookType !== a.hookType);
  const events = (cid, landings, clicks) => [...Array(landings)].map(() => ({ type: "view", cid })).concat([...Array(clicks)].map(() => ({ type: "click", cid })));
  const ids = matrix.map((x) => x.creativeId);
  // below MIN_EVIDENCE: no winner, the pick stays exploration
  const weak = measure({ clicks: events(b.creativeId, MIN_EVIDENCE - 1, 20), creativeIds: ids });
  const exploreAll = new Set(ids.filter((id) => id !== b.creativeId && id !== a.creativeId));
  const beforeMatrix = chooseCreative(opp, { learning: weak, done: exploreAll, now: NOW });
  assert.equal(weak.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(beforeMatrix.reason, "explore");
  // with real evidence on both: the better creative is exploited
  const strong = measure({ clicks: [...events(a.creativeId, MIN_EVIDENCE, 1), ...events(b.creativeId, MIN_EVIDENCE, 20)], creativeIds: ids });
  const after = chooseCreative(opp, { learning: strong, done: exploreAll, now: NOW });
  assert.equal(strong.status, "LEARNING");
  assert.equal(after.reason, "exploit"); assert.equal(after.creativeId, b.creativeId);
  const na = nextActions({ marketed: [{ objectId: p.id, kind: "product", video: { id: "v" } }], repairs: [], learning: strong, campaigns: [{ objectId: p.id, creativeId: a.creativeId }, { objectId: p.id, creativeId: b.creativeId }] });
  assert.ok(na.some((x) => x.action === "EXPLOIT" && x.creativeId === b.creativeId));
  assert.ok(na.some((x) => x.action === "RETIRE_CREATIVE" && x.creativeId === a.creativeId));
  const none = nextActions({ marketed: [{ objectId: p.id, kind: "product", video: { id: "v" } }], repairs: [], learning: weak, campaigns: [{ objectId: p.id, creativeId: b.creativeId, status: "PUBLISHED" }] });
  assert.ok(!none.some((x) => x.action === "EXPLOIT"), "no winner without evidence");
});

test("pause/resume, idempotent re-runs, cooldown, budget and settings sanitizing", async () => {
  const kv = memKv(seed());
  await setControl({ ...kv, scopeKey: PLATFORM_SCOPE, op: "pause", now: NOW, sanitize: sanitizeSettings });
  const paused = await runCycle(PLATFORM_SCOPE, { ...kv, now: NOW, entitlement: OWNER });
  assert.equal(paused.outcome, "PAUSED");
  assert.ok(!kv.db.has("brand_pulse:posts"), "nothing published while paused");
  await setControl({ ...kv, scopeKey: PLATFORM_SCOPE, op: "resume", now: NOW, sanitize: sanitizeSettings });
  const first = await runCycle(PLATFORM_SCOPE, { ...kv, now: NOW, entitlement: OWNER });
  const again = await runCycle(PLATFORM_SCOPE, { ...kv, now: NOW + 60000, entitlement: OWNER });
  const firstObjects = new Set(first.items.map((x) => x.objectId));
  assert.ok(again.items.every((x) => !firstObjects.has(x.objectId)), "a just-marketed object is cooling down");
  assert.deepEqual(budgetAllows({ budget: { monthlyCapIls: 0 } }, 5), { allowed: false, error: "budget_exceeded", capIls: 0, spentIls: 0 }, "no paid action without an owner budget");
  const s = sanitizeSettings({ channels: { instagram: false, evil: true }, autoPublish: { telegram: "yes" }, budget: { monthlyCapIls: -5 } });
  assert.deepEqual(s.channels, { instagram: false }); assert.equal(s.autoPublish.telegram, false); assert.equal(s.budget.monthlyCapIls, 0);
  const view = await engineView({ ...kv, scopeKey: PLATFORM_SCOPE, full: false, now: NOW });
  assert.ok(!("items" in view) && !("activity" in view) && !("settings" in view), "the public view has counts and proof ids only");
});

test("cron sweep: platform + enabled studios, each with its own verified plan; a broken scope never stops the others", async () => {
  const kv = memKv(seed({ "marketplace:subscriptions": [sub("professional")] }));
  await setControl({ ...kv, scopeKey: studioScope("m2"), op: "enable", owner: { userId: "u1" }, now: NOW, sanitize: sanitizeSettings });
  await setControl({ ...kv, scopeKey: studioScope("m1"), op: "enable", owner: { userId: "nobody" }, now: NOW, sanitize: sanitizeSettings });
  const r = await engineSweep({ ...kv, now: NOW });
  const by = Object.fromEntries(r.results.map((x) => [x.scope, x]));
  assert.equal(by.platform.outcome, "RAN");
  assert.equal(by["studio:m2"].outcome, "RAN");
  assert.equal(by["studio:m1"].outcome, "plan_required", "no verified subscription → no paid engine");
});

test("API negative auth: anonymous run 401, someone else's studio 403, platform scope owner-only, public status has no captions", async () => {
  const kv = memKv(seed());
  const handler = createMarketingEngineHandler({
    ...kv, env: { OWNER_EMAIL: "owner@x.co" }, now: () => NOW,
    verifyToken: async (t) => (t === "sess-m1" ? { id: "u1", email: "m1@x.co" } : null),
    verifyAdminToken: () => null, cronAuthorized: (req) => req.headers.authorization === "Bearer cron",
  });
  kv.db.set("marketplace:marketers", MARKETERS.map((m) => ({ ...m, email: `${m.id}@x.co` })));
  const call = async (method, q, { auth, body } = {}) => {
    let status = 0, payload = null;
    const res = { setHeader() {}, getHeader() {}, status(s) { status = s; return res; }, json(b) { payload = b; } };
    const req = { method, url: `/api/store?mode=growth-engine&${q}`, headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body || {} };
    await handler(req, res);
    return { status, body: payload };
  };
  assert.equal((await call("POST", "op=run")).status, 401);
  assert.equal((await call("POST", "op=run", { auth: "sess-m1", body: { scope: "studio:m2" } })).status, 403);
  assert.equal((await call("POST", "op=run", { auth: "sess-m1", body: { scope: "platform" } })).status, 403);
  const enableFree = await call("POST", "op=enable", { auth: "sess-m1" });
  assert.equal(enableFree.status, 402, "free plan cannot enable the engine");
  const pub = await call("GET", "op=status");
  assert.equal(pub.status, 200);
  assert.ok(!JSON.stringify(pub.body).includes("caption") && !JSON.stringify(pub.body).includes("@x.co"));
  const cron = await call("POST", "op=run", { auth: "cron" });
  assert.equal(cron.status, 200); assert.equal(cron.body.results[0].scope, "platform");
});

test("home 'Luna is promoting' shows only engine posts whose product is in the public graph, on our own origin", async () => {
  const { enginePicksFrom } = await import("../src/lib/growth/enginePicks.js");
  const graph = { products: [{ id: "a1", displayTitle: "טבעת", price: 10, media: { image: "x.jpg" } }] };
  const posts = [
    { id: "1", source: "marketing_engine", link: "https://likelink2.vercel.app/p/a1?cid=cr_1", text: "הוק\nטבעת", spotlight: { id: "a1" }, video: { videoUrl: "v.mp4" } },
    { id: "2", source: "marketing_engine", link: "https://likelink2.vercel.app/p/gone?cid=cr_2", text: "x", spotlight: { id: "gone" } },
    { id: "3", source: "marketing_engine", link: "https://evil.example/phish", text: "x" },
    { id: "4", source: "luna_pulse", link: "https://likelink2.vercel.app/sell", text: "x" },
    { id: "5", source: "marketing_engine", link: "https://likelink2.vercel.app/sell?cid=mk_1", text: "רוצה עמוד?\nסטודיו" },
  ];
  const out = enginePicksFrom(posts, graph);
  assert.deepEqual(out.map((x) => x.id), ["1", "5"]);
  assert.equal(out[0].to, "/p/a1?cid=cr_1"); assert.equal(out[0].animated, true); assert.equal(out[0].affiliate, true);
  assert.equal(out[1].affiliate, false);
});
