// Native reel pipeline — truth + proof contract.
//
// product → concept → render (runner) → ingest: store → VERIFY MEDIA (anon
// read-back) → register → VERIFY REGISTRATION (anon read-back) → publish →
// VERIFY PUBLICATION → proof. These tests drive ingestReel/auditReels against
// an in-memory Supabase (REST kv + Storage) through a network spy, and pin:
//   • renders are SYNTHETIC_ANIMATION, disclosed, never REAL_VIDEO / human UGC
//   • on-frame copy comes from real fields only (no shipping/stock/urgency)
//   • nothing is "VERIFIED"/"PUBLISHED" without a read-back; failures roll back
//   • external publication needs a provider id; unconfigured = REQUIRES_CONNECTION
//   • the plan never repeats a registered (product, style)
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildReelConcept,
  planRenders,
  validateIngest,
  sniffMedia,
  buildReelRecords,
  RENDER_PROVIDER,
  RENDERER_VERSION,
  STYLE_ORDER,
  HOOK_QUESTIONS,
  hookQuestion,
  buildSocialPack,
  SOCIAL_NETWORKS,
  HOOK_PRELUDE_MS,
} from "../src/lib/media/reelPipeline.js";
import { ingestReel, auditReels, buildPlan, registerStudioUpload, requestRender, studioReelState, instagramPublishStep, nextInstagramReel } from "../src/lib/cloud/reelPublisher.js";
import { isPublicVideo } from "../src/lib/videoSync.js";
import { productMediaTruth, MEDIA_TRUTH } from "../src/lib/discovery/mediaTruth.js";
import { buildPublicGraph } from "../src/lib/publicDiscovery.js";
import { parseByteRange } from "../api/og.mjs";
import { _resetKvReadGuard } from "../src/lib/cloud/kvReadGuard.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const creator = { id: "m1", name: "ALYOSTYLE", color: "#C1356C" };
const product = (id, extra = {}) => ({ id, title: `מוצר ${id} — ₪45`, price: 45, category: "Beauty", status: "approved", marketerId: "m1", image: `https://images.example.com/${id}.jpg`, source: "aliexpress", createdAt: 1, ...extra });

// Minimal valid MP4 / JPEG byte signatures (sniffed, not decoded).
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(2000, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 3)]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const ingestBody = (over = {}) => ({
  productId: "p1",
  style: "cinematic3d",
  renderer: RENDERER_VERSION,
  conceptId: "p1:cinematic3d",
  probe: { audio: "aac", audioRate: 48000, codec: "h264", width: 720, height: 1280, frames: 270, durationMs: 9000 },
  sha256: sha(MP4),
  video: MP4.toString("base64"),
  poster: JPEG.toString("base64"),
  ...over,
});

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

test("concepts use only real product fields and carry the disclosure", () => {
  for (const style of STYLE_ORDER) {
    const c = buildReelConcept({ product: product("p1"), creator, style });
    assert.equal(c.lines.title, "מוצר p1", "price suffix trimmed from the title");
    assert.ok(c.lines.facts.includes("₪45 · מחיר קטלוג"));
    assert.ok(c.lines.facts.includes("נמכר ב־AliExpress"));
    assert.ok(c.lines.facts.includes("נבחר על ידי ALYOSTYLE"));
    const all = JSON.stringify(c);
    assert.ok(!/משלוח|מלאי|נגמר|מוגבל|הנחה|pixar|פיקסאר/i.test(all), `no unverifiable claims in ${style}`);
    assert.match(c.disclosure, /ממוחשבת/);
  }
  assert.equal(buildReelConcept({ product: product("p1"), creator, style: "nope" }), null);
});

test("the plan never repeats a registered (product, style) and skips non-public products", () => {
  const products = [product("p1"), product("p2"), product("draft", { status: "pending" }), product("noimg", { image: "" })];
  const videos = STYLE_ORDER.map((style) => ({ source: RENDER_PROVIDER, style, productTags: [{ productId: "p1" }] }));
  const { plan } = planRenders({ products, marketers: [creator], videos, limit: 5 });
  assert.deepEqual(plan.map((x) => x.productId), ["p2"], "p1 has every style; draft/no-image are not eligible");
  const partial = planRenders({ products: [product("p1")], marketers: [creator], videos: [videos[0]], limit: 1 }).plan;
  assert.notEqual(partial[0].style, "cinematic3d");
});

test("ingest validation and media sniffing", () => {
  assert.equal(validateIngest(ingestBody()).ok, true);
  assert.equal(validateIngest(ingestBody({ style: "x" })).error, "bad_style");
  assert.equal(validateIngest(ingestBody({ renderer: "other" })).error, "unknown_renderer");
  // v2 must carry the AAC track Instagram requires; v1 (no audio) is still accepted.
  assert.equal(validateIngest(ingestBody({ probe: { width: 720, height: 1280, durationMs: 10500 } })).error, "missing_audio_track");
  assert.equal(validateIngest(ingestBody({ renderer: "reel-canvas-v1", probe: { width: 720, height: 1280, durationMs: 9000 } })).ok, true);
  assert.equal(validateIngest(ingestBody({ probe: { audio: "aac", width: 100, height: 100, durationMs: 9000 } })).error, "bad_dimensions");
  assert.equal(sniffMedia(MP4), "video/mp4");
  assert.equal(sniffMedia(JPEG), "image/jpeg");
  assert.equal(sniffMedia(Buffer.from("<svg/>")), "");
});

test("a render is a disclosed SYNTHETIC_ANIMATION that the public video filter accepts", () => {
  const url = "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p1/1-cinematic3d.mp4";
  const { truth, video, asset } = buildReelRecords({ product: product("p1"), style: "ugc_style", videoUrl: url, posterUrl: url.replace(".mp4", "-poster.jpg"), bytes: 10, sha256: "a".repeat(64), probe: { durationMs: 9000 } });
  assert.equal(truth, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.equal(video.synthetic, true);
  assert.equal(asset.disclosed, true);
  assert.equal(isPublicVideo({ ...video, public: true }), true);
  assert.equal(isPublicVideo({ ...video, public: true, videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=../x.mp4" }), false);
  // The product's own field must not turn a render into a filmed video.
  const p = product("p1", { videoUrl: url, videoProvider: RENDER_PROVIDER, videoSynthetic: true, videoStyle: "cinematic3d" });
  assert.equal(productMediaTruth(p).state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  const g = buildPublicGraph({ products: [p], marketers: [creator], videos: [{ ...video, public: true }] });
  assert.equal(g.byId.get("p1").media.state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.equal(g.reels.length, 1, "the product's own video and its registered reel are the same file → one reel");
  assert.ok(g.reels.every((r) => r.state === MEDIA_TRUTH.SYNTHETIC_ANIMATION));
});

test("ingest: store → anon read-back → register → publish → proof", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  const r = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl, now: 1_800_000_000_000 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.truth, "SYNTHETIC_ANIMATION");
  assert.equal(r.proof.media.status, "VERIFIED");
  assert.equal(r.proof.media.sha256Match, true);
  assert.equal(r.proof.registration.status, "VERIFIED");
  assert.equal(r.publication.status, "PUBLISHED");
  assert.match(r.publication.externalId, /^bp_/);
  assert.equal(r.external.status, "REQUIRES_CONNECTION", "no external channel → never a silent success");
  assert.equal(sb.objects.size, 2, "video + poster stored");
  const videos = sb.get("marketplace:videos");
  assert.equal(videos[0].public, true);
  assert.equal(videos[0].source, RENDER_PROVIDER);
  const p1 = sb.get("marketplace:products").find((p) => p.id === "p1");
  assert.equal(p1.videoProvider, RENDER_PROVIDER);
  assert.equal(p1.videoSynthetic, true);
  assert.ok(sb.get("brand_pulse:posts").some((p) => p.id === r.publication.externalId));
  const log = sb.get("publish:log");
  assert.deepEqual(log.map((e) => e.status), ["PUBLISHED", "REQUIRES_CONNECTION"]);
  assert.ok(sb.get(`media:proof:${r.assetId}`));
  // Idempotent: the same (product, style) is refused with the existing id.
  const again = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl, now: 1_800_000_000_500 });
  assert.equal(again.status, 409);
  assert.equal(again.assetId, r.assetId);
});

test("ingest rolls back when the public read-back does not match", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ corruptReadback: true });
  const r = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.error, "media_readback_failed");
  assert.equal(sb.objects.size, 0, "uploaded objects are deleted");
  assert.deepEqual(sb.get("marketplace:videos"), [], "nothing registered");
  assert.deepEqual(sb.get("publish:log"), [], "nothing published");
});

test("ingest refuses tampered, oversized or non-public input before storing anything", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1", { status: "pending" })] });
  assert.equal((await ingestReel(ingestBody({ sha256: "b".repeat(64) }), { env: sb.env, fetchImpl: sb.fetchImpl })).error, "sha256_mismatch");
  assert.equal((await ingestReel(ingestBody({ video: Buffer.from("<svg/>").toString("base64") }), { env: sb.env, fetchImpl: sb.fetchImpl })).error, "not_mp4");
  assert.equal((await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl })).error, "product_not_public");
  assert.equal(sb.objects.size, 0);
});

test("external publication counts only with a provider message id", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ telegram: true });
  const r = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.external.status, "PUBLISHED");
  assert.equal(r.external.externalId, "4242");
  assert.ok(sb.calls.some((c) => c.url.includes("api.telegram.org") && c.url.includes("/sendVideo")));
});

test("audit unregisters a reel that stopped serving and reports learning as correlation", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  const r = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.ok, true);
  sb.objects.clear(); // the object disappears
  const a = await auditReels({ env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(a.ok, true);
  assert.deepEqual(a.unregistered, [r.assetId]);
  assert.deepEqual(sb.get("marketplace:videos"), []);
  assert.equal(sb.get("marketplace:products").find((p) => p.id === "p1").videoUrl, null);
  assert.match(a.note, /correlation/);
  const plan = await buildPlan({ env: sb.env, fetchImpl: sb.fetchImpl, limit: 2 });
  assert.equal(plan.ok, true);
  assert.equal(plan.plan.length, 2);
});

test("media proxy byte ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=200-", 100), { unsatisfiable: true });
  assert.equal(parseByteRange("items=1-2", 100), null);
});

test("renderer, workflow and endpoint stay inside the architecture", () => {
  const scene = read("scripts/media/reel-scene.html");
  assert.ok(!/pixar|disney|dreamworks/i.test(scene), "no third-party studio names or styles in the renderer");
  assert.ok(scene.includes("C.disclosure"), "every frame draws the disclosure");
  const wf = read(".github/workflows/media-render.yml");
  assert.ok(wf.includes("secrets.AUTOPILOT_SECRET"));
  assert.ok(wf.includes("op=audit"));
  assert.ok(read("api/store.mjs").includes("mode') === 'media-pipeline'"));
  const count = readdirSync(path.join(ROOT, "api"), { withFileTypes: true }).filter((e) => !e.isDirectory() && /\.(mjs|js)$/.test(e.name)).length;
  assert.ok(count <= 12, `serverless functions: ${count}`);
  assert.ok(read("src/lib/cloud/autonomousJobs.js").includes('"native-reel-audit"'));
});

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(5000, 9)]);

test("studio one-click: an owner's browser render becomes a verified, disclosed public reel", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  sb.objects.set("reels/m1/1-abc.webm", { bytes: WEBM, type: "video/webm" });
  const r = await registerStudioUpload({ sourcePath: "reels/m1/1-abc.webm", productId: "p1", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl, now: 7 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.truth, "SYNTHETIC_ANIMATION");
  assert.equal(r.video.source, "likelink_studio_render");
  assert.equal(r.video.synthetic, true);
  assert.equal(r.proof.media.status, "VERIFIED");
  assert.equal(r.publication.status, "PUBLISHED");
  assert.ok(sb.objects.has("ugc/p1/7-studio.webm"));
  const state = await studioReelState({ ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(state.reels.length, 1);
});

test("studio one-click refuses someone else's upload or product, and fake media", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  sb.objects.set("reels/m2/1-x.webm", { bytes: WEBM, type: "video/webm" });
  sb.objects.set("reels/m1/2-y.webm", { bytes: Buffer.from("not a video at all, just text padding ...".repeat(40)), type: "video/webm" });
  assert.equal((await registerStudioUpload({ sourcePath: "reels/m2/1-x.webm", productId: "p1", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl })).error, "not_your_upload");
  assert.equal((await registerStudioUpload({ sourcePath: "../etc/passwd", productId: "p1", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl })).error, "bad_source_path");
  assert.equal((await registerStudioUpload({ sourcePath: "reels/m2/1-x.webm", productId: "p1", ownerIds: ["m2"] }, { env: sb.env, fetchImpl: sb.fetchImpl })).error, "not_your_product");
  const fake = await registerStudioUpload({ sourcePath: "reels/m1/2-y.webm", productId: "p1", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(fake.error, "not_a_playable_video");
  assert.deepEqual(sb.get("marketplace:videos"), [], "nothing registered");
});

test("a creator request is queued once and served first by the plan, then marked rendered", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase({ products: [product("p1", { createdAt: 9 }), product("p2", { createdAt: 1 })] });
  assert.equal((await requestRender({ productId: "p2", ownerIds: ["zz"] }, { env: sb.env, fetchImpl: sb.fetchImpl })).error, "not_your_product");
  const q = await requestRender({ productId: "p2", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(q.request.status, "QUEUED");
  assert.equal((await requestRender({ productId: "p2", ownerIds: ["m1"] }, { env: sb.env, fetchImpl: sb.fetchImpl })).duplicate, true);
  const plan = await buildPlan({ env: sb.env, fetchImpl: sb.fetchImpl, limit: 1 });
  assert.equal(plan.plan[0].productId, "p2", "requested product first even though p1 is newer");
  assert.equal(plan.plan[0].reason, "creator_request");
  const r = await ingestReel(ingestBody({ productId: "p2", style: plan.plan[0].style, conceptId: "p2:x" }), { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(sb.get("media:requests")[0].status, "RENDERED");
});

test("publishing a reel never evicts earlier feed posts (append-only, cap = publish:log length)", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  const old = Array.from({ length: 30 }, (_, i) => ({ id: `bp_old_${i}`, ts: i, text: "x" }));
  sb.kv.set("brand_pulse:posts", JSON.stringify(old));
  const r = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.ok, true);
  const feed = sb.get("brand_pulse:posts");
  assert.equal(feed.length, 31, "nothing evicted");
  assert.equal(feed[0].id, "bp_old_0", "oldest stays first");
  assert.equal(feed[30].id, r.publication.externalId, "new post appended last");
});

// ---------------------------------------------------------------- v2: hooks, social, Instagram

const FORBIDDEN_CLAIMS = /כולם|נגמר|אחרונ|מלאי|משלוח חינם|הכי נמכר|ויראלי|מבצע|רק היום|מיליון/;

test("v2 hooks are questions only, deterministic per product, never claims", () => {
  for (const [cat, bank] of Object.entries(HOOK_QUESTIONS)) {
    for (const q of bank) {
      assert.match(q, /\?(\s*\S{1,2})?$/u, `${cat}: "${q}" is a question`);
      assert.ok(!FORBIDDEN_CLAIMS.test(q), `${cat}: "${q}" makes no unprovable claim`);
    }
  }
  const p = product("p7", { category: "Fashion" });
  assert.equal(hookQuestion(p), hookQuestion({ ...p }));
  assert.ok(HOOK_QUESTIONS.Fashion.includes(hookQuestion(p)));
  assert.ok(HOOK_QUESTIONS.Other.includes(hookQuestion(product("p8", { category: "Nope" }))));
  const c = buildReelConcept({ product: p, creator, style: "animated_unbox" });
  assert.equal(c.hookMs, HOOK_PRELUDE_MS);
  assert.equal(c.lines.hook, hookQuestion(p));
  assert.equal(c.durationMs, 9500 + HOOK_PRELUDE_MS);
  assert.ok(c.durationMs <= 30000, "inside the ingest duration bound");
  assert.ok(STYLE_ORDER.includes("animated_unbox"));
  const scene = read("scripts/media/reel-scene.html");
  assert.ok(scene.includes("function prelude(") && scene.includes("function unbox("));
  assert.ok(read("scripts/media/render-reels.mjs").includes('"-c:a", "aac"'), "renderer muxes an AAC track");
});

test("social pack: every network, real fields, both disclosures, tracked canonical links", () => {
  const pack = buildSocialPack({ product: product("p1"), creator, style: "ugc_style" });
  assert.deepEqual(Object.keys(pack.networks).sort(), [...SOCIAL_NETWORKS].sort());
  const ig = pack.networks.instagram;
  assert.ok(ig.caption.length <= 2200);
  assert.ok(ig.caption.startsWith(pack.hook), "hook is the first line");
  assert.ok(ig.caption.includes("#פרסומת") && ig.caption.includes("אנימציה ממוחשבת"), "ad + animation disclosure");
  assert.ok((ig.caption.match(/#[^\s#]+/g) || []).length <= 6, "a few specific hashtags, not a wall");
  assert.ok(ig.caption.includes("₪45") && ig.caption.includes("מחיר קטלוג"));
  for (const [n, x] of Object.entries(pack.networks)) {
    assert.ok(x.link.startsWith("https://likelink2.vercel.app/p/p1?"), `${n} links to the canonical product page`);
    assert.equal(new URL(x.link).searchParams.get("utm_source"), n);
    const all = JSON.stringify(x);
    assert.ok(!FORBIDDEN_CLAIMS.test(all), `${n}: no invented claims`);
    assert.ok(!/likelink\.com/.test(all));
    assert.ok(all.includes("#פרסומת"), `${n}: paid-partnership disclosure`);
  }
  assert.ok(pack.networks.x.caption.length <= 280);
  assert.ok(pack.networks.youtube.title.includes("#Shorts") && pack.networks.youtube.title.length <= 100);
});

function fakeGraph({ status = ["IN_PROGRESS", "FINISHED"], failPublish = false } = {}) {
  const calls = [];
  let n = 0;
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "content-type": "application/json" } });
  return {
    calls,
    async handle(url, opts = {}) {
      const u = new URL(url);
      const body = opts.body ? Object.fromEntries(new URLSearchParams(opts.body)) : Object.fromEntries(u.searchParams);
      calls.push({ method: opts.method || "GET", path: u.pathname, body });
      assert.equal(body.access_token, "IGTOKEN");
      if (u.pathname.endsWith("/IGUSER/media") && opts.method === "POST") return json({ id: "CONT1" });
      if (u.pathname.endsWith("/CONT1")) return json({ status_code: status[Math.min(n++, status.length - 1)] });
      if (u.pathname.endsWith("/IGUSER/media_publish")) return failPublish ? json({ error: { message: "nope" } }, 400) : json({ id: "IGMEDIA9" });
      if (u.pathname.endsWith("/IGMEDIA9")) return json({ id: "IGMEDIA9", permalink: "https://www.instagram.com/reel/abc/" });
      return json({ error: { message: "unexpected" } }, 500);
    },
  };
}

function withInstagram(sb, graph, extra = {}) {
  const env = { ...sb.env, igUser: "IGUSER", igToken: "IGTOKEN", igGraph: "https://graph.test/v21.0", igDailyCap: 3, ...extra };
  const fetchImpl = (url, opts) => (String(url).startsWith("https://graph.test/") ? graph.handle(url, opts) : sb.fetchImpl(url, opts));
  return { env, fetchImpl };
}

test("instagram: nothing is sent without a connection", async () => {
  const sb = fakeSupabase();
  const r = await instagramPublishStep({ env: sb.env, fetchImpl: sb.fetchImpl });
  assert.equal(r.status, "REQUIRES_CONNECTION");
  assert.equal(sb.calls.length, 0);
});

test("instagram: two-phase publish, PUBLISHED only with a read-back media id, logged, never twice", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  const ok = await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl, now: 5000 });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  // v1 reels (no audio) are never sent to Instagram
  const vids = sb.get("marketplace:videos");
  assert.equal(vids[0].audio, "aac");
  assert.equal(nextInstagramReel({ videos: vids.map((v) => ({ ...v, audio: "none" })), products: sb.get("marketplace:products"), marketers: [creator] }), null);
  const graph = fakeGraph();
  const io = withInstagram(sb, graph);
  const now = Date.parse("2026-10-01T10:00:00Z");
  const a = await instagramPublishStep({ ...io, now });
  assert.equal(a.status, "CONTAINER_CREATED");
  const create = graph.calls.find((c) => c.path.endsWith("/IGUSER/media"));
  assert.equal(create.body.media_type, "REELS");
  assert.ok(create.body.caption.includes("#פרסומת"));
  assert.ok(create.body.video_url.startsWith("https://likelink2.vercel.app/api/og?mode=media"));
  assert.equal((await instagramPublishStep({ ...io, now: now + 1000 })).status, "PROCESSING");
  const c = await instagramPublishStep({ ...io, now: now + 2000 });
  assert.equal(c.status, "PUBLISHED");
  assert.equal(c.mediaId, "IGMEDIA9");
  const log = sb.get("publish:log").filter((x) => x.channel === "instagram");
  assert.equal(log.length, 1);
  assert.equal(log[0].externalId, "IGMEDIA9");
  assert.equal(sb.get("publish:instagram").posted[0].permalink, "https://www.instagram.com/reel/abc/");
  // the same reel is never posted again
  assert.equal((await instagramPublishStep({ ...io, now: now + 3000 })).status, "NOTHING_TO_POST");
});

test("instagram: a failed publish is FAILED (no id, no log) and the daily cap holds", async () => {
  _resetKvReadGuard();
  const sb = fakeSupabase();
  await ingestReel(ingestBody(), { env: sb.env, fetchImpl: sb.fetchImpl, now: 5000 });
  const io = withInstagram(sb, fakeGraph({ status: ["FINISHED"], failPublish: true }));
  const now = Date.parse("2026-10-01T10:00:00Z");
  await instagramPublishStep({ ...io, now });
  const r = await instagramPublishStep({ ...io, now: now + 1000 });
  assert.equal(r.status, "FAILED");
  assert.equal(sb.get("publish:log").filter((x) => x.channel === "instagram").length, 0);
  const capped = withInstagram(sb, fakeGraph(), { igDailyCap: 0 });
  assert.equal((await instagramPublishStep({ ...capped, now: now + 2000 })).status, "DAILY_CAP");
});
