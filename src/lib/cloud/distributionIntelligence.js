/**
 * LikeLink2 Distribution Intelligence 📡
 * ======================================
 * Uses the existing Capability Broker + Connection Manager.
 *
 * For each destination determine:
 *   READY | ASSISTED | CONNECT_REQUIRED | REAUTH_REQUIRED | BLOCKED | UNAVAILABLE
 *
 * Never pretend a post was published when it was not.
 * If direct publishing is unavailable, prepare the best legitimate fallback:
 *   COPY | OPEN | SHARE | DOWNLOAD
 *
 * One failed destination must not fail the entire campaign.
 */

import { evaluateCapability } from "./capabilityBroker.js";
import { getProviderConnectionState, CONNECTED_STATES, BLOCKED_STATES } from "./connectionManager.js";

export const DISTRIBUTION_STATES = Object.freeze({
  READY: "READY",
  ASSISTED: "ASSISTED",
  CONNECT_REQUIRED: "CONNECT_REQUIRED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  BLOCKED: "BLOCKED",
  UNAVAILABLE: "UNAVAILABLE",
});

export const DISTRIBUTION_FALLBACKS = Object.freeze({
  COPY: "COPY",
  OPEN: "OPEN",
  SHARE: "SHARE",
  DOWNLOAD: "DOWNLOAD",
});

export const DISTRIBUTION_STATE_LABELS = Object.freeze({
  [DISTRIBUTION_STATES.READY]: { he: "מוכן", en: "Ready" },
  [DISTRIBUTION_STATES.ASSISTED]: { he: "בעזרה", en: "Assisted" },
  [DISTRIBUTION_STATES.CONNECT_REQUIRED]: { he: "דורש חיבור", en: "Connect Required" },
  [DISTRIBUTION_STATES.REAUTH_REQUIRED]: { he: "דורש אימות מחדש", en: "Reauth Required" },
  [DISTRIBUTION_STATES.BLOCKED]: { he: "חסום", en: "Blocked" },
  [DISTRIBUTION_STATES.UNAVAILABLE]: { he: "לא זמין", en: "Unavailable" },
});

export function resolveDistributionState({ intent, provider, connectionState }) {
  const conn = connectionState || getProviderConnectionState(provider);
  const capability = evaluateCapability({ intent, provider, connectionState: conn });

  if (capability.canPublish && CONNECTED_STATES.includes(conn)) return DISTRIBUTION_STATES.READY;
  if (capability.canPrepare && CONNECTED_STATES.includes(conn)) return DISTRIBUTION_STATES.ASSISTED;
  if (BLOCKED_STATES.includes(conn)) return DISTRIBUTION_STATES.BLOCKED;
  if (conn === "REAUTH_REQUIRED") return DISTRIBUTION_STATES.REAUTH_REQUIRED;
  if (conn === "NOT_CONNECTED" || conn === "UNAVAILABLE") return DISTRIBUTION_STATES.CONNECT_REQUIRED;
  if (conn === "EXPIRED") return DISTRIBUTION_STATES.REAUTH_REQUIRED;
  if (conn === "DEGRADED") return DISTRIBUTION_STATES.ASSISTED;
  return DISTRIBUTION_STATES.UNAVAILABLE;
}

export function getBestFallback(creative, availableChannels = []) {
  if (!creative) return null;
  const hasVideo = creative.creativeType === "short_video" || creative.creativeType === "reel";
  const fallbacks = [];

  for (const ch of availableChannels) {
    const state = resolveDistributionState({
      intent: creative.creativeType === "short_video" || creative.creativeType === "reel" ? "publishCreative" : "share",
      provider: ch,
    });

    if (state === DISTRIBUTION_STATES.READY) {
      fallbacks.push({ channel: ch, action: "PUBLISH", state });
    } else if (state === DISTRIBUTION_STATES.ASSISTED) {
      fallbacks.push({ channel: ch, action: "COPY", state, reason: "assisted" });
    }
  }

  if (fallbacks.length === 0) {
    return {
      channel: "direct",
      action: DISTRIBUTION_FALLBACKS.SHARE,
      state: DISTRIBUTION_STATES.ASSISTED,
      reason: "no_ready_channel",
    };
  }

  return fallbacks[0];
}

export function distributionSummary(plan, lang = "he") {
  if (!plan) return { he: "אין תכנית הפצה", en: "No distribution plan" };
  const stateLabel = DISTRIBUTION_STATE_LABELS[plan.state]?.[lang] || plan.state;
  const parts = [plan.channel, stateLabel];
  if (plan.action) parts.push(plan.action);
  return {
    he: parts.join(" · "),
    en: parts.join(" · "),
  };
}
