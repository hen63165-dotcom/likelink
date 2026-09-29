// Luna API — served through api/store.mjs (?mode=discovery) to stay within
// the Vercel Hobby 12-function limit.
//
//   GET  ?mode=discovery&action=passport&productId=<id>   public, read-only
//   GET  ?mode=discovery&action=channels                  public channel states
//   GET  ?mode=discovery&action=sweep-status              public last-sweep summary
//   GET  ?mode=discovery&action=commands                  public command catalog
//   GET  ?mode=discovery&action=laws                      public operating laws
//   GET  ?mode=discovery&action=system-check              public (sanitized) / owner (detailed)
//   GET  ?mode=discovery&action=overview                  owner
//   GET  ?mode=discovery&action=memory                    owner
//   GET  ?mode=discovery&action=entitlement               owner
//   POST ?mode=discovery&action=goal    { goal, productId? }     owner
//   POST ?mode=discovery&action=command { command, productId? }  owner
//   POST ?mode=discovery&action=rollback { productId }           owner
//
// Identity comes only from the verified Bearer token: a Supabase session
// (→ the marketer with the same email) or an admin token. Public reads never
// expose drafts, logs, emails, private counts or any secret; env is reported
// as booleans only and env-var names reach admins/platform owner only.
import { readBody } from "./readBody.mjs";
import { jsonCors, isApprovedOrigin } from "./cors.js";
import {
  runCommand, runIntent, publicPassport, loadDiscoveryData, computePassports, channelEnv, KEYS,
  memoryAnswer, rollbackAssets,
} from "../../src/lib/discovery/orchestrator.js";
import { buildChannelRegistry, LUNA_COMMANDS, CHANNEL_STATE_LABEL, verifyPublication } from "../../src/lib/discovery/engine.js";
import { merchantStatus } from "../../src/lib/discovery/surfaces.js";
import { resolveEntitlement, pickSubscription } from "../../src/lib/discovery/entitlements.js";
import { evaluateSystem, classifyRlsProbe, publicPiiCounts } from "../../src/lib/discovery/systemCheck.js";
import { LAWS } from "../../src/lib/discovery/laws.js";
import { productMediaTruth, MEDIA_TRUTH } from "../../src/lib/discovery/mediaTruth.js";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;
const SYSTEM_CHECK_CACHE_MS = 60000;
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

  function rateAllowed(key) {
    const t = now();
    const win = (rateMap.get(key) || []).filter((x) => t - x < RATE_WINDOW_MS);
    if (win.length >= RATE_MAX) return false;
    win.push(t);
    rateMap.set(key, win);
    return true;
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
    // public control row (proves the anon key itself works); marketplace:marketers
    // is public by design, so it is checked for private fields it still carries.
    const anonRead = (key) => (sbUrl && anon
      ? timed(() => safeFetch(`${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=key`, { apikey: anon, Authorization: `Bearer ${anon}` }))
      : Promise.resolve({ ok: false }));
    const [authRes, rlsRes, controlRes, marketerRes, storageRes, beat, daily, subs] = await Promise.all([
      sbUrl && anon ? timed(() => safeFetch(`${sbUrl}/auth/v1/settings`, { apikey: anon })) : Promise.resolve({ ok: false }),
      anonRead("cron:beat"),
      anonRead("marketplace:products"),
      anonRead("marketplace:marketers"),
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
    const [privateProbe, controlProbe, marketerProbe] = await Promise.all([probeResult(rlsRes), probeResult(controlRes), probeResult(marketerRes)]);
    const rlsOpen = classifyRlsProbe({ privateProbe, controlProbe, privateKeyExists: beat != null });
    const pii = marketerProbe.httpOk && marketerProbe.rows > 0 ? publicPiiCounts(data.marketers) : null;
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
        syntheticImages: media.reduce((s, m) => s + m.inventory.syntheticImages, 0),
        images: media.filter((m) => m.state === MEDIA_TRUTH.STATIC_IMAGE).length,
      },
      storage: { checked: Boolean(storageRes.ok), ok: Boolean(storageRes.ok && storageRes.v?.ok) },
      tracking: { clicks: data.clicks.length, lastClickAt: data.clicks.reduce((m, c) => Math.max(m, Number(c?.ts) || 0), 0) || null },
      publicPages: { publicProducts: passports.filter((p) => p.isPublic).length, seoComplete: passports.filter((p) => p.isPublic && p.seo.audit.passed === p.seo.audit.total).length },
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

      // ── owner-scoped ──
      const ownerActions = new Set(["overview", "memory", "entitlement", "goal", "command", "rollback"]);
      if (!ownerActions.has(action)) { json(res, { ok: false, error: "unknown_action" }, 400, req); return; }
      const who = await identify(req);
      if (!who.ok) { json(res, { ok: false, error: who.error }, who.status, req); return; }
      const scope = { marketerIds: who.admin ? null : who.marketerIds, actor: who.actor };
      const scopeKey = scope.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";

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
        }, 200, req);
        return;
      }

      if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
      if (!rateAllowed(who.actor)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return; }
      const body = (await readBody(req).catch(() => null)) || {};
      const productId = body.productId ? String(body.productId).slice(0, 120) : null;

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
