// MEDIA CHAIN — product → real visual asset → AI asset → publication.
//
// Pins what the live catalog showed on 2026-10-01: stock photos were labelled
// "verified_catalog_image" and the UGC job appended a duplicate asset on every
// run; AI image generation could be triggered by any signed-in user (on the
// owner's OpenAI budget) and drew the product without a reference.
// Now: a stock photo is never a product asset; the job reuses one asset; AI
// images are owner-only, need a REAL product photo, send it as the reference
// (images/edits), ask for an ORIGINAL character and are stored as synthetic,
// AI-labelled assets. No network leaves the test.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.OWNER_EMAIL = "boss@likelink.test";

const kv = new Map();
const USERS = { "tok-boss": { id: "u-boss", email: "boss@likelink.test" }, "tok-creator": { id: "u-c", email: "creator@likelink.test" } };
const calls = [];
const PHOTO = "https://ae01.alicdn.com/kf/S-real-photo.jpg";
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
  if (u.startsWith(`${SB}/storage/v1/object/`)) { calls.push(`STORAGE ${u.slice(SB.length)}`); return jsonResponse(200, { Key: "ok" }); }
  if (u.startsWith(`${SB}/rest/v1/`)) return jsonResponse(200, []);
  if (u === PHOTO) { calls.push("PHOTO"); return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { "content-type": "image/jpeg" } }); }
  if (u.startsWith("https://api.openai.com/")) {
    const form = init.body;
    calls.push({ openai: u, prompt: form?.get?.("prompt") || null, hasImage: Boolean(form?.get?.("image")), model: form?.get?.("model") || null });
    return jsonResponse(200, { data: [{ b64_json: Buffer.from("fake-png").toString("base64") }] });
  }
  calls.push(`OTHER ${u}`);
  return jsonResponse(599, {});
};
const put = (k, v) => kv.set(k, JSON.stringify(v));
const read = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : undefined);
function mockRes() {
  return { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, json(o) { this.body = o; }, end() {}, writeHead(c) { this.statusCode = c; } };
}
function mockReq({ url, token = "", body = null }) {
  return { method: "POST", url, body, headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
async function generate(token, productId = "p1") {
  const { default: store } = await import("../api/store.mjs");
  const res = mockRes();
  await store(mockReq({ url: "/api/store?mode=ugc-model", token, body: { productId } }), res);
  return res;
}
function seed() {
  kv.clear(); calls.length = 0;
  put("marketplace:products", [
    { id: "p1", title: "עגילי כסף", description: "עגילי כסף 925.", price: 47, image: PHOTO, affiliateUrl: "https://s.click.aliexpress.com/e/a", status: "approved", marketerId: "m1" },
    { id: "p2", title: "טבעת", description: "טבעת כסף.", price: 10, image: "https://images.unsplash.com/photo-1", affiliateUrl: "https://s.click.aliexpress.com/e/b", status: "approved", marketerId: "m1" },
  ]);
  put("marketplace:marketers", [{ id: "m1", name: "Owner", slug: "owner" }]);
  put("marketplace:marketers:private", { m1: { email: "boss@likelink.test" } });
}

test("AI images: platform owner only (the owner's OpenAI budget), and only with the provider key", async () => {
  seed();
  process.env.OPENAI_API_KEY = "";
  let res = await generate("tok-creator");
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "platform_owner_only");
  res = await generate("tok-boss");
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "ugc_ai_not_configured");
  assert.ok(!calls.some((c) => c.openai), "no provider call");
});

test("AI images: a stock photo is refused — the real product photo is required", async () => {
  seed();
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const res = await generate("tok-boss", "p2");
  assert.equal(res.statusCode, 422);
  assert.deepEqual([res.body.error, res.body.provenance], ["product_photo_required", "stock_photo"]);
  assert.ok(!calls.some((c) => c.openai), "nothing was generated from a stock photo");
});

test("AI images: the real photo is the reference (images/edits); an ORIGINAL 3D character; stored as a synthetic, AI-labelled asset", async () => {
  seed();
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  const res = await generate("tok-boss", "p1");
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const call = calls.find((c) => c.openai);
  assert.equal(call.openai, "https://api.openai.com/v1/images/edits", "the product photo is sent as the reference");
  assert.equal(call.hasImage, true);
  assert.equal(call.model, "gpt-image-1");
  assert.match(call.prompt, /ORIGINAL, friendly 3D cartoon character/);
  assert.match(call.prompt, /must not resemble any existing film, TV or game character/);
  assert.match(call.prompt, /exactly like the reference photo/);
  assert.doesNotMatch(call.prompt, /pixar|disney|dreamworks/i);
  assert.ok(!calls.some((c) => c.openai === "https://api.openai.com/v1/images/generations"), "never drawn without the reference");
  assert.ok(calls.some((c) => typeof c === "string" && c.startsWith("STORAGE /storage/v1/object/product-images/ugc/p1/")), "stored in the private bucket");
  const [asset] = read("ugc:assets:p1");
  assert.deepEqual([asset.source, asset.synthetic, asset.aiGenerated, asset.aiLabelRequired, asset.referencePhoto, asset.characterType], ["openai_gpt_image_1_edit", true, true, true, PHOTO, "original_3d_cartoon"]);
});

test("UGC job: a stock photo is never a product asset, nothing is labelled 'verified', and runs never duplicate assets", async () => {
  seed();
  await import("../src/lib/cloud/autonomousJobs.js");
  const { executeJob } = await import("../src/lib/cloud/growthScheduler.js");
  const kvGet = async (k, fb) => (kv.has(k) ? JSON.parse(kv.get(k)) : fb);
  const kvSet = async (k, v) => { kv.set(k, JSON.stringify(v)); };
  await executeJob("autonomous-ugc-video-production", { kvGet, kvSet, force: true, skipAudit: true });
  await executeJob("autonomous-ugc-video-production", { kvGet, kvSet, force: true, skipAudit: true });
  await executeJob("autonomous-ugc-video-production", { kvGet, kvSet, force: true, skipAudit: true });
  assert.equal(read("ugc:assets:p2"), undefined, "no asset from a stock photo");
  const assets = read("ugc:assets:p1") || [];
  assert.equal(assets.length, 1, "one catalog asset, reused on every run");
  assert.deepEqual([assets[0].source, assets[0].provenance, assets[0].synthetic], ["catalog_image", "merchant_photo", false]);
  assert.ok(!JSON.stringify([...kv.values()]).includes("verified_catalog_image"));
});
