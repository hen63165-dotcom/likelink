// PUBLISHING ORCHESTRATOR + NATIVE VIDEO CAPABILITY
//
// product → creative plan (VideoIntent → Storyboard → SceneCompiler) → render
// → asset (with its creative brief) → publish → publication id → public
// verification → proof → tracking → Luna memory. Pinned here:
//  • the plan the renderer executes carries the intent, storyboard and brief;
//  • an external provider can only be an adapter with credentials + a check;
//  • a render in UGC format is SYNTHETIC_UGC_STYLE, never real UGC;
//  • a publication is VERIFIED only by evidence read back from its public URL;
//  • a destination without credentials is NEEDS_CONNECTION, never success;
//  • a product whose link is shared / image is stock is BLOCKED from promotion;
//  • the sweep is idempotent, fails closed and feeds Luna's memory;
//  • the product page serves the video (og:video + VideoObject) labelled as animation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { planRenders, buildReelRecords, reelCreative, buildReelConcept } from "../src/lib/media/reelPipeline.js";
import { videoIntent, videoStoryboard, compileScenes, creativeBrief, registerVideoProvider, videoProviders, ugcMode, UGC_MODE, videoAsset } from "../src/lib/media/videoCapability.js";
import { buildLedger, verifyEntry, runPublishingSweep, publicProof, PUB_STATUS, PROOF_KEY, LEDGER_KEY } from "../src/lib/publishing/orchestrator.js";
import { externalDestinations, publishExternalReel } from "../src/lib/publishing/adapters.js";
import { canonicalProduct, buildProductSeo, renderProductBody } from "../src/lib/discovery/surfaces.js";

const O = "https://likelink2.vercel.app";
const creator = { id: "m1", name: "ALYOSTYLE", slug: "alyostyle" };
const reelUrl = (pid, ts, style) => `${O}/api/og?mode=media&path=ugc/${pid}/${ts}-${style.replace(/_/g, "-")}.mp4`;
const product = (id, extra = {}) => ({
  id, title: `עגילים ${id}`, price: 47.17, category: "Accessories", status: "approved", marketerId: "m1",
  image: `https://ae01.alicdn.com/kf/${id}.jpg`, affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, source: "aliexpress", createdAt: 1, ...extra,
});
function reel(pid, style, ts) {
  const { video } = buildReelRecords({ product: product(pid), style, videoUrl: reelUrl(pid, ts, style), posterUrl: reelUrl(pid, ts, style).replace(".mp4", "-poster.jpg"), bytes: 900000, sha256: "a".repeat(64), probe: { durationMs: 11000, audio: "aac" }, now: ts, creative: reelCreative({ product: product(pid), creator, style }) });
  return { ...video, public: true };
}

test("the plan the renderer executes carries intent, storyboard and the creative brief (concept fields unchanged)", () => {
  const { plan } = planRenders({ products: [product("p1")], marketers: [creator], videos: [], clicks: [], limit: 1 });
  assert.equal(plan.length, 1);
  const item = plan[0];
  const plain = buildReelConcept({ product: product("p1"), creator, style: item.style });
  for (const k of ["id", "image", "durationMs", "fps", "width", "height", "lines", "disclosure"]) assert.deepEqual(item.concept[k], plain[k], `renderer field ${k} is unchanged`);
  assert.equal(item.concept.intent.productId, "p1");
  assert.equal(item.concept.intent.truth, "SYNTHETIC_ANIMATION");
  assert.ok(item.concept.storyboard.scenes.some((s) => s.id === "hook"));
  assert.match(item.creative.prompt, /גילוי נאות/);
  assert.equal(item.creative.productReference, product("p1").image);
});

test("a stored reel keeps its style, prompt, product reference, provider and generation status", () => {
  const v = reel("p1", "cinematic3d", 1790865168860);
  assert.equal(v.creative.style, "cinematic3d");
  assert.equal(v.creative.generationStatus, "GENERATED");
  assert.equal(v.creative.provider, "likelink_native_render");
  assert.ok(v.creative.prompt.length > 20);
  const a = videoAsset(v, product("p1"));
  assert.deepEqual([a.truth, a.generationStatus, a.provider, a.providerKnown], ["SYNTHETIC_ANIMATION", "GENERATED", "likelink_native_render", true]);
  assert.equal(reelCreative({ product: product("p1"), style: "studio" }).style, "studio");
});

test("an external video provider is only an adapter — refused without credentials, verification and a truth state", () => {
  assert.equal(registerVideoProvider({ id: "x1", verification: "readback", truth: "SYNTHETIC_ANIMATION" }).error, "required_credentials_missing");
  assert.equal(registerVideoProvider({ id: "x2", requiredCredentials: ["K"], truth: "SYNTHETIC_ANIMATION" }).error, "verification_required");
  assert.equal(registerVideoProvider({ id: "x3", requiredCredentials: ["K"], verification: "readback" }).error, "truth_state_required");
  assert.ok(videoProviders().every((p) => p.kind === "native"), "no external provider is registered by default");
  const intent = videoIntent({ product: product("p1"), creator, style: "cinematic3d" });
  const sb = videoStoryboard(intent, buildReelConcept({ product: product("p1"), creator, style: "cinematic3d" }));
  assert.equal(compileScenes(sb, null), null);
  assert.ok(creativeBrief(sb).prompt.startsWith("סגנון:"));
});

test("UGC truth: a render in UGC format is synthetic UGC-style; real UGC needs a real, human-filmed video", () => {
  assert.equal(ugcMode(reel("p1", "ugc_style", 1)), UGC_MODE.SYNTHETIC_UGC_STYLE);
  assert.equal(ugcMode(reel("p1", "cinematic3d", 1)), UGC_MODE.NOT_UGC);
  assert.equal(ugcMode({ videoUrl: "https://cdn.example.com/a.mp4", marketerId: "m1" }), UGC_MODE.NOT_UGC, "a video file alone is not UGC");
  assert.equal(ugcMode({ videoUrl: "https://cdn.example.com/a.mp4", marketerId: "m1", humanFilmed: true }), UGC_MODE.REAL_UGC);
  assert.equal(ugcMode({ videoUrl: "https://cdn.example.com/a.mp4", marketerId: "m1", humanFilmed: true, synthetic: true }), UGC_MODE.NOT_UGC);
});

function world() {
  const ok = reel("p-ok", "ugc_style", 1790865426150);
  const seeded = reel("s1", "cinematic3d", 1790861640080);
  const products = [
    product("p-ok", { videoUrl: ok.videoUrl, videoProvider: "likelink_native_render", videoSynthetic: true, videoStatus: "completed", videoAssetId: ok.id, videoPoster: ok.poster }),
    product("s1", { affiliateUrl: "https://best.aliexpress.com", videoUrl: seeded.videoUrl, videoProvider: "likelink_native_render", videoSynthetic: true, videoStatus: "completed", videoAssetId: seeded.id }),
    product("s2", { affiliateUrl: "https://best.aliexpress.com" }),
  ];
  const clicks = [
    { id: "c1", productId: "p-ok", ts: 1790865426150 + 10, src: "likelink_reels", camp: `v-${ok.id}` },
    { id: "c2", productId: "p-ok", ts: 1790865426150 + 20 },
  ];
  return { ok, seeded, products, marketers: [creator], videos: [ok, seeded], clicks, posts: [{ id: "bp_1", media: { assetId: ok.id } }], log: [{ contentId: ok.id, channel: "external", status: "REQUIRES_CONNECTION", externalId: null }] };
}

test("ledger: internal surfaces by id, catalog integrity BLOCKS promotion, externals need connection, clicks tracked", () => {
  const w = world();
  const { entries } = buildLedger({ ...w, env: { IG_USER_ID: "17840000000" }, origin: O });
  const ok = entries.find((e) => e.assetId === w.ok.id);
  const seeded = entries.find((e) => e.assetId === w.seeded.id);
  const pub = (e, d) => e.publications.find((p) => p.destination === d);
  for (const d of ["media", "product_page", "reels", "home", "creator_page"]) {
    assert.equal(pub(ok, d).status, PUB_STATUS.PUBLISHED_UNVERIFIED, d);
    assert.ok(pub(ok, d).publicationId && pub(ok, d).url.startsWith(O), d);
  }
  assert.equal(pub(ok, "creator_page").url, `${O}/u/alyostyle`);
  assert.equal(ok.feedPostId, "bp_1");
  assert.equal(seeded.blockedReason, "catalog_integrity");
  assert.equal(pub(seeded, "reels").status, PUB_STATUS.BLOCKED);
  const ig = pub(ok, "instagram");
  assert.deepEqual([ig.status, ig.missing], [PUB_STATUS.NEEDS_CONNECTION, ["IG_ACCESS_TOKEN"]]);
  assert.equal(pub(ok, "telegram_brand").status, PUB_STATUS.NEEDS_CONNECTION);
  assert.ok(ok.publications.filter((p) => p.kind === "external").every((p) => !p.providerId), "no provider id is invented");
  assert.match(ok.tracking.link, /\/r\?pid=p-ok&src=reel_ugc_style/);
  assert.deepEqual([ok.tracking.clicksSinceCreated, ok.tracking.clicksFromCreative], [2, 1]);
  assert.equal(ok.truth.ugcMode, "SYNTHETIC_UGC_STYLE");
});

function fakeWeb({ productPageHasVideo = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, headers: init.headers || {} });
    if (u.includes("/api/og?mode=media")) return new Response(new Uint8Array(1024), { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-1023/971874" } });
    if (u.includes("/p/")) {
      const w = world();
      return new Response(`<html><meta property="og:video" content="${productPageHasVideo ? w.ok.videoUrl.replace(/&/g, "&amp;") : ""}"></html>`, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response('<div id="root"></div>', { status: 200, headers: { "content-type": "text/html" } });
  };
  return { fetchImpl, calls };
}

test("verification: VERIFIED only with evidence read back from the public URL", async () => {
  const w = world();
  const { entries } = buildLedger({ ...w, origin: O });
  const entry = entries.find((e) => e.assetId === w.ok.id);
  const good = await verifyEntry(entry, { fetchImpl: fakeWeb().fetchImpl, now: 1790870000000 });
  assert.equal(good.state, "VERIFIED");
  for (const s of ["CREATED", "GENERATED", "STORED", "PUBLISHED", "VERIFIED", "TRACKED"]) assert.equal(good.stages[s].ok, true, s);
  assert.equal(good.publications.find((p) => p.destination === "product_page").evidence.marker, "asset_url_in_served_page");
  assert.equal(good.publications.find((p) => p.destination === "media").evidence.contentRange, "bytes 0-1023/971874");
  const web = fakeWeb({ productPageHasVideo: false });
  const bad = await verifyEntry(entry, { fetchImpl: web.fetchImpl, now: 1790870000000 });
  const page = bad.publications.find((p) => p.destination === "product_page");
  assert.equal(page.status, PUB_STATUS.PUBLISHED_UNVERIFIED);
  assert.equal(page.lastError, "asset_url_missing");
  assert.ok(web.calls.some((c) => /Googlebot/.test(c.headers["User-Agent"] || "")), "the product page is read as a crawler sees it");
  assert.ok(!web.calls.some((c) => c.url.includes("/r?")), "verification never hits /r (no fabricated clicks)");
});

test("sweep: proof + ledger + Luna memory once; idempotent; fails closed on a failed catalog read", async () => {
  const w = world();
  const store = new Map(Object.entries({ "marketplace:products": w.products, "marketplace:marketers": w.marketers, "marketplace:videos": w.videos, "marketplace:clicks": w.clicks, "brand_pulse:posts": w.posts, "publish:log": w.log }));
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const writes = [];
  const kvSet = async (k, v) => { writes.push(k); store.set(k, structuredClone(v)); };
  const now = 1790870000000;
  const r = await runPublishingSweep({ kvGet, kvSet, fetchImpl: fakeWeb().fetchImpl, now, origin: O });
  assert.equal(r.ok, true);
  assert.deepEqual([r.creatives, r.verified, r.blocked], [2, 1, 1]);
  assert.equal(store.get(PROOF_KEY(w.ok.id)).state, "VERIFIED");
  assert.equal(store.get(LEDGER_KEY).length, 2);
  const mem = store.get("discovery:memory:platform");
  assert.equal(mem.filter((m) => m.capability === "publishing_orchestrator").length, 2);
  assert.ok(mem.some((m) => m.type === "action" && m.proof.state === "VERIFIED"));
  assert.ok(mem.some((m) => m.type === "constraint" && /catalog_integrity/.test(m.text)));
  writes.length = 0;
  const again = await runPublishingSweep({ kvGet, kvSet, fetchImpl: fakeWeb().fetchImpl, now: now + 60000, origin: O });
  assert.equal(again.memoryWritten, 0, "an unchanged state writes no new memory");
  assert.ok(!writes.includes(PROOF_KEY(w.ok.id)), "a fresh verified creative is not re-checked");
  const empty = new Map();
  const failed = await runPublishingSweep({ kvGet: async () => null, kvSet: async (k) => { empty.set(k, 1); }, fetchImpl: fakeWeb().fetchImpl, now, origin: O });
  assert.deepEqual([failed.ok, failed.error, empty.size], [false, "kv_read_failed", 0]);
});

test("public proof carries no credential names; destinations report names only server-side", () => {
  const w = world();
  const { entries } = buildLedger({ ...w, origin: O });
  const p = publicProof(entries[0]);
  assert.doesNotMatch(JSON.stringify(p), /BRAND_TELEGRAM_BOT|IG_ACCESS_TOKEN|BRAND_WEBHOOK_URL/);
  const d = externalDestinations({ BRAND_TELEGRAM_BOT: "secret-value", BRAND_TELEGRAM_CHAT: "@c" }, { m1: { channels: [{ type: "bluesky", handle: "a", token: "t" }] } });
  assert.equal(d.find((x) => x.id === "telegram_brand").status, "CONNECTED");
  assert.equal(d.find((x) => x.id === "creator_bluesky").connectedCreators, 1);
  assert.doesNotMatch(JSON.stringify(d), /secret-value|"t"/, "values never leave");
});

test("the brand external adapter: PUBLISHED only with a provider id; nothing configured = REQUIRES_CONNECTION", async () => {
  assert.equal((await publishExternalReel({ env: {} }, { text: "x", videoUrl: "v", link: "l" })).status, "REQUIRES_CONNECTION");
  const hook = await publishExternalReel({ env: { webhook: "https://hook.test" }, fetchImpl: async () => new Response("{}", { status: 200 }) }, { text: "x", videoUrl: "v", link: "l" });
  assert.deepEqual([hook.status, hook.error], ["DELIVERED_UNVERIFIED", "no_provider_id"]);
});

test("the product page serves the reel as what it is (og:video + VideoObject, labelled animation)", () => {
  const w = world();
  const c = canonicalProduct(w.products[0], creator, O);
  const seo = buildProductSeo(c);
  assert.equal(seo.og.video.url, w.ok.videoUrl);
  assert.equal(seo.jsonLd.subjectOf["@type"], "VideoObject");
  assert.match(seo.jsonLd.subjectOf.description, /אנימציה ממוחשבת/);
  assert.equal(seo.jsonLd.subjectOf.uploadDate, new Date(1790865426150).toISOString());
  const body = renderProductBody(c);
  assert.match(body, /<video [^>]*src="[^"]*ugc\/p-ok\//);
  assert.match(body, /לא צילום/);
  const plain = buildProductSeo(canonicalProduct(product("x"), creator, O));
  assert.equal(plain.og.video, undefined);
  assert.equal(plain.jsonLd.subjectOf, undefined);
  assert.equal(canonicalProduct(w.products[0], creator, O).fingerprint, canonicalProduct({ ...w.products[0], videoUrl: "" }, creator, O).fingerprint, "media does not change the fingerprint");
});

test("the orchestrator is wired: autonomous job, manifest, audit op, Studio card, public proof endpoint", async () => {
  const jobs = readFileSync(new URL("../src/lib/cloud/autonomousJobs.js", import.meta.url), "utf8");
  assert.match(jobs, /registerJob\("publishing-orchestrator"/);
  assert.match(readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8"), /"publishing-orchestrator"/);
  assert.match(readFileSync(new URL("../api/_utils/mediaPipelineHandler.mjs", import.meta.url), "utf8"), /runPublishingSweep/);
  assert.match(readFileSync(new URL("../src/components/studio/LunaDiscoveryCenter.jsx", import.meta.url), "utf8"), /<CreativeProofCard \/>/);
  const { createDiscoveryHandler } = await import("../api/_utils/discoveryHandler.mjs");
  const store = new Map([[LEDGER_KEY, [{ assetId: "reel_a_ugc_style_1", state: "VERIFIED", fingerprint: "x" }]], [PROOF_KEY("reel_a_ugc_style_1"), { assetId: "reel_a_ugc_style_1", state: "VERIFIED", publications: [{ destination: "instagram", kind: "external", status: "NEEDS_CONNECTION", missing: ["IG_ACCESS_TOKEN"], requiredCredentials: ["IG_USER_ID", "IG_ACCESS_TOKEN"], codePath: "x" }] }]]);
  const handler = createDiscoveryHandler({ kvGet: async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb), kvSet: async () => {}, verifyToken: async () => null, verifyAdminToken: () => null, env: {} });
  const res = (() => { const r = { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, json(o) { this.body = o; }, end(b) { if (b && !this.body) this.body = JSON.parse(b); }, writeHead(c) { this.statusCode = c; } }; return r; });
  let r = res();
  await handler({ method: "GET", url: "/api/store?mode=discovery&action=publication-proof", headers: {} }, r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ledger[0].fingerprint, undefined);
  r = res();
  await handler({ method: "GET", url: "/api/store?mode=discovery&action=publication-proof&asset=reel_a_ugc_style_1", headers: {} }, r);
  assert.equal(r.body.proof.state, "VERIFIED");
  assert.doesNotMatch(JSON.stringify(r.body), /IG_ACCESS_TOKEN/, "credential names never reach the public proof");
  r = res();
  await handler({ method: "GET", url: "/api/store?mode=discovery&action=media-ledger", headers: {} }, r);
  assert.equal(r.statusCode, 401, "the Studio ledger needs a session");
});
