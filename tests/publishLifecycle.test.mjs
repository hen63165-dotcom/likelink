// Publication lifecycle — PREPARED ≠ GENERATED ≠ PUBLISHED ≠ VERIFIED.
//   • an external destination without a connection gets a validated payload
//     (PREPARED, sent:false) — never a publication id
//   • PUBLISHED externally only with the provider's id; VERIFIED only read back
//   • an Instagram payload without an AAC track is INVALID (the API refuses it)
import test from "node:test";
import assert from "node:assert/strict";
import { buildLedger, verifyEntry, prepareExternal } from "../src/lib/publishing/orchestrator.js";

const M = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle" }];
const P = { id: "p5", title: "עגילי Smyoue מואסניט ורודים", price: 47.17, category: "Accessories", status: "approved", marketerId: "m1", affiliateUrl: "https://s.click.aliexpress.com/e/_own5", image: "https://ae01.alicdn.com/kf/real.jpg", videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p5/1-likeloop-cinematic.mp4" };
const V = { id: "reel_p5_likeloop_cinematic_1", source: "likelink_native_render", videoProvider: "likelink_native_render", synthetic: true, disclosed: true, style: "likeloop_cinematic", audio: "aac", durationMs: 20000, bytes: 1500000, sha256: "a".repeat(64), renderer: "reel-canvas-v2", createdAt: 1, public: true, videoUrl: P.videoUrl, poster: "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p5/1-likeloop-cinematic-poster.jpg", productTags: [{ productId: "p5" }], marketerId: "m1", truth: "SYNTHETIC_ANIMATION", creative: { creativeId: "cr_x1", hookType: "before_after", hook: "רגע לפני שיוצאים: לפני ואחרי תכשיט אחד" } };

const okFetch = async (url, init = {}) => {
  if (String(url).includes("mode=media")) return new Response("x", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-0/1" } });
  return new Response(`<div id="root"></div>${P.videoUrl}`, { status: 200, headers: { "content-type": "text/html" } });
};

test("not connected: GENERATED + internally PUBLISHED/VERIFIED, externally PREPARED and never sent", async () => {
  const { entries } = buildLedger({ videos: [V], products: [P], marketers: M, env: {} });
  const proof = await verifyEntry(entries[0], { fetchImpl: okFetch });
  const ig = proof.publications.find((p) => p.destination === "instagram");
  assert.equal(ig.status, "NEEDS_CONNECTION");
  assert.equal(ig.providerId, null);
  assert.equal(ig.prepared.stage, "PREPARED");
  assert.equal(ig.prepared.sent, false);
  assert.equal(ig.prepared.payload.media_type, "REELS");
  assert.ok(ig.prepared.payload.caption.startsWith("רגע לפני שיוצאים"), "the creative's own hook opens the caption");
  assert.ok(ig.prepared.payload.caption.includes("#פרסומת") && ig.prepared.payload.caption.includes("אנימציה ממוחשבת"));
  assert.match(ig.prepared.trackingUrl, /cid=cr_x1/);
  const tg = proof.publications.find((p) => p.destination === "telegram_brand").prepared;
  assert.ok(tg.payload.caption.includes(tg.trackingUrl), "the caption link is the creative's tracked URL");
  assert.ok(!/utm_source=facebook/.test(proof.publications.find((p) => p.destination === "webhook_brand").prepared.payload.caption));
  assert.equal(proof.lifecycle.GENERATED.ok, true);
  assert.ok(proof.lifecycle.PUBLISHED.internal.length > 0);
  assert.deepEqual(proof.lifecycle.PUBLISHED.external, []);
  assert.deepEqual(proof.lifecycle.VERIFIED.external, []);
  assert.equal(proof.lifecycle.externalState, "PREPARED_NOT_SENT");
});

test("PUBLISHED externally only with a provider id; VERIFIED only when read back", async () => {
  const unverified = buildLedger({ videos: [V], products: [P], marketers: M, instagram: { posted: [{ reelId: V.id, mediaId: "1789", permalink: "https://www.instagram.com/reel/x/", verified: false, at: 2 }] } });
  const a = await verifyEntry(unverified.entries[0], { fetchImpl: okFetch });
  assert.equal(a.lifecycle.externalState, "PUBLISHED");
  assert.equal(a.lifecycle.PUBLISHED.external[0].providerId, "1789");
  assert.equal(a.publications.find((p) => p.destination === "instagram").prepared, undefined, "a sent post is not 'prepared'");
  const verified = buildLedger({ videos: [V], products: [P], marketers: M, instagram: { posted: [{ reelId: V.id, mediaId: "1789", verified: true, at: 2 }] } });
  const b = await verifyEntry(verified.entries[0], { fetchImpl: okFetch });
  assert.equal(b.lifecycle.externalState, "VERIFIED");
});

test("an Instagram payload without an AAC track (or out of 3–90 s) is INVALID, not prepared", () => {
  const asset = { assetUrl: V.videoUrl, posterUrl: V.poster, style: V.style, durationMs: 20000 };
  assert.equal(prepareExternal("instagram", { v: { ...V, audio: "none" }, asset, product: P, creator: M[0] }).stage, "INVALID");
  assert.equal(prepareExternal("instagram", { v: V, asset: { ...asset, durationMs: 120000 }, product: P, creator: M[0] }).stage, "INVALID");
  assert.equal(prepareExternal("instagram", { v: V, asset, product: P, creator: M[0] }).stage, "PREPARED");
});
