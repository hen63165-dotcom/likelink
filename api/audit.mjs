// Vercel Serverless Function — Audit Logging Infrastructure
//
// PURPOSE:
//   Logs security-sensitive operations for compliance and forensics.
//   This is a foundation for Phase 1 security hardening.
//
// SECURITY NOTES:
//   - Never log secrets, passwords, tokens, or credentials
//   - Never log full request bodies that may contain sensitive data
//   - Logs are written to a dedicated audit scope (not the main kv table)
//
// AUDIT EVENT TYPES:
//   auth.*          — Authentication events
//   admin.*         — Administrative actions
//   tenant.*        — Tenant lifecycle events
//   domain.*        — Domain management events
//   product.*       — Product management
//   trust.*         — Trust system events
//   payment.*       — Payment/payout events
//   access.*        — Access control changes
//   api.*           — API security events
//
// LOG STRUCTURE:
//   {
//     event: "auth.login.success",
//     actor: { type: "admin", id: "..." },
//     target: { type: "studio", id: "..." },
//     metadata: { ip: "...", userAgent: "..." },
//     timestamp: ISO8601
//   }

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const AUDIT_KEY_PREFIX = "audit:";

const MAX_AUDIT_EVENTS = 10000;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const AUDIT_EVENT_TYPES = {
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILURE: "auth.login.failure",
  AUTH_LOGOUT: "auth.logout",
  AUTH_TOKEN_VERIFY: "auth.token.verify",
  AUTH_TOKEN_EXPIRE: "auth.token.expire",
  ADMIN_LOGIN_SUCCESS: "admin.login.success",
  ADMIN_LOGIN_FAILURE: "admin.login.failure",
  ADMIN_ACTION: "admin.action",
  TENANT_CREATE: "tenant.create",
  TENANT_UPDATE: "tenant.update",
  TENANT_SUSPEND: "tenant.suspend",
  TENANT_DELETE: "tenant.delete",
  DOMAIN_CONNECT: "domain.connect",
  DOMAIN_VERIFY: "domain.verify",
  DOMAIN_DISCONNECT: "domain.disconnect",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_APPROVE: "product.approve",
  PRODUCT_FLAG: "product.flag",
  TRUST_UPDATE: "trust.update",
  PAYMENT_SALE: "payment.sale",
  PAYMENT_PAYOUT: "payment.payout",
  PAYMENT_CHARGE: "payment.charge",
  ACCESS_GRANT: "access.grant",
  ACCESS_REVOKE: "access.revoke",
  API_RATE_LIMIT: "api.rate_limit",
  API_INVALID_TOKEN: "api.invalid_token",
  API_FORBIDDEN: "api.forbidden",
};

function sanitizeLogData(data) {
  if (!data || typeof data !== "object") return {};

  const sanitized = {};
  const sensitiveKeys = new Set([
    "password", "token", "secret", "key", "authorization", "credential",
    "api_key", "apikey", "auth", "access_token", "refresh_token",
    "card_number", "cvv", "ssn", "social_security"
  ]);

  for (const [k, v] of Object.entries(data)) {
    const keyLower = k.toLowerCase();
    if (sensitiveKeys.has(keyLower) || sensitiveKeys.has(keyLower.replace(/_/g, ""))) {
      sanitized[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.length > 500) {
      sanitized[k] = v.slice(0, 500) + "...[TRUNCATED]";
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitizeLogData(v);
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}

function getClientIp(req) {
  const h = req.headers;
  const get = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]) || "";
  return String(get("x-forwarded-for")).split(",")[0].trim() || get("x-real-ip") || "unknown";
}

function getUserAgent(req) {
  const h = req.headers;
  const get = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]) || "";
  return String(get("user-agent") || "").slice(0, 300);
}

function createAuditEntry(event, actor, target, metadata = {}) {
  return {
    event,
    actor: actor ? sanitizeLogData(actor) : null,
    target: target ? sanitizeLogData(target) : null,
    metadata: {
      ...sanitizeLogData(metadata),
      ip: getClientIp(metadata._req || null),
      userAgent: getUserAgent(metadata._req || null),
      _req: undefined,
    },
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
  };
}

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
  } catch {
    return [];
  }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
}

async function appendAuditEvent(entry) {
  if (!SB_URL || !SB_KEY) {
    console.log("[AUDIT]", JSON.stringify(entry));
    return;
  }

  try {
    const auditLog = await kvGet(AUDIT_KEY_PREFIX + "events");
    const events = Array.isArray(auditLog) ? auditLog : [];

    events.push(entry);

    const cutoff = Date.now() - MAX_EVENT_AGE_MS;
    const filtered = events.filter((e) => {
      if (!e?.timestamp) return false;
      const eventTime = new Date(e.timestamp).getTime();
      return eventTime > cutoff;
    });

    const trimmed = filtered.slice(-MAX_AUDIT_EVENTS);

    await kvSet(AUDIT_KEY_PREFIX + "events", trimmed);
  } catch (e) {
    console.error("[AUDIT] Failed to write audit log:", e.message);
    console.log("[AUDIT]", JSON.stringify(entry));
  }
}

export const audit = {
  log(event, actor, target, metadata = {}) {
    const entry = createAuditEntry(event, actor, target, metadata);
    appendAuditEvent(entry).catch(() => {});
    return entry;
  },

  logAuthSuccess(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS, actor, target, metadata);
  },

  logAuthFailure(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.AUTH_LOGIN_FAILURE, actor, target, metadata);
  },

  logAdminSuccess(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.ADMIN_LOGIN_SUCCESS, actor, target, metadata);
  },

  logAdminFailure(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.ADMIN_LOGIN_FAILURE, actor, target, metadata);
  },

  logAdminAction(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.ADMIN_ACTION, actor, target, metadata);
  },

  logTenantCreate(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.TENANT_CREATE, actor, target, metadata);
  },

  logDomainConnect(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.DOMAIN_CONNECT, actor, target, metadata);
  },

  logProductCreate(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.PRODUCT_CREATE, actor, target, metadata);
  },

  logProductDelete(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.PRODUCT_DELETE, actor, target, metadata);
  },

  logPaymentPayout(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.PAYMENT_PAYOUT, actor, target, metadata);
  },

  logApiForbidden(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.API_FORBIDDEN, actor, target, metadata);
  },

  logApiRateLimit(actor, target, metadata = {}) {
    return this.log(AUDIT_EVENT_TYPES.API_RATE_LIMIT, actor, target, metadata);
  },

  EVENT_TYPES: AUDIT_EVENT_TYPES,
};

export async function getAuditLog(options = {}) {
  const { limit = 100, offset = 0, eventType = null, actorId = null } = options;

  if (!SB_URL || !SB_KEY) {
    return { ok: false, error: "supabase_not_configured", events: [] };
  }

  try {
    const auditLog = await kvGet(AUDIT_KEY_PREFIX + "events");
    let events = Array.isArray(auditLog) ? auditLog : [];

    if (eventType) {
      events = events.filter((e) => e?.event === eventType);
    }

    if (actorId) {
      events = events.filter((e) => e?.actor?.id === actorId);
    }

    events.sort((a, b) => {
      const timeA = new Date(a?.timestamp || 0).getTime();
      const timeB = new Date(b?.timestamp || 0).getTime();
      return timeB - timeA;
    });

    const paginated = events.slice(offset, offset + limit);

    return {
      ok: true,
      events: paginated,
      total: events.length,
      limit,
      offset,
    };
  } catch (e) {
    return { ok: false, error: e.message, events: [] };
  }
}
