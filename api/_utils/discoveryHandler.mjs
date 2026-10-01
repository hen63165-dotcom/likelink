// Luna API — served through api/store.mjs (?mode=discovery) to stay within
// the Vercel Hobby 12-function limit.
//
//   GET  ?mode=discovery&action=passport&productId=<id>   public, read-only
//   GET  ?mode=discovery&action=channels                  public channel states
//   GET  ?mode=discovery&action=sweep-status              public last-sweep summary
//   GET  ?mode=discovery&action=commands                  public command catalog
//   GET  ?mode=discovery&action=laws                      public operating laws
//   GET  ?mode=discovery&action=capabilities              public capability catalog
//   GET  ?mode=discovery&action=system-check              public (sanitized) / owner (detailed)
//   GET  ?mode=discovery&action=overview                  owner
//   GET  ?mode=discovery&action=memory                    owner
//   GET  ?mode=discovery&action=entitlement               owner
//   POST ?mode=discovery&action=goal    { goal, productId? }     owner
//   POST ?mode=discovery&action=command { command, productId? }  owner
//   POST ?mode=discovery&action=rollback { productId }           owner
//   GET  ?mode=discovery&action=quotas                    owner — plan, month usage, product count
//   …&action=distribution-*|click-stats                   owner — see distributionRoutes.mjs
//
// Identity comes only from the verified Bearer token: a Supabase session
// (→ the marketer with the same email) or an admin token. Public reads never
// expose drafts, logs, emails, private counts or any secret; env is reported
// as booleans only and env-var names reach admins/platform owner only.
import { readBody } from "./readBody.mjs";
import { jsonCors, isApprovedOrigin } from "./cors.js";
import {
  runCommand, runIntent, publicPassport, loadDiscoveryData, computePassports, channelEnv, KEYS,
  memoryAnswer, rollbackAssets, createCampaign, listCampaigns, recruitForProduct,
} from "../../src/lib/discovery/orchestrator.js";
import { buildChannelRegistry, LUNA_COMMANDS, CHANNEL_STATE_LABEL, verifyPublication } from "../../src/lib/discovery/engine.js";
import { merchantStatus } from "../../src/lib/discovery/surfaces.js";
import { resolveEntitlement, pickSubscription } from "../../src/lib/discovery/entitlements.js";
import { evaluateSystem, classifyRlsProbe, publicPiiCounts } from "../../src/lib/discovery/systemCheck.js";
import { parseValue } from "../../src/lib/cloud/marketerPrivacy.js";
import { MEDIA_BUCKET } from "../../src/lib/cloud/mediaStore.js";
import { getPayPalToken, getPayPalTokenStatus, paypalBase, FOREIGN_PLAN_IDS } from "./paypal.js";
import { getProvisionedPlans } from "../../src/lib/plans.js";
import { checkQuota, quotaStoreKey, monthKey, QUOTA_ERROR } from "../../src/lib/discovery/quotas.js";
import { LAWS } from "../../src/lib/discovery/laws.js";
import { listCapabilities, PERMISSION } from "../../src/lib/discovery/capabilities.js";
import { deliverInvitation } from "../../src/lib/discovery/campaigns.js";
import { productMediaTruth, MEDIA_TRUTH } from "../../src/lib/discovery/mediaTruth.js";
import { handleDistribution, DISTRIBUTION_ACTIONS } from "./distributionRoutes.mjs";
import { imageProvenance, isRealProductPhoto, sharedAffiliateLinks, IMAGE_PROVENANCE } from "../../src/lib/discovery/catalogIntegrity.js";
import { LEDGER_KEY, PROOF_KEY, publicProof, buildLedger, verifyEntry } from "../../src/lib/publishing/orchestrator.js";
import { externalDestinations } from "../../src/lib/publishing/adapters.js";
import { videoProviders } from "../../src/lib/media/videoCapability.js";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;
const SYSTEM_CHECK_CACHE_MS = 60000;
const STORAGE_SELFTEST_KEY = "storage:selftest:last";
const STORAGE_SELFTEST_EVERY_MS = 24 * 60 * 60 * 1000;
// 1×1 transparent PNG — the storage self-test object (health/ is never public).
const PROBE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SUBSCRIPTION_PLAN_ENV = ["PAYPAL_PLAN_STARTER", "PAYPAL_PLAN_PROFESSIONAL"];
const SERVER_SECRETS = ["ADMIN_SESSION_SECRET", "STORE_SIGN_SECRET", "AUTOPILOT_SECRET", "CRON_SECRET", "PAYOUTS_SECRET", "PRICE_WATCH_SECRET", "CLOUD_PASSPORT_SECRET", "PAYPAL_WEBHOOK_ID"];

function header(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

const norm = (v) => String(v || "").trim().toLowerCase();

/** Owner-only technical config hints (env names) are shown to admins only. */
function forViewer(channels, admin) {
  return (channels || []).map(({ ownerAction, ...rest }) => (admin ? { ...rest, ownerAction } : rest));
}

export function createDiscoveryHandler({
  kvGet, kvSet, verifyToken, verifyAdminToken, env = process.env, now = () => Date.now(), rateMap = new Map(),
  fetchImpl = (...a) => fetch(...a),
}) {
  let systemCache = { at: 0, probes: null };

  function json(res, obj, status, req) {
    jsonCors(res, obj, status, req, { allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
  }

  async function identify(req) {
    const token = String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, status: 401, error: "authentication_required" };
    let admin = null;
    try { admin = verifyAdminToken(token); } catch { admin = null; }
    if (admin) return { ok: true, admin: true, platformOwner: true, marketerIds: null, userId: null, actor: "admin" };
    const user = await verifyToken(token).catch(() => null);
    const email = norm(user?.email);
    if (!email) return { ok: false, status: 401, error: "authentication_required" };
    const marketers = await kvGet("marketplace:marketers", []);
    const mine = (Array.isArray(marketers) ? marketers : []).filter((m) => m && norm(m.email) === email).map((m) => String(m.id));
    if (!mine.length) return { ok: false, status: 403, error: "marketer_not_found" };
    const platformOwner = Boolean(norm(env.OWNER_EMAIL) && norm(env.OWNER_EMAIL) === email);
    return { ok: true, admin: false, platformOwner, marketerIds: mine, userId: String(user.id || ""), actor: `marketer:${mine[0]}` };
  }

  async function entitlementFor(who) {
    if (who.admin || who.platformOwner) return resolveEntitlement({ isPlatformOwner: true, now: now() });
    const subs = await kvGet("marketplace:subscriptions", []);
    return resolveEntitlement({ subscription: pickSubscription(subs, who.userId), now: now() });
  }

  // ── Monthly quotas (src/lib/plans.js via the entitlement) ──
  async function quotaGate(entitlement, scopeKey, quotaKey) {
    const used = Number(((await kvGet(quotaStoreKey(scopeKey, now()), {})) || {})[quotaKey]) || 0;
    return checkQuota(entitlement, quotaKey, used);
  }
  async function quotaUse(scopeKey, quotaKey) {
    const key = quotaStoreKey(scopeKey, now());
    const cur = (await kvGet(key, {})) || {};
    await kvSet(key, { ...cur, [quotaKey]: (Number(cur[quotaKey]) || 0) + 1 });
  }
  function quotaRefusal(gate) {
    return { ok: false, error: gate.error, limit: gate.limit, used: gate.used, upgrade: gate.upgrade || null };
  }

  function rateAllowed(key, max = RATE_MAX) {
    const t = now();
    const win = (rateMap.get(key) || []).filter((x) => t - x < RATE_WINDOW_MS);
    if (win.length >= max) return false;
    win.push(t);
    rateMap.set(key, win);
    return true;
  }

  /**
   * The private media bucket: existence + its real public flag, the policy
   * count (service-role-only status function) and, once a day, a REAL
   * upload → readback → anonymous-denied self-test on health/probe.png.
   */
  async function probeStorage({ storageRes, sbUrl, anon, service, t }) {
    if (!storageRes.ok || !storageRes.v) return { checked: false };
    if (!storageRes.v.ok) return { checked: true, bucketExists: false };
    const bucket = await storageRes.v.json().catch(() => ({}));
    const out = { checked: true, bucketExists: true, bucketPublic: bucket?.public === true, policies: null, selftest: null };
    try {
      const r = await fetchImpl(`${sbUrl}/rest/v1/rpc/likelink_media_policy_status`, {
        method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(6000),
      });
      if (r.ok) { const st = await r.json(); if (Array.isArray(st?.policies)) out.policies = st.policies.length; }
    } catch { /* policies stay unverified */ }
    out.selftest = await storageSelfTest({ sbUrl, anon, service, t, bucketPublic: out.bucketPublic });
    return out;
  }

  async function storageSelfTest({ sbUrl, anon, service, t, bucketPublic }) {
    const last = await kvGet(STORAGE_SELFTEST_KEY, null);
    if (last && t - Number(last.at || 0) < STORAGE_SELFTEST_EVERY_MS) return last;
    const objectPath = `${MEDIA_BUCKET}/health/probe.png`;
    const svc = { apikey: service, Authorization: `Bearer ${service}` };
    const result = { at: t, upload: false, readback: false, anonDenied: false, bucketPublic };
    try {
      const up = await fetchImpl(`${sbUrl}/storage/v1/object/${objectPath}`, {
        method: "POST", headers: { ...svc, "content-type": "image/png", "x-upsert": "true" }, body: PROBE_PNG, signal: AbortSignal.timeout(8000),
      });
      result.upload = up.ok;
      if (up.ok) {
        const back = await fetchImpl(`${sbUrl}/storage/v1/object/authenticated/${objectPath}`, { headers: svc, signal: AbortSignal.timeout(8000) });
        const bytes = back.ok ? Buffer.from(await back.arrayBuffer()) : null;
        result.readback = Boolean(bytes && bytes.equals(PROBE_PNG));
        const pub = await fetchImpl(`${sbUrl}/storage/v1/object/authenticated/${objectPath}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(8000) });
        result.anonDenied = !pub.ok;
      }
    } catch (e) {
      result.error = String(e?.message || e).slice(0, 80);
    }
    try { await kvSet(STORAGE_SELFTEST_KEY, result); } catch { /* the result is still reported */ }
    return result;
  }

  /**
   * Read-only PayPal proof: can the server authenticate, which environment,
   * and do the cached self-provisioned monthly plans exist at PayPal as ACTIVE.
   * Nothing is created here — plans are created by the first real sub=create.
   */
  async function probePayPal() {
    if (!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)) return {};
    const out = { paypalEnv: paypalBase().includes("sandbox") ? "sandbox" : "live", tokenOk: null, tokenRejected: false, tokenStatus: null, provisioned: 0, provisionedVerified: 0 };
    try {
      // Rejected credentials (401/403) are a proven fault; a network or
      // provider error is not proof of anything and stays unverified.
      const st = await getPayPalTokenStatus();
      out.tokenOk = st.ok;
      out.tokenStatus = st.status;
      out.tokenRejected = st.rejected;
      out.paypalEnvSource = st.envSource;
      const token = st.ok ? await getPayPalToken() : null;
      const cached = await kvGet("marketplace:paypal_plans", null);
      const ids = getProvisionedPlans().map((p) => (cached && typeof cached === "object" ? cached[`${p.id}:monthly`] : null)).filter((id) => id && !FOREIGN_PLAN_IDS.has(id));
      out.provisioned = ids.length;
      if (token && ids.length) {
        const states = await Promise.all(ids.map(async (id) => {
          try {
            const r = await fetchImpl(`${paypalBase()}/v1/billing/plans/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
            return r.ok ? String((await r.json())?.status || "") : "";
          } catch { return ""; }
        }));
        out.provisionedVerified = states.filter((x) => x === "ACTIVE").length;
      }
    } catch { /* stays unverified */ }
    return out;
  }

  /** Live probes for the system check — real reads, booleans for secrets. */
  async function probeSystem() {
    const t = now();
    if (systemCache.probes && t - systemCache.at < SYSTEM_CHECK_CACHE_MS) return systemCache.probes;
    const sbUrl = env.VITE_SUPABASE_URL;
    const anon = env.VITE_SUPABASE_ANON_KEY;
    const service = env.SUPABASE_SERVICE_ROLE_KEY;
    const timed = async (fn) => { const s = Date.now(); try { const v = await fn(); return { ok: true, v, ms: Date.now() - s }; } catch (e) { return { ok: false, error: String(e?.message || e).slice(0, 80), ms: Date.now() - s }; } };
    const safeFetch = (u, headers) => fetchImpl(u, { headers, signal: AbortSignal.timeout(6000) });

    const dbRead = await timed(() => kvGet("marketplace:products", null));
    const data = await loadDiscoveryData(kvGet);
    const { passports, channels, merchantEligibleCount } = computePassports(data, { env, now: t });
    // RLS probes read with the PUBLIC key and select only the key column — no
    // value is ever read. cron:beat is server-only; marketplace:products is a
    // public control row (proves the anon key itself works). The privacy probe
    // reads the two public rows that could carry personal data EXACTLY as the
    // public key sees them (marketplace:marketers, marketplace:payouts).
    const anonRead = (key) => (sbUrl && anon
      ? timed(() => safeFetch(`${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=key`, { apikey: anon, Authorization: `Bearer ${anon}` }))
      : Promise.resolve({ ok: false }));
    const anonValue = async (key) => {
      if (!sbUrl || !anon) return { ok: false };
      try {
        const r = await safeFetch(`${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, { apikey: anon, Authorization: `Bearer ${anon}` });
        if (!r.ok) return { ok: false };
        const rows = await r.json();
        return { ok: true, value: Array.isArray(rows) && rows[0] ? parseValue(rows[0].value) : null };
      } catch { return { ok: false }; }
    };
    const [authRes, rlsRes, controlRes, publicMarketers, publicPayouts, storageRes, beat, daily, subs] = await Promise.all([
      sbUrl && anon ? timed(() => safeFetch(`${sbUrl}/auth/v1/settings`, { apikey: anon })) : Promise.resolve({ ok: false }),
      anonRead("cron:beat"),
      anonRead("marketplace:products"),
      anonValue("marketplace:marketers"),
      anonValue("marketplace:payouts"),
      sbUrl && service ? timed(() => safeFetch(`${sbUrl}/storage/v1/bucket/product-images`, { apikey: service, Authorization: `Bearer ${service}` })) : Promise.resolve({ ok: false }),
      kvGet("cron:beat", null),
      kvGet("cron:daily:last", null),
      kvGet("marketplace:subscriptions", []),
    ]);
    const probeResult = async (r) => ({
      reached: Boolean(r.ok && r.v),
      httpOk: Boolean(r.ok && r.v?.ok),
      rows: r.ok && r.v?.ok ? await r.v.json().then((x) => (Array.isArray(x) ? x.length : null)).catch(() => null) : null,
    });
    const [privateProbe, controlProbe] = await Promise.all([probeResult(rlsRes), probeResult(controlRes)]);
    const rlsOpen = classifyRlsProbe({ privateProbe, controlProbe, privateKeyExists: beat != null });
    const pii = publicMarketers.ok && publicPayouts.ok ? publicPiiCounts(publicMarketers.value, publicPayouts.value) : null;
    let jobs = [];
    try {
      const { AUTONOMOUS_JOBS } = await import("../../src/lib/cloud/autonomousJobs.js");
      jobs = await Promise.all(AUTONOMOUS_JOBS.map(async (id) => ({ id, state: (await kvGet(`growth:job:${id}`, null)) || {} })));
    } catch { jobs = []; }
    const pubProofs = data.publications.filter((r) => r?.status === "PUBLISHED").map((r) => verifyPublication(r, { publicFeedIds: data.publicFeedIds, now: t }));
    const media = data.scope.map((p) => productMediaTruth(p, data.perProduct.get(String(p.id))?.ugc || []));
    const subList = Array.isArray(subs) ? subs : [];
    const probes = {
      db: { ok: dbRead.ok && Array.isArray(dbRead.v), ms: dbRead.ms, error: dbRead.error },
      auth: { configured: Boolean(sbUrl && anon), reachable: Boolean(authRes.ok && authRes.v?.ok) },
      payments: {
        paypalConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
        webhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID),
        // Monthly plans: env ids (legacy) or the self-provisioned mapping
        // (paypal.js ensureBillingPlans, cached in marketplace:paypal_plans).
        plansTotal: SUBSCRIPTION_PLAN_ENV.length,
        plansConfigured: SUBSCRIPTION_PLAN_ENV.filter((k) => Boolean(env[k])).length,
        missingPlans: SUBSCRIPTION_PLAN_ENV.filter((k) => !env[k]),
        ...(await probePayPal()),
        pending: subList.filter((s) => s?.status === "pending").length,
        active: subList.filter((s) => s?.status === "active").length,
      },
      publishing: {
        verified: pubProofs.filter((x) => x.verified).length,
        unverified: pubProofs.filter((x) => !x.verified).length,
        externalConnected: channels.some((c) => ["telegram", "webhook"].includes(c.provider) && c.connected),
      },
      merchant: {
        eligible: merchantEligibleCount,
        total: data.products.length,
        topReason: passports.find((p) => !p.merchant.eligible)?.merchant.reasons[0]?.he || null,
        avgReadiness: passports.length ? Math.round(passports.reduce((s, p) => s + (p.merchant.readiness?.score || 0), 0) / passports.length) : 0,
      },
      autopilot: {
        lastBeatAt: Number(beat?.lastBeatAt) || null,
        lastMode: beat?.lastMode || null,
        lastDailyAt: Number(daily?.at) || null,
        cronSecret: Boolean(env.CRON_SECRET),
        total: jobs.length,
        failed: jobs.filter((j) => String(j.state.state || "").toLowerCase() === "failed").length,
        overdue: jobs.filter((j) => j.state.nextRunAt && Number(j.state.nextRunAt) < t - 30 * 60 * 1000).length,
      },
      ugc: {
        realVideos: media.reduce((s, m) => s + m.inventory.realVideos, 0),
        syntheticAnimations: media.reduce((s, m) => s + (m.inventory.syntheticAnimations || 0), 0),
        syntheticImages: media.reduce((s, m) => s + m.inventory.syntheticImages, 0),
        images: media.filter((m) => m.state === MEDIA_TRUTH.STATIC_IMAGE).length,
        // A stock photo is not a product image (catalogIntegrity.imageProvenance).
        realProductPhotos: data.products.filter((p) => isRealProductPhoto(p?.image)).length,
        stockPhotos: data.products.filter((p) => imageProvenance(p?.image) === IMAGE_PROVENANCE.STOCK).length,
        sharedAffiliateLinks: [...sharedAffiliateLinks(data.products).values()].reduce((s, ids) => s + ids.length, 0),
      },
      storage: await probeStorage({ storageRes, sbUrl, anon, service, t }),
      tracking: { clicks: data.clicks.length, lastClickAt: data.clicks.reduce((m, c) => Math.max(m, Number(c?.ts) || 0), 0) || null },
      publicPages: { publicProducts: passports.filter((p) => p.isPublic).length, seoComplete: passports.filter((p) => p.isPublic && p.seo.audit.passed === p.seo.audit.total).length },
      agentCommerce: (() => {
        const pub = passports.filter((p) => p.isPublic && p.agentCommerce);
        const missing = {};
        for (const p of pub) for (const m of p.agentCommerce.missing) missing[m.he] = (missing[m.he] || 0) + 1;
        const top = Object.entries(missing).sort((a, b) => b[1] - a[1])[0] || null;
        return {
          total: pub.length,
          ready: pub.filter((p) => p.agentCommerce.ready).length,
          topMissing: top ? { he: top[0], count: top[1] } : null,
          availabilityUnstated: pub.filter((p) => p.agentCommerce.availability === "not_stated_merchant_stock_unverified").length,
        };
      })(),
      channels: channels.map((c) => ({ provider: c.provider, label: c.label, connected: c.connected, stateHe: CHANNEL_STATE_LABEL[c.state] || "לא ידוע" })),
      security: {
        rlsOpen,
        publicEmails: pii?.emails ?? null,
        publicPaymentDetails: pii?.payment ?? null,
        secretsTotal: SERVER_SECRETS.length,
        secretsPresent: SERVER_SECRETS.filter((k) => Boolean(env[k])).length,
        missing: SERVER_SECRETS.filter((k) => !env[k]),
      },
      deployment: { sha: env.VERCEL_GIT_COMMIT_SHA || null, env: env.VERCEL_ENV || null },
    };
    systemCache = { at: t, probes };
    return probes;
  }

  return async function discoveryHandler(req, res) {
    if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) { json(res, { ok: false, error: "origin_not_allowed" }, 403, req); return; }
    const url = new URL(req.url, "https://x");
    const action = url.searchParams.get("action") || "";

    try {
      // ── public, read-only ──
      if (req.method === "GET" && action === "passport") {
        const productId = String(url.searchParams.get("productId") || "").slice(0, 120);
        if (!productId) { json(res, { ok: false, error: "product_id_required" }, 400, req); return; }
        const out = await publicPassport({ kvGet, productId, env, now: now() });
        json(res, out, out.ok ? 200 : 404, req);
        return;
      }
      if (req.method === "GET" && action === "channels") {
        const data = await loadDiscoveryData(kvGet, { productIds: [] });
        const eligible = data.products.filter((p) => merchantStatus(p, data.marketers).eligible).length;
        const channels = buildChannelRegistry({ env: channelEnv(env), publications: data.publications, merchantEligibleCount: eligible });
        json(res, { ok: true, channels: forViewer(channels, false).map(({ provider, label, state, connected, capabilities, requirement, lastPublication, lastError }) => ({ provider, label, state, connected, capabilities, requirement, lastPublication, lastError })) }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "sweep-status") {
        const last = await kvGet(KEYS.sweep, null);
        json(res, { ok: true, sweep: last ? {
          at: last.at, products: last.products, assetsWritten: last.assetsWritten, assetsUpToDate: last.assetsUpToDate,
          snapshotsWritten: last.snapshotsWritten, avgScore: last.avgScore, avgMerchantReadiness: last.avgMerchantReadiness ?? null,
          merchantEligible: last.merchantEligible, evidence: last.evidence, failures: last.failures,
        } : null }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "commands") {
        json(res, { ok: true, commands: Object.entries(LUNA_COMMANDS).map(([id, c]) => ({ id, label: c.he, requiresProduct: Boolean(c.requiresProduct) })) }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "capabilities") {
        json(res, { ok: true, capabilities: listCapabilities() }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "laws") {
        json(res, { ok: true, laws: LAWS }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "system-check") {
        // Owner/admin sessions get private counts and env names; the public
        // view keeps colors + non-sensitive evidence only.
        let audience = "public";
        if (header(req, "authorization")) {
          const who = await identify(req);
          if (who.ok && (who.admin || who.platformOwner)) audience = "owner";
        }
        const probes = await probeSystem();
        json(res, { ok: true, audience, check: evaluateSystem(probes, { audience, now: now() }) }, 200, req);
        return;
      }

      // Publication proof (src/lib/publishing/orchestrator.js) — public and
      // read-only: everything in it is already public (asset URLs, public page
      // URLs, provider post ids). No credential names, no private fields.
      if (req.method === "GET" && action === "publication-proof") {
        const assetId = String(url.searchParams.get("asset") || "").slice(0, 120);
        if (!assetId) {
          const ledger = await kvGet(LEDGER_KEY, []);
          json(res, { ok: true, ledger: (Array.isArray(ledger) ? ledger : []).map(({ fingerprint, ...e }) => e) }, 200, req);
          return;
        }
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(assetId)) { json(res, { ok: false, error: "bad_asset_id" }, 400, req); return; }
        // live=1: verify NOW over the public URLs (read-only — nothing is
        // written; the stored proof comes from the sweep). Rate-limited per IP.
        if (url.searchParams.get("live") === "1") {
          const ip = String(header(req, "x-forwarded-for") || "anon").split(",")[0].trim().slice(0, 64);
          if (!rateAllowed(`live-proof:${ip}`, 6)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return; }
          const keys = ["marketplace:products", "marketplace:marketers", "marketplace:videos", "marketplace:clicks", "brand_pulse:posts", "publish:log", "publish:instagram"];
          const [products, marketers, videos, clicks, posts, log, instagram] = await Promise.all(keys.map((k) => kvGet(k, null)));
          if (!Array.isArray(products) || !Array.isArray(marketers) || !Array.isArray(videos)) { json(res, { ok: false, error: "kv_read_failed" }, 503, req); return; }
          const { entries } = buildLedger({ videos, products, marketers, clicks: clicks || [], posts: posts || [], log: log || [], instagram, env });
          const entry = entries.find((e) => e.assetId === assetId);
          if (!entry) { json(res, { ok: false, error: "not_a_creative", assetId }, 404, req); return; }
          const live = await verifyEntry(entry, { fetchImpl, now: now() });
          json(res, { ok: true, stored: false, proof: publicProof(live) }, 200, req);
          return;
        }
        const proof = await kvGet(PROOF_KEY(assetId), null);
        json(res, proof ? { ok: true, proof: publicProof(proof) } : { ok: false, error: "not_checked_yet", assetId }, proof ? 200 : 404, req);
        return;
      }

      // ── owner-scoped ──
      const ownerActions = new Set(["media-ledger", "overview", "memory", "entitlement", "goal", "command", "rollback", "campaign", "campaigns", "recruit", "quotas", ...DISTRIBUTION_ACTIONS]);
      if (!ownerActions.has(action)) { json(res, { ok: false, error: "unknown_action" }, 400, req); return; }
      const who = await identify(req);
      if (!who.ok) { json(res, { ok: false, error: who.error }, who.status, req); return; }
      const scope = { marketerIds: who.admin ? null : who.marketerIds, actor: who.actor };
      const scopeKey = scope.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";

      // The creative + publication ledger for the Studio: generation, truth,
      // every destination's status / id / proof, tracking. Credential NAMES
      // only for the platform owner / admin.
      if (req.method === "GET" && action === "media-ledger") {
        const privileged = Boolean(who.admin || who.platformOwner);
        const [ledger, autopilotStore] = await Promise.all([kvGet(LEDGER_KEY, []), privileged ? kvGet("marketplace:autopilot", {}) : Promise.resolve({})]);
        const mine = (Array.isArray(ledger) ? ledger : []).filter((e) => privileged || !scope.marketerIds || scope.marketerIds.includes(String(e.marketerId || "")));
        const proofs = await Promise.all(mine.slice(0, 20).map((e) => kvGet(PROOF_KEY(e.assetId), null)));
        const destinations = externalDestinations(env, autopilotStore || {}).map((d) => (privileged ? d : { id: d.id, he: d.he, scope: d.scope, status: d.status }));
        json(res, {
          ok: true,
          providers: videoProviders().map((p) => ({ id: p.id, he: p.he, kind: p.kind, output: p.output, truth: p.truth, ...(privileged ? { executor: p.executor, requiredCredentials: p.requiredCredentials } : {}) })),
          destinations,
          ledger: mine.map(({ fingerprint, ...e }) => e),
          proofs: proofs.filter(Boolean).map((p) => (privileged ? p : publicProof(p))),
        }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "campaigns") {
        json(res, { ok: true, campaigns: await listCampaigns({ kvGet, scope }) }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "entitlement") {
        const ent = await entitlementFor(who);
        json(res, { ok: true, entitlement: ent }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "memory") {
        const ent = await entitlementFor(who);
        json(res, await memoryAnswer({ kvGet, scope, depth: ent.capabilities.memoryDepth }), 200, req);
        return;
      }
      // Light "מה כלול במסלול" read: the plan, this month's usage and the product count.
      if (req.method === "GET" && action === "quotas") {
        const [ent, used, products] = await Promise.all([entitlementFor(who), kvGet(quotaStoreKey(scopeKey, now()), {}), kvGet("marketplace:products", [])]);
        const mine = (Array.isArray(products) ? products : []).filter((p) => p && (!scope.marketerIds || scope.marketerIds.includes(String(p.marketerId)))).length;
        json(res, { ok: true, plan: ent.plan, month: monthKey(now()), limits: ent.capabilities.quotas, used: { ...(used || {}), maxProducts: mine } }, 200, req);
        return;
      }
      if (req.method === "GET" && action === "overview") {
        const full = await loadDiscoveryData(kvGet, { productIds: [] });
        const ids = full.products.filter((p) => !scope.marketerIds || scope.marketerIds.includes(String(p.marketerId))).map((p) => String(p.id));
        const data = await loadDiscoveryData(kvGet, { productIds: ids });
        const { passports, channels } = computePassports(data, { env, now: now() });
        const [log, sweep, ent] = await Promise.all([kvGet(KEYS.log(scopeKey), []), kvGet(KEYS.sweep, null), entitlementFor(who)]);
        json(res, {
          ok: true,
          passports,
          channels: forViewer(channels, who.admin || who.platformOwner),
          // Persisted share/content assets (owner-only) so the studio can show
          // what Luna already prepared without re-running a goal.
          assets: Object.fromEntries(passports.map((p) => {
            const a = data.perProduct.get(p.productId)?.assets;
            const current = a && a.share && (a.fingerprint === p.fingerprint || a.pinnedFor === p.fingerprint);
            return [p.productId, current ? { share: a.share, drafts: a.drafts, hasPrevious: Boolean(a.previous?.share), restoredAt: a.restoredAt || null } : null];
          })),
          log: (Array.isArray(log) ? log : []).slice(-10).reverse(),
          sweep: sweep ? { at: sweep.at, products: sweep.products, avgScore: sweep.avgScore } : null,
          entitlement: { plan: ent.plan, status: ent.status, source: ent.source, reason: ent.reason, maxProductsPerRun: ent.capabilities.maxProductsPerRun },
          // This month's usage against the published quotas (the "מה כלול במסלול" view).
          quotas: { month: monthKey(now()), limits: ent.capabilities.quotas, used: (await kvGet(quotaStoreKey(scopeKey, now()), {})) || {} },
        }, 200, req);
        return;
      }

      // Distribution plans, content export, click stats (api/_utils/distributionRoutes.mjs).
      if (await handleDistribution({
        action, req, res, json, kvGet, kvSet, who, scope, scopeKey, now, entitlementFor, quotaGate, quotaUse, quotaRefusal, rateAllowed, env, fetchImpl,
        readJson: (r) => readBody(r).catch(() => null),
      })) return;

      if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
      if (!rateAllowed(who.actor)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return; }
      const body = (await readBody(req).catch(() => null)) || {};
      const productId = body.productId ? String(body.productId).slice(0, 120) : null;

      if (action === "campaign") {
        const goal = String(body.goal || "").trim().slice(0, 300);
        if (!goal) { json(res, { ok: false, error: "goal_required" }, 400, req); return; }
        const ids = (Array.isArray(body.productIds) ? body.productIds : productId ? [productId] : []).map((x) => String(x).slice(0, 120)).slice(0, 50);
        if (!ids.length) { json(res, { ok: false, error: "product_id_required" }, 400, req); return; }
        const entitlement = await entitlementFor(who);
        const gate = await quotaGate(entitlement, scopeKey, "campaigns");
        if (!gate.allowed) { json(res, quotaRefusal(gate), gate.error === QUOTA_ERROR.EXCEEDED ? 429 : 402, req); return; }
        const out = await createCampaign({ kvGet, kvSet, goal, productIds: ids, scope, entitlement, now: now() });
        if (out.ok && out.status === "executed") await quotaUse(scopeKey, "campaigns");
        json(res, out, out.ok ? 200 : out.error === "not_owner" ? 403 : out.error === "product_not_found" ? 404 : 400, req);
        return;
      }
      if (action === "recruit") {
        if (!productId) { json(res, { ok: false, error: "product_id_required" }, 400, req); return; }
        // recruit_creator is OWNER_EXPLICIT and draft-only: this API has no
        // send path at all. A send request is refused (deliverInvitation needs
        // explicit owner permission, which no API request can carry).
        if (body.send === true || body.deliver === true) {
          try { deliverInvitation(null, { permission: PERMISSION.SESSION }); } catch (e) {
            json(res, { ok: false, error: e?.code || "owner_explicit_required" }, 403, req);
            return;
          }
        }
        const recruitEnt = await entitlementFor(who);
        const gate = await quotaGate(recruitEnt, scopeKey, "recruitDrafts");
        if (!gate.allowed) { json(res, quotaRefusal(gate), gate.error === QUOTA_ERROR.EXCEEDED ? 429 : 402, req); return; }
        const out = await recruitForProduct({ kvGet, productId, scope });
        if (out.ok) await quotaUse(scopeKey, "recruitDrafts");
        json(res, out, out.ok ? 200 : out.error === "not_owner" ? 403 : 404, req);
        return;
      }
      if (action === "rollback") {
        if (!productId) { json(res, { ok: false, error: "product_id_required" }, 400, req); return; }
        const out = await rollbackAssets({ kvGet, kvSet, productId, scope, now: now() });
        json(res, out, out.ok ? 200 : out.error === "not_owner" ? 403 : out.error === "product_not_found" ? 404 : 400, req);
        return;
      }

      const entitlement = await entitlementFor(who);
      let out;
      if (action === "goal") {
        const goal = String(body.goal || "").trim().slice(0, 300);
        if (!goal) { json(res, { ok: false, error: "goal_required" }, 400, req); return; }
        out = await runIntent({ kvGet, kvSet, goal, productId, scope, entitlement, env, now: now() });
      } else {
        const command = String(body.command || "");
        if (!LUNA_COMMANDS[command]) { json(res, { ok: false, error: "unknown_command" }, 400, req); return; }
        out = await runCommand({ kvGet, kvSet, command, productId, scope, entitlement, env, now: now() });
      }
      const status = out.ok ? 200 : out.error === "not_owner" ? 403 : out.error === "product_not_found" ? 404 : 400;
      if (out.ok) out.channels = forViewer(out.channels, who.admin || who.platformOwner);
      json(res, out, status, req);
    } catch (e) {
      json(res, { ok: false, error: "internal_server_error", detail: String(e?.message || e).slice(0, 160) }, 500, req);
    }
  };
}

let defaultHandler = null;

/** Production wiring: guarded kv helpers from store.mjs + real auth. */
export default async function discoveryHandler(req, res) {
  if (!defaultHandler) {
    const [{ kvGet, kvSet }, { verifyToken }, { verifyAdminToken }] = await Promise.all([
      import("../store.mjs"),
      import("./authVerify.js"),
      import("./adminAuth.js"),
    ]);
    defaultHandler = createDiscoveryHandler({
      kvGet: async (key, fallback) => {
        const v = await kvGet(key);
        return v == null ? fallback : v;
      },
      kvSet,
      verifyToken,
      verifyAdminToken,
    });
  }
  return defaultHandler(req, res);
}
