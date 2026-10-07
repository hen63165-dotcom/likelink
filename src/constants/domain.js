// Provider-neutral public-origin utilities.
// No deployment provider is a source of truth. In a browser, the current
// origin is authoritative; server code uses PUBLIC_ORIGIN/LIKELINK_BASE_URL
// when it must emit an absolute URL, otherwise it derives the request origin.

export const PRODUCTION_ORIGIN = "";

export const LEGACY_ORIGINS = Object.freeze([
  "https://likelink.com",
  "https://www.likelink.com",
  "https://likelink.app",
  "https://www.likelink.app",
]);

export const LEGACY_HOSTS = Object.freeze([
  "likelink.com",
  "www.likelink.com",
  "likelink.app",
  "www.likelink.app",
]);

export function publicOrigin(fallback) {
  const explicit = String(import.meta?.env?.VITE_PUBLIC_ORIGIN || "").trim();
  if (explicit && !isLegacyOrigin(explicit)) return stripTrailingSlash(explicit);

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (!isLegacyOrigin(origin)) return stripTrailingSlash(origin);
  }

  if (fallback && !isLegacyOrigin(fallback)) return stripTrailingSlash(fallback);
  return PRODUCTION_ORIGIN || "http://localhost:8787";
}

export function isLegacyOrigin(value) {
  const host = hostOf(value);
  return !!host && LEGACY_HOSTS.includes(host);
}

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
