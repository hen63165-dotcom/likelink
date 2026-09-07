// LikeLink Cloud — Identity link endpoint.
//
// THE trusted bridge between an authenticated Auth user and a LikeLink
// marketer/studio. Every link claim is verified server-side:
//   - the Bearer token must be a valid Auth session
//   - the token's user id must match the claimed authUserId
//   - the marketer must exist in kv
//   - the marketer must not already be linked to a different auth user
//
// This runs with the SERVICE_ROLE key and is the ONLY place that writes
// profiles.marketer_id. The client never writes this column directly.

import { jsonCors } from "./_utils/cors.js";
import { audit } from "./_utils/audit.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

/**
 * Verify the Bearer token server-side by calling Supabase auth get user.
 * Returns the Auth user record or null.
 */
async function verifyToken(accessToken) {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(
    `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
    {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`kv_read_failed_${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  try {
    return JSON.parse(rows[0]?.value ?? "null");
  } catch {
    return null;
  }
}

async function profileUpsert(profileId, marketerId) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  // Partial update — only marketer_id is set here. Other columns (name, email,
  // is_admin) are managed by other flows and never touched.
  const res = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ marketer_id: marketerId }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`profile_update_failed_${res.status}`);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    json(res, { ok: true }, 200, req);
    return;
  }

  if (!SB_URL || !SB_KEY) {
    json(res, { ok: false, error: "misconfigured: service role key missing" }, 500, req);
    return;
  }

  if (req.method !== "POST") {
    json(res, { ok: false, error: "method_not_allowed" }, 405, req);
    return;
  }

  // 1. Authenticate the caller via Bearer token (verified server-side).
  const authHeader = req.headers.get?.("authorization") || "";
  const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
  const authUser = await verifyToken(token);
  if (!authUser?.id) {
    audit.logApiForbidden({ type: "unauthenticated" }, { type: "identity_link" }, { _req: req });
    json(res, { ok: false, error: "unauthenticated" }, 401, req);
    return;
  }

  // 2. Parse + validate body.
  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { authUserId, marketerId } = body || {};
  if (!authUserId || !marketerId || authUserId !== authUser.id) {
    audit.logApiForbidden(
      { type: "id_mismatch", claimed: authUserId, session: authUser.id },
      { type: "identity_link" },
      { _req: req }
    );
    json(res, { ok: false, error: "identity_mismatch" }, 403, req);
    return;
  }

  // 3. Verify the marketer exists in kv.
  const marketers = (await kvGet("marketplace:marketers")) || [];
  const marketer = marketers.find((m) => m.id === marketerId);
  if (!marketer) {
    json(res, { ok: false, error: "marketer_not_found" }, 404, req);
    return;
  }

  // 4. Claim check: is this marketer already linked to ANOTHER auth user?
  {
    const claimRes = await fetch(
      `${SB_URL}/rest/v1/profiles?marketer_id=eq.${encodeURIComponent(marketerId)}&select=id`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (claimRes.ok) {
      const existing = await claimRes.json();
      if (existing && existing.length > 0 && existing[0].id !== authUser.id) {
        audit.logApiForbidden(
          { type: "already_claimed", marketerId, by: existing[0].id },
          { type: "identity_link" },
          { _req: req }
        );
        json(res, { ok: false, error: "marketer_already_linked" }, 409, req);
        return;
      }
    }
  }

  // 5. Write the link (idempotent — PATCH on id = auth.uid).
  try {
    await profileUpsert(authUser.id, marketerId);
  } catch (e) {
    json(res, { ok: false, error: `link_write_failed: ${e.message}` }, 500, req);
    return;
  }

  audit.logApiSuccess(
    { type: "identity_linked", authUserId: authUser.id, marketerId },
    { type: "identity_link" },
    { _req: req }
  );
  json(res, { ok: true, authUserId: authUser.id, marketerId }, 200, req);
}
