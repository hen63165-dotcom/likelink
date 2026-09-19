/**
 * LikeLink Connection Manager — provider connection state tracker.
 * Reuses the existing autopilot channel storage. No second auth system.
 *
 * States:
 *   NOT_CONNECTED, CONNECTING, CONNECTED, DEGRADED, EXPIRED,
 *   REAUTH_REQUIRED, BLOCKED, ERROR, UNAVAILABLE
 */

export const CONNECTION_STATE = {
  NOT_CONNECTED: "NOT_CONNECTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DEGRADED: "DEGRADED",
  EXPIRED: "EXPIRED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  BLOCKED: "BLOCKED",
  ERROR: "ERROR",
  UNAVAILABLE: "UNAVAILABLE",
};

const CONNECTION_KEY = "marketplace:connection_states";

export function createConnectionState(provider, state = CONNECTION_STATE.NOT_CONNECTED, meta = {}) {
  return {
    provider: String(provider || "unknown").slice(0, 40),
    state,
    lastVerified: meta.lastVerified || null,
    lastSuccess: meta.lastSuccess || null,
    lastError: meta.lastError || null,
    requiredPermission: meta.requiredPermission || null,
    recoveryAction: meta.recoveryAction || null,
    updatedAt: Date.now(),
  };
}

export function connectionStatesEqual(a, b) {
  if (!a || !b) return a === b;
  return (
    a.provider === b.provider &&
    a.state === b.state &&
    (a.lastError || "") === (b.lastError || "") &&
    (a.recoveryAction || "") === (b.recoveryAction || "")
  );
}

export function updateConnectionState(store, provider, state, meta = {}) {
  const list = Array.isArray(store?.[CONNECTION_KEY]) ? store[CONNECTION_KEY] : [];
  const idx = list.findIndex((c) => c && c.provider === provider);
  const next = createConnectionState(provider, state, meta);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next, updatedAt: Date.now() };
  } else {
    list.push(next);
  }
  const out = { ...store, [CONNECTION_KEY]: list.slice(-200) };
  return out;
}

export function getConnectionState(store, provider) {
  const list = Array.isArray(store?.[CONNECTION_KEY]) ? store[CONNECTION_KEY] : [];
  return list.find((c) => c && c.provider === provider) || null;
}

export function listConnectionStates(store) {
  const list = Array.isArray(store?.[CONNECTION_KEY]) ? store[CONNECTION_KEY] : [];
  return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function summarizeConnectionHealth(store) {
  const list = listConnectionStates(store);
  const byState = {};
  for (const c of list) {
    byState[c.state] = (byState[c.state] || 0) + 1;
  }
  const connected = list.filter((c) => c.state === CONNECTION_STATE.CONNECTED).length;
  const blocked = list.filter((c) => c.state === CONNECTION_STATE.BLOCKED || c.state === CONNECTION_STATE.REAUTH_REQUIRED).length;
  return {
    total: list.length,
    connected,
    blocked,
    byState,
    needsAttention: blocked,
  };
}
