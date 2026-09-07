/**
 * LikeLink Cloud Shield 🛡️
 * ========================
 * The smallest possible security boundary above Cloud Identity.
 *
 * DENY-BY-DEFAULT: every action is forbidden unless the policy table
 * explicitly allows it for the caller's role at the required risk level.
 *
 * Roles:
 *   user   — a signed-in creator accessing only her own resources
 *   owner  — the platform owner (existing ADMIN_CODE / server-verified admin)
 *   system — explicitly authorized internal server actions
 *   ai     — Luna / AI: can analyze and recommend; can only execute actions
 *            that are explicitly permitted AND never touch secrets, money,
 *            ownership or authorization itself.
 *
 * This module is pure and deterministic — no network, no browser globals,
 * no secrets. It runs identically in the browser and in serverless code.
 * The AI role can NEVER: receive master secrets, grant admin/ownership,
 * move money, bypass PayPal verification, or disable this shield.
 */

export const ROLES = {
  USER: "user",
  OWNER: "owner",
  SYSTEM: "system",
  AI: "ai",
};

export const RISK = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

/** Actions the policy knows about (deny-by-default for anything else). */
export const ACTIONS = {
  READ_OWN_RESOURCE: "resource.read.own",
  CREATE_OWN_RESOURCE: "resource.create.own",
  UPDATE_OWN_RESOURCE: "resource.update.own",
  READ_PUBLIC_FEED: "feed.read.public",
  LINK_IDENTITY: "identity.link",
  MANAGE_CONNECTIONS: "connection.manage",
  TRIGGER_AUTOPILOT: "autopilot.trigger",
  VIEW_OWN_EARNINGS: "earnings.read.own",
  // Owner-only
  MANAGE_PLATFORM_SETTINGS: "platform.settings.manage",
  PROCESS_PAYOUTS: "payouts.process",
  VIEW_AUDIT_LOG: "audit.view",
  // AI-permitted (analysis/recommendation only)
  AI_ANALYZE: "ai.analyze",
  AI_RECOMMEND: "ai.recommend",
};

/**
 * Policy table: action → { roles }.
 * Absent action = DENIED for everyone.
 */
const POLICY = {
  [ACTIONS.READ_OWN_RESOURCE]: { roles: [ROLES.USER, ROLES.OWNER] },
  [ACTIONS.CREATE_OWN_RESOURCE]: { roles: [ROLES.USER, ROLES.OWNER] },
  [ACTIONS.UPDATE_OWN_RESOURCE]: { roles: [ROLES.USER, ROLES.OWNER] },
  [ACTIONS.READ_PUBLIC_FEED]: { roles: [ROLES.USER, ROLES.OWNER, ROLES.AI] },
  [ACTIONS.LINK_IDENTITY]: { roles: [ROLES.USER] },
  [ACTIONS.MANAGE_CONNECTIONS]: { roles: [ROLES.USER] },
  [ACTIONS.TRIGGER_AUTOPILOT]: { roles: [ROLES.USER, ROLES.SYSTEM] },
  [ACTIONS.VIEW_OWN_EARNINGS]: { roles: [ROLES.USER, ROLES.OWNER] },
  [ACTIONS.MANAGE_PLATFORM_SETTINGS]: { roles: [ROLES.OWNER] },
  [ACTIONS.PROCESS_PAYOUTS]: { roles: [ROLES.OWNER, ROLES.SYSTEM] },
  [ACTIONS.VIEW_AUDIT_LOG]: { roles: [ROLES.OWNER] },
  [ACTIONS.AI_ANALYZE]: { roles: [ROLES.AI, ROLES.OWNER] },
  [ACTIONS.AI_RECOMMEND]: { roles: [ROLES.AI, ROLES.OWNER] },
};

/** Actions AI may propose but a human/owner must execute (never auto-run). */
export const AI_HUMAN_APPROVAL_REQUIRED = new Set([
  ACTIONS.TRIGGER_AUTOPILOT,
  ACTIONS.MANAGE_CONNECTIONS,
]);

const RISK_ORDER = { [RISK.LOW]: 0, [RISK.MEDIUM]: 1, [RISK.HIGH]: 2, [RISK.CRITICAL]: 3 };

/** Risk ceiling per action — an invocation context can never exceed it. */
const RISK_OF_ACTION = {
  [ACTIONS.PROCESS_PAYOUTS]: RISK.CRITICAL,
  [ACTIONS.TRIGGER_AUTOPILOT]: RISK.HIGH,
  [ACTIONS.MANAGE_PLATFORM_SETTINGS]: RISK.HIGH,
  [ACTIONS.CREATE_OWN_RESOURCE]: RISK.MEDIUM,
  [ACTIONS.UPDATE_OWN_RESOURCE]: RISK.MEDIUM,
  [ACTIONS.MANAGE_CONNECTIONS]: RISK.MEDIUM,
  [ACTIONS.LINK_IDENTITY]: RISK.MEDIUM,
  [ACTIONS.VIEW_AUDIT_LOG]: RISK.MEDIUM,
};

/**
 * Build a security context from the verified identity boundary
 * (src/lib/cloud/identity.js). Never trust browser-provided role/permissions:
 * pass role only from a server-verified source.
 *
 * @returns {{ authenticated, userId, marketerId, role, permissions: string[], riskLevel }}
 */
export function createSecurityContext({ authUser = null, marketerId = null, role = ROLES.USER, permissions = [], riskLevel = RISK.LOW } = {}) {
  const safeRole = Object.values(ROLES).includes(role) ? role : ROLES.USER;
  return {
    authenticated: Boolean(authUser?.id),
    userId: authUser?.id || null,
    marketerId: marketerId || null,
    role: safeRole,
    permissions: Array.isArray(permissions) ? [...permissions] : [],
    riskLevel: RISK_ORDER[riskLevel] != null ? riskLevel : RISK.LOW,
  };
}

/** An empty (unauthenticated) context — everything denied. */
export function anonymousContext() {
  return createSecurityContext({});
}

/**
 * The single authorization gate. DENY unless explicitly allowed AND the
 * action's risk level is within the context's allowed risk ceiling.
 * Ownership is enforced structurally: when a resource declares an owner,
 * it must match the context's verified marketerId.
 */
export function can(ctx, action, resource = null) {
  if (!ctx || !ctx.authenticated) return false;
  const rule = POLICY[action];
  if (!rule) return false; // deny-by-default
  if (!rule.roles.includes(ctx.role)) return false;
  const actionRisk = RISK_OF_ACTION[action] || RISK.LOW;
  if (RISK_ORDER[actionRisk] > RISK_ORDER[ctx.riskLevel]) return false;

  // AI can never act beyond analysis/recommendation + public reads.
  if (ctx.role === ROLES.AI && !String(action).startsWith("ai.") && action !== ACTIONS.READ_PUBLIC_FEED) {
    return false;
  }

  // Ownership boundary: if a resource is provided and it declares an owner,
  // it must match the context's verified marketerId (owner role exempt).
  if (resource && resource.ownerId != null && ctx.role !== ROLES.OWNER) {
    if (resource.ownerId !== ctx.marketerId) return false;
  }
  return true;
}

/** Assert-style helper: throws on denial (use at boundary entry points). */
export function ensureCan(ctx, action, resource = null) {
  if (!can(ctx, action, resource)) {
    const err = new Error("cloud_shield_denied");
    err.code = "CLOUD_SHIELD_DENIED";
    err.action = action;
    throw err;
  }
  return true;
}

