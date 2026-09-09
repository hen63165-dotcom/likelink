import crypto from "crypto";
import { readBody } from "../_utils/readBody.mjs";
import { jsonCors } from "../_utils/cors.js";
import { audit } from "../_utils/audit.js";
import { makeAdminToken, verifyAdminToken, ADMIN_TTL_MS } from "../_utils/adminAuth.js";

// Vercel Serverless Function — server-side admin authentication 🔐
//
// WHY THIS EXISTS: the old gate compared the code against VITE_ADMIN_CODE,
// which is baked into the public JS bundle — anyone could open DevTools and
// steal it. The admin code now lives ONLY in the server environment
// (ADMIN_CODE) and never reaches the browser.
//
// POST { code }            → 200 { ok, token, expiresIn }  | 401 invalid_code
//                            | 429 rate_limited | 503 server_not_configured
// GET  (Bearer token)      → 200 { ok, expiresInLeft }     | 401 invalid_token
//
// Token = HMAC-SHA256 (payload.exp, v=1), base64url, constant-time verified —
// implementation shared via _utils/adminAuth.js so /api/store can verify the
// SAME tokens directly (no self-HTTP round-trip).

const ADMIN_CODE = process.env.ADMIN_CODE || "";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

// Per-lambda best-effort rate limiting (each cold start resets it — combined
// with the 400ms delay and a strong random code this is solid for a solo admin).
const attempts = new Map(); // ip → [ts]

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

function clientIp(req) {
  const h = req.headers;
  const get = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]) || "";
  return String(get("x-forwarded-for")).split(",")[0].trim() || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((ts) => now - ts < ATTEMPT_WINDOW_MS);
  attempts.set(ip, arr);
  return arr.length >= MAX_ATTEMPTS;
}

function noteAttempt(ip) {
  const arr = attempts.get(ip) || [];
  arr.push(Date.now());
  attempts.set(ip, arr);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }

  // ── GET: verify an existing admin session token ──
  if (req.method === "GET") {
    const h = req.headers;
    const auth = (typeof h?.get === "function" ? h.get("authorization") : h?.authorization) || "";
    const token = String(auth).replace(/^Bearer\s+/i, "");
    const data = verifyAdminToken(token);
    if (!data) {
      audit.logApiForbidden({ type: "token-verify" }, { type: "admin-session" }, { _req: req });
      json(res, { ok: false, error: "invalid_token" }, 401, req);
      return;
    }
    json(res, { ok: true, expiresInLeft: data.exp - Date.now() }, 200, req);
    return;
  }

  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  // ── POST: exchange the admin code for a session token ──
  if (!ADMIN_CODE) { json(res, { ok: false, error: "server_not_configured" }, 503, req); return; }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    audit.logApiRateLimit({ type: "admin-login", ip }, { type: "admin-auth" }, { _req: req });
    json(res, { ok: false, error: "rate_limited" }, 429, req);
    return;
  }

  let code = "";
  try {
    const body = await readBody(req);
    code = String(body?.code || "");
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const ok = code.length > 0 && safeEqual(code, ADMIN_CODE);

  if (!ok) {
    noteAttempt(ip);
    await new Promise((r) => setTimeout(r, 400)); // blunt brute force
    audit.logAdminFailure({ type: "admin", ip }, { type: "admin-session" }, { _req: req });
    json(res, { ok: false, error: "invalid_code" }, 401, req);
    return;
  }

  attempts.delete(ip);
  const token = makeAdminToken();
  audit.logAdminSuccess({ type: "admin", ip }, { type: "admin-session" }, { _req: req });
  json(res, { ok: true, token, expiresIn: ADMIN_TTL_MS }, 200, req);
}
