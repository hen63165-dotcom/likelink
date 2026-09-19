import { readBody } from "../api/_utils/readBody.mjs";
import { jsonCors } from "../api/_utils/cors.js";
import { verifyAdminToken } from "../api/_utils/adminAuth.js";
import { audit } from "../api/_utils/audit.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

async function kvGet(key, fallback = null) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : fallback;
  } catch {
    return fallback;
  }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

/**
 * Growth Job — thin wrapper around the existing growth cycle.
 * Reuses runGrowthCycle from api/autopilot.mjs without duplicating logic.
 */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const authHeader = String(getHeader(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const isAdmin = Boolean(verifyAdminToken(authHeader));

  if (!isAdmin) {
    const ownerEmail = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (ownerEmail) {
      try {
        const { verifyToken } = await import("../api/_utils/authVerify.js");
        const authUser = await verifyToken(authHeader);
        if (!authUser?.email || String(authUser.email).trim().toLowerCase() !== ownerEmail) {
          audit.logApiForbidden({ type: "non-admin" }, { type: "growth-job" }, { _req: req });
          json(res, { ok: false, error: "admin_required" }, 403, req);
          return;
        }
      } catch {
        json(res, { ok: false, error: "admin_required" }, 403, req);
        return;
      }
    } else {
      json(res, { ok: false, error: "admin_required" }, 403, req);
      return;
    }
  }

  if (!SB_URL || !SB_KEY) {
    json(res, { ok: false, error: "misconfigured: service role key missing" }, 500, req);
    return;
  }

  try {
    const { runGrowthCycle } = await import("../api/autopilot.mjs");
    const result = await runGrowthCycle();
    audit.logApiSuccess(
      { type: "growth_job", opportunities: result.opportunities, created: result.created },
      { type: "growth-job" },
      { _req: req }
    );
    json(res, { ok: true, ...result }, 200, req);
  } catch (e) {
    audit.logApiError(
      { type: "growth_job_failed", error: String(e.message || e).slice(0, 160) },
      { type: "growth-job" },
      { _req: req }
    );
    json(res, { ok: false, error: String(e.message || e).slice(0, 160) }, 500, req);
  }
}
