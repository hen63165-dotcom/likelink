// VIDEO CHAIN — a reel made in the studio must actually play for the public.
//
// Found in production (2026-10-01): 98 reels in storage, none playable —
// (1) isPublicVideo rejected the private-bucket proxy URL (/api/og?mode=media…)
// so no video record ever reached marketplace:videos; (2) the storage policy
// only serves reels/<marketer>/… when an approved PRODUCT references the path,
// and nothing attached the reel to the product; (3) the proxy ignored Range,
// which iOS Safari needs to play <video>. All three are pinned here.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.VITE_SUPABASE_ANON_KEY = "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
const kv = new Map();
const USERS = { "tok-owner": { id: "u-owner", email: "owner@likelink.test" }, "tok-other": { id: "u-other", email: "other@likelink.test" } };
const storageCalls = [];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
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
  if (u.startsWith(`${SB}/storage/v1/object/authenticated/product-images/`)) {
    storageCalls.push({ url: u, range: headers.range || null });
    const body = new Uint8Array(1000).fill(7);
    if (headers.range === "bytes=0-1") return new Response(body.slice(0, 2), { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-1/1000" } });
    return new Response(body, { status: 200, headers: { "content-type": "video/mp4" } });
  }
  return jsonResponse(200, []);
};
const put = (k, v) => kv.set(k, JSON.stringify(v));
const read = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : undefined);
function mockRes() {
  return { statusCode: 200, headers: {}, body: undefined, ended: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, json(o) { this.body = o; }, end(b) { this.ended = b; }, writeHead(c) { this.statusCode = c; } };
}
function mockReq({ method = "POST", url = "/api/store", token = "", body = null, headers = {} }) {
  return { method, url, body, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.81", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
const REEL = "https://likelink2.vercel.app/api/og?mode=media&path=reels/m1/1790800071271-abc.mp4";
const video = (over = {}) => ({ id: "v1", title: "ריל", videoUrl: REEL, marketerId: "m1", productId: "p1", productTags: [{ productId: "p1" }], public: true, synthetic: true, createdAt: 1790800071271, ...over });
function seed() {
  kv.clear(); storageCalls.length = 0;
  put("marketplace:products", [
    { id: "p1", title: "עגילים", marketerId: "m1", status: "approved", image: "https://ae01.alicdn.com/kf/a.jpg", affiliateUrl: "https://s.click.aliexpress.com/e/a" },
    { id: "p2", title: "טבעת", marketerId: "m2", status: "approved", image: "https://ae01.alicdn.com/kf/b.jpg", affiliateUrl: "https://s.click.aliexpress.com/e/b" },
  ]);
  put("marketplace:marketers", [{ id: "m1", name: "Owner", slug: "owner" }, { id: "m2", name: "Other", slug: "other" }]);
  put("marketplace:marketers:private", { m1: { email: "owner@likelink.test" }, m2: { email: "other@likelink.test" } });
}

test("isPublicVideo accepts the private-bucket proxy URL (and still rejects drafts, SVG motion and foreign paths)", async () => {
  const { isPublicVideo } = await import("../src/lib/videoSync.js");
  assert.equal(isPublicVideo(video()), true);
  assert.equal(isPublicVideo(video({ videoUrl: REEL.replace(".mp4", ".webm") })), true);
  assert.equal(isPublicVideo(video({ videoUrl: "blob:https://likelink2.vercel.app/x" })), false);
  assert.equal(isPublicVideo(video({ videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=reels/m1/a.svg" })), false);
  assert.equal(isPublicVideo(video({ videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=health/x/a.mp4" })), false);
  assert.equal(isPublicVideo(video({ public: false })), false);
});

test("reelAttachments: only the writer's own approved product, only a reel from that creator's own folder", async () => {
  const { reelAttachments } = await import("../src/lib/cloud/reelAttach.js");
  const products = [{ id: "p1", marketerId: "m1", status: "approved" }, { id: "p3", marketerId: "m1", status: "pending" }, { id: "p2", marketerId: "m2", status: "approved" }];
  const owned = new Set(["m1"]);
  assert.deepEqual(reelAttachments([video()], owned, products).map((a) => a.productId), ["p1"]);
  assert.equal(reelAttachments([video({ productId: "p3", productTags: [] })], owned, products).length, 0, "not an unapproved product");
  assert.equal(reelAttachments([video({ productId: "p2", productTags: [], marketerId: "m2" })], owned, products).length, 0, "not another creator's product");
  assert.equal(reelAttachments([video({ videoUrl: REEL.replace("reels/m1/", "reels/m2/") })], owned, products).length, 0, "not a reel from another creator's folder");
});

test("saving a reel attaches it to the creator's own product (so storage serves it); a stale product write can't drop it; others can't attach", async () => {
  seed();
  const { default: store } = await import("../api/store.mjs");
  const call = async (opts) => { const res = mockRes(); await store(mockReq(opts), res); return res; };
  let res = await call({ token: "tok-owner", body: { key: "marketplace:videos", value: JSON.stringify([video()]) } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.reelsAttached, 1);
  let p1 = read("marketplace:products").find((p) => p.id === "p1");
  assert.equal(p1.videoUrl, REEL);
  assert.equal(p1.videoSynthetic, true, "a first-party animation is labelled synthetic");
  // A stale client product list without videoUrl must not make the reel private again.
  const stale = read("marketplace:products").map(({ videoUrl, videoSynthetic, videoUpdatedAt, ...rest }) => (rest.id === "p1" ? { ...rest, title: "עגילים חדשים" } : rest));
  res = await call({ token: "tok-owner", body: { key: "marketplace:products", value: JSON.stringify(stale) } });
  assert.equal(res.statusCode, 200);
  p1 = read("marketplace:products").find((p) => p.id === "p1");
  assert.deepEqual([p1.title, p1.videoUrl], ["עגילים חדשים", REEL]);
  // Another creator cannot attach anything to p1.
  res = await call({ token: "tok-other", body: { key: "marketplace:videos", value: JSON.stringify([...read("marketplace:videos"), video({ id: "v9", videoUrl: REEL.replace("abc", "zzz"), marketerId: "m1" })]) } });
  assert.equal(read("marketplace:products").find((p) => p.id === "p1").videoUrl, REEL);
});

test("media proxy: byte ranges are passed through (206 + Content-Range + Accept-Ranges) so iPhones can play reels", async () => {
  const { default: og } = await import("../api/og.mjs");
  let res = mockRes();
  await og(mockReq({ method: "GET", url: "/api/og?mode=media&path=reels/m1/1790800071271-abc.mp4", headers: { range: "bytes=0-1" } }), res);
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers["content-range"], "bytes 0-1/1000");
  assert.equal(res.headers["accept-ranges"], "bytes");
  res = mockRes();
  await og(mockReq({ method: "GET", url: "/api/og?mode=media&path=reels/m1/1790800071271-abc.mp4" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["accept-ranges"], "bytes");
  res = mockRes();
  await og(mockReq({ method: "GET", url: "/api/og?mode=media&path=reels/m1/x.mp4", headers: { range: "bytes=0-1;rm -rf" } }), res);
  assert.equal(res.statusCode, 200, "a malformed Range is ignored (full body), never trusted");
});
