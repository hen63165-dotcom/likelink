// The radar's tiers and trial (Master Execution Order, items 5–7): Basic and Pro carry no price
// and are not for sale until the owner approves the price, the provider and the terms; they never
// reach the checkout allow-list or PayPal provisioning; every feature they list is live code; the
// waitlist accepts them; the trial never locks a page while nothing can be bought; the landing page
// is bilingual, wired like every public section, and makes no promise.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RADAR_FEATURES, RADAR_PLANS, RADAR_PRICES, accessOf, billingOf, cleanRadarAccess, radarCheckoutPlan, radarWaitlistPlan } from "../src/lib/growth/radarPlans.js";
import { RADAR_PLAN_KEYS, planName, plannedRadarBillingPlans, plannedBillingPlans, PLAN_KEYS } from "../api/_utils/paypal.js";
import { getPurchasablePlans, getProvisionedPlans, getAllPlans } from "../src/lib/plans.js";
import { sectionSeo } from "../src/lib/publicSeo.js";
import { parsePath } from "../src/utils/routing.js";

const NOW = Date.parse("2026-11-14T12:00:00Z");

test("Basic and Pro: no price, not purchasable, never provisioned, features are live code", () => {
  for (const p of Object.values(RADAR_PLANS)) {
    assert.equal(p.price, null, `${p.id} has no price before the owner approves one`);
    assert.equal(p.priceStatus, "PENDING_OWNER_APPROVAL");
    assert.equal(p.purchasable, false);
    assert.equal(p.provision, false);
    assert.equal(p.comingSoon, true);
    for (const f of p.features) assert.ok(RADAR_FEATURES[f] && existsSync(RADAR_FEATURES[f].code), `${f} names code that exists`);
  }
  const sellable = [...getPurchasablePlans(), ...getProvisionedPlans()].map((p) => p.id);
  assert.ok(!sellable.some((id) => id.startsWith("radar")), "the checkout allow-list and PayPal provisioning never see a radar tier");
  assert.ok(!getAllPlans().some((p) => p.id.startsWith("radar")), "the site's plans (pricing page, PayPal plan bodies) are untouched");
  assert.ok(RADAR_PLANS.radar_pro.features.length > RADAR_PLANS.radar_basic.features.length);
});

test("waitlist: accepts the radar tiers, refuses anything else", () => {
  assert.equal(radarWaitlistPlan("radar_pro")?.id, "radar_pro");
  assert.equal(radarWaitlistPlan("RADAR_BASIC")?.id, "radar_basic");
  assert.equal(radarWaitlistPlan("starter"), null);
  assert.equal(radarWaitlistPlan(""), null);
  const handler = readFileSync("api/_utils/legalHandler.mjs", "utf8");
  assert.match(handler, /radarWaitlistPlan\(planId\)/);
  assert.match(handler, /user_session_required/, "a signed-in account only");
});

test("the trial: off = open; on = days left; ended = still open while nothing can be bought", () => {
  assert.deepEqual(accessOf({}, { now: NOW }), { state: "OPEN", locked: false, trialDays: 14 });
  const on = accessOf({ radarAccess: { trial: true, trialDays: 14, startedAt: "2026-11-10T00:00:00.000Z" } }, { now: NOW });
  assert.equal(on.state, "TRIAL");
  assert.equal(on.daysLeft, 10);
  const ended = accessOf({ radarAccess: { trial: true, trialDays: 7, startedAt: "2026-11-01T00:00:00.000Z" } }, { now: NOW });
  assert.equal(ended.state, "TRIAL_ENDED");
  assert.equal(ended.locked, false, "no lock without a plan anyone can buy");
  const billingOn = { enabled: true };
  assert.equal(accessOf({ radarAccess: { trial: true, trialDays: 7, startedAt: "2026-11-01" } }, { now: NOW, billing: billingOn }).locked, true, "locks only when billing is on");
  assert.equal(cleanRadarAccess({ trialDays: 999 }).trialDays, 60);
  assert.equal(cleanRadarAccess({ trialDays: 3 }).trialDays, 7, "the owner's range is 7–60 days");
  assert.equal(cleanRadarAccess({ trialDays: "x", startedAt: "nope" }).startedAt, null);
  assert.equal(accessOf({ radarAccess: { trial: true } }, { now: NOW }).state, "OPEN", "a trial without a start date is not running");
});

test("/radar-pro: routed, rewritten, its own head, bilingual, no price or promise on the page", () => {
  assert.deepEqual(parsePath("/radar-pro"), { type: "radarPro" });
  assert.match(readFileSync("src/App.jsx", "utf8"), /PUBLIC_TYPES = new Set\(\[[^\]]*"radarPro"/, "the public site renders it (without this it showed the home page)");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.ok((vercel.rewrites || []).some((r) => r.source === "/radar-pro" && r.destination === "/"));
  const seo = sectionSeo("radarPro");
  assert.equal(seo.canonical, "https://likelink2.vercel.app/radar-pro");
  assert.match(readFileSync("scripts/prerender-products.mjs", "utf8"), /"\/radar-pro"/);
  const page = readFileSync("src/components/discover/radarPro.jsx", "utf8");
  for (const he of ["מחיר: עוד לא נקבע", "לא מבטיח להיט", "רשימת ההמתנה"]) assert.ok(page.includes(he));
  for (const en of ["Price: not set yet", "never promises a hit", "Join the waitlist"]) assert.ok(page.includes(en));
  assert.doesNotMatch(page, /\$\d|היחיד בעולם|only one in the world|guarantee/i);
  // The only shekel sign on the page sits inside the billing.enabled branch (prices from billingOf).
  const shekel = page.indexOf("₪");
  assert.ok(shekel > 0 && page.lastIndexOf("billing.enabled ?", shekel) > 0 && page.indexOf("₪", shekel + 1) === -1);
  assert.doesNotMatch(seo.description, /₪\d|מבטיח|היחיד/);
});

test("billing: off until the owner approves today's exact prices and switches it on", () => {
  const approved = { radarBilling: { enabled: true, approvedPrices: RADAR_PRICES, approvedAt: "2026-11-15T10:00:00.000Z" } };
  assert.equal(billingOf({}).enabled, false);
  assert.equal(billingOf({}).reason, "prices_not_approved");
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, enabled: false } }).reason, "billing_switched_off");
  assert.equal(billingOf(approved).enabled, true);
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, approvedPrices: { ...RADAR_PRICES, radar_pro: { monthly: 79, yearly: 890 } } } }).enabled, false, "a price she did not approve never bills");
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, approvedAt: null } }).enabled, false);
  assert.equal(radarCheckoutPlan("radar_pro", "yearly", {}), null, "no checkout while off");
  assert.deepEqual(radarCheckoutPlan("radar_pro", "yearly", approved), { plan: RADAR_PLANS.radar_pro, period: "yearly", price: 890, currency: "ILS" });
  assert.equal(radarCheckoutPlan("starter", "monthly", approved), null, "only radar tiers");
  assert.equal(radarCheckoutPlan("radar_basic", "weekly", approved), null);
  for (const id of Object.keys(RADAR_PRICES)) assert.equal(RADAR_PRICES[id].yearly, RADAR_PRICES[id].monthly * 10, "annual = 10 months for 12");
});

test("PayPal: the radar's 4 plans are their own (ILS, yearly one term), the site's plans unchanged", () => {
  assert.deepEqual(RADAR_PLAN_KEYS, ["radar_basic:monthly", "radar_basic:yearly", "radar_pro:monthly", "radar_pro:yearly"]);
  const bodies = plannedRadarBillingPlans("PROD-T");
  for (const { key, body } of bodies) {
    const [id, per] = key.split(":");
    const cycle = body.billing_cycles[0];
    assert.equal(body.billing_cycles.length, 1, "no PayPal trial cycle: the trial is on the site, with no card");
    assert.equal(cycle.pricing_scheme.fixed_price.currency_code, "ILS");
    assert.equal(Number(cycle.pricing_scheme.fixed_price.value), RADAR_PRICES[id][per]);
    assert.equal(cycle.total_cycles, per === "yearly" ? 1 : 0, "yearly is one 12-month term, no automatic renewal");
    assert.equal(body.name, planName(id, per));
  }
  assert.equal(planName("radar_basic", "monthly"), "LikeLink Radar Basic Monthly (ILS)");
  assert.equal(planName("starter", "monthly"), "LikeLink Starter Monthly (ILS)", "existing plan names unchanged");
  assert.ok(!PLAN_KEYS.some((k) => k.startsWith("radar")) && !plannedBillingPlans().some((p) => p.key.startsWith("radar")));
});

test("server: radar checkout refused while billing is off, never trusts a client price", () => {
  const store = readFileSync("api/store.mjs", "utf8");
  const block = store.slice(store.indexOf('if (sub === "radar-checkout")'), store.indexOf('if (sub === "radar-get")'));
  assert.match(block, /if \(!billing\.enabled\) return json\(res, \{ ok: false, error: "radar_billing_disabled"/);
  assert.match(block, /legal_acceptance_required/);
  assert.match(block, /active_subscription_exists/);
  assert.doesNotMatch(block, /body\.price|body\.amount/);
  const get = store.slice(store.indexOf('if (sub === "radar-get")'), store.indexOf("// ── Prepaid plan"));
  assert.match(get, /details\?\.status === "ACTIVE" && details\.customId === authId && expected && details\.planId === expected/, "activated only on PayPal's own ACTIVE for this user and plan");
  const prov = store.slice(store.indexOf('if (sub === "provision-plans")'), store.indexOf('if (sub === "refunds")'));
  assert.match(prov, /if \(radarBilling\.enabled\)/, "radar plans are created only while billing is on");
});
