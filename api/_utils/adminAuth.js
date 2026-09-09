// Shared admin session tokens — HMAC-SHA256, constant-time verification.
//
// Single source of truth used by BOTH /api/admin/auth (issue + verify) and the
// admin gates in /api/store (mode=cloud-report, campaign-share, key, bootstrap,
// repair-attribution, …). Verifying locally removes a self-HTTP round-trip and
// works in every runtime — a relative fetch('/api/...') would throw in Node's
// undici fetch, dead-locking every admin-gated store mode in production.
//
// Token format: `<base64url(json { exp, v })>.<base64url(hmac-sha256)>`
// Secret: ADMIN_SESSION_SECRET, else a deterministic derivation of ADMIN_CODE.

import crypto from "crypto";

const ADMIN_CODE = process.env.ADMIN_CODE || "";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash("sha256").update(`likelink:${ADMIN_CODE}:admin-session`).digest("hex");

const TTL_MS = 8 * 60 * 60 * 1000; // 8h admin session

/** Admin session lifetime (ms) — exposed so the issuer can report expiresIn. */
export const ADMIN_TTL_MS = TTL_MS;

const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Issue a fresh admin session token (same shape as the old /api/admin/auth token). */
export function makeAdminToken() {
  const payload = b64url(JSON.stringify({ exp: Date.now() + TTL_MS, v: 1 }));
  return `${payload}.${sign(payload)}`;
}

/** Verify + decode an admin token in constant time. Returns payload or null. */
export function verifyAdminToken(token) {
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