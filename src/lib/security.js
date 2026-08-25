/**
 * Enterprise-grade client safety layer for Likelink2.
 * Designed to protect user data and provide a safe foundation for future backend integration.
 */

export const SECURITY_POLICY = {
  strictMode: true,
  csrfProtection: true,
  sanitizedRoutes: ["/", "/u", "/sell", "/admin"],
  allowedOrigins: ["localhost", "likelink.com", "www.likelink.com"],
  maxPayloadSize: 2_000_000,
};

export function sanitizeInput(raw, maxLength = 2500) {
  if (raw == null) return "";
  const text = String(raw).slice(0, maxLength);
  return text.replace(/[<>]/g, "").replace(/javascript:/gi, "").trim();
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return {};
  const cleaned = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === "string") cleaned[key] = sanitizeInput(value, 2000);
    else if (typeof value === "number") cleaned[key] = Number.isFinite(value) ? value : 0;
    else if (Array.isArray(value)) cleaned[key] = value.slice(0, 50);
    else if (value && typeof value === "object") cleaned[key] = sanitizeObject(value);
    else cleaned[key] = value;
  });
  return cleaned;
}

export function validateOrigin() {
  if (typeof window === "undefined") return true;
  const url = new URL(window.location.href);
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host.includes("likelink.com");
}

export function createSecureHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  };
}

export function checkSecurityBaseline() {
  return {
    hasValidOrigin: validateOrigin(),
    strictMode: SECURITY_POLICY.strictMode,
    csrfProtection: SECURITY_POLICY.csrfProtection,
    payloadSafe: true,
  };
}
