// LikeLink's own skills (src/lib/skills): a small runtime (input check,
// permissions, timeout, bounded retries, resumable workflows that never mark
// an unfinished stage done) and the catalog skills, run on the real catalog
// copy. Nothing here invents a price, a rating, a match or a video.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defineSkill, fingerprint, runSkill, runWorkflow, STATUS } from "../src/lib/skills/runtime.js";
import { CATALOG_GRANTS, CATALOG_HEALTH, ensureCatalogSkills, matchMedia, priceState, rankProducts } from "../src/lib/skills/catalog.js";
import { HOOK_FORBIDDEN } from "../src/lib/growth/likeloop.js";
import { runCatalogHealth } from "../scripts/skills/run.mjs";
import { parsePath } from "../src/utils/routing.js";
import { SPA_SECTIONS } from "../scripts/rebase-static-pages.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const snapshot = JSON.parse(read("public/snapshot/kv.json"));
const rows = (k) => { const v = snapshot.keys[k]; return typeof v === "string" ? JSON.parse(v) : v; };
const products = rows("marketplace:products");
const marketers = rows("marketplace:marketers");
const feed = [
  { id: "seller-p-live-02", productId: "p-live-02", look: "seller" },
  { id: "seller-p-live-05", productId: "p-live-05", look: "seller" },
  { id: "luna-gift-earrings", productId: "p-live-05", look: "talking" },
];
ensureCatalogSkills();
const grants = { grants: [...CATALOG_GRANTS] };

test("runtime: a skill declares itself; bad input fails, a missing permission blocks, nothing throws", async () => {
  assert.throws(() => defineSkill({ name: "Bad Name", purpose: "x", permissions: [], run() {} }), /skill_name_invalid/);
  defineSkill({ name: "t-echo", purpose: "echo", permissions: ["read:catalog"], validate: (i) => (typeof i?.n === "number" ? [] : ["n must be a number"]), run: (i) => ({ processed: 1, output: i.n }) });
  assert.throws(() => defineSkill({ name: "t-echo", purpose: "dup", permissions: [], run() {} }), /skill_exists/);
  assert.equal((await runSkill("t-echo", { n: "x" }, grants)).status, STATUS.FAILED);
  const blocked = await runSkill("t-echo", { n: 1 }, { grants: [] });
  assert.equal(blocked.status, STATUS.BLOCKED);
  assert.equal(blocked.blockedBy, "permission:read:catalog");
  const ok = await runSkill("t-echo", { n: 7 }, grants);
  assert.deepEqual([ok.status, ok.output, ok.processed, ok.attempts], [STATUS.OK, 7, 1, 1]);
  assert.equal((await runSkill("no-such-skill", {}, grants)).errors[0].code, "unknown_skill");
});

test("runtime: timeouts and bounded retries, only for errors worth retrying", async () => {
  defineSkill({ name: "t-slow", purpose: "never ends", permissions: [], timeoutMs: 20, run: () => new Promise(() => {}) });
  const slow = await runSkill("t-slow", {}, {});
  assert.deepEqual([slow.status, slow.errors[0].code], [STATUS.FAILED, "timeout"]);
  let calls = 0;
  defineSkill({ name: "t-flaky", purpose: "fails twice", permissions: [], retries: 2, run: () => { calls += 1; if (calls < 3) throw new Error("fetch failed"); return { output: "ok" }; } });
  const flaky = await runSkill("t-flaky", {}, { sleep: async () => {} });
  assert.deepEqual([flaky.status, flaky.attempts], [STATUS.OK, 3]);
  let hard = 0;
  defineSkill({ name: "t-broken", purpose: "a bug is not retried", permissions: [], retries: 3, run: () => { hard += 1; throw new TypeError("x is not a function"); } });
  assert.equal((await runSkill("t-broken", {}, { sleep: async () => {} })).status, STATUS.FAILED);
  assert.equal(hard, 1);
});

test("runtime: a workflow stops at a failed stage, skips the rest with the reason, and resumes without redoing finished stages", async () => {
  let runs = 0;
  defineSkill({ name: "t-a", purpose: "a", permissions: [], run: () => { runs += 1; return { output: 1 }; } });
  defineSkill({ name: "t-b", purpose: "b", permissions: [], run: (i) => (i.fail ? { status: STATUS.FAILED, errors: [{ code: "x" }] } : { output: 2 }) });
  defineSkill({ name: "t-c", purpose: "c", permissions: [], run: () => ({ output: 3 }) });
  const steps = [{ skill: "t-a" }, { skill: "t-b" }, { skill: "t-c" }];
  const first = await runWorkflow({ name: "w", steps, input: { fail: true } });
  assert.equal(first.status, STATUS.FAILED);
  assert.deepEqual(first.stages.map((s) => s.status), [STATUS.OK, STATUS.FAILED, STATUS.SKIPPED]);
  assert.equal(first.stages[2].reason, "after t-b: failed");
  const again = await runWorkflow({ name: "w", steps, input: { fail: true }, previous: first });
  assert.equal(runs, 1, "the finished stage with the same input is reused");
  assert.equal(again.stages[0].resumed, true);
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});

test("product integrity on the real catalog: every listed product passes; a rating, a review count or an unsourced price never does", async () => {
  const real = await runSkill("product-integrity", { products, marketers }, grants);
  assert.equal(real.status, STATUS.OK);
  assert.deepEqual(real.output.publishable, products.map((p) => p.id));
  const bad = await runSkill("product-integrity", { products: [{ ...products[0], rating: 4.8, reviewCount: 1400 }, { ...products[1], price: 99, priceSource: undefined, priceCheckedAt: undefined }, { ...products[2], affiliateUrl: "http://example.com/x" }], marketers }, grants);
  const codes = (id) => bad.output.products.find((r) => r.id === id).issues.map((i) => i.code);
  assert.ok(codes(products[0].id).includes("unverified_claim"));
  assert.ok(codes(products[1].id).includes("unverified_price"));
  assert.ok(codes(products[2].id).includes("not_a_store_link"));
  assert.deepEqual(bad.output.publishable, []);
});

test("links are checked without opening them; prices are shown only from an approved, recent source", async () => {
  const links = await runSkill("link-health", { products }, grants);
  assert.equal(links.status, STATUS.OK);
  assert.ok(links.output.links.every((l) => l.state === "FORMAT_OK" && l.live === "NOT_OPENED" && l.host === "s.click.aliexpress.com"));
  // The real catalog: every price was read from the AliExpress API (fresh or, between syncs, stale — never NONE).
  const prices = await runSkill("price-freshness", { products }, grants);
  assert.ok(prices.output.prices.every((p) => p.state === "FRESH" || p.state === "STALE"), "every listed price has an approved source");
  // Without an API price only the hand-entered catalogPrice is left, and that is never a price.
  const unpriced = await runSkill("price-freshness", { products: products.map(({ price, priceSource, priceCheckedAt, ...p }) => p) }, grants);
  assert.equal(unpriced.status, STATUS.WARN);
  assert.equal(unpriced.blockedBy, "aliexpress_api_connection");
  assert.ok(unpriced.output.prices.every((p) => p.state === "NONE"), "catalogPrice is never a price");
  const now = Date.parse("2026-10-11T12:00:00Z");
  assert.equal(priceState({ price: 47, priceSource: "aliexpress_api", priceCheckedAt: "2026-10-11T00:00:00Z" }, now).state, "FRESH");
  assert.equal(priceState({ price: 47, priceSource: "aliexpress_api", priceCheckedAt: "2026-10-01T00:00:00Z" }, now).state, "STALE");
  assert.equal(priceState({ price: 47, priceSource: "hand_entered", priceCheckedAt: "2026-10-11T00:00:00Z" }, now).state, "NONE");
});

test("media matching: a clip of another item is rejected, a checked clip matches, an unchecked one stays uncertain", async () => {
  const items = matchMedia({ products, reels: [...feed, { id: "seller-p-live-01", productId: "p-live-01", look: "seller" }, { id: "x", productId: "p-unknown", look: "seller" }] });
  const v = (media) => items.find((m) => m.media === media)?.verdict;
  assert.equal(v("seller-p-live-02"), "REJECTED");
  assert.equal(v("seller-p-live-05"), "MATCHED");
  assert.equal(v("seller-p-live-01"), "UNCERTAIN", "no one has looked at it yet");
  assert.equal(v("x"), "REJECTED");
  assert.equal(v("luna-gift-earrings"), "LABELLED_SYNTHETIC");
  assert.equal(v("looks/p-live-05.jpg"), "MATCHED");
  const noFeed = await runSkill("media-matching", { products, reels: null }, grants);
  assert.deepEqual([noFeed.status, noFeed.blockedBy], [STATUS.WARN, "reels_feed_unreachable"]);
});

test("discovery ranking explains itself and ignores popularity", () => {
  const busy = products.map((p) => (p.id === "p-live-01" ? { ...p, clicks: 1e6 } : p));
  const ranked = rankProducts(busy, { reels: feed });
  assert.equal(ranked.at(-1).id === "p-live-01" || ranked.find((r) => r.id === "p-live-01").score < ranked[0].score, true, "a million clicks do not move it up");
  assert.ok(ranked[0].reasons.includes("סרטון של המוצר שנבדק"));
  assert.ok(ranked.every((r) => r.reasons.every((t) => !/פופולרי|נמכר|דירוג|ביקורות/.test(t))));
});

test("content production writes claim-free Hebrew with the disclosure and never says a video exists", async () => {
  const res = await runSkill("content-production", { products, publishable: ["p-live-01", "p-live-05"], reels: feed }, grants);
  assert.equal(res.status, STATUS.OK);
  assert.deepEqual(res.output.packs.map((p) => p.id), ["p-live-01", "p-live-05"]);
  for (const pack of res.output.packs) {
    assert.ok(pack.hooks.length > 0 && pack.hooks.every((h) => !HOOK_FORBIDDEN.test(h)));
    assert.ok(pack.caption.startsWith("#פרסומת · קישור שותפים"));
    assert.ok(["FOOTAGE_AVAILABLE", "NOT_RENDERED"].includes(pack.video.state));
  }
  assert.equal(res.output.packs.find((p) => p.id === "p-live-05").video.state, "FOOTAGE_AVAILABLE");
  assert.equal(res.output.packs.find((p) => p.id === "p-live-01").video.state, "NOT_RENDERED");
});

test("the catalog-health workflow on the real catalog: six stages, honest status, resumable", async () => {
  const doc = await runCatalogHealth({ snapshot, reels: feed, now: Date.parse(snapshot.takenAt) });
  assert.deepEqual(doc.stages.map((s) => s.skill), CATALOG_HEALTH.map((s) => s.skill));
  assert.equal(doc.status, STATUS.WARN, "prices wait for the AliExpress connection; one clip is rejected");
  assert.ok(doc.stages.every((s) => s.status !== STATUS.SKIPPED));
  const again = await runCatalogHealth({ snapshot, reels: feed, previous: doc, now: Date.parse(snapshot.takenAt) });
  assert.ok(again.stages.every((s) => s.resumed), "same input: nothing is redone");
  assert.doesNotMatch(JSON.stringify(doc), /ALIEXPRESS_APP|SERVICE_ROLE|VITE_SUPABASE_ANON|apikey/i, "the public record names no secret");
});

test("the record ships with every build and /status shows it, with no secret names", () => {
  assert.match(JSON.parse(read("package.json")).scripts.postbuild, /node scripts\/skills\/run\.mjs/);
  assert.equal(parsePath("/status").type, "status");
  assert.ok(SPA_SECTIONS.includes("status"));
  assert.match(read("src/App.jsx"), /"status"/);
  assert.ok(JSON.parse(read("vercel.json")).rewrites.some((r) => r.source === "/status"));
  const page = read("src/components/discover/status.jsx");
  assert.match(page, /withBase\("\/ops\/skills\.json"\)/);
  assert.doesNotMatch(page, /ALIEXPRESS_|VITE_|SUPABASE_|SERVICE_ROLE/, "public page: no environment names");
  const products = read("src/components/discover/pages.jsx");
  assert.match(products, /rankProducts\(graph\.products, \{ verifiedVideoIds: checked \}\)/, "/products uses the ranking skill");
  assert.match(products, /only === "video"/, "a real 'with video' filter");
});
