// Distribution actions of /api/store?mode=discovery (owner session required).
//
//   GET  action=distribution-channels                 channel states + exact owner actions
//   POST action=distribution-fit   { productId }       which channels suit the product
//   POST action=distribution-plan  { productId, channels? }   DRAFT plan (quota: distributionPlans)
//   GET  action=distribution-plans                    my plans (newest first)
//   GET  action=distribution-export&id=&format=csv|json   content pack (Starter+)
//   GET  action=click-stats                            real clicks (breakdown on Starter+)
//   POST action=distribution-post  { planId, postId, step: ready_manual|reported|publish }
//   GET  action=distribution-autorun                  my approved campaigns
//   POST action=distribution-autorun { planId, channels, op: start|stop, confirm }
//
// "publish" posts ONE post, only on the owner's explicit per-post confirmation
// (confirm = postId, from a studio session — never an API key). "autorun"
// starts a campaign only on the owner's explicit approval of THAT campaign
// (confirm = planId); the light cron then publishes its due posts (job
// distribution-autorun, at most a few a day). Only channels with real
// credentials publish (publishers/index.js: Telegram, Bluesky, Mastodon). A
// post is PUBLISHED only with the provider's own post id, PUBLIC_VERIFIED only
// when it is readable in public; a creator-reported post stays
// REPORTED_BY_CREATOR. Publishing is idempotent (distributionStore.js).
import { canonicalProduct } from "../../src/lib/discovery/surfaces.js";
import {
  analyzeDistributionFit, generateDistributionPlan, distributionChannels, exportContentPack, clickStats, POST_STATE,
} from "../../src/lib/discovery/distribution.js";
import { FEATURES } from "../../src/lib/plans.js";
import { OWNER_PLAN } from "../../src/lib/discovery/entitlements.js";
import { catalogIssues } from "../../src/lib/discovery/catalogIntegrity.js";
import { QUOTA_ERROR } from "../../src/lib/discovery/quotas.js";
import { channelCredentials, PUBLISHABLE_CHANNELS, OWNER_ACTIONS } from "../../src/lib/discovery/publishers/index.js";
import { plansKey, connectionsKey, autorunKey, AUTORUN_INDEX_KEY, publishPlanPost } from "../../src/lib/discovery/distributionStore.js";

export const DISTRIBUTION_ACTIONS = new Set([
  "distribution-channels", "distribution-fit", "distribution-plan", "distribution-plans", "distribution-export", "click-stats", "distribution-post", "distribution-autorun",
]);
export { plansKey, connectionsKey };
const MAX_PLANS = 30;

/** Is a plans.js feature row included for this entitlement? */
export function featureIncluded(entitlement, featureId) {
  if (entitlement?.plan === OWNER_PLAN) return true;
  const f = FEATURES.find((x) => x.id === featureId);
  return Boolean(f && f.status === "live" && f.plans[entitlement?.plan]);
}

async function ownedProduct({ kvGet, productId, scope }) {
  const products = (await kvGet("marketplace:products", [])) || [];
  const product = (Array.isArray(products) ? products : []).find((p) => p && String(p.id) === String(productId));
  if (!product) return { error: "product_not_found", status: 404 };
  if (scope.marketerIds && !scope.marketerIds.includes(String(product.marketerId))) return { error: "not_owner", status: 403 };
  const marketers = (await kvGet("marketplace:marketers", [])) || [];
  const marketer = (Array.isArray(marketers) ? marketers : []).find((m) => m && String(m.id) === String(product.marketerId)) || null;
  return { product, issues: catalogIssues(product, products), c: canonicalProduct(product, marketer ? { id: marketer.id, name: marketer.name, slug: marketer.slug } : null) };
}

/** @returns {Promise<boolean>} true when the action was handled */
export async function handleDistribution(ctx) {
  const { action, req, res, json, kvGet, kvSet, who, scope, scopeKey, now, entitlementFor, quotaGate, quotaUse, quotaRefusal, readJson, rateAllowed, env = {}, fetchImpl = (...a) => fetch(...a) } = ctx;
  if (!DISTRIBUTION_ACTIONS.has(action)) return false;
  const url = new URL(req.url, "https://x");
  // Verified = a post the provider confirmed; configured = credentials saved.
  const connections = (await kvGet(connectionsKey(scopeKey), {})) || {};
  const creds = await channelCredentials({ kvGet, env, scope });
  const configured = Object.fromEntries(PUBLISHABLE_CHANNELS.map((c) => [c, Boolean(creds[c])]));

  if (req.method === "GET") {
    if (action === "distribution-channels") {
      json(res, { ok: true, channels: distributionChannels({ connections, configured }), video: { provider: null, mode: "storyboard_only", note: "לא מחובר ספק וידאו. תוכניות ההפצה כוללות תסריט ו-storyboard בלבד." } }, 200, req);
      return true;
    }
    if (action === "distribution-plans") {
      const list = (await kvGet(plansKey(scopeKey), [])) || [];
      json(res, { ok: true, plans: [...list].reverse().map((p) => ({ id: p.id, productId: p.productId, productTitle: p.productTitle, createdAt: p.createdAt, status: p.status, posts: p.calendar?.length || 0, calendar: p.calendar })) }, 200, req);
      return true;
    }
    if (action === "distribution-export") {
      const ent = await entitlementFor(who);
      if (!featureIncluded(ent, "content_export")) { json(res, { ok: false, error: QUOTA_ERROR.PLAN_REQUIRED, upgrade: { id: "starter" } }, 402, req); return true; }
      const list = (await kvGet(plansKey(scopeKey), [])) || [];
      const plan = list.find((p) => p.id === url.searchParams.get("id"));
      if (!plan) { json(res, { ok: false, error: "not_found" }, 404, req); return true; }
      json(res, { ok: true, file: exportContentPack(plan, url.searchParams.get("format") === "json" ? "json" : "csv") }, 200, req);
      return true;
    }
    if (action === "distribution-autorun") {
      json(res, { ok: true, campaigns: (await kvGet(autorunKey(scopeKey), [])) || [] }, 200, req);
      return true;
    }
    if (action === "click-stats") {
      const [ent, clicks, products] = await Promise.all([entitlementFor(who), kvGet("marketplace:clicks", []), kvGet("marketplace:products", [])]);
      const ids = (Array.isArray(products) ? products : []).filter((p) => p && (!scope.marketerIds || scope.marketerIds.includes(String(p.marketerId)))).map((p) => String(p.id));
      const detailed = ent.capabilities?.analytics === "sources";
      json(res, { ok: true, plan: ent.plan, ...clickStats(Array.isArray(clicks) ? clicks : [], ids, { detailed }), ...(detailed ? {} : { upgrade: { id: "starter", he: "פירוט לפי ערוץ ולפי פוסט זמין מ-Starter" } }) }, 200, req);
      return true;
    }
    json(res, { ok: false, error: "method_not_allowed" }, 405, req);
    return true;
  }

  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return true; }
  // Own budget: marking 8 posts of a plan in a row is normal use (Luna goals keep the strict 12/min).
  if (!rateAllowed(`dist:${who.actor}`, 60)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return true; }
  const body = (await readJson(req)) || {};

  if (action === "distribution-fit" || action === "distribution-plan") {
    const productId = String(body.productId || "").slice(0, 120);
    if (!productId) { json(res, { ok: false, error: "product_id_required" }, 400, req); return true; }
    const owned = await ownedProduct({ kvGet, productId, scope });
    if (owned.error) { json(res, { ok: false, error: owned.error }, owned.status, req); return true; }
    const clicks = (await kvGet("marketplace:clicks", [])) || [];
    if (action === "distribution-fit") {
      json(res, { ok: true, fit: analyzeDistributionFit(owned.c, { clicks, issues: owned.issues }), issues: owned.issues }, 200, req);
      return true;
    }
    const ent = await entitlementFor(who);
    const gate = await quotaGate(ent, scopeKey, "distributionPlans");
    if (!gate.allowed) { json(res, quotaRefusal(gate), gate.error === QUOTA_ERROR.EXCEEDED ? 429 : 402, req); return true; }
    const channels = Array.isArray(body.channels) ? body.channels.map(String).slice(0, 10) : null;
    const plan = generateDistributionPlan(owned.c, { now: now(), channels, clicks, connections, issues: owned.issues });
    if (plan.ok) for (const p of plan.calendar) if (configured[p.channel] && p.publish.mode === "manual") p.publish = { ...p.publish, mode: "api" };
    if (!plan.ok) { json(res, plan, 422, req); return true; }
    const list = (await kvGet(plansKey(scopeKey), [])) || [];
    await kvSet(plansKey(scopeKey), [...list.filter((p) => p.id !== plan.id), plan].slice(-MAX_PLANS));
    // Verified by reading it back (LAW 01) before it counts or is reported.
    const back = ((await kvGet(plansKey(scopeKey), [])) || []).find((p) => p.id === plan.id);
    if (!back || back.fingerprint !== plan.fingerprint) { json(res, { ok: false, error: "storage_failed" }, 500, req); return true; }
    await quotaUse(scopeKey, "distributionPlans");
    json(res, { ok: true, verified: true, plan }, 200, req);
    return true;
  }

  if (action === "distribution-autorun") {
    const list = (await kvGet(plansKey(scopeKey), [])) || [];
    const plan = list.find((p) => p.id === String(body.planId || ""));
    if (!plan) { json(res, { ok: false, error: "not_found" }, 404, req); return true; }
    const runs = (await kvGet(autorunKey(scopeKey), [])) || [];
    if (body.op === "stop") {
      const next = runs.map((r) => (r.planId === plan.id ? { ...r, status: "STOPPED", stoppedAt: new Date(now()).toISOString() } : r));
      await kvSet(autorunKey(scopeKey), next);
      json(res, { ok: true, campaigns: next }, 200, req);
      return true;
    }
    // The owner's explicit approval of THIS campaign (the studio sends it after a confirm dialog).
    if (String(body.confirm || "") !== plan.id) { json(res, { ok: false, error: "explicit_confirmation_required" }, 400, req); return true; }
    const wanted = (Array.isArray(body.channels) ? body.channels : []).map(String).filter((c) => PUBLISHABLE_CHANNELS.includes(c));
    const missing = wanted.filter((c) => !configured[c]);
    if (!wanted.length || missing.length) {
      json(res, { ok: false, error: "channel_requires_connection", channels: missing.length ? missing : PUBLISHABLE_CHANNELS, ownerAction: (missing.length ? missing : ["telegram"]).map((c) => OWNER_ACTIONS[c]).join(" ") }, 409, req);
      return true;
    }
    const record = {
      planId: plan.id, productId: plan.productId, productTitle: plan.productTitle, channels: wanted,
      status: "ACTIVE", approvedAt: new Date(now()).toISOString(), approvedBy: who.actor, maxPerDay: 3,
      posts: plan.calendar.filter((p) => wanted.includes(p.channel)).length,
    };
    const next = [...runs.filter((r) => r.planId !== plan.id), record].slice(-20);
    await kvSet(autorunKey(scopeKey), next);
    const index = (await kvGet(AUTORUN_INDEX_KEY, [])) || [];
    if (!index.includes(scopeKey)) await kvSet(AUTORUN_INDEX_KEY, [...index, scopeKey].slice(-500));
    json(res, { ok: true, campaign: record }, 200, req);
    return true;
  }

  if (action === "distribution-post") {
    const list = (await kvGet(plansKey(scopeKey), [])) || [];
    const plan = list.find((p) => p.id === String(body.planId || ""));
    const post = plan?.calendar?.find((p) => p.postId === String(body.postId || ""));
    if (!post) { json(res, { ok: false, error: "not_found" }, 404, req); return true; }
    const step = String(body.step || "");
    if (step === "publish") {
      if (post.state === POST_STATE.PUBLISHED) { json(res, { ok: true, idempotent: true, post }, 200, req); return true; }
      // The owner's explicit approval of THIS post (the studio sends it after a confirm dialog).
      if (String(body.confirm || "") !== post.postId) { json(res, { ok: false, error: "explicit_confirmation_required" }, 400, req); return true; }
      if (!PUBLISHABLE_CHANNELS.includes(post.channel) || !creds[post.channel]) {
        const ch = distributionChannels({ connections, configured }).find((x) => x.id === post.channel);
        json(res, { ok: false, error: "channel_requires_connection", channel: post.channel, state: ch?.state || "REQUIRES_CONNECTION", ownerAction: OWNER_ACTIONS[post.channel] || ch?.ownerAction || null }, 409, req);
        return true;
      }
      const out = await publishPlanPost({ kvGet, kvSet, scopeKey, planId: plan.id, postId: post.postId, creds, fetchImpl, now: now(), via: "studio" });
      if (!out.ok) { json(res, { ok: false, error: out.error }, out.status || 502, req); return true; }
      json(res, { ok: true, ...(out.idempotent ? { idempotent: true } : {}), post: out.post }, 200, req);
      return true;
    }
    let update;
    if (step === "ready_manual") update = { state: POST_STATE.READY_FOR_MANUAL_POST, readyAt: new Date(now()).toISOString() };
    else if (step === "reported") {
      const postUrl = String(body.postUrl || "").trim();
      if (postUrl && !/^https:\/\/[^\s]+$/i.test(postUrl)) { json(res, { ok: false, error: "invalid_url" }, 400, req); return true; }
      update = { state: POST_STATE.REPORTED_BY_CREATOR, reportedAt: new Date(now()).toISOString(), postUrl: postUrl || null, verification: "creator_reported_unverified" };
    } else { json(res, { ok: false, error: "bad_request" }, 400, req); return true; }
    const next = list.map((p) => (p.id !== plan.id ? p : { ...p, calendar: p.calendar.map((x) => (x.postId === post.postId ? { ...x, ...update } : x)) }));
    await kvSet(plansKey(scopeKey), next);
    json(res, { ok: true, post: { ...post, ...update } }, 200, req);
    return true;
  }
  return false;
}
