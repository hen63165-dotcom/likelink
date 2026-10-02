// Autonomous Marketing Engine: the server runner (isomorphic, no browser
// globals). It does the I/O for the pure core in src/lib/growth/marketingEngine.js.
//
// One cycle for one scope (platform = LikeLink Growth Mode, studio:<id> =
// Studio Growth Mode):
//   INTENT        the scope state: enabled, not paused, entitlement and quota
//   OPPORTUNITY   promotable products (+ a LikeLink page on the platform)
//   CREATIVE      a hook/CTA creative chosen by evidence (explore → exploit)
//   VIDEO         an existing verified LikeLink render (SYNTHETIC), or a render
//                 request queued for the native reel engine (proven at ingest)
//   DISTRIBUTION  site feed (internal post id + read-back); Telegram with the
//                 provider's message id; everything else is a tracked
//                 MANUAL_SHARE item with the exact missing connection
//   TRACKING      every link carries utm + the creative id (cid)
//   PROOF         campaign items + the shared publish:log (through the gate)
//   MEASUREMENT   recorded views/clicks/funnel events with that cid
//   LEARNING      INSUFFICIENT_EVIDENCE below MIN_EVIDENCE landings
//   NEXT ACTION   per object, from evidence only
//
// Each stage step runs independently. A failure is classified,
// dead-lettered, and the rest continues. Publishing is never blindly retried:
// a creative already published on a channel is skipped (idempotent by
// creativeId + channel + day).
import {
  KEYS, PLATFORM_SCOPE, parseScope, engineLimits, selectOpportunities, chooseCreative, pickVideo, buildCaption,
  trackedUrl, routeDistribution, manualShareUrl, measure, nextActions, defaultState, ENGINE_QUOTA_KEY, ENGINE_VERSION,
} from "../growth/marketingEngine.js";
import { catalogTruth } from "../growth/likeloop.js";
import { classifyFailure } from "../discovery/capabilities.js";
import { appendPublicationLog } from "../publishing/adapters.js";
import { checkQuota, quotaStoreKey } from "../discovery/quotas.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const ACTIVITY_CAP = 200;
const CAMPAIGN_CAP = 150;
const FEED_KEY = "brand_pulse:posts";
const FEED_CAP = 60;
const rid = () => Math.random().toString(36).slice(2, 8);
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export const quotaScopeOf = (sc) => (sc.kind === "platform" ? "platform" : sc.marketerId);

/** Read the engine state of a scope (a default one when none exists). */
export async function loadState(kvGet, scopeKey, now = Date.now()) {
  const s = await kvGet(KEYS.state(scopeKey), null);
  return s && typeof s === "object" ? { ...defaultState(scopeKey, now), ...s } : defaultState(scopeKey, now);
}

/** Write a state and verify it by reading it back. */
async function writeState(kvGet, kvSet, scopeKey, state) {
  await kvSet(KEYS.state(scopeKey), state);
  const back = await kvGet(KEYS.state(scopeKey), null);
  return back?.updatedAt === state.updatedAt;
}

async function appendCapped(kvGet, kvSet, key, rows, cap) {
  const cur = arr(await kvGet(key, []));
  await kvSet(key, [...rows, ...cur].slice(0, cap));
}

/**
 * Change the engine controls: enable / pause / resume / settings. Pure owner action, verified by read-back.
 * @param {"enable"|"disable"|"pause"|"resume"|"settings"} op
 */
export async function setControl({ kvGet, kvSet, scopeKey, op, settings = null, owner = {}, now = Date.now(), sanitize }) {
  const state = await loadState(kvGet, scopeKey, now);
  const t = new Date(now).toISOString();
  const next = { ...state, updatedAt: t };
  if (op === "enable") { next.enabled = true; next.paused = false; }
  else if (op === "disable") next.enabled = false;
  else if (op === "pause") { next.paused = true; next.pausedAt = t; }
  else if (op === "resume") { next.paused = false; next.resumedAt = t; }
  else if (op === "settings") next.settings = sanitize(settings || {}, state.settings || {});
  else return { ok: false, status: 400, error: "bad_op" };
  // Who may run the studio from cron: its verified auth user, never a client claim.
  if (owner.userId) next.ownerUserId = owner.userId;
  if (typeof owner.platformOwner === "boolean") next.ownerIsPlatformOwner = owner.platformOwner;
  const ok = await writeState(kvGet, kvSet, scopeKey, next);
  if (!ok) return { ok: false, status: 502, error: "state_not_persisted" };
  if (scopeKey !== PLATFORM_SCOPE) {
    const idx = arr(await kvGet(KEYS.index, []));
    const want = next.enabled && !next.paused;
    const has = idx.includes(scopeKey);
    if (want && !has) await kvSet(KEYS.index, [...idx, scopeKey].slice(-500));
    if (!want && has) await kvSet(KEYS.index, idx.filter((x) => x !== scopeKey));
  }
  await appendCapped(kvGet, kvSet, KEYS.activity(scopeKey), [{ at: t, stage: "INTENT", type: `control_${op}`, status: "DONE", detail: op === "settings" ? next.settings : null }], ACTIVITY_CAP);
  return { ok: true, status: 200, state: next };
}

/** Post one creative on LikeLink's own public feed. PUBLISHED only after the id is read back. */
async function publishSiteFeed({ kvGet, kvSet, scopeKey, creative, opportunity, caption, link, video, now }) {
  const id = `mk_${now}_${rid()}`;
  const feed = arr(await kvGet(FEED_KEY, []));
  const p = opportunity.product;
  const post = {
    id, ts: now, text: caption, link, source: "marketing_engine", scope: scopeKey === PLATFORM_SCOPE ? "platform" : "studio",
    creativeId: creative.creativeId, contentId: `engine:${creative.creativeId}`,
    spotlight: p ? { id: p.id, title: p.title, price: p.price, image: p.image } : null,
    video: video ? { id: video.id, videoUrl: video.videoUrl, posterUrl: video.posterUrl, truth: video.truth, creativeClass: video.creativeClass } : null,
    channels: ["web"],
  };
  const next = [...feed, post];
  while (next.length > FEED_CAP) next.shift();
  await kvSet(FEED_KEY, next);
  const back = arr(await kvGet(FEED_KEY, []));
  const ok = back.some((x) => x?.id === id);
  return ok ? { ok: true, providerId: id, via: `kv_read:${FEED_KEY}` } : { ok: false, error: "site_feed_readback_failed" };
}

/**
 * One engine cycle.
 * @param {object} deps { kvGet, kvSet, env, fetchImpl, now, entitlement, origin,
 *                        requestVideo(productId, ownerId) → {ok, request?, complete?, error?},
 *                        channelCredentials(scope) → {telegram?}, publishPost({channel, creds, text, photoUrl}) }
 */
export async function runCycle(scopeKey, deps) {
  const { kvGet, kvSet, now = Date.now(), entitlement, origin = PRODUCTION_ORIGIN, trigger = "manual" } = deps;
  const sc = parseScope(scopeKey);
  if (!sc) return { ok: false, status: 400, error: "bad_scope" };
  const t = new Date(now).toISOString();
  const runId = `run_${now}_${rid()}`;
  const activity = [];
  const dead = [];
  const log = (stage, type, status, extra = {}) => activity.push({ at: new Date(now).toISOString(), runId, stage, type, status, ...extra });
  const fail = (stage, e, extra = {}) => {
    const c = classifyFailure(e);
    const row = { at: t, runId, scope: scopeKey, stage, error: String(e?.message || e).slice(0, 200), class: c.class || c, retryable: Boolean(c.retryable), ...extra };
    dead.push(row);
    log(stage, "failure", "FAILED", { error: row.error, class: row.class });
  };

  // ── INTENT ──
  const state = await loadState(kvGet, scopeKey, now);
  if (!state.enabled) return { ok: true, status: 200, outcome: "NOT_ENABLED", scope: scopeKey };
  if (state.paused) {
    await appendCapped(kvGet, kvSet, KEYS.activity(scopeKey), [{ at: t, runId, stage: "INTENT", type: "cycle_skipped", status: "PAUSED" }], ACTIVITY_CAP);
    return { ok: true, status: 200, outcome: "PAUSED", scope: scopeKey };
  }
  const limits = engineLimits(entitlement);
  if (!limits.included) {
    await appendCapped(kvGet, kvSet, KEYS.activity(scopeKey), [{ at: t, runId, stage: "INTENT", type: "cycle_refused", status: "PLAN_REQUIRED", plan: limits.plan }], ACTIVITY_CAP);
    return { ok: false, status: 402, error: "plan_required", plan: limits.plan, scope: scopeKey };
  }
  const qKey = quotaStoreKey(quotaScopeOf(sc), now);
  const usage = (await kvGet(qKey, {})) || {};
  const gate = checkQuota(entitlement, ENGINE_QUOTA_KEY, Number(usage[ENGINE_QUOTA_KEY]) || 0);
  if (!gate.allowed) return { ok: false, status: gate.error === "quota_exceeded" ? 429 : 402, error: gate.error, limit: gate.limit, used: gate.used, upgrade: gate.upgrade || null, scope: scopeKey };
  log("INTENT", "cycle_start", "DONE", { trigger, plan: limits.plan });

  // ── data ──
  const [products, marketers, videos, clicks, funnel, scores, campaignsPrev] = await Promise.all([
    kvGet("marketplace:products", []), kvGet("marketplace:marketers", []), kvGet("marketplace:videos", []),
    kvGet("marketplace:clicks", []), kvGet("marketplace:funnel", []), kvGet("likeloop:scores", {}), kvGet(KEYS.campaigns(scopeKey), []),
  ]);
  const truth = catalogTruth({ products: arr(products), marketers: arr(marketers), videos: arr(videos), clicks: arr(clicks), origin });

  // ── MEASUREMENT + LEARNING (before choosing, so evidence steers the choice) ──
  const prevItems = arr(campaignsPrev);
  const learning = measure({ clicks: arr(clicks), funnel: arr(funnel), creativeIds: [...new Set(prevItems.map((x) => x.creativeId))] });
  log("LEARNING", "evidence", learning.status, { landings: learning.landings, outbound: learning.outbound, signups: learning.signups });

  // ── OPPORTUNITY ──
  const opp = selectOpportunities({ scope: sc, products: arr(products), truthRows: truth.rows, scores: scores?.byId || {}, history: prevItems, limit: limits.objectsPerCycle, now });
  log("OPPORTUNITY", "selected", opp.selected.length ? "DONE" : "NOTHING_DUE", { objects: opp.selected.map((x) => x.objectId), repairs: opp.repairs.length, cooling: opp.cooling.length });

  // channel connections (booleans; credentials stay here)
  let creds = {};
  try { creds = deps.channelCredentials ? await deps.channelCredentials(sc.kind === "platform" ? { marketerIds: null } : { marketerIds: [sc.marketerId] }) : {}; }
  catch (e) { fail("DISTRIBUTION", e, { step: "channel_credentials" }); }
  const connected = { telegram: Boolean(creds.telegram), instagram: false };
  const routes = routeDistribution({ scopeKind: sc.kind, connected, autoChannels: limits.autoChannels, settings: state.settings });
  const today = dayOf(now);
  let feedToday = prevItems.filter((x) => x.channel === "site_feed" && x.status === "PUBLISHED" && dayOf(Date.parse(x.at)) === today).length;

  const items = [];
  const marketed = [];
  for (const o of opp.selected) {
    // ── CREATIVE ──
    let creative = null;
    try {
      const done = new Set(prevItems.filter((x) => x.objectId === o.objectId).map((x) => x.creativeId));
      creative = chooseCreative(o, { learning, done, now, seed: now % 997 }) || chooseCreative(o, { learning, now, seed: now % 997 });
      if (!creative) throw new Error("no_safe_creative");
      log("CREATIVE", "chosen", "DONE", { objectId: o.objectId, creativeId: creative.creativeId, hookType: creative.hookType, reason: creative.reason });
    } catch (e) { fail("CREATIVE", e, { objectId: o.objectId }); continue; }

    // ── VIDEO ──
    let video = null;
    if (o.kind === "product") {
      video = pickVideo(o.objectId, creative, arr(videos));
      if (video) log("VIDEO", "attached", "VERIFIED_ASSET", { objectId: o.objectId, videoId: video.id, truth: video.truth, creativeClass: video.creativeClass });
      try {
        if (deps.requestVideo) {
          const r = await deps.requestVideo(o.objectId, o.product.marketerId);
          log("VIDEO", "render_request", r?.ok ? (r.complete ? "ALL_STYLES_EXIST" : r.duplicate ? "ALREADY_QUEUED" : "QUEUED") : "FAILED", { objectId: o.objectId, requestId: r?.request?.id || null, error: r?.ok ? null : r?.error || null });
        }
      } catch (e) { fail("VIDEO", e, { objectId: o.objectId }); }
    }
    marketed.push({ objectId: o.objectId, kind: o.kind, video });
    const path = o.kind === "product" ? `/p/${encodeURIComponent(o.objectId)}` : o.object.path;

    // ── DISTRIBUTION + TRACKING + PROOF ──
    for (const r of routes) {
      const link = trackedUrl(creative, { channel: r.channel, scopeKey, path, origin });
      const caption = buildCaption({ creative, opportunity: o, link, video });
      const base = {
        id: `mi_${now}_${rid()}`, at: t, runId, scope: scopeKey, objectId: o.objectId, kind: o.kind, creativeId: creative.creativeId,
        hookType: creative.hookType, channel: r.channel, link, caption, mediaType: video ? video.creativeClass : (o.kind === "product" ? "PRODUCT_IMAGE" : "NO_VIDEO"),
        videoUrl: video?.videoUrl || null, synthetic: Boolean(video),
      };
      const already = prevItems.some((x) => x.creativeId === creative.creativeId && x.channel === r.channel && x.status === "PUBLISHED" && dayOf(Date.parse(x.at)) === today);
      if (already) { log("DISTRIBUTION", "skip_duplicate", "IDEMPOTENT", { channel: r.channel, creativeId: creative.creativeId }); continue; }
      try {
        if (r.mode === "PUBLISH_INTERNAL") {
          if (feedToday >= limits.feedPostsPerDay) { items.push({ ...base, status: "DAILY_CAP_REACHED" }); log("DISTRIBUTION", "site_feed", "DAILY_CAP_REACHED", { cap: limits.feedPostsPerDay }); continue; }
          const res = await publishSiteFeed({ kvGet, kvSet, scopeKey, creative, opportunity: o, caption, link, video, now });
          if (!res.ok) throw new Error(res.error);
          feedToday += 1;
          items.push({ ...base, status: "PUBLISHED", providerId: res.providerId, proof: { via: res.via, readBack: true, publicUrl: `${origin}/api/store?mode=brand-pulse` } });
          log("PROOF", "site_feed_published", "PUBLISHED", { providerId: res.providerId, creativeId: creative.creativeId });
        } else if (r.mode === "PUBLISH_PROVIDER") {
          const res = await deps.publishPost({ channel: r.channel, creds: creds[r.channel], text: caption, photoUrl: o.product?.image || "" });
          if (!res?.ok) throw new Error(res?.error || "provider_failed");
          // The publication gate: no provider id → never PUBLISHED.
          if (!res.providerPostId) throw new Error("provider_returned_no_id");
          items.push({ ...base, status: "PUBLISHED", providerId: String(res.providerPostId), proof: { provider: res.provider, publicUrl: res.publicUrl || null, verification: res.verification } });
          log("PROOF", `${r.channel}_published`, "PUBLISHED", { providerId: String(res.providerPostId), verification: res.verification });
        } else if (r.mode === "APPROVAL_REQUIRED") {
          items.push({ ...base, status: "APPROVAL_REQUIRED", requirement: "אישור הבעלים לפרסום אוטומטי בערוץ (הגדרות המנוע ← פרסום אוטומטי)" });
          log("DISTRIBUTION", r.channel, "APPROVAL_REQUIRED");
        } else {
          items.push({ ...base, status: "MANUAL_SHARE_READY", shareUrl: manualShareUrl(r.channel, caption, link), missingConnection: r.missingConnection });
        }
      } catch (e) {
        items.push({ ...base, status: "FAILED", error: String(e?.message || e).slice(0, 160) });
        fail("DISTRIBUTION", e, { channel: r.channel, creativeId: creative.creativeId });
      }
    }
    const manual = items.filter((x) => x.objectId === o.objectId && x.status === "MANUAL_SHARE_READY").length;
    if (manual) log("DISTRIBUTION", "manual_share_ready", "READY", { objectId: o.objectId, items: manual });
  }

  // ── persist: campaigns, publish log, quota, activity, state ──
  const published = items.filter((x) => x.status === "PUBLISHED");
  try {
    if (items.length) await appendCapped(kvGet, kvSet, KEYS.campaigns(scopeKey), items, CAMPAIGN_CAP);
    if (published.length) {
      await appendPublicationLog({ kvGet, kvSet, now }, published.map((x) => ({
        contentId: `engine:${x.creativeId}`, contentType: "marketing_engine", brandId: sc.kind === "platform" ? "platform" : sc.marketerId,
        productId: x.kind === "product" ? x.objectId : null, channel: x.channel === "site_feed" ? "web" : x.channel, status: "PUBLISHED",
        externalId: x.providerId, permalink: x.proof?.publicUrl || null, text: x.caption, link: x.link,
      })));
    }
  } catch (e) { fail("PROOF", e, { step: "persist_items" }); }
  let campaignsVerified = false;
  try {
    const back = arr(await kvGet(KEYS.campaigns(scopeKey), []));
    campaignsVerified = items.every((x) => back.some((y) => y?.id === x.id));
  } catch (e) { fail("PROOF", e, { step: "readback_items" }); }

  const all = [...items, ...prevItems];
  const next = nextActions({ marketed, repairs: opp.repairs, learning, campaigns: all });
  log("NEXT_ACTION", "planned", "DONE", { actions: next.length });

  // A cycle counts against the quota only when it did something.
  if (items.length) {
    try {
      const cur = (await kvGet(qKey, {})) || {};
      await kvSet(qKey, { ...cur, [ENGINE_QUOTA_KEY]: (Number(cur[ENGINE_QUOTA_KEY]) || 0) + 1 });
    } catch (e) { fail("INTENT", e, { step: "quota_use" }); }
  }
  const summary = {
    runId, at: t, trigger, plan: limits.plan, objects: marketed.length, items: items.length,
    published: published.length, manual: items.filter((x) => x.status === "MANUAL_SHARE_READY").length,
    approval: items.filter((x) => x.status === "APPROVAL_REQUIRED").length, failed: items.filter((x) => x.status === "FAILED").length,
    learning: learning.status, landings: learning.landings, deadLetters: dead.length, campaignsVerified,
  };
  try {
    await appendCapped(kvGet, kvSet, KEYS.activity(scopeKey), activity.reverse(), ACTIVITY_CAP);
    if (dead.length) await appendCapped(kvGet, kvSet, KEYS.deadletter, dead, 200);
    const fresh = await loadState(kvGet, scopeKey, now);
    await writeState(kvGet, kvSet, scopeKey, { ...fresh, version: ENGINE_VERSION, lastRun: summary, learning: { status: learning.status, landings: learning.landings, outbound: learning.outbound, signups: learning.signups, minEvidence: learning.minEvidence }, nextActions: next.slice(0, 20), runs: [summary, ...arr(fresh.runs)].slice(0, 30), updatedAt: new Date(now + 1).toISOString() });
  } catch (e) { dead.push({ stage: "STATE", error: String(e?.message || e) }); }
  return { ok: true, status: 200, outcome: items.length ? "RAN" : "NOTHING_DUE", scope: scopeKey, summary, items, nextActions: next, learning, repairs: opp.repairs, deadLetters: dead };
}

/** What a viewer may see. Public = counts only; owner = the full log. */
export async function engineView({ kvGet, scopeKey, full = false, entitlement = null, now = Date.now() }) {
  const sc = parseScope(scopeKey);
  if (!sc) return { ok: false, status: 400, error: "bad_scope" };
  const [state, campaigns, activity] = await Promise.all([loadState(kvGet, scopeKey, now), kvGet(KEYS.campaigns(scopeKey), []), full ? kvGet(KEYS.activity(scopeKey), []) : []]);
  const items = arr(campaigns);
  const by = (k) => items.reduce((o, x) => ({ ...o, [x[k]]: (o[x[k]] || 0) + 1 }), {});
  const base = {
    ok: true, status: 200, scope: scopeKey, enabled: Boolean(state.enabled), paused: Boolean(state.paused),
    lastRun: state.lastRun || null, learning: state.learning || { status: "INSUFFICIENT_EVIDENCE", landings: 0 },
    totals: { items: items.length, byStatus: by("status"), byChannel: by("channel") },
    publishedProof: items.filter((x) => x.status === "PUBLISHED").slice(0, 10).map((x) => ({ channel: x.channel, providerId: x.providerId, at: x.at, objectId: x.objectId, creativeId: x.creativeId, mediaType: x.mediaType })),
    stages: ["INTENT", "OPPORTUNITY", "CREATIVE", "VIDEO", "DISTRIBUTION", "TRACKING", "PROOF", "MEASUREMENT", "LEARNING", "NEXT_ACTION"],
  };
  if (!full) return base;
  let quota = null;
  if (entitlement) {
    const used = Number(((await kvGet(quotaStoreKey(quotaScopeOf(sc), now), {})) || {})[ENGINE_QUOTA_KEY]) || 0;
    quota = { ...checkQuota(entitlement, ENGINE_QUOTA_KEY, used), limits: engineLimits(entitlement) };
  }
  return { ...base, settings: state.settings, nextActions: state.nextActions || [], runs: arr(state.runs).slice(0, 10), items: items.slice(0, 40), activity: arr(activity).slice(0, 60), quota };
}

/**
 * The autonomous sweep (cron / scheduler): LikeLink Growth Mode, then every
 * enabled studio. Each studio runs with its own server-verified plan, from the
 * auth user stored when its owner switched the engine on. One failing scope
 * never stops the others.
 */
export async function engineSweep({ kvGet, kvSet, env = {}, now = Date.now(), requestVideo = null, channelCredentials = null, publishPost = null, maxStudios = 10, trigger = "cron" }) {
  const { resolveEntitlement, pickSubscription } = await import("../discovery/entitlements.js");
  const deps = (entitlement) => ({
    kvGet, kvSet, env, now, entitlement, trigger, requestVideo, publishPost,
    channelCredentials: channelCredentials ? (scope) => channelCredentials({ kvGet, env, scope }) : null,
  });
  const results = [];
  const once = async (scopeKey, ent) => {
    try {
      const r = await runCycle(scopeKey, deps(ent));
      results.push({ scope: scopeKey, ok: r.ok, outcome: r.outcome || r.error, summary: r.summary || null });
    } catch (e) {
      results.push({ scope: scopeKey, ok: false, outcome: "FAILED", error: String(e?.message || e).slice(0, 160) });
    }
  };
  await once(PLATFORM_SCOPE, resolveEntitlement({ isPlatformOwner: true, now }));
  const index = arr(await kvGet(KEYS.index, []));
  const subs = index.length ? await kvGet("marketplace:subscriptions", []) : [];
  for (const scopeKey of index.slice(0, maxStudios)) {
    const st = await kvGet(KEYS.state(scopeKey), null);
    if (!st?.enabled || st.paused || !st.ownerUserId) { results.push({ scope: scopeKey, ok: true, outcome: "SKIPPED" }); continue; }
    const ent = st.ownerIsPlatformOwner && env.OWNER_EMAIL
      ? resolveEntitlement({ isPlatformOwner: true, now })
      : resolveEntitlement({ subscription: pickSubscription(subs, st.ownerUserId, now), now });
    await once(scopeKey, ent);
  }
  return { ok: true, trigger, results };
}
