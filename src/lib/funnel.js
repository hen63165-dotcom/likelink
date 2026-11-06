// First-party funnel events (marketplace:funnel, append-only, server-only read).
// Only real browser actions are recorded: automated browsers never write, and a
// failed write never blocks the user. The write policy keeps known fields only.
import { storage } from "./storage.js";
import { landingAttribution } from "./attribution.js";

export const FUNNEL_KEY = "marketplace:funnel";
export const FUNNEL_TYPES = Object.freeze(["studio_cta", "signup_completed", "signup_confirm_sent", "login_completed", "landing", "magic_check"]);

// Search crawlers and link-preview bots run pages too; they are not visitors.
// (Pinterest's, Telegram's and Instagram's in-app browsers are real people:
// their fetchers are "…bot" and match on that, the apps themselves never do.)
export const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|headlesschrome|lighthouse|pagespeed|bingpreview/i;
const isAutomated = () => {
  try {
    if (typeof navigator === "undefined") return false;
    return navigator.webdriver === true || BOT_UA.test(String(navigator.userAgent || ""));
  } catch { return false; }
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

export const VISIT_FLAG = "ll_visit";

/**
 * A visit, recorded once per browser session: the page it landed on and where
 * it came from (utm_* / cid, else the referrer's host; landingAttribution).
 * This is the "כניסות" count the owner reads (2026-11-03: until then only a
 * marketing-engine creative's landing was recorded, so real visitors were not
 * counted at all). A landing from a marketing-engine creative (cid mk_…) is
 * also recorded once per creative, which the engine's learning reads. No IP,
 * no personal data; crawlers and preview bots are not visits. Never throws.
 */
export function trackLanding() {
  try {
    if (typeof window === "undefined") return false;
    const cid = new URLSearchParams(window.location.search).get("cid") || "";
    const creative = /^mk_[A-Za-z0-9_-]{1,57}$/.test(cid);
    const flag = creative ? `ll_landing_${cid}` : VISIT_FLAG;
    try {
      if (sessionStorage.getItem(flag)) return false;
      sessionStorage.setItem(flag, "1");
      if (creative) sessionStorage.setItem(VISIT_FLAG, "1"); // the creative's landing is the session's visit
    } catch { /* private mode: still record once per page load */ }
    trackFunnel("landing", window.location.pathname);
    return true;
  } catch {
    return false;
  }
}
