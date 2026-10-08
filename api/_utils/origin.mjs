// ─── Server-side SINGLE SOURCE OF TRUTH — public production origin ──────────
//
// Mirror of src/constants/domain.js for serverless functions. Never hardcode
// an origin in an api/<name>.mjs file — call originFromRequest(req) instead.
//
// Resolution order:
//   1. PUBLIC_ORIGIN env var (explicit, wins — set this for a custom domain)
//   2. LIKELINK_BASE_URL env var (legacy-compatible, explicit)
//   3. the live request host (x-forwarded-host / host) — so preview
//      deployments and custom domains resolve themselves correctly
//   4. PRODUCTION_ORIGIN
//
// A legacy `likelink.com` host header is refused at step 3 so a stale /
// hijacked Host can never turn into an emitted canonical URL.
// ────────────────────────────────────────────────────────────────────────────

/** Canonical production origin — the source of truth. */
export const PRODUCTION_ORIGIN = "https://likelink2.vercel.app";

/** Legacy placeholder hosts that must never be emitted or trusted. */
export const LEGACY_HOSTS = Object.freeze([
  "likelink.com",
  "www.likelink.com",
  "likelink.app",
  "www.likelink.app",
]);

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envOrigin() {
  for (const key of ["PUBLIC_ORIGIN", "LIKELINK_BASE_URL"]) {
    const raw = String(process.env[key] || "").trim();
    if (!raw) continue;
    if (isLegacyOrigin(raw)) continue;
    return stripTrailingSlash(raw);
  }
  return "";
}

/** Lowercase hostname from an origin, URL or bare host ("" when unparseable). */
export function hostOf(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
}

/** True when an origin/URL/bare host resolves to a legacy placeholder host. */
export function isLegacyOrigin(value) {
  const host = hostOf(value);
  if (!host) return false;
  return LEGACY_HOSTS.includes(host);
}

function headerOf(req, name) {
  const h = req?.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

/** The origin implied by the incoming request, or "" when unknown/legacy. */
export function requestOrigin(req) {
  const proto = String(headerOf(req, "x-forwarded-proto") || "https").split(",")[0].trim() || "https";
  const host = String(headerOf(req, "x-forwarded-host") || headerOf(req, "host") || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const origin = `${proto}://${host.replace(/:\d+$/, "")}`;
  if (isLegacyOrigin(origin)) return "";
  return origin;
}

/**
 * Resolve the public origin for emitted URLs.
 * @param {object} [req] incoming request (optional)
 * @returns {string} origin, no trailing slash — never a legacy domain
 */
export function originFromRequest(req) {
  return envOrigin() || requestOrigin(req) || PRODUCTION_ORIGIN;
}

/** Join an absolute path onto the resolved public origin. */
export function publicUrl(req, path = "/") {
  const base = originFromRequest(req);
  const suffix = String(path || "/");
  return `${base}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
