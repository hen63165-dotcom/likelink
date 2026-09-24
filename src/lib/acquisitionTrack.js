import { recordActivity } from "./studioActivity.js";
import { buildSiteEventPayload } from "./acquisition.js";

/**
 * Send a REAL site event to the existing measurement router
 * (/api/store?mode=record-click). Best-effort: never blocks the UI, never
 * throws, and never claims anything the browser cannot observe.
 */
export function trackSiteEvent(type, meta = {}) {
  const payload = buildSiteEventPayload(type, meta);
  if (!payload) return null;
  try {
    fetch("/api/store?mode=record-click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // measurement is best-effort
  }
  return payload;
}

/** Track + log a CTA/share interaction in the local Studio activity feed. */
export function trackAcquisition(type, label, meta = {}) {
  trackSiteEvent(type, meta);
  try { recordActivity(type, label, meta); } catch { /* best-effort */ }
}
