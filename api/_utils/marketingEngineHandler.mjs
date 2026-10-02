// Autonomous Marketing Engine API. It is served through api/store.mjs
// (?mode=growth-engine) to stay within the Vercel Hobby 12-function limit.
//
//   GET  ?mode=growth-engine&op=status[&scope=platform]   public: counts + proof ids only
//   GET  ?mode=growth-engine&op=status                    session: own studio, full log
//   POST ?mode=growth-engine&op=run      { scope? }       cron bearer (platform + enabled studios),
//                                                         admin/owner (any), session (own studio)
//   POST ?mode=growth-engine&op=enable|disable|pause|resume|settings { scope?, settings? }
//
// Identity comes only from the server: a cron bearer (CRON_SECRET /
// AUTOPILOT_SECRET), an admin token, or a Supabase session (→ the studio with
// the same e-mail). A studio's plan comes from its server-verified
// subscription (resolveEntitlement). The engine quota is ENGINE_QUOTA_KEY
// from src/lib/plans.js. Credentials never leave the server; public output
// carries no captions, links to private data, e-mails or env names.
import { readBody } from "./readBody.mjs";
import { jsonCors, isApprovedOrigin } from "./cors.js";
import { isAuthorizedCron } from "./cronAuth.mjs";
import { resolveEntitlement, pickSubscription } from "../../src/lib/discovery/entitlements.js";
import { PLATFORM_SCOPE, studioScope, parseScope, sanitizeSettings, ENGINE_QUOTA_KEY, KEYS } from "../../src/lib/growth/marketingEngine.js";
import { runCycle, setControl, engineView, engineSweep } from "../../src/lib/cloud/marketingEngineRunner.js";
import { planIncluding } from "../../src/lib/discovery/quotas.js";
import { aeStatus, importHotProducts, repairSharedLinks, dailyAffiliateImport } from "./aliexpressAffiliate.mjs";
import { sharedAffiliateLinks } from "../../src/lib/discovery/catalogIntegrity.js";

const norm = (v) => String(v || "").trim().toLowerCase();
const CONTROL_OPS = new Set(["enable", "disable", "pause", "resume", "settings"]);

function header(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

export function createMarketingEngineHandler({
  kvGet, kvSet, verifyToken, verifyAdminToken, env = process.env, now = () => Date.now(),
  requestVideo = null, channelCredentials = null, publishPost = null, cronAuthorized = (req) => isAuthorizedCron(req, [env.AUTOPILOT_SECRET]),
  rateMap = new Map(), fetchImpl = (...a) => fetch(...a),
}) {
  const json = (res, obj, status, req) => jsonCors(res, obj, status, req, { allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });

  function rateAllowed(key, max = 6) {
    const t = now();
    const win = (rateMap.get(key) || []).filter((x) => t - x < 60000);
    if (win.length >= max) return false;
    win.push(t); rateMap.set(key, win);
    return true;
  }

  async function identify(req) {
    const token = String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    let admin = null;
    try { admin = verifyAdminToken(token); } catch { admin = null; }
    if (admin) return { admin: true, platformOwner: true, marketerIds: [], userId: null };
    const user = await verifyToken(token).catch(() => null);
    const email = norm(user?.email);
    if (!email) return null;
    // store.mjs kvGet merges the server-only private fields (createPrivateKv), so e-mails resolve here only.
    const marketers = await kvGet("marketplace:marketers", []);
    const mine = (Array.isArray(marketers) ? marketers : []).filter((m) => m && norm(m.email) === email).map((m) => String(m.id));
    const platformOwner = Boolean(norm(env.OWNER_EMAIL) && norm(env.OWNER_EMAIL) === email);
    return { admin: false, platformOwner, marketerIds: mine, userId: String(user.id || "") };
  }

  async function studioEntitlement({ userId, platformOwner }) {
    if (platformOwner) return resolveEntitlement({ isPlatformOwner: true, now: now() });
    const subs = await kvGet("marketplace:subscriptions", []);
    return resolveEntitlement({ subscription: pickSubscription(subs, userId, now()), now: now() });
  }

  const deps = (entitlement, trigger) => ({
    kvGet, kvSet, env, now: now(), entitlement, trigger,
    requestVideo, channelCredentials: channelCredentials ? (scope) => channelCredentials({ kvGet, env, scope }) : null, publishPost,
  });

  /** The scope the caller may act on, or an error. */
  function resolveScope(who, wanted) {
    const w = String(wanted || "").trim();
    if (w === PLATFORM_SCOPE) return who.admin || who.platformOwner ? { scopeKey: PLATFORM_SCOPE } : { error: "platform_scope_owner_only", status: 403 };
    const parsed = w ? parseScope(w) : null;
    const marketerId = parsed?.kind === "studio" ? parsed.marketerId : who.marketerIds[0];
    if (!marketerId) return { error: "marketer_not_found", status: 403 };
    if (!who.admin && !who.marketerIds.includes(marketerId)) return { error: "not_your_studio", status: 403 };
    return { scopeKey: studioScope(marketerId) };
  }

  return async function marketingEngineHandler(req, res) {
    if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) { json(res, { ok: false, error: "origin_not_allowed" }, 403, req); return; }
    const url = new URL(req.url, "https://x");
    const op = url.searchParams.get("op") || "status";
    try {
      // ── cron: platform + every enabled studio (each with its own verified plan) ──
      if (req.method === "POST" && op === "run" && cronAuthorized(req)) {
        // The owner's affiliate account first (new promotable products), then the engine.
        const affiliate = await dailyAffiliateImport({ kvGet, kvSet, env, fetchImpl, now: now() });
        const out = { ...(await engineSweep({ kvGet, kvSet, env, now: now(), requestVideo, channelCredentials, publishPost })), affiliate };
        json(res, out, 200, req);
        return;
      }

      if (req.method === "GET" && op === "affiliate-status") {
        const last = await kvGet("affiliate:aliexpress:last", null);
        json(res, { ok: true, provider: "aliexpress_affiliate_api", configured: aeStatus(env).configured, last }, 200, req);
        return;
      }

      const who = await identify(req);

      // The owner's affiliate account (platform owner / admin, or cron above).
      if (req.method === "POST" && (op === "affiliate-import" || op === "affiliate-repair")) {
        if (!who || !(who.admin || who.platformOwner)) { json(res, { ok: false, error: who ? "owner_only" : "authentication_required" }, who ? 403 : 401, req); return; }
        const out = op === "affiliate-import"
          ? await importHotProducts({ kvGet, kvSet, env, fetchImpl, now: now(), limit: 8 })
          : await repairSharedLinks({ kvGet, kvSet, env, fetchImpl, now: now(), sharedAffiliateLinks });
        json(res, out.ok ? out : { ...out, missing: who.admin || who.platformOwner ? out.missing : undefined }, out.status || 200, req);
        return;
      }

      if (req.method === "GET" && op === "status") {
        const wanted = url.searchParams.get("scope");
        if (!who || wanted === PLATFORM_SCOPE && !(who.admin || who.platformOwner)) {
          if (wanted && wanted !== PLATFORM_SCOPE) { json(res, { ok: false, error: "authentication_required" }, 401, req); return; }
          json(res, await engineView({ kvGet, scopeKey: PLATFORM_SCOPE, full: false, now: now() }), 200, req);
          return;
        }
        const sc = resolveScope(who, wanted);
        if (sc.error) { json(res, { ok: false, error: sc.error }, sc.status, req); return; }
        const ent = sc.scopeKey === PLATFORM_SCOPE ? resolveEntitlement({ isPlatformOwner: true, now: now() }) : await studioEntitlement(who);
        const view = await engineView({ kvGet, scopeKey: sc.scopeKey, full: true, entitlement: ent, now: now() });
        json(res, { ...view, plan: ent.plan, planStatus: ent.status, upgrade: view.quota?.allowed === false ? planIncluding(ENGINE_QUOTA_KEY) : null }, 200, req);
        return;
      }

      if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
      if (!who) { json(res, { ok: false, error: "authentication_required" }, 401, req); return; }
      const body = (await readBody(req).catch(() => null)) || {};
      const sc = resolveScope(who, body.scope);
      if (sc.error) { json(res, { ok: false, error: sc.error }, sc.status, req); return; }
      if (!rateAllowed(`${sc.scopeKey}:${op}`)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return; }
      const ent = sc.scopeKey === PLATFORM_SCOPE ? resolveEntitlement({ isPlatformOwner: true, now: now() }) : await studioEntitlement(who);

      if (CONTROL_OPS.has(op)) {
        // Turning the engine on (or running it) needs a plan that includes it.
        if (op === "enable" && !(ent.capabilities?.quotas?.[ENGINE_QUOTA_KEY] === null || Number(ent.capabilities?.quotas?.[ENGINE_QUOTA_KEY]) > 0)) {
          json(res, { ok: false, error: "plan_required", plan: ent.plan, upgrade: planIncluding(ENGINE_QUOTA_KEY) }, 402, req);
          return;
        }
        const out = await setControl({ kvGet, kvSet, scopeKey: sc.scopeKey, op, settings: body.settings, owner: { userId: who.userId || null, platformOwner: Boolean(who.platformOwner) }, now: now(), sanitize: sanitizeSettings });
        json(res, out.ok ? { ok: true, scope: sc.scopeKey, enabled: out.state.enabled, paused: out.state.paused, settings: out.state.settings } : out, out.status, req);
        return;
      }
      if (op === "run") {
        const out = await runCycle(sc.scopeKey, deps(ent, who.admin ? "admin" : "owner_session"));
        const status = out.status || (out.ok ? 200 : 400);
        json(res, out.ok ? out : { ...out, upgrade: out.upgrade || (out.error === "plan_required" ? planIncluding(ENGINE_QUOTA_KEY) : null) }, status, req);
        return;
      }
      json(res, { ok: false, error: "unknown_op" }, 400, req);
    } catch (e) {
      json(res, { ok: false, error: "internal_server_error", detail: String(e?.message || e).slice(0, 160) }, 500, req);
    }
  };
}

let defaultHandler = null;

/** Production wiring: guarded kv helpers from store.mjs, real auth, the native reel queue and the publishers. */
export default async function marketingEngineHandler(req, res) {
  if (!defaultHandler) {
    const [{ kvGet, kvSet }, { verifyToken }, { verifyAdminToken }, { requestRender }, publishers] = await Promise.all([
      import("../store.mjs"),
      import("./authVerify.js"),
      import("./adminAuth.js"),
      import("../../src/lib/cloud/reelPublisher.js"),
      import("../../src/lib/discovery/publishers/index.js"),
    ]);
    const kvGetF = async (key, fallback) => {
      const v = await kvGet(key);
      return v == null ? fallback : v;
    };
    defaultHandler = createMarketingEngineHandler({
      kvGet: kvGetF,
      kvSet,
      verifyToken,
      verifyAdminToken,
      requestVideo: (productId, ownerId) => requestRender({ productId, ownerIds: [ownerId], requestedBy: "marketing_engine" }, {}),
      channelCredentials: publishers.channelCredentials,
      publishPost: (args) => publishers.publishPost(args),
    });
  }
  return defaultHandler(req, res);
}
