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
// The token is HMAC-SHA256 signed (payload.exp) with ADMIN_SESSION_SECRET
// (or a deterministic derivation of the admin code when the secret is unset),
// TTL 8h, verified in constant time. Wrong-code attempts are rate-limited
// per IP and answered with a small artificial delay to blunt brute force.

import crypto from "crypto";

const ADMIN_CODE = process.env.ADMIN_CODE || "";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash("sha256").update(`likelink:${ADMIN_CODE}:admin-session`).digest("hex");

const TTL_MS = 8 * 60 * 60 * 1000; // 8h admin session
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

// Per-lambda best-effort rate limiting (each cold start resets it — combined
// with the 400ms delay and a strong random code this is solid for a solo admin).
const attempts = new Map(); // ip → [ts]

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
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

const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function makeToken() {
  const payload = b64url(JSON.stringify({ exp: Date.now() + TTL_MS, v: 1 }));
  return `${payload}.${sign(payload)}`;
}

function checkToken(token) {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const expected = sign(payload);
    const ab = Buffer.from(sig);
    const bb = Buffer.from(expected);
    if (ab.length !== bb.length || !crypto.timingSafeEqual(ab, bb)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });

  // ── GET: verify an existing admin session token ──
  if (req.method === "GET") {
    const h = req.headers;
    const auth = (typeof h?.get === "function" ? h.get("authorization") : h?.authorization) || "";
    const token = String(auth).replace(/^Bearer\s+/i, "");
    const data = checkToken(token);
    if (!data) return json({ ok: false, error: "invalid_token" }, 401);
    return json({ ok: true, expiresInLeft: data.exp - Date.now() });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // ── POST: exchange the admin code for a session token ──
  if (!ADMIN_CODE) return json({ ok: false, error: "server_not_configured" }, 503);

  const ip = clientIp(req);
  if (isRateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

  let code = "";
  try {
    const body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
    code = String(body?.code || "");
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const ok = code.length > 0 && safeEqual(code, ADMIN_CODE);

  if (!ok) {
    noteAttempt(ip);
    await new Promise((r) => setTimeout(r, 400)); // blunt brute force
    return json({ ok: false, error: "invalid_code" }, 401);
  }

  attempts.delete(ip);
  return json({ ok: true, token: makeToken(), expiresIn: TTL_MS });
}
