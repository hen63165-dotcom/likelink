// AutoPilot tick 🚀
// Vercel's Hobby plan only fires cron jobs once a day, so scheduled marketing
// posts could sit waiting. Fix: every visitor's browser pings the autopilot
// function (throttled to once per 10 minutes per device) — the server then
// publishes exactly the posts whose smart-scheduled slot is due. No secrets
// involved; it can only publish what creators already scheduled.
const THROTTLE_KEY = "autopilot_last_tick";
const THROTTLE_MS = 10 * 60 * 1000;

export function autopilotTick() {
  let shouldFire = true;
  try {
    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    shouldFire = Date.now() - last >= THROTTLE_MS;
    if (shouldFire) localStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch {
    /* storage blocked (private mode) — fire anyway; server is idempotent */
  }
  if (!shouldFire) return;
  try {
    fetch("/api/autopilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "tick" }),
      keepalive: true,
    }).catch(() => {}); // fully silent — marketing must never disturb UX
  } catch { /* noop */ }
}
