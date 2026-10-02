// First-party funnel events (marketplace:funnel, append-only, server-only read).
// Only real browser actions are recorded: automated browsers never write, and a
// failed write never blocks the user. The write policy keeps known fields only.
import { storage } from "./storage.js";
import { landingAttribution } from "./attribution.js";

export const FUNNEL_KEY = "marketplace:funnel";
export const FUNNEL_TYPES = Object.freeze(["studio_cta", "signup_completed", "signup_confirm_sent", "login_completed"]);

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
