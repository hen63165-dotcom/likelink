// Native discovery fabric — commerce routing, disclosure, real connections,
// first-party experiments and the crawler-served product body.
//
// Every value comes from real records: prices are labelled "catalog", stock is
// UNVERIFIED, conversions are verified only with a PayPal capture, and an
// experiment never names a winner without known exposures.
import test from "node:test";
import assert from "node:assert/strict";

const MARKETERS = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle" }];
const product = (i, over = {}) => ({
  id: `p${i}`, title: `מוצר ${i}`, description: "תיאור אמיתי ומלא של המוצר, ארוך מספיק לבדיקות SEO ולכל שאר הבדיקות.",
  price: 50 + i, currency: "ILS", image: `https://images.unsplash.com/photo-${i}`, affiliateUrl: `https://www.aliexpress.com/item/${i}`,
  category: "Home", status: "approved", marketerId: "m1", ...over,
});

test("affiliate share packs carry a disclosure; variants are tracked separately", async () => {
  const S = await import("../src/lib/discovery/surfaces.js");
  const c = S.canonicalProduct(product(1), MARKETERS[0]);
  assert.equal(c.saleModel, "affiliate");
  const share = S.buildShareAsset(c);
  assert.match(share.text, /גילוי נאות: קישור שותפים/);
  assert.match(decodeURIComponent(share.whatsappUrl), /גילוי נאות/, "the WhatsApp text carries it too");
  const variants = S.buildShareVariants(c, share);
  assert.deepEqual(variants.map((v) => new URL(v.trackingLink).searchParams.get("src")), ["luna_share_a", "luna_share_b"]);
  assert.ok(variants.every((v) => /גילוי נאות/.test(v.text)));
  const direct = S.canonicalProduct(product(2, { affiliateUrl: "" }), MARKETERS[0]);
  assert.notEqual(direct.saleModel, "affiliate");
  assert.doesNotMatch(S.buildShareAsset(direct).text, /גילוי נאות/, "no disclosure where there is no affiliate link");
});

test("commerce route: real clicks per source, verified vs self-reported conversions, stock never claimed", async () => {
  const S = await import("../src/lib/discovery/surfaces.js");
  const c = S.canonicalProduct(product(1), MARKETERS[0]);
  const clicks = [
    { productId: "p1", type: "outbound_click", source: "luna_share_a" },
    { productId: "p1", type: "outbound_click", source: "luna_share_a" },
    { productId: "p1", type: "view", source: "feed" },
    { productId: "p2", type: "outbound_click", source: "feed" },
  ];
  const sales = [{ productId: "p1", source: "paypal_checkout", captureId: "CAP1" }, { productId: "p1", source: "self_report" }];
  const r = S.commerceRoute(c, { clicks, sales });
  assert.equal(r.model, "affiliate");
  assert.equal(r.merchant.host, "aliexpress.com");
  assert.equal(r.tracking.outboundClicks, 2);
  assert.deepEqual(r.tracking.bySource, { luna_share_a: 2 });
  assert.deepEqual([r.conversion.verified, r.conversion.selfReported], [1, 1]);
  assert.equal(r.availability.merchantStock, "UNVERIFIED");
  assert.equal(r.price.verifiedAtMerchant, false);
  assert.equal(r.disclosure.required, true);
});

test("connections are real and public-only (no new pages)", async () => {
  const S = await import("../src/lib/discovery/surfaces.js");
  const products = [product(1), product(2), product(3, { category: "Beauty" }), product(4, { status: "removed" }), product(5, { marketerId: "ghost" })];
  const c = S.canonicalProduct(products[0], MARKETERS[0]);
  const k = S.productConnections(c, { products, marketers: MARKETERS, collections: [{ id: "col1", productIds: ["p1", "p3"] }] });
  assert.deepEqual(k.sameCreator.sort(), ["p2", "p3"]);
  assert.deepEqual(k.sameCategory, ["p2"]);
  assert.deepEqual(k.viaCollections, ["p3"]);
  assert.ok(!k.sameCreator.includes("p4") && !k.sameCategory.includes("p5"), "non-public products never connect");
});

test("experiments: no exposure data → INSUFFICIENT_DATA however many clicks; a winner needs significance", async () => {
  const { evaluateExperiment, shareExperiment, EXPERIMENT_STATE } = await import("../src/lib/discovery/experiments.js");
  assert.equal(evaluateExperiment([{ id: "a", exposures: null, clicks: 900 }, { id: "b", exposures: null, clicks: 3 }]).state, EXPERIMENT_STATE.INSUFFICIENT_DATA);
  assert.equal(evaluateExperiment([{ id: "a", exposures: 40, clicks: 20 }, { id: "b", exposures: 40, clicks: 2 }]).state, EXPERIMENT_STATE.INSUFFICIENT_DATA, "too few exposures");
  const win = evaluateExperiment([{ id: "a", exposures: 1000, clicks: 80 }, { id: "b", exposures: 1000, clicks: 30 }]);
  assert.equal(win.state, EXPERIMENT_STATE.WINNER);
  assert.equal(win.winner, "a");
  assert.ok(win.pValue < 0.05);
  const tie = evaluateExperiment([{ id: "a", exposures: 1000, clicks: 50 }, { id: "b", exposures: 1000, clicks: 48 }]);
  assert.equal(tie.state, EXPERIMENT_STATE.NO_DIFFERENCE);
  assert.equal(tie.winner, null);
  const real = shareExperiment("p1", [{ productId: "p1", type: "outbound_click", source: "luna_share_b" }]);
  assert.equal(real.state, EXPERIMENT_STATE.INSUFFICIENT_DATA);
  assert.deepEqual(real.variants.map((v) => v.clicks), [0, 1]);
});

test("crawler body = the real, escaped content a person sees (with the disclosure)", async () => {
  const S = await import("../src/lib/discovery/surfaces.js");
  const c = S.canonicalProduct(product(1, { title: "<script>alert(1)</script> כוס" }), MARKETERS[0]);
  const html = S.renderProductBody(c);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /מומלץ על ידי <a href="https:\/\/likelink2\.vercel\.app\/u\/alyostyle">/);
  assert.match(html, /גילוי נאות/);
});

test("share packs of the old format are rebuilt once with the disclosure (previous kept)", async () => {
  const { runIntent } = await import("../src/lib/discovery/orchestrator.js");
  const { buildProductAssets } = await import("../src/lib/discovery/engine.js");
  const old = buildProductAssets(product(1), MARKETERS, []);
  delete old.format;
  old.share.text = "old text without disclosure";
  const store = new Map([["marketplace:products", [product(1)]], ["marketplace:marketers", MARKETERS], ["publish:log", []], ["discovery:assets:p1", old]]);
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const kvSet = async (k, v) => { store.set(k, structuredClone(v)); };
  const r = await runIntent({ kvGet, kvSet, goal: "לונה, תגדילי את החשיפה", scope: { marketerIds: ["m1"] } });
  const step = r.steps.find((s) => s.capability === "create_share_asset");
  assert.equal(step.status, "executed");
  const now = store.get("discovery:assets:p1");
  assert.equal(now.format, 2);
  assert.match(now.share.text, /גילוי נאות/);
  assert.equal(now.previous.share.text, "old text without disclosure", "rollback target kept");
  assert.equal(now.share.variants.length, 2);
  const again = await runIntent({ kvGet, kvSet, goal: "לונה, תגדילי את החשיפה", scope: { marketerIds: ["m1"] } });
  assert.notEqual(again.steps.find((s) => s.capability === "create_share_asset")?.status, "executed", "idempotent after the upgrade (the pack is fresh, so no rewrite)");
  assert.equal(again.passports[0].surfaces.find((x) => x.id === "share_asset").status, "ready");
});

test("a reel LikeLink rendered is an animation — never a real (filmed) video, never UGC", async () => {
  const { classifyMediaRecord, MEDIA_TRUTH } = await import("../src/lib/discovery/mediaTruth.js");
  const url = "https://likelink2.vercel.app/api/og?mode=media&path=reels/m1/1-a.webm";
  assert.equal(classifyMediaRecord({ videoUrl: url, source: "likelink_auto_ugc" }).state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.equal(classifyMediaRecord({ videoUrl: url, source: "upload", native: true }).state, MEDIA_TRUTH.SYNTHETIC_ANIMATION);
  assert.equal(classifyMediaRecord({ videoUrl: "https://cdn.example/filmed.mp4", source: "upload" }).state, MEDIA_TRUTH.REAL_VIDEO, "a creator's own uploaded video file stays a real video");
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/components/product/ProductComponents.jsx", "src/components/studio/StudioHome.jsx", "src/components/studio/UGCCampaignStudio.jsx"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /title: `UGC ·/, `${f}: a rendered reel is not titled UGC`);
    assert.match(src, /native: true,\s*\n\s*synthetic: true/, `${f}: rendered reels are flagged native + synthetic`);
  }
});

test("crawler HTML is never shared-cached for people (link previews used to strand humans on it)", async () => {
  process.env.VITE_SUPABASE_URL = "https://sb.test";
  process.env.VITE_SUPABASE_ANON_KEY = "anon";
  const products = [product(1)];
  const marketers = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle" }];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("key=eq.marketplace%3Aproducts") || u.includes("key=eq.marketplace:products")) return new Response(JSON.stringify([{ value: JSON.stringify(products) }]), { status: 200 });
    if (u.includes("key=eq.marketplace%3Amarketers") || u.includes("key=eq.marketplace:marketers")) return new Response(JSON.stringify([{ value: JSON.stringify(marketers) }]), { status: 200 });
    if (u.endsWith("/index.html")) return new Response('<!doctype html><div id="root"></div>', { status: 200 });
    return new Response("[]", { status: 200 });
  };
  const { default: og } = await import("../api/og.mjs");
  const call = async (ua) => {
    const res = { statusCode: 200, headers: {}, sent: "", status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, end(b) { this.sent = String(b ?? ""); }, writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); } };
    await og({ method: "GET", url: "/api/og?id=p1", headers: { host: "likelink2.vercel.app", "user-agent": ua } }, res);
    return res;
  };
  const bot = await call("WhatsApp/2.23");
  assert.match(bot.sent, /גילוי נאות/);
  assert.match(bot.headers["cache-control"], /^private/, "the CDN must not keep the crawler page");
  assert.equal(bot.headers.vary, "User-Agent");
  const human = await call("Mozilla/5.0 (Linux; Android 14) Chrome/152 Mobile Safari/537.36");
  assert.match(human.sent, /id="root"/, "a person always gets the app");
  assert.equal(human.headers.vary, "User-Agent");
});
