// Luna Discovery API — served through api/store.mjs (?mode=discovery) to stay
// within the Vercel Hobby 12-function limit.
//
//   GET  ?mode=discovery&action=passport&productId=<id>   public, read-only
//   GET  ?mode=discovery&action=channels                  public channel states
//   GET  ?mode=discovery&action=sweep-status              public last-sweep summary
//   GET  ?mode=discovery&action=overview                  owner (Bearer session / admin)
//   POST ?mode=discovery&action=command { command, productId? }  owner
//
// Identity comes only from the verified Bearer token: a Supabase session
// (→ the marketer record with the same email) or an admin token. Creators act
// on their own products only. Public reads never expose drafts, logs, emails
// or any secret; channel state is derived from BOOLEAN env presence only.
import { readBody } from "./readBody.mjs";
import { jsonCors, isApprovedOrigin } from "./cors.js";
import {
  runCommand, publicPassport, loadDiscoveryData, computePassports, channelEnv, KEYS,
} from "../../src/lib/discovery/orchestrator.js";
import { buildChannelRegistry, LUNA_COMMANDS } from "../../src/lib/discovery/engine.js";
import { merchantStatus } from "../../src/lib/discovery/surfaces.js";

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 12;

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
}) {
  function json(res, obj, status, req) {
    jsonCors(res, obj, status, req, { allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
  }

  async function identify(req) {
    const token = String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, status: 401, error: "authentication_required" };
    let admin = null;
    try { admin = verifyAdminToken(token); } catch { admin = null; }
    if (admin) return { ok: true, admin: true, marketerIds: null, actor: "admin" };
    const user = await verifyToken(token).catch(() => null);
    const email = norm(user?.email);
    if (!email) return { ok: false, status: 401, error: "authentication_required" };
    const marketers = await kvGet("marketplace:marketers", []);
    const mine = (Array.isArray(marketers) ? marketers : []).filter((m) => m && norm(m.email) === email).map((m) => String(m.id));
    if (!mine.length) return { ok: false, status: 403, error: "marketer_not_found" };
    return { ok: true, admin: false, marketerIds: mine, actor: `marketer:${mine[0]}` };
  }

  function rateAllowed(key) {
    const t = now();
    const win = (rateMap.get(key) || []).filter((x) => t - x < RATE_WINDOW_MS);
    if (win.length >= RATE_MAX) return false;
    win.push(t);
    rateMap.set(key, win);
    return true;
  }

  return async function discoveryHandler(req, res) {
    if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) { json(res, { ok: false, error: "origin_not_allowed" }, 403, req); return; }
    const url = new URL(req.url, "https://x");
    const action = url.searchParams.get("action") || "";

    try {
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
          snapshotsWritten: last.snapshotsWritten, avgScore: last.avgScore, merchantEligible: last.merchantEligible,
          evidence: last.evidence, failures: last.failures,
        } : null }, 200, req);
        return;
      }

      if (req.method === "GET" && action === "commands") {
        json(res, { ok: true, commands: Object.entries(LUNA_COMMANDS).map(([id, c]) => ({ id, label: c.he, requiresProduct: Boolean(c.requiresProduct) })) }, 200, req);
        return;
      }

      if (req.method === "GET" && action === "overview") {
        const who = await identify(req);
        if (!who.ok) { json(res, { ok: false, error: who.error }, who.status, req); return; }
        const full = await loadDiscoveryData(kvGet);
        const ids = full.products
          .filter((p) => !who.marketerIds || who.marketerIds.includes(String(p.marketerId)))
          .map((p) => String(p.id));
        const data = await loadDiscoveryData(kvGet, { productIds: ids });
        const { passports, channels } = computePassports(data, { env, now: now() });
        const scopeKey = who.marketerIds?.length === 1 ? who.marketerIds[0] : "platform";
        const [log, sweep] = await Promise.all([kvGet(KEYS.log(scopeKey), []), kvGet(KEYS.sweep, null)]);
        json(res, {
          ok: true,
          passports,
          channels: forViewer(channels, who.admin),
          // Persisted share/content assets (owner-only) so the studio can show
          // what Luna already prepared without re-running a command.
          assets: Object.fromEntries(passports.map((p) => {
            const a = data.perProduct.get(p.productId)?.assets;
            return [p.productId, a && a.fingerprint === p.fingerprint ? { share: a.share, drafts: a.drafts } : null];
          })),
          log: (Array.isArray(log) ? log : []).slice(-10).reverse(),
          sweep: sweep ? { at: sweep.at, products: sweep.products, avgScore: sweep.avgScore } : null,
        }, 200, req);
        return;
      }

      if (req.method === "POST" && action === "command") {
        const who = await identify(req);
        if (!who.ok) { json(res, { ok: false, error: who.error }, who.status, req); return; }
        if (!rateAllowed(who.actor)) { json(res, { ok: false, error: "rate_limited" }, 429, req); return; }
        const body = (await readBody(req).catch(() => null)) || {};
        const command = String(body.command || "");
        if (!LUNA_COMMANDS[command]) { json(res, { ok: false, error: "unknown_command" }, 400, req); return; }
        const productId = body.productId ? String(body.productId).slice(0, 120) : null;
        const out = await runCommand({
          kvGet, kvSet, command, productId,
          scope: { marketerIds: who.marketerIds, actor: who.actor },
          env, now: now(),
        });
        const status = out.ok ? 200 : out.error === "not_owner" ? 403 : out.error === "product_not_found" ? 404 : 400;
        if (out.ok) out.channels = forViewer(out.channels, who.admin);
        json(res, out, status, req);
        return;
      }

      json(res, { ok: false, error: "unknown_action" }, 400, req);
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
