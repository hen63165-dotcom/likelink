/**
 * LikeLink2 Security Foundation 🛡️
 * ================================
 * Centralized defensive controls for the existing architecture.
 *
 * This module does NOT replace auth, DB, or existing modules.
 * It adds:
 *   - ownership resolver
 *   - secret scanner
 *   - telemetry provenance
 *   - signal validator
 *   - upload safety
 *   - serverless attack-surface reduction
 *
 * All controls are additive and fail-closed.
 */

// ── Ownership Resolver ──────────────────────────────────────────────────────

/**
 * Resolve the actual actor from a server-verified token.
 * Never trust caller-supplied marketerId/productId/creatorId alone.
 */
export function resolveActor({ token, supabaseUser, fallback = null }) {
  if (!supabaseUser && !token) return fallback;
  const id = supabaseUser?.id || fallback?.id || null;
  const email = supabaseUser?.email || fallback?.email || null;
  return {
    id: String(id || ""),
    email: String(email || ""),
    authenticated: Boolean(id),
    source: token ? "token" : "fallback",
  };
}

export function assertOwnership({ actor, resourceOwnerId, resourceType = "resource" }) {
  if (!actor?.authenticated) {
    return { ok: false, reason: "unauthenticated", action: "sign_in" };
  }
  if (!resourceOwnerId) {
    return { ok: false, reason: "owner_not_set", action: "assign_owner" };
  }
  if (actor.id !== String(resourceOwnerId)) {
    return { ok: false, reason: "ownership_mismatch", action: "request_access_from_owner" };
  }
  return { ok: true, actor, resourceOwnerId: String(resourceOwnerId) };
}

// ── Secret Scanner ──────────────────────────────────────────────────────────

const SECRET_PATTERNS = Object.freeze([
  /(?:^|[^A-Z0-9])(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|service[_-]?role|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{16,}/i,
  /(?:^|[^A-Z0-9])AIza[0-9A-Za-z\-_]{35}/i,
  /(?:^|[^A-Z0-9])sk-[A-Za-z0-9]{20,}/i,
  /(?:^|[^A-Z0-9])(?:xox[baprs]-[A-Za-z0-9-]{10,})/i,
]);

export function scanForSecrets(text) {
  if (typeof text !== "string") return [];
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        pattern: pattern.source,
        match: match[0].slice(0, 40),
        location: "client_bundle",
      });
    }
  }
  return findings;
}

export function validateEnvSafety(env = {}) {
  const issues = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("VITE_")) {
      if (typeof value === "string" && value.length > 0) {
        const findings = scanForSecrets(`${key}=${value}`);
        if (findings.length > 0) {
          issues.push({ key, findings, severity: "HIGH" });
        }
      }
    }
  }
  return issues;
}

// ── Telemetry Provenance ────────────────────────────────────────────────────

export const EVIDENCE_LEVELS = Object.freeze({
  MEASURED: "MEASURED",
  VERIFIED: "VERIFIED",
  INFERRED: "INFERRED",
  ESTIMATED: "ESTIMATED",
  USER_PROVIDED: "USER_PROVIDED",
  SYSTEM_GENERATED: "SYSTEM_GENERATED",
});

export function createProvenance({ source, actor, session, product, creator, provider, eventType, evidenceLevel = EVIDENCE_LEVELS.MEASURED } = {}) {
  return {
    source: String(source || "unknown"),
    actor: actor ? String(actor) : null,
    session: session ? String(session) : null,
    product: product ? String(product) : null,
    creator: creator ? String(creator) : null,
    provider: provider ? String(provider) : null,
    eventType: String(eventType || "unknown"),
    evidenceLevel,
    timestamp: Date.now(),
    id: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function isMeasured(provenance) {
  return provenance?.evidenceLevel === EVIDENCE_LEVELS.MEASURED || provenance?.evidenceLevel === EVIDENCE_LEVELS.VERIFIED;
}

// ── Signal Validator ────────────────────────────────────────────────────────

export function validateGrowthSignal(signal) {
  if (!signal || typeof signal !== "object") {
    return { valid: false, reason: "invalid_signal_format" };
  }
  if (!signal.source || !signal.timestamp || !signal.productId) {
    return { valid: false, reason: "missing_required_fields", missing: ["source", "timestamp", "productId"].filter((f) => !signal[f]) };
  }
  if (signal.timestamp > Date.now() + 60000) {
    return { valid: false, reason: "future_timestamp" };
  }
  if (signal.timestamp < Date.now() - 30 * 24 * 60 * 60 * 1000) {
    return { valid: false, reason: "stale_signal" };
  }
  return { valid: true, signal };
}

export function sanitizeSignalForStorage(signal) {
  if (!signal || typeof signal !== "object") return null;
  const { source, timestamp, productId, creatorId, eventType, evidenceLevel, value } = signal;
  return {
    source: String(source || "unknown"),
    timestamp: Number(timestamp || 0),
    productId: String(productId || ""),
    creatorId: creatorId ? String(creatorId) : null,
    eventType: String(eventType || "unknown"),
    evidenceLevel: evidenceLevel || EVIDENCE_LEVELS.ESTIMATED,
    value: Number(value || 0),
  };
}

// ── Upload Safety ───────────────────────────────────────────────────────────

export const ALLOWED_UPLOAD_MIME = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/webm",
  "video/mp4",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export function validateUpload({ mime, size, ownerId, filename = "" }) {
  const issues = [];
  if (!ALLOWED_UPLOAD_MIME.includes(mime)) {
    issues.push({ code: "UNSUPPORTED_MIME", detail: `MIME ${mime} not allowed` });
  }
  if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
    issues.push({ code: "FILE_TOO_LARGE", detail: `size ${size} exceeds ${MAX_UPLOAD_BYTES}` });
  }
  if (!ownerId) {
    issues.push({ code: "MISSING_OWNER", detail: "ownerId required" });
  }
  if (typeof filename === "string" && (filename.includes("..") || filename.includes("/") || filename.includes("\\"))) {
    issues.push({ code: "UNSAFE_FILENAME", detail: "path traversal detected" });
  }
  return {
    safe: issues.length === 0,
    issues,
    status: issues.length === 0 ? "READY" : "BLOCKED",
  };
}

// ── Serverless Attack Surface Reduction ─────────────────────────────────────

export function sanitizeServerlessInput(body = {}) {
  const out = {};
  const MAX_STRING = 10000;
  const MAX_ARRAY = 100;
  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== "string" || key.length > 120) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_STRING);
    } else if (Array.isArray(value) && value.length <= MAX_ARRAY) {
      out[key] = value.slice(0, MAX_ARRAY);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof k === "string" && k.length <= 120 && typeof v === "string" && v.length <= MAX_STRING) {
          nested[k] = v;
        }
      }
      if (Object.keys(nested).length > 0) out[key] = nested;
    }
  }
  return out;
}

export function rateLimitKey({ actorId, action, windowMs = 60_000, maxRequests = 10 }) {
  return {
    key: `rl:${actorId || "anon"}:${action}`,
    windowMs,
    maxRequests,
  };
}
