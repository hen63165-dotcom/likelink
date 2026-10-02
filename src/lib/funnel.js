// First-party funnel events (marketplace:funnel, append-only, server-only read).
// Only real browser actions are recorded: automated browsers never write, and a
// failed write never blocks the user. The write policy keeps known fields only.
import { storage } from "./storage.js";
import { landingAttribution } from "./attribution.js";

export const FUNNEL_KEY = "marketplace:funnel";
export const FUNNEL_TYPES = Object.freeze(["studio_cta", "signup_completed", "signup_confirm_sent", "login_completed", "landing"]);

const isAutomated = () => {
  try { return typeof navigator !== "undefined" && navigator.webdriver === true; } catch { return false; }
};
const rid = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** Record one funnel step. Never throws. */
export async function trackFunnel(type, place = "") {
  if (!FUNNEL_TYPES.includes(type) || isAutomated()) return false;
  let attr = {};
  try { attr = landingAttribution() || {}; } catch { attr = {}; }
  const ev = { id: rid(), type, ts: Date.now(), place: String(place || "").slice(0, 60), ...attr };
  try {
    await storage.set(FUNNEL_KEY, JSON.stringify([ev]), true);
    return true;
  } catch {
    return false;
  }
}

/**
 * A landing that arrived from a marketing-engine creative on a LikeLink page
 * (cid mk_…; product pages are measured by their own view event). Recorded
 * once per browser session per creative. Never throws.
 */
export function trackLanding() {
  try {
    if (typeof window === "undefined") return false;
    const cid = new URLSearchParams(window.location.search).get("cid") || "";
    if (!/^mk_[A-Za-z0-9_-]{1,57}$/.test(cid)) return false;
    const flag = `ll_landing_${cid}`;
    try { if (sessionStorage.getItem(flag)) return false; sessionStorage.setItem(flag, "1"); } catch { /* private mode: still record once */ }
    trackFunnel("landing", window.location.pathname);
    return true;
  } catch {
    return false;
  }
}
