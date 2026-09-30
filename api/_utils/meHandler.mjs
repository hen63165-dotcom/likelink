// GET /api/store?mode=me — the caller's own private creator fields.
//
// marketplace:marketers is public and no longer carries e-mails or payout
// details (src/lib/cloud/marketerPrivacy.js). A signed-in creator gets their
// own studio id(s) + private fields here, from a VERIFIED Supabase session
// only; nobody else's record is ever returned. An admin token gets every
// creator's private fields (the admin panel shows payout destinations).
import { jsonCors, isApprovedOrigin } from "./cors.js";
import { privateFieldsOf } from "../../src/lib/cloud/marketerPrivacy.js";

const norm = (v) => String(v || "").trim().toLowerCase();

function header(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || h?.[name.toLowerCase()] || "";
}

export function createMeHandler({ kvGet, verifyToken, verifyAdminToken }) {
  function json(res, obj, status, req) {
    jsonCors(res, obj, status, req, { allowMethods: ["GET", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
  }
  return async function meHandler(req, res) {
    if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) { json(res, { ok: false, error: "origin_not_allowed" }, 403, req); return; }
    if (req.method !== "GET") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
    const token = String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) { json(res, { ok: false, error: "authentication_required" }, 401, req); return; }
    try {
      let admin = null;
      try { admin = verifyAdminToken(token); } catch { admin = null; }
      const marketers = await kvGet("marketplace:marketers");
      const list = Array.isArray(marketers) ? marketers : [];
      if (admin) {
        json(res, { ok: true, admin: true, marketers: list.filter((m) => m && m.id).map((m) => ({ id: String(m.id), ...privateFieldsOf(m) })) }, 200, req);
        return;
      }
      const user = await verifyToken(token).catch(() => null);
      const email = norm(user?.email);
      if (!email) { json(res, { ok: false, error: "authentication_required" }, 401, req); return; }
      const mine = list.filter((m) => m && m.id && norm(m.email) === email);
      json(res, { ok: true, admin: false, marketers: mine.map((m) => ({ id: String(m.id), ...privateFieldsOf(m) })) }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: "internal_server_error" }, 500, req);
    }
  };
}

let defaultHandler = null;

export default async function meHandler(req, res) {
  if (!defaultHandler) {
    const [{ kvGet }, { verifyToken }, { verifyAdminToken }] = await Promise.all([
      import("../store.mjs"),
      import("./authVerify.js"),
      import("./adminAuth.js"),
    ]);
    defaultHandler = createMeHandler({ kvGet, verifyToken, verifyAdminToken });
  }
  return defaultHandler(req, res);
}
