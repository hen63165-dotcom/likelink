/**
 * LikeLink Cloud Core ☁️
 * ======================
 * The business-level boundary: identity → ownership → authorized resource
 * operations → events. It WRAPS the existing systems — it does not replace
 * them:
 *
 *   • identity      → reuses src/lib/cloud/identity.js (the ONLY identity
 *                     source; localStorage session:marketerId is cache-only)
 *   • authorization → reuses src/lib/cloud/shield.js (deny-by-default)
 *   • persistence   → reuses src/lib/storage.js + /api/store (the existing
 *                     server gate with SERVICE_ROLE + admin/signed keys)
 *
 * Client modules should talk to Cloud Core instead of touching Supabase,
 * storage keys or identity internals directly. Adoption is incremental:
 * existing flows keep working unchanged.
 */

import { resolveCurrentMarketer, getAuthUser, cloudAuthConfigured } from "./identity.js";
import { createSecurityContext, can, ensureCan, ROLES, ACTIONS } from "./shield.js";

// ─── Identity ───────────────────────────────────────────────────────────────

/**
 * Resolve the current verified identity + security context.
 * @param {Array} marketers — the already-loaded marketers list (existing feed)
 */
export async function getCurrentIdentity(marketers = []) {
  const resolved = await resolveCurrentMarketer(marketers);
  const ctx = createSecurityContext({
    authUser: resolved.authUser,
    marketerId: resolved.marketerId,
    role: ROLES.USER,
    riskLevel: "LOW",
  });
  return { ...resolved, context: ctx, configured: cloudAuthConfigured };
}

/** Raw auth user (or null) — thin wrapper, unchanged behavior. */
export async function currentAuthUser() {
  return getAuthUser();
}

// ─── Owned resources ────────────────────────────────────────────────────────

/**
 * Filter a resource list down to resources owned by the verified identity.
 * Works on the existing in-memory collections (products, collections, …)
 * where ownership is expressed as `marketerId`.
 */
export function getOwnedResources(resources, identity) {
  const ownerId = identity?.marketerId;
  if (!ownerId) return [];
  return (Array.isArray(resources) ? resources : []).filter((r) => r?.marketerId === ownerId);
}

/**
 * Assert ownership over a single resource before a mutation.
 * Returns the resource when owned; throws cloud_shield_denied otherwise.
 */
export function assertOwned(resource, identity) {
  ensureCan(identity?.context, identity?.context ? ACTIONS.UPDATE_OWN_RESOURCE : "resource.update.own", {
    ownerId: resource?.marketerId,
  });
  if (!resource || resource.marketerId !== identity?.marketerId) {
    const err = new Error("cloud_shield_denied");
    err.code = "CLOUD_SHIELD_DENIED";
    throw err;
  }
  return resource;
}

/**
 * Build an ownership-checked create/update payload for an owned resource.
 * Stamps the verified marketerId — the caller can never forge another
 * marketer's ownership through Cloud Core.
 */
export function withOwnedResource(identity, resource) {
  if (!identity?.marketerId) {
    const err = new Error("cloud_shield_denied");
    err.code = "CLOUD_SHIELD_DENIED";
    throw err;
  }
  return { ...resource, marketerId: identity.marketerId };
}

// ─── Events ─────────────────────────────────────────────────────────────────

// Local, capped event ring buffer. Server-side security events continue to go
// through api/_utils/audit.js (service-role only) — this buffer is the client
// foundation so automation/Luna can observe what happened without any new
// endpoint or database table.
const EVENT_BUFFER_KEY = "sch:local:cloud:events";
const MAX_EVENTS = 100;

const EVENT_NAMES = {
  IDENTITY_LINKED: "identity.linked",
  RESOURCE_CREATED: "resource.created",
  RESOURCE_UPDATED: "resource.updated",
  CONNECTION_CONNECTED: "connection.connected",
  CONNECTION_DISCONNECTED: "connection.disconnected",
  PAYMENT_CREATED: "payment.created",
  PAYMENT_COMPLETED: "payment.completed",
  SALE_RECORDED: "sale.recorded",
  COMMISSION_CALCULATED: "commission.calculated",
  AUTOPILOT_STARTED: "autopilot.started",
  AUTOPILOT_COMPLETED: "autopilot.completed",
  AUTOPILOT_FAILED: "autopilot.failed",
  SECURITY_BLOCKED: "security.blocked",
};

export const EVENTS = EVENT_NAMES;

function readBuffer() {
  try {
    const raw = localStorage.getItem(EVENT_BUFFER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Record a Cloud Core event (never include secrets/tokens/passwords in
 * payload — callers are responsible; payload values are length-capped here).
 */
export function recordEvent(name, payload = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(payload || {})) {
    safe[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  const event = { name, ts: Date.now(), ...safe };
  try {
    const buffer = [...readBuffer(), event].slice(-MAX_EVENTS);
    localStorage.setItem(EVENT_BUFFER_KEY, JSON.stringify(buffer));
  } catch { /* storage full / private mode — event still returned */ }
  return event;
}

/** Read recent events (for dashboards / Luna analysis). */
export function recentEvents(limit = 20) {
  return readBuffer().slice(-limit).reverse();
}
