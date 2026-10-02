// PLANS CONSISTENCY — the pricing page, the code and the PayPal plans must say
// exactly the same thing.
//
// One source of truth (src/lib/plans.js) feeds: the generated pricing page
// (public/pricing.html), the entitlement resolver + server quotas
// (src/lib/discovery/entitlements.js), the PayPal Billing Plan payloads
// (api/_utils/paypal.js buildPlanBody) and the checkout allow-list
// (api/store.mjs PLAN_ENV_*). If any of them drifts, this file fails.
//
// Also: every feature a paid plan promises as "live" must point at code that
// exists (no advertising a feature that does not work today).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("public/pricing.html is exactly what plans.js renders (run `npm run pages:build`)", async () => {
  const { renderPricingPage } = await import("../src/lib/staticPages/pricingPage.js");
  const disk = src("public/pricing.html").replace(/\r\n/g, "\n");
  assert.equal(disk, renderPricingPage().replace(/\r\n/g, "\n"), "the committed pricing page is stale — run npm run pages:build");
});

test("the page shows every price, and only purchasable plans can be bought", async () => {
  const { getAllPlans } = await import("../src/lib/plans.js");
  const html = src("public/pricing.html");
  const model = JSON.parse(html.match(/<script type="application\/json" id="likelink-data">([\s\S]*?)<\/script>/)[1]);
  for (const p of getAllPlans()) {
    const m = model.plans.find((x) => x.id === p.id);
    assert.ok(m, `${p.id} is on the page`);
    assert.deepEqual([m.price, m.priceYearly, m.purchasable, m.comingSoon], [p.price, p.priceYearly, Boolean(p.purchasable && !p.comingSoon), Boolean(p.comingSoon)], p.id);
    assert.ok(html.includes(`₪${p.price}`), `₪${p.price} shown`);
    if (p.priceYearly) assert.ok(html.includes(`₪${p.priceYearly}`), `₪${p.priceYearly} shown`);
  }
  const elite = model.plans.find((x) => x.id === "elite");
  assert.equal(elite.purchasable, false);
  assert.deepEqual(elite.rows, [], "a waitlist plan promises no features");
  assert.match(html, /רשימת ההמתנה/);
  assert.doesNotMatch(html, /href="\/sell\?plan=elite"[^>]*>בחירת/, "Elite has no buy button");
});

test("PayPal plan payloads = the page prices, in ILS; only Starter + Professional exist at PayPal", async () => {
  const { plannedBillingPlans, PLAN_KEYS } = await import("../api/_utils/paypal.js");
  const { getAllPlans } = await import("../src/lib/plans.js");
  const planned = plannedBillingPlans("PROD-TEST");
  const purchasable = getAllPlans().filter((p) => p.purchasable && !p.comingSoon && p.price > 0);
  assert.deepEqual(planned.map((x) => x.key).sort(), purchasable.flatMap((p) => [`${p.id}:monthly`, `${p.id}:yearly`]).sort());
  assert.deepEqual([...PLAN_KEYS].sort(), planned.map((x) => x.key).sort());
  for (const { key, body } of planned) {
    const [planId, period] = key.split(":");
    const plan = getAllPlans().find((p) => p.id === planId);
    const cycle = body.billing_cycles[0];
    assert.equal(cycle.pricing_scheme.fixed_price.currency_code, "ILS", key);
    assert.equal(Number(cycle.pricing_scheme.fixed_price.value), period === "yearly" ? plan.priceYearly : plan.price, key);
    assert.equal(cycle.frequency.interval_unit, period === "yearly" ? "YEAR" : "MONTH", key);
    assert.equal(cycle.total_cycles, period === "yearly" ? 1 : 0, `${key}: yearly never auto-renews (13א)`);
    assert.equal(body.product_id, "PROD-TEST");
  }
  assert.ok(!planned.some((x) => x.key.startsWith("elite") || x.key.startsWith("enterprise") || x.key.startsWith("free")));
});

test("checkout accepts exactly the purchasable plans", async () => {
  const { getPurchasablePlans } = await import("../src/lib/plans.js");
  const store = src("api/store.mjs");
  const monthly = store.match(/const PLAN_ENV_MONTHLY = \{([^}]*)\}/)[1];
  const keys = [...monthly.matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys, getPurchasablePlans().map((p) => p.id).sort());
});

test("entitlement quotas = plans.js quotas = what the page says, for every plan", async () => {
  const { resolveEntitlement, QUOTA_KEYS } = await import("../src/lib/discovery/entitlements.js");
  const { getAllPlans, FEATURES } = await import("../src/lib/plans.js");
  const html = src("public/pricing.html");
  const model = JSON.parse(html.match(/<script type="application\/json" id="likelink-data">([\s\S]*?)<\/script>/)[1]);
  for (const p of getAllPlans().filter((x) => !x.comingSoon)) {
    const ent = p.id === "free"
      ? resolveEntitlement({})
      : resolveEntitlement({ subscription: { planId: p.id, status: "active", startedAt: "2026-09-01T00:00:00Z" } });
    assert.equal(ent.plan, p.id);
    for (const k of QUOTA_KEYS) assert.equal(ent.capabilities.quotas[k], p.quotas[k] ?? 0, `${p.id}.${k}`);
    assert.deepEqual(model.plans.find((x) => x.id === p.id).quotas, p.quotas, `${p.id}: page quotas`);
    for (const f of FEATURES.filter((x) => x.quotaKey && x.status === "live")) {
      const v = f.plans[p.id];
      if (v && typeof v === "object") assert.equal(ent.capabilities.quotas[f.quotaKey], v.monthly ?? v.total, `${p.id}: ${f.id}`);
      else assert.equal(ent.capabilities.quotas[f.quotaKey], 0, `${p.id}: ${f.id} not included → 0`);
    }
  }
});

test("a 'soon' feature is never included in any plan and is labelled בקרוב on the page", async () => {
  const { FEATURES, planFeatureRows, getAllPlans } = await import("../src/lib/plans.js");
  const html = src("public/pricing.html");
  for (const f of FEATURES.filter((x) => x.status === "soon")) {
    for (const p of getAllPlans()) {
      assert.ok(!Object.values(f.plans).some(Boolean), `${f.id} is not in any plan`);
      assert.equal(planFeatureRows(p.id).find((r) => r.id === f.id).included, false);
    }
    assert.ok(html.includes(f.he.replace(/"/g, "&quot;")), `${f.id} listed under "מה עוד לא זמין"`);
  }
  assert.doesNotMatch(html, /הכנסה מובטחת|מובטח לך|תרוויחי|guaranteed/i, "no income promises");
});

// Every "live" feature must be backed by code that exists today.
const LIVE_EVIDENCE = {
  studio: [["src/components/studio/StudioShell.jsx", "StudioShell"]],
  products: [["api/store.mjs", "PRODUCT_LIMIT_ERROR"], ["src/lib/discovery/quotas.js", "productLimitAllows"]],
  goal_scope: [["src/lib/discovery/entitlements.js", "maxProductsPerRun"]],
  share_packs: [["src/lib/discovery/surfaces.js", "export function buildShareAsset"]],
  campaigns: [["src/lib/discovery/orchestrator.js", "export async function createCampaign"], ["api/_utils/discoveryHandler.mjs", "\"campaigns\""]],
  recruit: [["src/lib/discovery/campaigns.js", "recruitCreators"], ["api/_utils/discoveryHandler.mjs", "\"recruitDrafts\""]],
  priority_support: [["src/lib/plans.js", "prioritySupport: true"]],
  click_stats: [["src/lib/discovery/distribution.js", "export function clickStats"], ["api/_utils/distributionRoutes.mjs", "\"click-stats\""], ["api/og.mjs", "source,"]],
  distribution_plans: [["src/lib/discovery/distribution.js", "export function generateDistributionPlan"], ["api/_utils/distributionRoutes.mjs", "\"distributionPlans\""]],
  content_export: [["src/lib/discovery/distribution.js", "export function exportContentPack"], ["api/_utils/distributionRoutes.mjs", "\"content_export\""]],
};
LIVE_EVIDENCE.marketing_engine = [["src/lib/cloud/marketingEngineRunner.js", "export async function runCycle"], ["api/_utils/marketingEngineHandler.mjs", "ENGINE_QUOTA_KEY"]];
LIVE_EVIDENCE.creative_premium = [["src/lib/cloud/reelPublisher.js", "export async function createCreative"], ["src/lib/media/creativeEngine.js", "PREMIUM_QUOTA_KEY = \"premiumCreatives\""], ["api/_utils/mediaPipelineHandler.mjs", "creative-create"]];
const PENDING_IN_THIS_PR = [];
LIVE_EVIDENCE.gpt_api = [["api/_utils/gptHandler.mjs", "create_content_draft"], ["src/lib/gpt/openapi.js", "operationId: \"create_content_draft\""], ["api/_utils/gptHandler.mjs", "\"gptDrafts\""]];

test("every live feature points at code that exists", async () => {
  const { FEATURES } = await import("../src/lib/plans.js");
  for (const f of FEATURES.filter((x) => x.status === "live")) {
    const ev = LIVE_EVIDENCE[f.id];
    if (!ev && PENDING_IN_THIS_PR.includes(f.id)) continue; // built later in this PR; the list must be empty before merge
    assert.ok(ev, `${f.id}: no evidence that it works today`);
    for (const [file, needle] of ev) {
      assert.ok(existsSync(path.join(ROOT, file)), `${f.id}: ${file} exists`);
      assert.ok(src(file).includes(needle), `${f.id}: ${file} contains ${needle}`);
    }
  }
});
