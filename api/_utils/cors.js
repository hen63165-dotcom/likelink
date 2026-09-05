/**
 * CORS Utility — Centralized CORS policy for LikeLink APIs.
 *
 * PURPOSE:
 *   Provides consistent, secure CORS headers across all API endpoints.
 *   Replaces inline `access-control-allow-origin: *` with proper validation.
 *
 * APPROVED ORIGINS:
 *   - localhost (development)
 *   - likelink.com
 *   - www.likelink.com
 *   - Studio subdomains (*.studios.likelink.com) — future
 *
 * SECURITY NOTES:
 *   - Credentials (cookies, auth headers) require explicit origin, not wildcard
 *   - Preflight requests (OPTIONS) are handled automatically
 *   - Production should never use wildcard `*` for credentialed requests
 */

const APPROVED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://likelink.com",
  "https://www.likelink.com",
]);

const APPROVED_PATTERN = /^(https?:\/\/)([a-z0-9-]+\.)*likelink\.com$/;

export function isApprovedOrigin(origin) {
  if (!origin) return false;
  const normalized = origin.toLowerCase().trim();
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
