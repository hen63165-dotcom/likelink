// Catalog truth resolver — a product's photo is replaced only by the store's
// own photo from the product's own page, checked by the server and read back.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCandidates, validateResolution, applyResolution, catalogCandidates } from "../src/lib/cloud/catalogResolver.js";
import { _resetKvReadGuard } from "../src/lib/cloud/kvReadGuard.js";

const M = [{ id: "m1", name: "ALYOSTYLE" }];
const prod = (id, extra = {}) => ({ id, title: `t ${id}`, status: "approved", marketerId: "m1", affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, image: "https://images.unsplash.com/photo-1", ...extra });
const CATALOG = [
  prod("own1"),
  prod("merchant", { image: "https://ae01.alicdn.com/kf/real.jpg" }),
  prod("s1", { affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }),
  prod("s2", { affiliateUrl: "https://s.click.aliexpress.com/e/_SHARED" }),
  prod("draft", { status: "pending" }),
];
const GOOD = { productId: "own1", itemUrl: "https://www.aliexpress.com/item/1005006123456789.html", image: "https://ae01.alicdn.com/kf/S64b18d.jpg" };

test("candidates: public, own link, image not yet the store's photo", () => {
  assert.deepEqual(resolveCandidates(CATALOG, M).map((c) => c.id), ["own1"]);
});

test("validation refuses anything that is not the store's own product page + photo", () => {
  assert.equal(validateResolution(GOOD, CATALOG, M).ok, true);
  assert.equal(validateResolution({ ...GOOD, productId: "s1" }, CATALOG, M).error, "shared_affiliate_link");
  assert.equal(validateResolution({ ...GOOD, productId: "draft" }, CATALOG, M).error, "product_not_public");
  assert.equal(validateResolution({ ...GOOD, itemUrl: "https://www.aliexpress.com/" }, CATALOG, M).error, "not_a_product_page");
  assert.equal(validateResolution({ ...GOOD, itemUrl: "https://evil.example/item/1005006123456789.html" }, CATALOG, M).error, "not_a_product_page");
  assert.equal(validateResolution({ ...GOOD, image: "https://images.unsplash.com/x.jpg" }, CATALOG, M).error, "image_not_merchant_photo");
  assert.equal(validateResolution({ ...GOOD, image: "http://ae01.alicdn.com/kf/x.jpg" }, CATALOG, M).error, "bad_image_url");
});

function fake({ imageType = "image/jpeg", imageBytes = 20_000 } = {}) {
  const kv = new Map([["marketplace:products", JSON.stringify(CATALOG)], ["marketplace:marketers", JSON.stringify(M)]]);
  const env = { VITE_SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "SERVICE" };
  const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    if (u.hostname === "ae01.alicdn.com") return new Response(new Uint8Array(imageBytes), { status: 200, headers: { "content-type": imageType } });
    if (u.pathname === "/rest/v1/kv" && (opts.method || "GET") === "GET") {
      const k = u.searchParams.get("key").replace(/^eq\./, "");
      return json(kv.has(k) ? [{ value: kv.get(k) }] : []);
    }
    if (u.pathname === "/rest/v1/kv" && opts.method === "POST") {
      const { key, value } = JSON.parse(opts.body);
      kv.set(key, value);
      return json({});
    }
    return new Response("unexpected", { status: 500 });
  }
  return { env, fetchImpl, get: (k) => JSON.parse(kv.get(k)) };
}

test("apply: the server downloads the photo, writes it, keeps the previous one, reads it back", async () => {
  _resetKvReadGuard();
  const f = fake();
  const r = await applyResolution(GOOD, { env: f.env, fetchImpl: f.fetchImpl, now: 1000 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.proof.status, "VERIFIED");
  const p = f.get("marketplace:products").find((x) => x.id === "own1");
  assert.equal(p.image, GOOD.image);
  assert.equal(p.imageSource.previous, "https://images.unsplash.com/photo-1");
  assert.equal(p.imageSource.itemId, "1005006123456789");
  assert.equal(f.get("marketplace:products").find((x) => x.id === "s1").image, "https://images.unsplash.com/photo-1", "other products untouched");
  assert.equal(f.get("catalog:resolve:log")[0].status, "VERIFIED");
  const c = await catalogCandidates({ env: f.env, fetchImpl: f.fetchImpl });
  assert.deepEqual(c.candidates, [], "resolved products are no longer candidates");
  assert.deepEqual(c.needsOwnerLink.sort(), ["s1", "s2"]);
});

test("apply refuses a 'photo' that is not an image or is a tiny placeholder — nothing written", async () => {
  _resetKvReadGuard();
  for (const opts of [{ imageType: "text/html" }, { imageBytes: 100 }]) {
    const f = fake(opts);
    const r = await applyResolution(GOOD, { env: f.env, fetchImpl: f.fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.error, "image_not_valid");
    assert.equal(f.get("marketplace:products").find((x) => x.id === "own1").image, "https://images.unsplash.com/photo-1");
  }
});
