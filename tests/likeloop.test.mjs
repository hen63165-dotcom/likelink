// LikeLoop — the growth loop's truth contract.
//   • only real products with their own link and a real photo are promotable;
//     everything else is REQUIRES_PRODUCT_DATA with the exact repair
//   • hooks: 8 types, Hebrew, short, never a claim (no "everyone", stock, results)
//   • creatives: stable ids and their own tracked URL (utm + cid)
//   • learning: INSUFFICIENT_EVIDENCE below the threshold; exploit only with data
//   • channels: CONNECTED only with a provider post id; caps per day
//   • public status hides env names, repair details and analytics
import test from "node:test";
import assert from "node:assert/strict";
import {
  productTruth, catalogTruth, buildHookSet, HOOK_TYPES, HOOK_FORBIDDEN, buildCreativeMatrix, creativeUrl,
  learn, selectCreatives, MIN_EVIDENCE, channelStates, planCalendar, classifyFailure, nextAttempt,
  matchTrends, parseTrendsRss, profileChecklist, buildStoryBeats, mediaTypeOf, TRUTH,
} from "../src/lib/growth/likeloop.js";
import { likeloopRun, likeloopStatus, summarize } from "../src/lib/cloud/likeloopRunner.js";
import { catalogCandidates, recordResolveOutcome } from "../src/lib/cloud/catalogResolver.js";
import { BROWSER_WRITE_POLICIES } from "../api/_utils/storeWritePolicy.mjs";
import { _resetKvReadGuard } from "../src/lib/cloud/kvReadGuard.js";

const M = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle" }];
const real = { id: "real", title: "עגילי Smyoue מואסניט — ₪47", price: 47.17, category: "Accessories", status: "approved", marketerId: "m1", affiliateUrl: "https://s.click.aliexpress.com/e/_own", image: "https://ae01.alicdn.com/kf/real.jpg" };
const stock = { ...real, id: "stock", affiliateUrl: "https://s.click.aliexpress.com/e/_own2", image: "https://images.unsplash.com/x" };
const demoA = { ...real, id: "d1", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" };
const demoB = { ...real, id: "d2", affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" };
const CATALOG = [real, stock, demoA, demoB, { ...real, id: "draft", status: "pending", affiliateUrl: "https://x.test/own3" }];

test("product truth: promotable only with own link + real photo; the rest get the exact repair", () => {
  const t = catalogTruth({ products: CATALOG, marketers: M });
  const by = Object.fromEntries(t.rows.map((r) => [r.productId, r]));
  assert.equal(by.real.truthStatus, TRUTH.PROMOTABLE);
  assert.equal(by.real.merchant, "AliExpress");
  assert.equal(by.real.price.label, "catalog_price_unverified");
  assert.equal(by.real.availability, "UNVERIFIED");
  assert.equal(by.stock.truthStatus, TRUTH.REQUIRES_PRODUCT_DATA);
  assert.deepEqual(by.stock.issues, ["stock_image"]);
  assert.ok(by.d1.issues.includes("shared_affiliate_link"));
  assert.equal(by.draft.truthStatus, TRUTH.NOT_PUBLIC);
  assert.equal(t.counts.promotable, 1);
  assert.deepEqual(t.repairQueue.map((r) => r.productId).sort(), ["d1", "d2", "stock"]);
  assert.ok(t.repairQueue.every((r) => r.repair.length));
  const blocked = productTruth(stock, { products: CATALOG, marketers: M, resolveState: { stock: { status: "SOURCE_BLOCKED" } } });
  assert.deepEqual(blocked.issues, ["source_blocked"]);
  assert.equal(by.real.publicationStatus, "NOT_READY", "no media yet → not ready for external publication");
});

test("hooks: 8 typed Hebrew hooks, short, never a claim; trend only from a sourced trend", () => {
  const hooks = buildHookSet(real, { now: Date.parse("2026-10-01") });
  assert.deepEqual(hooks.map((h) => h.type), [...HOOK_TYPES]);
  for (const h of hooks) {
    assert.ok(h.text.length <= 70, h.text);
    assert.ok(!HOOK_FORBIDDEN.test(h.text), h.text);
    assert.match(h.text, /[֐-׿]/, "Hebrew");
  }
  assert.equal(hooks.find((h) => h.type === "trend").source, "calendar_season");
  const withTrend = buildHookSet(real, { trend: { term: "עגילים", source: "google_trends_rss_IL", observedAt: "2026-10-01T00:00:00Z" } });
  assert.equal(withTrend.find((h) => h.type === "trend").source, "google_trends_rss_IL");
  assert.ok(!HOOK_FORBIDDEN.test("שאלה פשוטה"));
  assert.ok(HOOK_FORBIDDEN.test("כולם קונים את זה"));
  const beats = buildStoryBeats(real);
  assert.deepEqual(beats.map((b) => b.beat), ["hook", "world", "tension", "change", "hero", "cta"]);
  assert.equal(beats.at(-1).to, 20);
});

test("creative matrix: 3×3×2×2 = 36 stable ids, each with its own tracked URL", () => {
  const m = buildCreativeMatrix(real);
  assert.equal(m.length, 36);
  assert.equal(new Set(m.map((c) => c.creativeId)).size, 36);
  assert.deepEqual(buildCreativeMatrix(real).map((c) => c.creativeId), m.map((c) => c.creativeId), "deterministic");
  const u = new URL(creativeUrl(m[0], "instagram"));
  assert.equal(u.origin, "https://likelink2.vercel.app");
  assert.equal(u.pathname, "/p/real");
  assert.equal(u.searchParams.get("cid"), m[0].creativeId);
  assert.equal(u.searchParams.get("utm_content"), m[0].hookType);
  assert.equal(mediaTypeOf({ source: "likelink_native_render", style: "ugc_style" }), "SYNTHETIC_UGC", "a render is never REAL_UGC");
  assert.equal(mediaTypeOf({ source: "likelink_native_render", style: "cinematic3d" }), "CINEMATIC");
});

test("learning: no data → INSUFFICIENT_EVIDENCE and exploration; with data → rates and exploitation", () => {
  const m = buildCreativeMatrix(real);
  const none = learn([], m);
  assert.equal(none.status, "INSUFFICIENT_EVIDENCE");
  const pick = selectCreatives(m, none, { limit: 3 });
  assert.equal(new Set(pick.map((p) => p.hookType)).size, 3, "explores different hook types first");
  assert.ok(pick.every((p) => p.reason === "explore"));
  const [a, b] = [m[0], m[12]];
  const ev = [];
  for (let i = 0; i < MIN_EVIDENCE; i++) ev.push({ type: "view", productId: "real", cid: a.creativeId }, { type: "view", productId: "real", cid: b.creativeId });
  for (let i = 0; i < 12; i++) ev.push({ type: "outbound_click", productId: "real", cid: a.creativeId });
  ev.push({ type: "outbound_click", productId: "real", cid: b.creativeId });
  ev.push({ type: "view", productId: "real" }); // no creative id → not attributed
  const L = learn(ev, m);
  assert.equal(L.status, "LEARNING");
  assert.equal(L.creatives[a.creativeId].clickRate, 12 / MIN_EVIDENCE);
  const only = selectCreatives([a, b], L, { limit: 1 });
  assert.equal(only[0].creativeId, a.creativeId);
  assert.equal(only[0].reason, "exploit");
});

test("channels: CONNECTED only with a provider post id; caps and READY states", () => {
  const none = channelStates({}, []);
  assert.ok(none.every((c) => c.state === "REQUIRES_CONNECTION"));
  const cfg = channelStates({ IG_USER_ID: true, IG_ACCESS_TOKEN: true, FB_PAGE_ID: true, FB_PAGE_TOKEN: true }, []);
  assert.equal(cfg.find((c) => c.channel === "instagram").state, "CONFIGURED");
  assert.equal(cfg.find((c) => c.channel === "facebook").state, "CONFIGURED_NO_PUBLISHER");
  const proven = channelStates({ IG_USER_ID: true, IG_ACCESS_TOKEN: true }, [{ channel: "instagram", status: "PUBLISHED", externalId: "1789" }]);
  assert.equal(proven.find((c) => c.channel === "instagram").state, "CONNECTED");
  const ready = Array.from({ length: 10 }, (_, i) => ({ creativeId: `c${i}`, productId: "real" }));
  const now = Date.parse("2026-10-01T06:00:00Z");
  const cal = planCalendar({ ready, channels: none.filter((c) => c.channel === "instagram"), now, days: 2 });
  const perDay = cal.reduce((o, q) => ({ ...o, [q.slotAt.slice(0, 10)]: (o[q.slotAt.slice(0, 10)] || 0) + 1 }), {});
  assert.ok(Object.values(perDay).every((n) => n <= 3), JSON.stringify(perDay));
  assert.ok(cal.every((q) => q.status === "READY_FOR_EXTERNAL_PUBLICATION" && /missing:IG_USER_ID/.test(q.blocker)));
});

test("failures are classified; retries back off; dead-letter after the limit", () => {
  assert.equal(classifyFailure("http_429 too many").class, "RATE_LIMIT");
  assert.equal(classifyFailure("Invalid OAuth access token").class, "AUTH");
  assert.equal(classifyFailure("captcha").class, "PROVIDER");
  assert.equal(classifyFailure("media_readback_failed").class, "MEDIA");
  assert.equal(classifyFailure("shared_affiliate_link").class, "DATA");
  assert.equal(classifyFailure("misconfigured: service role key missing").class, "CONFIG");
  assert.equal(classifyFailure("TypeError: x is undefined").class, "CODE");
  const a = nextAttempt(1, 0), b = nextAttempt(2, 0);
  assert.ok(b.at > a.at);
  assert.equal(nextAttempt(5, 0).deadLetter, true);
});

test("trend radar: parsed from the public RSS, matched to products only on real overlap", () => {
  const xml = `<rss><channel><item><title>עגילים</title><ht:approx_traffic>2000+</ht:approx_traffic></item><item><title><![CDATA[מכבי תל אביב]]></title></item></channel></rss>`;
  const trends = parseTrendsRss(xml, { observedAt: "2026-10-01T00:00:00Z" });
  assert.deepEqual(trends.map((t) => t.term), ["עגילים", "מכבי תל אביב"]);
  const m = matchTrends(trends, [real]);
  assert.equal(m[0].relevance, "MATCHED");
  assert.deepEqual(m[0].products, ["real"]);
  assert.equal(m[1].relevance, "NO_PRODUCT_MATCH");
  assert.equal(m[1].source, "google_trends_rss_IL");
});

test("profile checklist: one clear action; the bio is UNVERIFIED without a token", () => {
  const p = profileChecklist({ creator: M[0] });
  assert.equal(p.items.find((i) => i.id === "bio_website").status, "UNVERIFIED");
  assert.match(p.oneAction, /likelink2\.vercel\.app\/u\/alyostyle\?utm_source=instagram&utm_medium=bio/);
  assert.equal(profileChecklist({ creator: M[0], bioWebsite: "https://likelink2.vercel.app/u/alyostyle" }).oneAction, null);
});

function fakeKv(extra = {}, { trendsOk = true } = {}) {
  const kv = new Map([["marketplace:products", JSON.stringify(CATALOG)], ["marketplace:marketers", JSON.stringify(M)], ["marketplace:videos", JSON.stringify([])], ["marketplace:clicks", JSON.stringify([])], ["publish:log", JSON.stringify([])], ...Object.entries(extra).map(([k, v]) => [k, JSON.stringify(v)])]);
  const env = { VITE_SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "SERVICE" };
  const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  const calls = [];
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    calls.push(u.hostname);
    if (u.hostname === "trends.google.com") return trendsOk ? new Response("<rss><item><title>עגילים</title></item></rss>", { status: 200 }) : new Response("", { status: 503 });
    if (u.pathname === "/rest/v1/kv" && (opts.method || "GET") === "GET") {
      const k = u.searchParams.get("key").replace(/^eq\./, "");
      return json(kv.has(k) ? [{ value: kv.get(k) }] : []);
    }
    if (u.pathname === "/rest/v1/kv" && opts.method === "POST") { const { key, value } = JSON.parse(opts.body); kv.set(key, value); return json({}); }
    return new Response("unexpected", { status: 500 });
  }
  return { env, fetchImpl, calls, get: (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null) };
}

test("a LikeLoop run: truth, hooks, queue, learning, trends — written and read back; public view is safe", async () => {
  _resetKvReadGuard();
  const video = { id: "reel_real_x", source: "likelink_native_render", style: "ugc_style", audio: "aac", public: true, productTags: [{ productId: "real" }], creative: { creativeId: "cr_abc", hookType: "didnt_know", hook: "לא ידעתי שאני צריכה תכשיט כזה" } };
  const f = fakeKv({ "marketplace:videos": [video] });
  const r = await likeloopRun({ env: f.env, fetchImpl: f.fetchImpl, now: Date.parse("2026-10-01T06:00:00Z") });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.proof, "VERIFIED");
  const st = f.get("likeloop:state");
  assert.equal(st.counts.promotable, 1);
  assert.equal(st.products.find((p) => p.productId === "real").lifecycle, "CREATIVE_READY");
  assert.equal(st.creatives.real.hooks.length, 8);
  assert.equal(st.creatives.real.hooks.find((h) => h.type === "trend").source, "google_trends_rss_IL", "a real matched trend feeds the trend hook");
  assert.equal(st.learning.status, "INSUFFICIENT_EVIDENCE");
  const q = f.get("likeloop:queue");
  assert.ok(q.length >= 1 && q.every((x) => x.status === "READY_FOR_EXTERNAL_PUBLICATION"), "never PUBLISHED without a provider");
  assert.equal(st.trends.status, "OK");
  const pub = summarize(st);
  const s = JSON.stringify(pub);
  assert.ok(!/IG_ACCESS_TOKEN|missingEnv|repairQueue|productTruth|SERVICE/.test(s), s);
  const pubStatus = await likeloopStatus({ env: f.env, fetchImpl: f.fetchImpl });
  assert.equal(pubStatus.products.promotable, 1);
  assert.equal(pubStatus.repairQueue, undefined);
});

test("a LikeLoop run fails closed on a failed read and keeps working when the trend source is down", async () => {
  _resetKvReadGuard();
  const f = fakeKv({}, { trendsOk: false });
  const r = await likeloopRun({ env: f.env, fetchImpl: f.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(f.get("likeloop:state").trends.status, "SOURCE_UNAVAILABLE");
  _resetKvReadGuard();
  const broken = await likeloopRun({ env: f.env, fetchImpl: async () => new Response("x", { status: 500 }) });
  assert.equal(broken.ok, false);
  assert.equal(broken.error, "kv_read_failed");
});

test("resolver: a CAPTCHA is recorded as SOURCE_BLOCKED with backoff; the product waits, nothing else changes", async () => {
  _resetKvReadGuard();
  const f = fakeKv();
  const now = Date.parse("2026-10-01T06:00:00Z");
  const before = await catalogCandidates({ env: f.env, fetchImpl: f.fetchImpl, now });
  assert.ok(before.candidates.some((c) => c.id === "stock"));
  const r = await recordResolveOutcome({ productId: "stock", status: "SOURCE_BLOCKED", detail: "captcha" }, { env: f.env, fetchImpl: f.fetchImpl, now });
  assert.equal(r.ok, true);
  const after = await catalogCandidates({ env: f.env, fetchImpl: f.fetchImpl, now: now + 3_600_000 });
  assert.ok(!after.candidates.some((c) => c.id === "stock"), "backing off");
  const later = await catalogCandidates({ env: f.env, fetchImpl: f.fetchImpl, now: now + 13 * 3_600_000 });
  assert.ok(later.candidates.some((c) => c.id === "stock"), "tried again after the backoff");
  assert.equal(f.get("marketplace:products").find((p) => p.id === "stock").image, stock.image);
  assert.equal((await recordResolveOutcome({ productId: "stock", status: "PUBLISHED" }, { env: f.env, fetchImpl: f.fetchImpl })).error, "bad_outcome");
});

test("visitor click events keep only known attribution fields (no free-form payloads)", () => {
  const now = Date.now();
  const r = BROWSER_WRITE_POLICIES["marketplace:clicks"]([], [{ id: "e1", productId: "real", type: "view", ts: now, cid: "cr_abc", src: "instagram", evil: "<script>", cnt: "x".repeat(500) }, { id: "e2", productId: "real", ts: now, cid: "bad id with spaces" }], { now });
  assert.equal(r.value.length, 2);
  assert.equal(r.value[0].evil, undefined);
  assert.equal(r.value[0].cid, "cr_abc");
  assert.equal(r.value[0].cnt.length, 60);
  assert.equal(r.value[1].cid, undefined);
});

// ── Luna knows the LikeLoop capabilities (intent → plan → action → proof) ──
import { compileIntent, buildActionGraph } from "../src/lib/discovery/intent.js";
import { buildPassport } from "../src/lib/discovery/engine.js";
import { CAPABILITIES, FACTS } from "../src/lib/discovery/capabilities.js";

test("Luna: 'more exposure' plans a native reel for a promotable product and a data repair for a demo one", () => {
  const passports = [real, demoA].map((product) => buildPassport({ product, marketers: M, products: CATALOG }));
  assert.equal(passports[0].promotion.promotable, true);
  assert.equal(passports[1].promotion.promotable, false);
  assert.ok(passports[1].promotion.issues.includes("shared_affiliate_link"));
  const intent = compileIntent("לונה, תגדילי את החשיפה של המוצרים");
  assert.ok(intent.requiredFacts.includes("promotion_ready") && intent.requiredFacts.includes("native_reel"));
  const g = buildActionGraph(intent, passports);
  const reelReal = g.nodes.find((n) => n.productId === "real" && n.fact === "native_reel");
  assert.equal(reelReal.capability, "request_native_reel");
  assert.equal(reelReal.status, "safe", "Luna may queue LikeLink's own render by herself");
  const reelDemo = g.nodes.find((n) => n.productId === "d1" && n.fact === "native_reel");
  assert.equal(reelDemo.status, "blocked", "never for a product that cannot be promoted honestly");
  const truthDemo = g.nodes.find((n) => n.productId === "d1" && n.fact === "promotion_ready");
  assert.equal(truthDemo.capability, "repair_product_truth");
  assert.equal(truthDemo.status, "owner");
  assert.equal(FACTS.native_reel.read({ media: { state: "STATIC_IMAGE" } }), false, "a photo is not a reel");
  assert.equal(CAPABILITIES.request_native_reel.verification, "reread_render_queue");
});

test("Luna executes the reel request herself and proves it by read-back (the reel is not claimed)", async () => {
  const { runIntent } = await import("../src/lib/discovery/orchestrator.js");
  const store = new Map([["marketplace:products", CATALOG], ["marketplace:marketers", M]]);
  const kvGet = async (k) => (store.has(k) ? structuredClone(store.get(k)) : null);
  const kvSet = async (k, v) => { store.set(k, structuredClone(v)); };
  const r = await runIntent({ kvGet, kvSet, goal: "לונה, תגדילי את החשיפה של המוצר", productId: "real", scope: { marketerIds: ["m1"] }, now: 1_790_000_000_000 });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const q = store.get("media:requests") || [];
  assert.equal(q.filter((x) => x.productId === "real" && x.status === "QUEUED").length, 1);
  const again = await runIntent({ kvGet, kvSet, goal: "לונה, תגדילי את החשיפה של המוצר", productId: "real", scope: { marketerIds: ["m1"] }, now: 1_790_000_100_000 });
  assert.equal(again.ok, true);
  assert.equal((store.get("media:requests") || []).filter((x) => x.productId === "real").length, 1, "idempotent");
  const demo = await runIntent({ kvGet, kvSet, goal: "לונה, תגדילי את החשיפה של המוצר", productId: "d1", scope: { marketerIds: ["m1"] }, now: 1_790_000_200_000 });
  assert.equal(demo.ok, true);
  assert.ok(!(store.get("media:requests") || []).some((x) => x.productId === "d1"), "a demo product is never queued");
});
