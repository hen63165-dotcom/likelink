// The radar's tiers and trial (Master Execution Order, items 5–7): Basic and Pro carry no price
// and are not for sale until the owner approves the price, the provider and the terms; they never
// reach the checkout allow-list or PayPal provisioning; every feature they list is live code; the
// waitlist accepts them; the trial never locks a page while nothing can be bought; the landing page
// is bilingual, wired like every public section, and makes no promise.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RADAR_FEATURES, RADAR_PLANS, accessOf, cleanRadarAccess, radarWaitlistPlan } from "../src/lib/growth/radarPlans.js";
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
  const ended = accessOf({ radarAccess: { trial: true, trialDays: 3, startedAt: "2026-11-01T00:00:00.000Z" } }, { now: NOW });
  assert.equal(ended.state, "TRIAL_ENDED");
  assert.equal(ended.locked, false, "no lock without a plan anyone can buy");
  const priced = { x: { purchasable: true, price: 10 } };
  assert.equal(accessOf({ radarAccess: { trial: true, trialDays: 3, startedAt: "2026-11-01" } }, { now: NOW, plans: priced }).locked, true);
  assert.equal(cleanRadarAccess({ trialDays: 999 }).trialDays, 60);
  assert.equal(cleanRadarAccess({ trialDays: "x", startedAt: "nope" }).startedAt, null);
  assert.equal(accessOf({ radarAccess: { trial: true } }, { now: NOW }).state, "OPEN", "a trial without a start date is not running");
});

test("/radar-pro: routed, rewritten, its own head, bilingual, no price or promise on the page", () => {
  assert.deepEqual(parsePath("/radar-pro"), { type: "radarPro" });
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.ok((vercel.rewrites || []).some((r) => r.source === "/radar-pro" && r.destination === "/"));
  const seo = sectionSeo("radarPro");
  assert.equal(seo.canonical, "https://likelink2.vercel.app/radar-pro");
  assert.match(readFileSync("scripts/prerender-products.mjs", "utf8"), /"\/radar-pro"/);
  const page = readFileSync("src/components/discover/radarPro.jsx", "utf8");
  for (const he of ["מחיר: עוד לא נקבע", "לא מבטיח להיט", "רשימת ההמתנה"]) assert.ok(page.includes(he));
  for (const en of ["Price: not set yet", "never promises a hit", "Join the waitlist"]) assert.ok(page.includes(en));
  assert.doesNotMatch(page, /₪|\$\d|היחיד בעולם|only one in the world|guarantee/i);
  assert.doesNotMatch(seo.description, /₪\d|מבטיח|היחיד/);
});
