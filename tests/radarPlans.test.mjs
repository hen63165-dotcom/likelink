// The radar's tiers and trial (Master Execution Order, items 5–7): one tier (Basic) is priced at
// launch and sold only after the owner approves that exact price and switches billing on; Pro has no
// price and is waitlist only; neither reaches the site's checkout allow-list or provisioning; every
// feature they list is live code; the waitlist accepts them; the trial never locks a page while
// nothing can be bought; the landing page is bilingual, wired like every public section, and makes
// no promise. A subscriber can cancel from the page (PayPal first, the site's cancellation terms).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RADAR_FEATURES, RADAR_ON_SALE, RADAR_PLANS, RADAR_PRICES, accessOf, billingOf, cleanRadarAccess, radarCheckoutPlan, radarWaitlistPlan } from "../src/lib/growth/radarPlans.js";
import { RADAR_PLAN_KEYS, planName, plannedRadarBillingPlans, plannedBillingPlans, PLAN_KEYS, paypalEnvName, sameEnv, resolveRadarPlanId } from "../api/_utils/paypal.js";
import { ownRadarSubs, currentRadarSub, cancellableRadarSub, radarSubAccess, publicRadarSub } from "../src/lib/growth/radarSubs.js";
import { cancellationTerms } from "../src/lib/billing/cancellation.js";
import { getPurchasablePlans, getProvisionedPlans, getAllPlans } from "../src/lib/plans.js";
import { sectionSeo } from "../src/lib/publicSeo.js";
import { parsePath } from "../src/utils/routing.js";

const NOW = Date.parse("2026-11-14T12:00:00Z");

test("Basic and Pro: no price on the plan itself, not purchasable, never provisioned, features are live code", () => {
  assert.deepEqual(RADAR_ON_SALE, ["radar_basic"], "one tier at launch");
  assert.equal(RADAR_PRICES.radar_pro, undefined, "Pro has no price: waitlist only");
  assert.equal(RADAR_PLANS.radar_pro.priceStatus, "NOT_ON_SALE");
  for (const p of Object.values(RADAR_PLANS)) {
    assert.equal(p.price, null, `${p.id} carries no price of its own (only RADAR_PRICES, after approval)`);
    assert.ok(["PENDING_OWNER_APPROVAL", "NOT_ON_SALE"].includes(p.priceStatus));
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
  // The owner, 2026-11-16: no "doesn't promise" line; the proof is the sealed, public record. Still never a promise.
  for (const he of ["מחיר: עוד לא נקבע", "נחתמת מראש ונבדקת בפומבי", "רשימת ההמתנה"]) assert.ok(page.includes(he));
  for (const en of ["Price: not set yet", "sealed in advance and graded in public", "Join the waitlist"]) assert.ok(page.includes(en));
  assert.doesNotMatch(page, /(?<!לא )מבטיח(ה)? להיט|יהיה להיט|guaranteed hit/);
  // The word "guarantee" never appears in the copy. The money-back box (RADAR_GUARANTEE, approved by
  // the owner 15.11, live 20.11) reads its words from radarPlans.js, whose own test keeps them clean.
  assert.doesNotMatch(page, /\$\d|היחיד בעולם|only one in the world|\bguarantee(d)?\b/i);
  // Shekel signs appear only in the subscriber's own record (MySubscription: a subscription exists only
  // after billing was on) and in the billing.enabled branch (prices from billingOf).
  const mine = page.slice(page.indexOf("function MySubscription()"), page.indexOf("export function RadarProPage()"));
  const rest = page.replace(mine, "");
  const shekel = rest.indexOf("₪");
  assert.ok(shekel > 0 && rest.lastIndexOf("billing.enabled && RADAR_PRICES[p.id] ?", shekel) > 0 && rest.indexOf("₪", shekel + 1) === -1);
  assert.doesNotMatch(seo.description, /₪\d|מבטיח|היחיד/);
});

test("billing: off until the owner approves today's exact prices and switches it on", () => {
  const approved = { radarBilling: { enabled: true, approvedPrices: RADAR_PRICES, approvedAt: "2026-11-15T10:00:00.000Z" } };
  assert.equal(billingOf({}).enabled, false);
  assert.equal(billingOf({}).reason, "prices_not_approved");
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, enabled: false } }).reason, "billing_switched_off");
  assert.equal(billingOf(approved).enabled, true);
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, approvedPrices: { radar_basic: { monthly: 39, yearly: 390 } } } }).enabled, false, "an earlier proposal she approved is not today's price: no billing");
  assert.equal(billingOf({ radarBilling: { ...approved.radarBilling, approvedAt: null } }).enabled, false);
  assert.equal(radarCheckoutPlan("radar_basic", "yearly", {}), null, "no checkout while off");
  assert.deepEqual(radarCheckoutPlan("radar_basic", "yearly", approved), { plan: RADAR_PLANS.radar_basic, period: "yearly", price: 290, currency: "ILS" });
  assert.deepEqual(radarCheckoutPlan("radar_basic", "monthly", approved), { plan: RADAR_PLANS.radar_basic, period: "monthly", price: 29, currency: "ILS" });
  assert.equal(radarCheckoutPlan("radar_pro", "monthly", approved), null, "Pro is not sold, even with billing on");
  assert.equal(radarCheckoutPlan("starter", "monthly", approved), null, "only radar tiers");
  assert.equal(radarCheckoutPlan("radar_basic", "weekly", approved), null);
  for (const id of Object.keys(RADAR_PRICES)) assert.equal(RADAR_PRICES[id].yearly, RADAR_PRICES[id].monthly * 10, "annual = 10 months for 12");
});

test("PayPal: the radar's plans are their own (ILS, yearly one term), only for the tier on sale; the site's plans unchanged", () => {
  assert.deepEqual(RADAR_PLAN_KEYS, ["radar_basic:monthly", "radar_basic:yearly"]);
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

test("PayPal ids belong to one environment: a Sandbox plan never reaches a Live checkout", async () => {
  const before = process.env.PAYPAL_ENV;
  try {
    process.env.PAYPAL_ENV = "sandbox";
    assert.equal(paypalEnvName(), "sandbox");
    assert.equal(sameEnv({ env: "sandbox" }), true);
    assert.equal(sameEnv({}), false, "a map saved before the field is live");
    const map = (env) => ({ currency: "ILS", ...(env ? { env } : {}), "radar_basic:monthly": "P-TEST-1" });
    const kv = (m) => ({ kvGet: async () => m });
    assert.equal(await resolveRadarPlanId("radar_basic", "monthly", kv(map("sandbox"))), "P-TEST-1");
    assert.equal(await resolveRadarPlanId("radar_basic", "monthly", kv(map("live"))), null, "a Live plan is not used in Sandbox");
    process.env.PAYPAL_ENV = "live";
    assert.equal(await resolveRadarPlanId("radar_basic", "monthly", kv(map("sandbox"))), null, "a Sandbox plan is not used in Live");
    assert.equal(await resolveRadarPlanId("radar_basic", "monthly", kv(map(null))), "P-TEST-1", "older maps (no env) were live");
    assert.equal(await resolveRadarPlanId("radar_pro", "monthly", kv({ ...map("live"), "radar_pro:monthly": "P-X" })), null, "a tier not on sale has no plan");
  } finally {
    if (before === undefined) delete process.env.PAYPAL_ENV; else process.env.PAYPAL_ENV = before;
  }
  const pp = readFileSync("api/_utils/paypal.js", "utf8");
  assert.match(pp, /currency: PLAN_CURRENCY, env: paypalEnvName\(\), productId/, "every stored plan map records its environment");
  assert.match(pp, /`\$\{PRODUCT_KV_KEY\}:sandbox`/, "the Sandbox catalog product is stored apart");
});

test("radar subscriptions: one environment, access only when PayPal said ACTIVE or paid time is left", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  const all = [
    { id: "a", userId: "u1", env: "sandbox", status: "active" },
    { id: "b", userId: "u1", status: "pending" },
    { id: "c", userId: "u2", env: "live", status: "active" },
    { id: "d", userId: "u1", env: "live", status: "cancelled", expiresAt: "2026-11-30T00:00:00Z" },
  ];
  assert.deepEqual(ownRadarSubs(all, "u1", "live").map((s) => s.id), ["b", "d"], "a Sandbox test never counts in Live");
  assert.equal(currentRadarSub(ownRadarSubs(all, "u1", "live"), now).id, "d", "cancelled with paid time left beats pending");
  assert.equal(radarSubAccess(all[3], now), true);
  assert.equal(radarSubAccess(all[3], Date.parse("2026-12-01T00:00:00Z")), false);
  assert.equal(radarSubAccess({ status: "pending" }, now), false, "pending (not approved at PayPal) never opens the radar");
  assert.equal(cancellableRadarSub(ownRadarSubs(all, "u1", "live")).id, "b");
  const pub = publicRadarSub({ ...all[0], paypalSubscriptionId: "I-SECRET", authEmail: "x@y.z", planId: "radar_basic", price: 29 });
  assert.ok(!("paypalSubscriptionId" in pub) && !("authEmail" in pub), "no PayPal id or e-mail reaches the browser");
});

test("cancelling the radar: the site's lawful terms on the radar's own price", () => {
  const started = "2026-11-15T10:00:00Z";
  const within = cancellationTerms({ sub: { planId: "radar_basic", billingPeriod: "monthly", status: "active", startedAt: started }, now: Date.parse("2026-11-20T10:00:00Z"), price: 29 });
  assert.equal(within.withinCoolingOff, true);
  assert.deepEqual(within.refund, { amount: 27.55, fee: 1.45, reason: "cooling_off_14d", currency: "ILS" }, "14 days: refund minus 5% (capped at ₪100)");
  const later = cancellationTerms({ sub: { planId: "radar_basic", billingPeriod: "monthly", status: "active", startedAt: started }, now: Date.parse("2026-12-05T10:00:00Z"), paidThrough: "2026-12-15T10:00:00Z", price: 29 });
  assert.equal(later.refund, null);
  assert.equal(later.accessUntil, "2026-12-15T10:00:00.000Z", "monthly after 14 days: access to the end of the paid month");
  assert.equal(cancellationTerms({ sub: { planId: "radar_basic", billingPeriod: "monthly", status: "pending" }, now: Date.parse(started), price: 29 }).refund, null, "never billed: nothing to refund");
  const store = readFileSync("api/store.mjs", "utf8");
  const cancel = store.slice(store.indexOf('if (sub === "radar-cancel")'), store.indexOf("// ── Prepaid plan"));
  assert.ok(cancel.indexOf("cancelPayPalSubscription(") > 0 && cancel.indexOf("cancelPayPalSubscription(") < cancel.indexOf("kvSet(RADAR_SUBS_KEY"), "PayPal is cancelled before the record changes");
  assert.match(cancel, /paypal_cancel_failed[\s\S]*502/, "if PayPal fails, nothing changes");
  assert.match(cancel, /price: mine\.price/, "the terms use the price the customer was charged");
  assert.match(cancel, /product: "radar"/, "a refund request names the radar for the owner");
  const get = store.slice(store.indexOf('if (sub === "radar-get")'), store.indexOf('if (sub === "radar-cancel")'));
  assert.match(get, /needsReconcile\(mine, nowMs\)/, "an active subscription is re-checked at PayPal (every 12 h)");
  assert.match(get, /ownRadarSubs\(all, authId, env\)/);
  const page = readFileSync("src/components/discover/radarPro.jsx", "utf8");
  assert.match(page, /cancelRadarSubscription\(token\)/, "the radar page has the cancel button");
  assert.match(page, /ביטול המנוי/);
});

test("the guarantee: a missed sniper call in a paid month earns that month back, never shown before it can be kept", async () => {
  const { RADAR_GUARANTEE, guaranteeCredits } = await import("../src/lib/growth/radarPlans.js");
  assert.equal(RADAR_GUARANTEE.live, true, "the claims job (guaranteeClaims on the daily board put) writes the refund requests");
  assert.doesNotMatch(RADAR_GUARANTEE.he + RADAR_GUARANTEE.termsHe, /מבטיח להיט|תמיד פוגע|100%/);
  const subs = [{ id: "s1", status: "active", activatedAt: "2026-12-01T00:00:00Z", price: 29, billingPeriod: "monthly" }, { id: "s2", status: "pending", activatedAt: "2026-12-01T00:00:00Z", price: 29 }];
  const calls = [
    { concept: "a", kind: "early", at: "2026-12-05", result: "MISS", gradedAt: "2026-12-19" },
    { concept: "b", kind: "early", at: "2026-12-10", result: "MISS" },
    { concept: "c", kind: "early", at: "2027-01-03", result: "HIT" },
    { concept: "d", at: "2027-01-04", result: "MISS" },
  ];
  const claims = guaranteeCredits({ subs, calls, now: Date.parse("2027-02-15T00:00:00Z") });
  assert.equal(claims.length, 1, "one month per paid month, a stage call never counts, a pending sub never claims");
  assert.deepEqual([claims[0].subscriptionId, claims[0].month, claims[0].amount, claims[0].call.concept], ["s1", 1, 29, "a"]);
  const yearly = guaranteeCredits({ subs: [{ id: "y", status: "active", activatedAt: "2026-12-01T00:00:00Z", price: 290, billingPeriod: "yearly" }], calls, now: Date.parse("2027-02-15T00:00:00Z") });
  assert.equal(yearly[0].amount, 24.17, "a yearly plan gets a twelfth back");
});

test("the guarantee's claims job: refund requests for the owner, one per paid month, never twice, never across PayPal environments", async () => {
  const { guaranteeClaims } = await import("../src/lib/growth/radarPlans.js");
  const subs = [
    { id: "s1", userId: "u1", status: "active", activatedAt: "2026-12-01T00:00:00Z", price: 29, billingPeriod: "monthly", currency: "ILS", env: "live", paypalSubscriptionId: "I-1" },
    { id: "s2", userId: "u2", status: "active", activatedAt: "2026-12-01T00:00:00Z", price: 29, billingPeriod: "monthly", currency: "ILS", env: "sandbox" },
  ];
  const ledger = [{ concept: "a", at: "2026-12-05", due: "2026-12-19", result: "MISS" }, { concept: "b", at: "2026-12-06", due: "2026-12-20", result: null }];
  const now = Date.parse("2026-12-20T06:00:00Z");
  const first = guaranteeClaims({ subs, ledger, refunds: [], env: "live", now });
  assert.equal(first.length, 1);
  assert.deepEqual([first[0].id, first[0].product, first[0].reason, first[0].status, first[0].amount, first[0].call.concept], ["rg_s1_1", "radar", "guarantee", "pending_owner", 29, "a"]);
  assert.equal(guaranteeClaims({ subs, ledger, refunds: first, env: "live", now }).length, 0, "a claim already written is never written again");
  assert.equal(guaranteeClaims({ subs, ledger: [{ concept: "a", at: "2026-12-05", result: "HIT" }], refunds: [], env: "live", now }).length, 0, "a hit earns nothing");
  assert.equal(guaranteeClaims({ subs, ledger, refunds: [], env: "sandbox", now })[0].subscriptionId, "s2", "each PayPal environment claims only its own subscriptions");
});

test("the daily board put writes the guarantee's refund requests and reads them back", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  process.env.AUTOPILOT_SECRET = process.env.AUTOPILOT_SECRET || "s3cret-for-test";
  const store = new Map([["radar:subscriptions", [{ id: "s1", userId: "u1", status: "active", activatedAt: "2026-12-01T00:00:00Z", price: 29, billingPeriod: "monthly", currency: "ILS" }]]]);
  const kv = { kvGet: async (k, d = null) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d), kvSet: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; } };
  const h = createRadarBoardHandler({ kv, now: () => Date.parse("2026-12-20T06:00:00Z"), fetchImpl: async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }) });
  const board = { v: 2, at: "2026-12-20T06:00:00Z", record: {}, concepts: [{ id: "ear-cuff", he: "עגיל", stage: "STEADY" }], early: { need: 4, record: {}, ledger: [{ concept: "ear-cuff", at: "2026-12-05", due: "2026-12-19", result: "MISS" }] } };
  const out = {};
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { out.body = o; return this; }, end(b) { if (b) out.body = JSON.parse(b); return this; } };
  await h({ method: "POST", url: "/api/store?mode=radar-board&op=put", headers: { authorization: `Bearer ${process.env.AUTOPILOT_SECRET}` }, body: board }, res);
  assert.equal(out.body?.claims, 1);
  assert.deepEqual(store.get("billing:refund_requests").map((r) => [r.id, r.status, r.amount]), [["rg_s1_1", "pending_owner", 29]]);
  await h({ method: "POST", url: "/api/store?mode=radar-board&op=put", headers: { authorization: `Bearer ${process.env.AUTOPILOT_SECRET}` }, body: board }, res);
  assert.equal(store.get("billing:refund_requests").length, 1, "the next day's put never writes it twice");
});
