/**
 * LikeLink2 Autonomous Jobs Client (Browser-Safe)
 * ================================================
 * Reads-only client for the autonomous job status.
 * No secrets. No write access. Communicates entirely through
 * the existing POST /api/autopilot { mode: "autonomous-jobs-status" } endpoint.
 *
 * The service-role key is NEVER exposed to the browser.
 */

const AUTONOMOUS_JOBS = [
  "autonomous-growth-cycle",
  "daily-trend-scan",
  "site-campaign-cycle",
  "brand-pulse-publish",
  "brand-pulse-external",
  "opportunity-discovery",
  "brand-pulse-freshness",
];

export const JOB_STATE = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
};

const STATE_LABELS = {
  [JOB_STATE.PENDING]: "ממתין",
  [JOB_STATE.RUNNING]: "פועל",
  [JOB_STATE.SUCCESS]: "הצליח",
  [JOB_STATE.FAILED]: "נכשל",
  [JOB_STATE.SKIPPED]: "דלג",
};

const STATE_COLORS = {
  [JOB_STATE.PENDING]: "text-[var(--text-secondary)]",
  [JOB_STATE.RUNNING]: "text-[var(--warning)]",
  [JOB_STATE.SUCCESS]: "text-[var(--success)]",
  [JOB_STATE.FAILED]: "text-[var(--danger)]",
  [JOB_STATE.SKIPPED]: "text-[var(--text-secondary)]",
};

const STATE_BG = {
  [JOB_STATE.PENDING]: "var(--bg-subtle)",
  [JOB_STATE.RUNNING]: "color-mix(in srgb, var(--warning) 15%, transparent)",
  [JOB_STATE.SUCCESS]: "color-mix(in srgb, var(--success) 15%, transparent)",
  [JOB_STATE.FAILED]: "color-mix(in srgb, var(--danger) 15%, transparent)",
  [JOB_STATE.SKIPPED]: "var(--bg-subtle)",
};

/**
 * Fetch autonomous job status from the server.
 * Returns the raw server response (no secrets, no writes).
 */
export async function fetchAutonomousJobStatus() {
  const res = await fetch("/api/autopilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "autonomous-jobs-status" }),
  });
  if (!res.ok) throw new Error(`status_${res.status}`);
  return res.json();
}

/**
 * Convenience: return jobs sorted by lastRun (most recent first).
 */
export function sortJobsByRecency(jobs) {
  return (jobs || []).slice().sort((a, b) => {
    const ta = a.lastRunAt || 0;
    const tb = b.lastRunAt || 0;
    return tb - ta;
  });
}

/**
 * Format duration for display.
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

function formatTime(ts, lang = "he") {
  if (!ts) return "—";
  const d = new Date(ts);
  if (lang === "he") {
    return d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  }
  return d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
}

export {
  AUTONOMOUS_JOBS,
  STATE_LABELS,
  STATE_COLORS,
  STATE_BG,
  formatTime,
};
