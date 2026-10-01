// /api/store?mode=legal — acceptance records, marketing consent, unsubscribe
// and the Elite waitlist. Dispatched from api/store.mjs (12-function limit).
//
//   GET  action=status                      → my acceptance + consent state
//   POST action=accept {version, context}   → record acceptance (signup / checkout)
//   POST action=marketing {optIn}           → explicit, separate consent (30א)
//   GET|POST action=unsubscribe&u=&sig=     → one-click removal from marketing
//   POST action=waitlist {planId}           → join a coming-soon plan's waitlist
//   GET  action=waitlist                    → owner/admin: the waitlist
//
// Identity is ALWAYS a verified Supabase session (never a client user id).
// Records are server-only kv keys (not browser-writable, not in the public
// RLS allowlist). A client can only accept the CURRENT legal version.
import crypto from "node:crypto";
import { jsonCors, isApprovedOrigin } from "./cors.js";
import { readBody } from "./readBody.mjs";
import { LEGAL_VERSION, ACCEPTANCE_DOCS } from "../../src/lib/legal/catalog.js";
import { getAllPlans } from "../../src/lib/plans.js";

export const ACCEPTANCES_KEY = "legal:acceptances";
export const MARKETING_KEY = "legal:marketing_consent";
export const WAITLIST_KEY = "plans:waitlist";
const CONTEXTS = new Set(["signup", "checkout", "renewal_notice"]);
const MARKETING_TEXT_VERSION = "2026-09-30";

const norm = (v) => String(v || "").trim().toLowerCase();
function header(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || h?.[name.toLowerCase()] || "";
}

/** Signed one-click unsubscribe link parameters (no login needed to opt out). */
export function unsubscribeSignature(userId, secret = process.env.STORE_SIGN_SECRET) {
  if (!secret) return null;
  return crypto.createHmac("sha256", String(secret)).update(`unsubscribe:${userId}`).digest("base64url");
}

/** Has this user accepted the current version of the legal pack? */
export function hasAcceptedCurrent(record) {
  return Boolean(record?.current && record.current.version === LEGAL_VERSION);
}

export function createLegalHandler({ kvGet, kvSet, verifyToken, verifyAdminToken, env = process.env, now = () => Date.now() }) {
  function json(res, obj, status, req) {
    jsonCors(res, obj, status, req, { allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
  }
  async function identity(req) {
    const token = String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    let admin = false;
    try { admin = Boolean(verifyAdminToken(token)); } catch { admin = false; }
    if (admin) return { admin: true, userId: null, email: null, owner: true };
    const user = await verifyToken(token).catch(() => null);
    if (!user?.id) return null;
    const email = norm(user.email);
    const owner = Boolean(norm(env.OWNER_EMAIL) && norm(env.OWNER_EMAIL) === email);
    return { admin: false, userId: String(user.id), email, owner };
  }
  const map = async (key) => { const v = await kvGet(key); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };

  return async function legalHandler(req, res) {
    if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) { json(res, { ok: false, error: "origin_not_allowed" }, 403, req); return; }
    const url = new URL(req.url, "https://x");
    const action = url.searchParams.get("action") || "status";
    let body = {};
    if (req.method === "POST") { try { body = (await readBody(req)) || {}; } catch { body = {}; } }

    try {
      // ── One-click unsubscribe (signed link, no session) ──
      if (action === "unsubscribe") {
        const userId = String(url.searchParams.get("u") || body.u || "").slice(0, 80);
        const sig = String(url.searchParams.get("sig") || body.sig || "");
        const expected = unsubscribeSignature(userId, env.STORE_SIGN_SECRET);
        if (!expected) { json(res, { ok: false, error: "unsubscribe_not_configured" }, 503, req); return; }
        const a = Buffer.from(sig); const b = Buffer.from(expected);
        if (!userId || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { json(res, { ok: false, error: "invalid_unsubscribe_link" }, 400, req); return; }
        const all = await map(MARKETING_KEY);
        all[userId] = { ...(all[userId] || {}), optIn: false, at: new Date(now()).toISOString(), source: "unsubscribe_link" };
        await kvSet(MARKETING_KEY, all);
        json(res, { ok: true, unsubscribed: true }, 200, req);
        return;
      }

      const who = await identity(req);
      if (!who) { json(res, { ok: false, error: "authentication_required" }, 401, req); return; }

      if (action === "status" && req.method === "GET") {
        if (!who.userId) { json(res, { ok: true, version: LEGAL_VERSION, admin: true }, 200, req); return; }
        const rec = (await map(ACCEPTANCES_KEY))[who.userId] || null;
        const mk = (await map(MARKETING_KEY))[who.userId] || null;
        const wl = ((await kvGet(WAITLIST_KEY)) || []).filter((w) => w && w.userId === who.userId).map((w) => w.planId);
        json(res, {
          ok: true,
          version: LEGAL_VERSION,
          documents: ACCEPTANCE_DOCS,
          accepted: rec?.current || null,
          needsAcceptance: !hasAcceptedCurrent(rec),
          marketing: mk ? { optIn: Boolean(mk.optIn), at: mk.at } : { optIn: false, at: null },
          waitlist: wl,
        }, 200, req);
        return;
      }

      if (action === "accept" && req.method === "POST") {
        if (!who.userId) { json(res, { ok: false, error: "user_session_required" }, 400, req); return; }
        if (String(body.version || "") !== LEGAL_VERSION) { json(res, { ok: false, error: "legal_version_outdated", version: LEGAL_VERSION }, 409, req); return; }
        const context = CONTEXTS.has(body.context) ? body.context : "signup";
        const all = await map(ACCEPTANCES_KEY);
        const prev = all[who.userId] || { history: [] };
        const entry = { version: LEGAL_VERSION, documents: ACCEPTANCE_DOCS, context, at: new Date(now()).toISOString(), ageConfirmed18: body.ageConfirmed18 === true };
        all[who.userId] = { current: entry, history: [...(prev.history || []), entry].slice(-20) };
        await kvSet(ACCEPTANCES_KEY, all);
        json(res, { ok: true, accepted: entry }, 200, req);
        return;
      }

      if (action === "marketing" && req.method === "POST") {
        if (!who.userId) { json(res, { ok: false, error: "user_session_required" }, 400, req); return; }
        if (typeof body.optIn !== "boolean") { json(res, { ok: false, error: "bad_request" }, 400, req); return; }
        const all = await map(MARKETING_KEY);
        all[who.userId] = { optIn: body.optIn, at: new Date(now()).toISOString(), source: "studio", textVersion: MARKETING_TEXT_VERSION, email: who.email };
        await kvSet(MARKETING_KEY, all);
        json(res, { ok: true, marketing: { optIn: body.optIn, at: all[who.userId].at } }, 200, req);
        return;
      }

      if (action === "waitlist") {
        const list = (await kvGet(WAITLIST_KEY)) || [];
        if (req.method === "GET") {
          if (!who.owner) { json(res, { ok: false, error: "admin_required" }, 403, req); return; }
          json(res, { ok: true, count: list.length, waitlist: list }, 200, req);
          return;
        }
        if (!who.userId) { json(res, { ok: false, error: "user_session_required" }, 400, req); return; }
        const planId = String(body.planId || "").toLowerCase();
        const plan = getAllPlans().find((p) => p.id === planId);
        if (!plan?.comingSoon) { json(res, { ok: false, error: "invalid_plan" }, 400, req); return; }
        if (list.some((w) => w && w.userId === who.userId && w.planId === planId)) { json(res, { ok: true, joined: true, existing: true }, 200, req); return; }
        await kvSet(WAITLIST_KEY, [...list, { userId: who.userId, email: who.email, planId, at: new Date(now()).toISOString() }]);
        json(res, { ok: true, joined: true }, 200, req);
        return;
      }

      json(res, { ok: false, error: "invalid_action" }, 400, req);
    } catch {
      json(res, { ok: false, error: "internal_server_error" }, 500, req);
    }
  };
}

let defaultHandler = null;
export default async function legalHandler(req, res) {
  if (!defaultHandler) {
    const [{ kvGet, kvSet }, { verifyToken }, { verifyAdminToken }] = await Promise.all([
      import("../store.mjs"),
      import("./authVerify.js"),
      import("./adminAuth.js"),
    ]);
    defaultHandler = createLegalHandler({ kvGet, kvSet, verifyToken, verifyAdminToken });
  }
  return defaultHandler(req, res);
}
