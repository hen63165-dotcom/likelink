/**
 * CORS Utility — Centralized CORS policy for LikeLink APIs.
 *
 * PURPOSE:
 *   Provides consistent, secure CORS headers across all API endpoints.
 *   Replaces inline `access-control-allow-origin: *` with proper validation.
 *
 * APPROVED ORIGINS:
 *   - localhost (development)
 *   - https://likelink2.vercel.app (production)
 *   - any custom domain listed in the PUBLIC_ORIGIN / ALLOWED_ORIGINS env vars
 *
 * NOTE: `likelink.com` / `likelink.app` are NOT owned by this project and are
 * deliberately rejected — trusting a host we do not control would let a third
 * party make credentialed cross-origin calls against our API.
 *
 * SECURITY NOTES:
 *   - Credentials (cookies, auth headers) require explicit origin, not wildcard
 *   - Preflight requests (OPTIONS) are handled automatically
 *   - Production should never use wildcard `*` for credentialed requests
 */

// Single source of truth for the canonical production origin (mirrors
// src/constants/domain.js). Never hardcode another origin below.
import { LEGACY_HOSTS, hostOf } from "./origin.mjs";

// 🔒 Approved origins — extendable WITHOUT code change via the ALLOWED_ORIGINS
// env var (comma-separated list of exact origins, e.g. custom domains).
const ENV_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const APPROVED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://likelink2.vercel.app",
  ...String(process.env.PUBLIC_ORIGIN || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  ...ENV_ORIGINS,
]);

// 🔒 Allow our own preview/deploy subdomains (e.g. likelink2-git-branch.vercel.app)
// but NEVER a host we do not control. `*.vercel.app` is ours only when it
// belongs to this project; we accept the project prefix explicitly.
const APPROVED_PATTERN = /^https:\/\/likelink2(-[a-z0-9-]+)?\.vercel\.app$/;

export function isApprovedOrigin(origin) {
  if (!origin) return false;
  const normalized = origin.toLowerCase().trim();
  // Refuse legacy placeholder hosts we do not own, even if someone lists them
  // in ALLOWED_ORIGINS by mistake.
  if (LEGACY_HOSTS.includes(hostOf(normalized))) return false;
  if (APPROVED_ORIGINS.has(normalized)) return true;
  if (APPROVED_PATTERN.test(normalized)) return true;
  return false;
}

export function getCorsOrigin(req) {
  const h = req.headers;
  const getHeader = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]) || "";
  const origin = getHeader("origin") || getHeader("Origin") || "";

  if (!origin) return null;

  if (isApprovedOrigin(origin)) {
    return origin;
  }

  return null;
}

export function createCorsHeaders(req, options = {}) {
  const {
    allowMethods = ["GET", "POST", "OPTIONS"],
    allowHeaders = ["content-type", "authorization"],
    exposeHeaders = [],
    maxAge = 86400,
    credentials = true,
  } = options;

  const origin = getCorsOrigin(req);

  const headers = {
    "Access-Control-Allow-Methods": allowMethods.join(", "),
    "Access-Control-Allow-Headers": allowHeaders.join(", "),
    "Access-Control-Max-Age": String(maxAge),
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    if (credentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  if (exposeHeaders.length > 0) {
    headers["Access-Control-Expose-Headers"] = exposeHeaders.join(", ");
  }

  return headers;
}

export function applyCors(res, req, options = {}) {
  const headers = createCorsHeaders(req, options);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

export function jsonCors(res, obj, status = 200, req, options = {}) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  applyCors(res, req, options);
  res.json(obj);
}

export function isLocalDev(req) {
  const origin = getCorsOrigin(req);
  if (!origin) return true;
  return origin.includes("localhost") || origin.includes("127.0.0.1");
}
