// ─── SINGLE SOURCE OF TRUTH — public production origin ──────────────────────
//
// The one and only canonical production origin for LikeLink2.
// Every public URL the platform emits (canonical, og:url, og:image,
// sitemap, robots Sitemap line, JSON-LD @id/url, g:link, share links,
// referral links) resolves from THIS constant.
//
// RULES:
//   1. Never hardcode an origin anywhere else — import from here.
//   2. `likelink.com` / `www.likelink.com` are NOT ours. They must never be
//      emitted as a production address (a legacy placeholder from the first
//      draft) and must never be trusted as an allowed origin.
//   3. index.html cannot import ESM at parse time, so it mirrors this value.
//      `tests/domainOrigin.test.mjs` fails the build if the two ever diverge.
//
// Override per-environment (preview / self-hosted) with VITE_PUBLIC_ORIGIN.
// ────────────────────────────────────────────────────────────────────────────

/** Canonical production origin — the source of truth. */
export const PRODUCTION_ORIGIN = "https://likelink2.vercel.app";

/** Legacy placeholder hostnames. Kept ONLY so we can detect and refuse them. */
export const LEGACY_ORIGINS = Object.freeze([
  "https://likelink.com",
  "https://www.likelink.com",
  "https://likelink.app",
  "https://www.likelink.app",
]);

/** Hostnames (no scheme) that are never a valid LikeLink2 origin. */
export const LEGACY_HOSTS = Object.freeze([
  "likelink.com",
  "www.likelink.com",
  "likelink.app",
  "www.likelink.app",
]);

/**
 * The origin this module should resolve URLs against.
 *
 * Order: explicit VITE_PUBLIC_ORIGIN override → the real browser origin when
 * running in a browser → the canonical production origin. Node-safe: `window`
 * is undefined in scripts / tests / serverless, so this never throws.
 *
 * @param {string} [fallback] optional origin to use instead of production.
 * @returns {string} origin with no trailing slash, never the legacy domain.
 */
export function publicOrigin(fallback) {
  const explicit = String(import.meta?.env?.VITE_PUBLIC_ORIGIN || "").trim();
  if (explicit) return stripTrailingSlash(explicit);

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (!isLegacyOrigin(origin)) return stripTrailingSlash(origin);
  }

  if (fallback && !isLegacyOrigin(fallback)) return stripTrailingSlash(fallback);
  return PRODUCTION_ORIGIN;
}

/** True when a full origin (or bare host) is a legacy placeholder host. */
export function isLegacyOrigin(value) {
  const host = hostOf(value);
  if (!host) return false;
  return LEGACY_HOSTS.includes(host);
}

/** Extract a lowercase hostname from an origin, URL or bare host. */
export function hostOf(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}
