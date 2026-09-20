import test from "node:test";
import assert from "node:assert/strict";

import {
  LUNA_GROWTH_CYCLE,
  LUNA_ACTION_TYPE,
  LUNA_ACTION_STATUS,
  detectOpportunities,
  diagnoseProduct,
  selfHealProduct,
  generateLunaContent,
  generateLunaHooks,
  planLunaCampaign,
  runGrowthCycle,
  runDailyTrendScan,
} from "../src/lib/cloud/lunaGrowth.js";

const baseProduct = {
  id: "p1",
  title: "טבעת כסף 925 קלאסית",
  price: 10.62,
  marketerId: "m1",
  status: "approved",
  affiliateUrl: "https://s.click.aliexpress.com/e/_test",
  category: "Accessories",
};

const owner = { id: "m1", authenticated: true };
const marketers = [{ id: "m1", name: "Test Creator" }];

test("LUNA_GROWTH_CYCLE contains all required stages", () => {
  assert.ok(LUNA_GROWTH_CYCLE.DETECT);
  assert.ok(LUNA_GROWTH_CYCLE.DIAGNOSE);
  assert.ok(LUNA_GROWTH_CYCLE.FIX);
  assert.ok(LUNA_GROWTH_CYCLE.EXECUTE);
  assert.ok(LUNA_GROWTH_CYCLE.MEASURE);
  assert.ok(LUNA_GROWTH_CYCLE.LEARN);
  assert.ok(LUNA_GROWTH_CYCLE.ADAPT);
  assert.ok(LUNA_GROWTH_CYCLE.IMPROVE);
  assert.ok(LUNA_GROWTH_CYCLE.PLAN);
  assert.ok(LUNA_GROWTH_CYCLE.CREATE);
  assert.ok(LUNA_GROWTH_CYCLE.PUBLISH);
  assert.ok(LUNA_GROWTH_CYCLE.VERIFY);
});

test("LUNA_ACTION_TYPE contains action types", () => {
  assert.ok(LUNA_ACTION_TYPE.TREND_SCAN);
  assert.ok(LUNA_ACTION_TYPE.CONTENT_CREATE);
  assert.ok(LUNA_ACTION_TYPE.PUBLISH_ATTEMPT);
  assert.ok(LUNA_ACTION_TYPE.VERIFICATION_RUN);
  assert.ok(LUNA_ACTION_TYPE.DIAGNOSIS);
  assert.ok(LUNA_ACTION_TYPE.SELF_HEAL);
  assert.ok(LUNA_ACTION_TYPE.LEARNING);
});

test("LUNA_ACTION_STATUS contains required statuses", () => {
  assert.ok(LUNA_ACTION_STATUS.PENDING);
  assert.ok(LUNA_ACTION_STATUS.RUNNING);
  assert.ok(LUNA_ACTION_STATUS.COMPLETED);
  assert.ok(LUNA_ACTION_STATUS.FAILED);
  assert.ok(LUNA_ACTION_STATUS.BLOCKED);
});

test("detectOpportunities returns opportunities from products", () => {
  const clicks = [{ productId: "p1", ts: Date.now() }, { productId: "p1", ts: Date.now() }];
  const result = detectOpportunities({ products: [baseProduct], clicks, now: Date.now() });
  assert.ok(result.opportunities.length > 0);
  assert.ok(result.summary.totalProducts === 1);
});

test("detectOpportunities handles empty products", () => {
  const result = detectOpportunities({ products: [] });
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.summary.totalProducts, 0);
});

test("diagnoseProduct detects no owner issue", () => {
  const product = { id: "p1", title: "Test", price: 99, marketerId: null, status: "approved" };
  const result = diagnoseProduct(product, { clicks: [], sales: [] });
  assert.ok(result.issues.some((i) => i.code === "no_owner"));
});

test("diagnoseProduct detects not approved issue", () => {
  const product = { id: "p1", title: "Test", price: 99, marketerId: "m1", status: "pending" };
  const result = diagnoseProduct(product, { clicks: [], sales: [] });
  assert.ok(result.issues.some((i) => i.code === "not_approved"));
});

test("diagnoseProduct detects no affiliate URL", () => {
  const product = { id: "p1", title: "Test", price: 99, marketerId: "m1", status: "approved" };
  const result = diagnoseProduct(product, { clicks: [], sales: [] });
  assert.ok(result.issues.some((i) => i.code === "no_affiliate_url"));
});

test("diagnoseProduct no issues for healthy product", () => {
  const result = diagnoseProduct(baseProduct, { clicks: [{ productId: "p1", ts: Date.now() }], sales: [] });
  const criticalIssues = result.issues.filter((i) => i.severity === "critical");
  assert.equal(criticalIssues.length, 0);
});

test("diagnoseProduct detects fatigue", () => {
  const product = { ...baseProduct, clicks: 0 };
  const campaigns = [{ productId: "p1", createdAt: new Date().toISOString() }];
  const result = diagnoseProduct(product, { clicks: [], sales: [], campaigns });
  assert.ok(result.issues.some((i) => i.code === "fatigued"));
});

test("selfHealProduct handles auto-fixable issues", () => {
  const diagnosis = diagnoseProduct(baseProduct, { clicks: [], sales: [] });
  const heal = selfHealProduct(baseProduct, diagnosis);
  assert.ok(heal.productId === "p1");
  assert.ok(Array.isArray(heal.autoFixed));
});

test("selfHealProduct keeps manual issues for owner", () => {
  const product = { id: "p1", title: "Limited!", price: 99, marketerId: null, status: "pending", affiliateUrl: null };
  const diagnosis = diagnoseProduct(product, { clicks: [], sales: [] });
  const heal = selfHealProduct(product, diagnosis);
  assert.ok(heal.needsOwnerAction.length > 0);
  assert.equal(heal.canProceed, false);
});

test("generateLunaContent produces content pack", () => {
  const result = generateLunaContent(baseProduct, { language: "he" });
  assert.equal(result.ok, true);
  assert.ok(result.lunaHook);
  assert.ok(result.lunaStory);
  assert.ok(result.contentPack);
});

test("generateLunaContent falls back gracefully on error", () => {
  const result = generateLunaContent(null, { language: "he" });
  assert.equal(result.ok, false);
});

test("generateLunaHooks produces variants", () => {
  const result = generateLunaHooks(baseProduct, { count: 3 });
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.hooks));
  assert.ok(result.hooks.length > 0);
});

test("planLunaCampaign builds campaign + distribution", () => {
  const result = planLunaCampaign(baseProduct, {
    clicks: [{ productId: "p1", ts: Date.now() }],
    sales: [],
    campaigns: [],
    channelStates: [],
    marketers,
    origin: "https://likelink2.vercel.app",
  });
  assert.equal(result.ok, true);
  assert.ok(result.campaign);
  assert.ok(result.distribution);
  assert.ok(result.lunaHook);
});

test("runGrowthCycle completes for valid product", async () => {
  const product = { ...baseProduct };
  const result = await runGrowthCycle({
    product,
    products: [product],
    sales: [],
    clicks: [{ productId: "p1", ts: Date.now() }],
    views: [],
    campaigns: [],
    channelStates: [],
    marketers,
    actor: owner,
    origin: "https://likelink2.vercel.app",
  });
  assert.ok(result);
  assert.ok(Array.isArray(result.actions));
  assert.ok(result.actions.length > 0);
  assert.equal(result.productId, "p1");
});

test("runGrowthCycle blocks on ownership mismatch", async () => {
  const result = await runGrowthCycle({
    product: baseProduct,
    products: [baseProduct],
    sales: [],
    clicks: [],
    campaigns: [],
    channelStates: [],
    marketers,
    actor: { id: "wrong", authenticated: true },
    origin: "https://likelink2.vercel.app",
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "trust_verification_failed");
});

test("runGrowthCycle records all action types", async () => {
  const result = await runGrowthCycle({
    product: baseProduct,
    products: [baseProduct],
    sales: [],
    clicks: [{ productId: "p1", ts: Date.now() }],
    campaigns: [],
    channelStates: [],
    marketers,
    actor: owner,
    origin: "https://likelink2.vercel.app",
  });
  const actionTypes = result.actions.map((a) => a.type);
  assert.ok(actionTypes.includes(LUNA_ACTION_TYPE.TREND_SCAN));
  assert.ok(actionTypes.includes(LUNA_ACTION_TYPE.DIAGNOSIS));
  assert.ok(actionTypes.includes(LUNA_ACTION_TYPE.SELF_HEAL));
  assert.ok(actionTypes.includes(LUNA_ACTION_TYPE.CONTENT_CREATE));
  assert.ok(actionTypes.includes(LUNA_ACTION_TYPE.VERIFICATION_RUN));
});

test("runDailyTrendScan produces opportunity summary", () => {
  const result = runDailyTrendScan({
    products: [baseProduct],
    sales: [],
    clicks: [{ productId: "p1", ts: Date.now() }],
    views: [],
  });
  assert.equal(result.ok, true);
  assert.ok(result.cycle === "daily_trend_scan");
  assert.ok(result.opportunities);
  assert.ok(result.summary);
});

test("runDailyTrendScan handles empty products", () => {
  const result = runDailyTrendScan({ products: [] });
  assert.equal(result.ok, true);
  assert.equal(result.opportunities.length, 0);
});

test("Luna never claims fake publication", async () => {
  const product = { ...baseProduct, marketerId: null };
  const result = await runGrowthCycle({
    product,
    products: [product],
    sales: [],
    clicks: [],
    campaigns: [],
    channelStates: [],
    marketers,
    actor: { id: "m1", authenticated: true },
  });
  // Should be blocked, never claim PUBLISHED
  assert.equal(result.blocked, true);
  assert.ok(!result.actions.some((a) => a.result?.status === "PUBLISHED"));
});

test("Luna growth cycle is deterministic (same inputs = same outputs)", async () => {
  const ctx = {
    product: { ...baseProduct, description: "affiliate link" },
    products: [{ ...baseProduct, description: "affiliate link" }],
    sales: [],
    clicks: [{ productId: "p1", ts: Date.now() }],
    campaigns: [],
    channelStates: [],
    marketers,
    actor: owner,
    origin: "https://likelink2.vercel.app",
  };
  const r1 = await runGrowthCycle(ctx);
  const r2 = await runGrowthCycle(ctx);
  // Same hooks generated
  assert.deepEqual(r1.hooks, r2.hooks);
  // Same content hooks
  assert.equal(r1.content.lunaHook || r1.content.hook, r2.content.lunaHook || r2.content.hook);
});
