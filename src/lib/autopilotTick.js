// AutoPilot tick 🚀 — "swarm scheduler"
// Vercel's Hobby plan only fires cron jobs once a day, so scheduled marketing
// posts could sit waiting. Fix: every visitor's browser pings the autopilot
// function — the server then publishes exactly the posts whose smart-scheduled
// slot is due. More visitors = more frequent, more precise wakes: the whole
// audience effectively IS the scheduler. No secrets involved; it can only
// publish what creators already scheduled.
const THROTTLE_KEY = "autopilot_last_tick";
const BASE_THROTTLE_MS = 5 * 60 * 1000; // floor: one ping per 5 min per device
const JITTER_MS = 45 * 1000;            // random delay so hundreds of devices spread out

function shouldFire() {
  try {
    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    return Date.now() - last >= BASE_THROTTLE_MS;
  } catch {
    return true; // storage blocked (private mode) — fire anyway; server is idempotent
  }
}

function markFired() {
  try {
    localStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch { /* noop */ }
}

function ping() {
  try {
    fetch("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "tick" }),
      keepalive: true,
    }).catch(() => {}); // fully silent — marketing must never disturb UX
  } catch { /* noop */ }
}

export function autopilotTick() {
  if (!shouldFire()) return;
  markFired();
  // Jitter: instead of every device pinging simultaneously (spiky load),
  // each fires within a 45s window — smooth, distributed wake-ups.
  setTimeout(ping, Math.floor(Math.random() * JITTER_MS));
}

/**
 * Installs the full swarm lifecycle: initial tick + wake-up whenever the tab
 * becomes visible again (returning visitors = the best "it's due now" signal).
 * Call once from the app root; safe to call multiple times.
 */
export function startAutoPilotSwarm() {
  autopilotTick();
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") autopilotTick();
  });
}
