// Creative Engine: one entry point (createCreative) over the native reel
// pipeline. Proves: real provider states only, premium counted only after a
// verified asset, bounded retries, AI-provider backoff, honest job states.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { _resetKvReadGuard } from "../src/lib/cloud/kvReadGuard.js";
import { buildPlan, createCreative, creativeStudioState, creativeCapabilityView, ingestReel, recordRenderReport } from "../src/lib/cloud/reelPublisher.js";
import { CREATIVE_TYPES, CREATIVE_TYPE_IDS, PROVIDERS, providerStates, creativeCapabilities, validateOrder, jobView, creativeScript, publishChecks, MAX_RENDER_ATTEMPTS, PREMIUM_QUOTA_KEY } from "../src/lib/media/creativeEngine.js";
import { STYLE_ORDER, RENDER_PROVIDER, RENDERER_VERSION, AI_IMAGE_PROVIDER } from "../src/lib/media/reelPipeline.js";
import { resolveEntitlement } from "../src/lib/discovery/entitlements.js";

const creator = { id: "m1", name: "ALYOSTYLE", color: "#C1356C" };
const product = (id, extra = {}) => ({ id, title: `מוצר ${id} — ₪45`, price: 45, category: "Tech", status: "approved", marketerId: "m1", image: `https://images.example.com/${id}.jpg`, affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, source: "aliexpress", createdAt: 1, ...extra });
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(2000, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 3)]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const ingestBody = (over = {}) => ({ productId: "p1", style: "text_hook", renderer: RENDERER_VERSION, conceptId: "p1:x", probe: { audio: "aac", audioRate: 48000, codec: "h264", width: 720, height: 1280, frames: 300, durationMs: 12500 }, sha256: sha(MP4), video: MP4.toString("base64"), poster: JPEG.toString("base64"), renderMs: 4200, ...over });
const FREE = resolveEntitlement({ subscription: null });
const STARTER = resolveEntitlement({ subscription: { planId: "starter", status: "ACTIVE", userId: "u1" } });
const T0 = 1_900_000_000_000;

const ALLOW = new Set(["marketplace:products", "marketplace:marketers", "marketplace:videos", "marketplace:clicks"]);
function fakeSupabase({ products = [product("p1"), product("p2")], corruptReadback = false, telegram = false } = {}) {
  const kv = new Map([
    ["marketplace:products", JSON.stringify(products)],
    ["marketplace:marketers", JSON.stringify([creator])],
    ["marketplace:videos", JSON.stringify([])],
    ["marketplace:clicks", JSON.stringify([])],
    ["brand_pulse:posts", JSON.stringify([{ id: "bp_old", ts: 1, text: "old" }])],
    ["publish:log", JSON.stringify([])],
  ]);
  const objects = new Map();
  const calls = [];
  const env = { url: "https://sb.test", service: "SERVICE", anon: "ANON", telegramBot: telegram ? "BOT" : "", telegramChat: telegram ? "@chan" : "", webhook: "", origin: "https://likelink2.vercel.app" };
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    const method = opts.method || "GET";
    const auth = opts.headers?.Authorization || "";
    calls.push({ method, url: u.href, auth });
    if (u.hostname === "api.telegram.org") return json({ ok: true, result: { message_id: 4242 } });
    if (u.pathname === "/rest/v1/kv" && method === "GET") {
      const key = u.searchParams.get("key").replace(/^eq\./, "");
      if (auth === "Bearer ANON" && !ALLOW.has(key)) return json([]);
      return json(kv.has(key) ? [{ value: kv.get(key) }] : []);
    }
    if (u.pathname === "/rest/v1/kv" && method === "POST") {
      assert.equal(auth, "Bearer SERVICE", "kv writes use the service role");
      const { key, value } = JSON.parse(opts.body);
      kv.set(key, value);
      return json({});
    }
    const objPrefix = "/storage/v1/object/product-images/";
    if (u.pathname.startsWith(objPrefix) && method === "POST") {
      objects.set(u.pathname.slice(objPrefix.length), { bytes: Buffer.from(opts.body), type: opts.headers["Content-Type"] });
      return json({ Key: u.pathname });
    }
    if (u.pathname === "/storage/v1/object/copy" && method === "POST") {
      const { sourceKey, destinationKey } = JSON.parse(opts.body);
      const o = objects.get(sourceKey);
      if (!o) return new Response("missing", { status: 404 });
      objects.set(destinationKey, { ...o });
      return json({ Key: destinationKey });
    }
    if (u.pathname === "/storage/v1/object/product-images" && method === "DELETE") {
      for (const p of JSON.parse(opts.body).prefixes) objects.delete(p);
      return json([]);
    }
    const readPrefix = "/storage/v1/object/authenticated/product-images/";
    if (u.pathname.startsWith(readPrefix)) {
      assert.equal(auth, "Bearer ANON", "media verification reads through the public (anon) path");
      const o = objects.get(u.pathname.slice(readPrefix.length));
      if (!o) return new Response("not found", { status: 400 });
      const bytes = corruptReadback ? Buffer.concat([o.bytes, Buffer.from([1])]) : o.bytes;
      return new Response(bytes, { status: 200, headers: { "content-type": o.type } });
    }
    return new Response("unexpected", { status: 500 });
  }
  const get = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null);
  return { env, fetchImpl, kv, objects, calls, get };
}


const ctxOf = (sb, now = T0) => ({ env: sb.env, fetchImpl: sb.fetchImpl, now, providerEnv: {} });

test("every creative type maps onto a real planned style; the AI types are labelled AI, the rest are not", () => {
  for (const id of CREATIVE_TYPE_IDS) assert.ok(STYLE_ORDER.includes(CREATIVE_TYPES[id].style), id);
  assert.equal(CREATIVE_TYPES.TEXT_HOOK.tier, "free");
  assert.ok(["UGC", "AI_3D_STORY", "AI_3D_UGC"].every((t) => CREATIVE_TYPES[t].tier === "premium"));
  assert.ok(CREATIVE_TYPES.AI_3D_STORY.aiGenerated && CREATIVE_TYPES.AI_3D_UGC.aiGenerated);
});

test("providers are AVAILABLE only with recorded evidence; paid keys without an adapter are never AVAILABLE", () => {
  const none = providerStates({ env: {}, health: {}, videos: [], now: T0 });
  const by = (l, id) => l.find((p) => p.id === id);
  assert.equal(by(none, AI_IMAGE_PROVIDER).status, "UNVERIFIED");
  assert.equal(by(none, "likelink_native_render").status, "UNVERIFIED");
  assert.equal(by(none, "kling").status, "NOT_CONFIGURED");
  assert.equal(by(none, "elevenlabs").status, "NOT_CONFIGURED");
  const keyed = providerStates({ env: { KLING_ACCESS_KEY: "a", KLING_SECRET_KEY: "b", ELEVENLABS_API_KEY: "c" }, now: T0 });
  assert.equal(by(keyed, "kling").status, "DISABLED");
  assert.equal(by(keyed, "kling").reason, "adapter_not_implemented");
  const ok = providerStates({ health: { [AI_IMAGE_PROVIDER]: { lastOkAt: T0 - 1000 } }, videos: [{ source: RENDER_PROVIDER, createdAt: new Date(T0 - 1000).toISOString() }], now: T0 });
  assert.equal(by(ok, AI_IMAGE_PROVIDER).status, "AVAILABLE");
  assert.equal(by(ok, "likelink_native_render").status, "AVAILABLE");
  const failing = providerStates({ health: { [AI_IMAGE_PROVIDER]: { lastFailAt: T0 - 1000, consecutiveFailures: 3 } }, now: T0 });
  assert.equal(by(failing, AI_IMAGE_PROVIDER).status, "FAILED");
  const caps = creativeCapabilities({ providers: failing });
  assert.equal(caps.find((c) => c.type === "AI_3D_STORY").available, false, "an AI type is unavailable while its provider fails");
  assert.equal(caps.find((c) => c.type === "TEXT_HOOK").available, true);
  // honest output: no voice, no "AI video" — animated stills
  for (const c of creativeCapabilities({ providers: ok })) {
    assert.equal(c.voice, "CAPTIONS_ONLY");
    assert.notEqual(c.videoGeneration, "AI_VIDEO");
  }
  assert.equal(creativeCapabilities({ providers: ok }).find((c) => c.type === "AI_3D_UGC").videoGeneration, "AI_STILLS_ANIMATED");
  // env names only for the owner
  assert.ok(!JSON.stringify(none).includes("KLING_ACCESS_KEY"));
  assert.ok(JSON.stringify(providerStates({ owner: true, now: T0 })).includes("KLING_ACCESS_KEY"));
  assert.ok(PROVIDERS.every((p) => !JSON.stringify(p).match(/sk-|secret_value/)));
});

test("orders accept fixed choices only: language, platform and CTA are validated; a custom offer is never burned in", () => {
  assert.equal(validateOrder({ productId: "p1", creativeType: "nope" }).error, "bad_creative_type");
  assert.equal(validateOrder({ productId: "p1", creativeType: "UGC", language: "en" }).error, "unsupported_language");
  assert.equal(validateOrder({ productId: "p1", creativeType: "UGC", platform: "myspace" }).error, "unsupported_platform");
  assert.equal(validateOrder({ productId: "p1", creativeType: "UGC", cta: "BUY NOW 90% OFF" }).error, "cta_not_allowed");
  const ok = validateOrder({ productId: "p1", creativeType: "ai_3d_story", offer: "50% הנחה", duration: 30 });
  assert.equal(ok.order.style, "ai_story");
  assert.equal(ok.order.offerFromCatalogOnly, true);
  assert.equal(ok.order.requestedDurationMs, 30000);
});

test("scripts come from the same concept the renderer draws: UGC framework beats, no testimonial, no Pixar", () => {
  const p = product("p1");
  const ugc = creativeScript({ product: p, creativeType: "AI_3D_UGC" });
  assert.deepEqual(ugc.beats.map((b) => b.beat), ["PRELUDE", "HOOK", "PROBLEM_DESIRE", "PRODUCT", "DEMONSTRATION", "CTA"]);
  const story = creativeScript({ product: p, creativeType: "AI_3D_STORY" });
  assert.deepEqual(story.beats.map((b) => b.beat), ["PRELUDE", "PROBLEM", "DESIRE", "PRODUCT", "CTA"]);
  for (const t of CREATIVE_TYPE_IDS) {
    const s = JSON.stringify(creativeScript({ product: p, creativeType: t }));
    assert.doesNotMatch(s, /pixar|disney|פיקסאר|ממליצה בחום|קניתי|השתמשתי|ביקורות|הכי נמכר/i, t);
  }
  assert.ok(story.aiPrompts.every((x) => /not holding any product/.test(x.prompt)), "the product is never drawn by AI");
});

test("jobs are COMPLETED only with a registered video; no URL is ever invented", () => {
  const q = jobView({ request: { id: "r1", productId: "p1", style: "ai_story", status: "QUEUED", at: T0 } });
  assert.equal(q.status, "QUEUED");
  assert.equal(q.videoUrl, null);
  assert.deepEqual(q.assets, []);
  const lost = jobView({ request: { id: "r2", productId: "p1", style: "ai_story", status: "RENDERED" } });
  assert.equal(lost.status, "RENDERED_NOT_FOUND");
  assert.equal(lost.videoUrl, null);
  const f = jobView({ request: { id: "r3", productId: "p1", style: "ai_ugc", status: "FAILED", lastError: "ai_scene_502" } });
  assert.equal(f.status, "FAILED");
  assert.equal(f.error, "ai_scene_502");
  assert.equal(publishChecks({ product: product("p1"), video: null, script: creativeScript({ product: product("p1"), creativeType: "TEXT_HOOK" }) }).ok, false, "no media → no publish");
});

test("free TEXT_HOOK queues a job; premium on the free plan is refused before anything is written", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1"), product("p2")] });
  const r = await createCreative({ productId: "p1", creativeType: "TEXT_HOOK" }, { ...ctxOf(sb), ownerIds: ["m1"], actor: "a@b.c", entitlement: FREE });
  assert.equal(r.ok, true);
  assert.equal(r.job.status, "QUEUED");
  assert.equal(r.job.style, "text_hook");
  assert.equal(r.job.videoUrl, null);
  assert.equal(sb.get("media:requests")[0].creativeType, "TEXT_HOOK");
  assert.equal(sb.get("creative:events")[0].type, "queued");
  const before = JSON.stringify(sb.get("media:requests"));
  const p = await createCreative({ productId: "p1", creativeType: "AI_3D_STORY" }, { ...ctxOf(sb), ownerIds: ["m1"], entitlement: FREE });
  assert.equal(p.status, 402);
  assert.equal(p.error, "plan_required");
  assert.ok(p.upgrade?.price > 0, "the real plan price comes from plans.js");
  assert.equal(JSON.stringify(sb.get("media:requests")), before, "nothing queued, nothing charged");
  assert.equal((await createCreative({ productId: "p1", creativeType: "UGC" }, { ...ctxOf(sb), ownerIds: ["zz"], entitlement: STARTER })).error, "not_your_product");
});

test("premium: reserved while queued, charged only after the verified ingest; the planner serves the exact style", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1", { createdAt: 9 }), product("p2", { createdAt: 1 })] });
  const r = await createCreative({ productId: "p2", creativeType: "AI_3D_UGC" }, { ...ctxOf(sb), ownerIds: ["m1"], entitlement: STARTER });
  assert.equal(r.ok, true);
  assert.equal(r.job.premium, true);
  assert.equal(sb.get("quota:m1:" + new Date(T0).toISOString().slice(0, 7)), null, "no charge at order time");
  const plan = await buildPlan({ env: sb.env, fetchImpl: sb.fetchImpl, limit: 1, now: T0 });
  assert.equal(plan.plan[0].productId, "p2");
  assert.equal(plan.plan[0].style, "ai_ugc", "exactly the ordered type");
  assert.ok(plan.plan[0].concept.aiStory.scenes.length === 2);
  const ing = await ingestReel(ingestBody({ productId: "p2", style: "ai_ugc", probe: { ...ingestBody().probe, durationMs: 16500 } }), { env: sb.env, fetchImpl: sb.fetchImpl, now: T0 + 10 });
  assert.equal(ing.ok, true);
  const req = sb.get("media:requests")[0];
  assert.equal(req.status, "RENDERED");
  assert.equal(req.quotaCharged, true);
  assert.equal(sb.get("quota:m1:" + new Date(T0).toISOString().slice(0, 7))[PREMIUM_QUOTA_KEY], 1);
  const ev = sb.get("creative:events")[0];
  assert.equal(ev.type, "completed");
  assert.equal(ev.creativeType, "AI_3D_UGC");
  assert.equal(ev.renderMs, 4200);
  const st = await creativeStudioState({ ownerIds: ["m1"], entitlement: STARTER }, ctxOf(sb, T0 + 20));
  const job = st.jobs.find((j) => j.jobId === req.id);
  assert.equal(job.status, "COMPLETED");
  assert.equal(job.videoUrl, sb.get("marketplace:videos").find((v) => v.id === ing.assetId).videoUrl, "the job points at the stored, registered asset");
  assert.ok(job.disclosure.some((l) => /AI/.test(l)));
  assert.equal(st.analytics.byType.AI_3D_UGC.completed, 1);
  assert.equal(st.analytics.byType.TEXT_HOOK.completed, 0, "zero is zero");
  assert.equal(st.quota.byStudio.m1.check.remaining, 3, "Starter 4/month − 1 verified");
  // A finished style is not rendered again: the order returns the existing asset, uncharged.
  const again = await createCreative({ productId: "p2", creativeType: "AI_3D_UGC" }, { ...ctxOf(sb, T0 + 30), ownerIds: ["m1"], entitlement: STARTER });
  assert.equal(again.existing, true);
  assert.equal(again.job.status, "COMPLETED");
  assert.equal(sb.get("quota:m1:" + new Date(T0).toISOString().slice(0, 7))[PREMIUM_QUOTA_KEY], 1);
});

test("a failing render is retried a bounded number of times, then FAILED — never published, never charged", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1")] });
  const r = await createCreative({ productId: "p1", creativeType: "AI_3D_STORY" }, { ...ctxOf(sb), ownerIds: ["m1"], entitlement: STARTER });
  for (let i = 0; i < MAX_RENDER_ATTEMPTS; i++) {
    const rep = await recordRenderReport({ productId: "p1", style: "ai_story", ok: false, error: "ai_scene_502_text/html", provider: AI_IMAGE_PROVIDER, providerOk: false }, { env: sb.env, fetchImpl: sb.fetchImpl, now: T0 + i });
    assert.equal(rep.ok, true);
  }
  const req = sb.get("media:requests").find((x) => x.id === r.job.jobId);
  assert.equal(req.status, "FAILED");
  assert.equal(req.attempts, MAX_RENDER_ATTEMPTS);
  assert.equal(sb.get("quota:m1:" + new Date(T0).toISOString().slice(0, 7)), null, "a failed premium job is never counted");
  assert.deepEqual(sb.get("marketplace:videos"), [], "nothing registered, nothing published");
  const st = await creativeStudioState({ ownerIds: ["m1"], entitlement: STARTER }, ctxOf(sb, T0 + 5));
  assert.equal(st.jobs[0].status, "FAILED");
  assert.equal(st.analytics.byType.AI_3D_STORY.failed, MAX_RENDER_ATTEMPTS);
  const plan = await buildPlan({ env: sb.env, fetchImpl: sb.fetchImpl, limit: 3, now: T0 + 6 });
  assert.ok(!plan.plan.some((x) => x.reason === "creator_request"), "a FAILED job is not picked again");
  assert.equal((await recordRenderReport({ productId: "../x", style: "ai_story" }, { env: sb.env, fetchImpl: sb.fetchImpl })).error, "bad_report");
});

test("the free AI image provider backs off after repeated failures: AI styles leave the plan and the order is refused", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1")] });
  for (let i = 0; i < 3; i++) await recordRenderReport({ productId: "p1", style: "ai_story", ok: false, error: "timeout", provider: AI_IMAGE_PROVIDER, providerOk: false }, { env: sb.env, fetchImpl: sb.fetchImpl, now: T0 + i });
  const plan = await buildPlan({ env: sb.env, fetchImpl: sb.fetchImpl, limit: 3, now: T0 + 10 });
  assert.deepEqual(plan.skippedStyles.sort(), ["ai_story", "ai_ugc"]);
  assert.ok(plan.plan.every((x) => !["ai_story", "ai_ugc"].includes(x.style)));
  const r = await createCreative({ productId: "p1", creativeType: "AI_3D_UGC" }, { ...ctxOf(sb, T0 + 10), ownerIds: ["m1"], entitlement: STARTER });
  assert.equal(r.status, 409);
  assert.equal(r.error, "creative_unavailable");
  const view = await creativeCapabilityView({}, ctxOf(sb, T0 + 10));
  assert.equal(view.providers.find((p) => p.id === AI_IMAGE_PROVIDER).status, "FAILED");
  assert.ok(!JSON.stringify(view).includes("lastError"), "raw provider errors stay with the owner");
  // after a success the provider is AVAILABLE again
  await recordRenderReport({ productId: "p1", style: "ai_story", ok: true, provider: AI_IMAGE_PROVIDER, providerOk: true }, { env: sb.env, fetchImpl: sb.fetchImpl, now: T0 + 20 });
  const back = await creativeCapabilityView({}, ctxOf(sb, T0 + 30));
  assert.equal(back.providers.find((p) => p.id === AI_IMAGE_PROVIDER).status, "AVAILABLE");
});

test("renderer + runner: ai_ugc is drawn with the AI label and disclosure; the runner reports every attempt", () => {
  const html = readFileSync("scripts/media/reel-scene.html", "utf8");
  assert.match(html, /C\.style === "ai_ugc"\) aiUgc\(s\)/);
  const fn = html.slice(html.indexOf("function aiUgc(ms)"), html.indexOf("window.renderFrame ="));
  assert.match(fn, /לא אדם אמיתי/);
  assert.match(fn, /disclosure\(t\)/);
  assert.match(fn, /תמונה אמיתית/);
  const runner = readFileSync("scripts/media/render-reels.mjs", "utf8");
  assert.match(runner, /render-report/);
  assert.match(runner, /renderMs/);
});

test("Creative Lab: every button has a real action, and no Pixar wording reaches the UI", () => {
  const ui = readFileSync("src/components/studio/CreativeLab.jsx", "utf8");
  const buttons = ui.match(/<button[^>]*>/g) || [];
  assert.ok(buttons.length > 0);
  for (const b of buttons) assert.match(b, /onClick=/, b);
  assert.doesNotMatch(ui, /pixar|פיקסאר|disney/i);
  assert.match(readFileSync("src/components/studio/StudioShell.jsx", "utf8"), /<CreativeLab /);
});
