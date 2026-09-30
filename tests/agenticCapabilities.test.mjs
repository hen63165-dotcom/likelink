// Native agentic capabilities — build_campaign, recruit_creator,
// agent_commerce_readiness. All run on LikeLink's own code (no AI provider),
// use real catalog/profile fields only, and say "insufficient data" instead
// of guessing. Structured data states only true facts and is worded as
// readiness, never as a protocol connection.
import test from "node:test";
import assert from "node:assert/strict";

// Production shape: creator profiles have NO category/tag fields.
const PROD_MARKETERS = [{ id: "m1", name: "ALYOSTYLE", slug: "alyostyle", email: "owner@likelink.test" }];
const product = (i, over = {}) => ({
  id: `p${i}`, title: `מוצר ${i} לבדיקה`, description: "תיאור אמיתי ומלא של המוצר שמתאים לבדיקות, ארוך מספיק כדי לעבור את בדיקות ה-SEO.",
  price: 50 + i, currency: "ILS", image: `https://images.unsplash.com/photo-${i}`, affiliateUrl: `https://s.click.aliexpress.com/e/${i}`,
  category: "Jewelry", status: "approved", marketerId: "m1", commission: 5, ...over,
});
function memStore(entries) {
  const store = new Map(entries);
  const writes = [];
  return { store, writes, kvGet: async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb), kvSet: async (k, v) => { writes.push(k); store.set(k, structuredClone(v)); } };
}

test("budget and timeline come from the goal only when stated", async () => {
  const { parseBudget, parseTimeline } = await import("../src/lib/discovery/campaigns.js");
  assert.deepEqual(parseBudget("לונה, קמפיין עם תקציב 500 ₪"), { amount: 500, currency: "ILS", source: "goal_text" });
  assert.equal(parseBudget("budget $1,200")?.amount, 1200);
  assert.equal(parseBudget("budget $1,200")?.currency, "USD");
  assert.equal(parseBudget("לונה, תכיני קמפיין"), null, "no budget stated → none invented");
  assert.equal(parseTimeline("קמפיין לשבוע", 0).days, 7);
  assert.equal(parseTimeline("10 ימים", 0).days, 10);
  assert.equal(parseTimeline("קמפיין", 0), null);
});

test("creator matching uses real profile topics only — otherwise INSUFFICIENT DATA", async () => {
  const { matchCreators } = await import("../src/lib/discovery/campaigns.js");
  const none = matchCreators({ topics: ["jewelry"], marketers: PROD_MARKETERS });
  assert.equal(none.status, "insufficient_data");
  assert.deepEqual(none.matches, []);
  assert.match(none.reason, /לונה לא מנחשת/);
  const tagged = [...PROD_MARKETERS, { id: "m2", name: "נועה", slug: "noa", tags: ["Jewelry", "fashion"] }, { id: "m3", name: "דנה", slug: "dana", categories: "Home, Kitchen" }];
  const r = matchCreators({ topics: ["jewelry"], marketers: tagged });
  assert.equal(r.status, "matched");
  assert.deepEqual(r.matches.map((m) => m.id), ["m2"]);
  assert.deepEqual(r.matches[0].overlap, ["jewelry"]);
  assert.equal(matchCreators({ topics: ["toys"], marketers: tagged }).status, "no_overlap");
});

test("build_campaign: real products only, plan limits, draft only, verified by read-back, idempotent", async () => {
  const { createCampaign } = await import("../src/lib/discovery/orchestrator.js");
  const { resolveEntitlement } = await import("../src/lib/discovery/entitlements.js");
  const products = Array.from({ length: 7 }, (_, i) => product(i + 1));
  const m = memStore([["marketplace:products", [...products, product(99, { marketerId: "other" })]], ["marketplace:marketers", PROD_MARKETERS]]);
  const scope = { marketerIds: ["m1"] };
  const free = resolveEntitlement({ subscription: null });
  const r = await createCampaign({ ...m, goal: "לונה, תכיני קמפיין לשבוע עם תקציב 500 ₪", productIds: [...products.map((p) => p.id), "p99", "ghost"], scope, entitlement: free });
  assert.equal(r.ok, true);
  assert.equal(r.status, "executed");
  assert.equal(r.proof.state, "VERIFIED");
  const c = r.campaign;
  assert.equal(c.status, "DRAFT");
  assert.equal(c.products.length, 5, "free plan: 5 products per campaign");
  assert.deepEqual(c.overPlanProductIds, ["p6", "p7"]);
  assert.deepEqual(c.unknownProductIds, ["ghost"]);
  assert.deepEqual(c.notOwnedProductIds, ["p99"], "another creator's product is never pulled in");
  assert.deepEqual([c.budget.amount, c.budget.currency, c.timeline.days], [500, "ILS", 7]);
  assert.equal(c.creators.status, "insufficient_data", "production profiles carry no topics → no invented match");
  assert.equal(c.paid.status, "REQUIRES_APPROVAL");
  assert.deepEqual(m.writes, ["discovery:campaigns:m1"], "a campaign writes only its own draft — no payment, no send, no publish key");
  const again = await createCampaign({ ...m, goal: "לונה, תכיני קמפיין לשבוע עם תקציב 500 ₪", productIds: products.map((p) => p.id), scope, entitlement: free });
  assert.equal(again.status, "up_to_date");
  assert.equal(m.writes.length, 1, "the same draft is not rewritten");
  const noBudget = await createCampaign({ ...m, goal: "לונה, קמפיין", productIds: ["p1"], scope });
  assert.equal(noBudget.campaign.budget.source, "not_stated");
  assert.equal(noBudget.campaign.timeline.source, "not_stated");
});

test("a campaign goal runs build_campaign as one verified step and passes the law audit", async () => {
  const { runIntent } = await import("../src/lib/discovery/orchestrator.js");
  const m = memStore([["marketplace:products", [product(1), product(2)]], ["marketplace:marketers", PROD_MARKETERS], ["publish:log", []]]);
  const r = await runIntent({ ...m, goal: "לונה, תכיני קמפיין לשבועיים", scope: { marketerIds: ["m1"] } });
  const step = r.steps.find((s) => s.capability === "build_campaign");
  assert.equal(step.status, "executed");
  assert.equal(step.proof.state, "VERIFIED");
  assert.equal(step.permission, "session");
  assert.equal(r.campaign.timeline.days, 14);
  assert.equal(r.laws.ok, true, JSON.stringify(r.laws.rows.filter((x) => !x.ok)));
});

test("agent commerce JSON-LD: true seller, no merchant-stock claim, no creator-as-brand, disclosure stated", async () => {
  const S = await import("../src/lib/discovery/surfaces.js");
  const c = S.canonicalProduct(product(1), PROD_MARKETERS[0]);
  const j = S.buildProductSeo(c).jsonLd;
  assert.equal(j.offers.seller.name, "aliexpress.com", "the affiliate redirect host is normalised to the merchant");
  assert.equal(j.offers.availability, undefined, "merchant stock is never claimed");
  assert.equal(j.brand, undefined, "the recommending creator is not the brand");
  const props = Object.fromEntries(j.additionalProperty.map((x) => [x.name, x.value]));
  assert.equal(props.sale_model, "affiliate");
  assert.match(props.affiliate_disclosure, /גילוי נאות/);
  assert.equal(props.recommended_by, "ALYOSTYLE");
  const ready = S.agentCommerceReadiness(c);
  assert.equal(ready.ready, true);
  assert.equal(ready.availability, "not_stated_merchant_stock_unverified");
  // A direct-checkout product must state availability — and only from a real stock field.
  const directFields = { affiliateUrl: "", merchantEligible: true, checkoutUrl: "https://likelink2.vercel.app/checkout/p2" };
  const direct = S.canonicalProduct({ ...product(2), ...directFields, stock: 3 }, PROD_MARKETERS[0]);
  assert.equal(direct.saleModel, "direct");
  const dj = S.buildProductSeo(direct).jsonLd;
  assert.equal(dj.offers.availability, "https://schema.org/InStock");
  assert.equal(dj.offers.seller.name, "LikeLink");
  assert.equal(S.canonicalProduct({ ...product(2), ...directFields, stock: 0 }, PROD_MARKETERS[0]).stock, 0);
  assert.equal(S.buildProductSeo(S.canonicalProduct({ ...product(2), ...directFields, stock: 0 }, PROD_MARKETERS[0])).jsonLd.offers.availability, "https://schema.org/OutOfStock");
  const noStock = S.canonicalProduct({ ...product(3), ...directFields }, PROD_MARKETERS[0]);
  assert.equal(S.agentCommerceReadiness(noStock).ready, false, "no stock source → not ready, never a guessed InStock");
});

test("system check: agent_commerce is worded as readiness, never as a connection", async () => {
  const { evaluateSystem } = await import("../src/lib/discovery/systemCheck.js");
  const at = (agentCommerce) => evaluateSystem({ agentCommerce }).areas.find((a) => a.id === "agent_commerce");
  const all = at({ total: 28, ready: 28, topMissing: null, availabilityUnstated: 28 });
  assert.equal(all.color, "GREEN");
  assert.match(all.evidence.join(" "), /הכנה בלבד — LikeLink לא מחוברת/);
  assert.doesNotMatch(all.evidence.join(" "), /(^|\s)מחובר(ת)?(\s|$)(?!לאף)/, "never claims a connection");
  const partial = at({ total: 28, ready: 20, topMissing: { he: "תיאור", count: 8 }, availabilityUnstated: 28 });
  assert.equal(partial.color, "YELLOW");
  assert.match(partial.ownerAction, /תיאור/);
});

test("the three capabilities are registered, marked new, and discoverable with the right permissions", async () => {
  const { listCapabilities, CAPABILITIES, PERMISSION, EXECUTOR } = await import("../src/lib/discovery/capabilities.js");
  const byId = Object.fromEntries(listCapabilities().map((c) => [c.id, c]));
  for (const id of ["build_campaign", "recruit_creator", "agent_commerce_readiness"]) {
    assert.ok(byId[id], id);
    assert.equal(byId[id].isNew, true);
    assert.equal(byId[id].native, true, `${id} runs on LikeLink's own code`);
    assert.equal(byId[id].adapter, null, `${id} needs no external provider`);
  }
  assert.equal(CAPABILITIES.recruit_creator.permission, PERMISSION.OWNER_EXPLICIT);
  assert.equal(CAPABILITIES.recruit_creator.executor, EXECUTOR.OWNER);
  assert.equal(byId.recruit_creator.autonomous, false);
  assert.equal(byId.build_campaign.permission, PERMISSION.SESSION);
  assert.equal(byId.build_campaign.scope, "run");
  assert.equal(byId.build_campaign.planLimit, "maxProductsPerRun");
});
