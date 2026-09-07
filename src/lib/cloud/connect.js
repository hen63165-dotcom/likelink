/**
 * LikeLink Cloud Connect Core 🔗
 * ==============================
 * A thin, read-only FACADE over the provider connections that ALREADY exist:
 *
 *   • PayPal payout destination → existing /api/paypal/connect + marketer
 *     profile fields (payPalEmail) — no new payment system.
 *   • Social publishing channels → existing AutoPilot channel config
 *     (telegram/webhook/facebook/discord/instagram/x/linkedin/pinterest/
 *     wordpress/whatsapp) via the existing /api/autopilot { mode: "get" }.
 *
 * connect/disconnect/refresh stay where they are today (the existing studio
 * UI + autopilot save + paypal/connect endpoints). This facade only makes
 * connection STATE observable to Cloud Core / Luna without exposing tokens
 * or credentials — it never returns or accepts secrets.
 *
 * User-facing status uses i18n message keys (see src/lib/i18n.js → "cloud"
 * section) so no infrastructure language leaks into the UX.
 */

// Provider ids (stable, UI-facing)
export const PROVIDERS = {
  PAYPAL: "paypal",
  AUTOPILOT: "autopilot",
};

// Channel types already supported by the existing AutoPilot publisher.
export const SOCIAL_CHANNEL_TYPES = [
  "telegram", "webhook", "facebook", "discord", "instagram",
  "x", "linkedin", "pinterest", "wordpress", "whatsapp",
];

// i18n keys (src/lib/i18n.js → cloud section)
export const MESSAGE_KEYS = {
  ATTENTION: "cloud.connectAttention",
  RECONNECT: "cloud.reconnectService",
  SESSION_EXPIRED: "cloud.sessionExpired",
  CONNECTED: "cloud.connected",
  NOT_CONNECTED: "cloud.notConnected",
};

function connectionStatus(connected, { needsAttention = false } = {}) {
  return {
    connected: Boolean(connected),
    needsAttention: Boolean(needsAttention),
    messageKey: needsAttention ? MESSAGE_KEYS.ATTENTION : connected ? MESSAGE_KEYS.CONNECTED : MESSAGE_KEYS.NOT_CONNECTED,
  };
}

/**
 * PayPal connection status for a marketer — derived from the EXISTING
 * marketer record (payPalEmail was validated by /api/paypal/connect).
 * The email itself is NOT returned (PII stays out of generic consumers).
 */
export function getPayPalConnectionStatus(marketer) {
  const email = String(marketer?.payPalEmail || "").trim();
  return {
    provider: PROVIDERS.PAYPAL,
    ...connectionStatus(Boolean(email), { needsAttention: Boolean(marketer) && !email }),
    // capabilities come from the existing flow: payouts are processed by
    // the server-side worker (/api/payouts/process) via PayPal Payouts API.
    capabilities: ["receive_payouts"],
  };
}

/**
 * AutoPilot (social) connection status — reads the existing config through
 * the existing endpoint. Token-bearing channel fields are stripped here.
 */
export async function getAutoPilotConnectionStatus(marketerId) {
  if (!marketerId) {
    return { provider: PROVIDERS.AUTOPILOT, ...connectionStatus(false), channels: [] };
  }
  let cfg = null;
  try {
    const res = await fetch("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "get", marketerId }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) cfg = data.config;
  } catch { /* offline — report as not connected, never throw into UI */ }

  const channels = (Array.isArray(cfg?.channels) ? cfg.channels : []).map((ch) => ({
    type: String(ch?.type || "unknown"),
    // NEVER expose tokens/bearers/phone numbers — presence only.
    configured: Boolean(ch),
  }));
  return {
    provider: PROVIDERS.AUTOPILOT,
    ...connectionStatus(channels.length > 0, { needsAttention: cfg?.enabled === true && channels.length === 0 }),
    channels,
    capabilities: ["publish_posts", "schedule", "utm_tracking"],
  };
}

/** All connection statuses for the current marketer (read-only). */
export async function listConnections(marketer) {
  const [paypal, autopilot] = await Promise.all([
    Promise.resolve(getPayPalConnectionStatus(marketer)),
    getAutoPilotConnectionStatus(marketer?.id),
  ]);
  return [paypal, autopilot];
}
