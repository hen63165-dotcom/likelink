// Per-product engagement (the owner's Master Execution Order, item 4): a real visitor's video play,
// watch completion, share and save — appended to the server-only marketplace:engagement (never to
// marketplace:clicks, whose readers count every non-view event as an exit to the store). Only real
// browser actions: automated browsers never write, one event per product per type per browser
// session (an honest count), known fields only (the write policy keeps nothing else), and a failed
// write never blocks the visitor. No IP, no personal data. Read by the owner's metrics only
// (src/lib/growth/productTelemetry.js, GET op=product-metrics).
import { storage } from "./storage.js";
import { landingAttribution } from "./attribution.js";
import { BOT_UA } from "./funnel.js";

export const ENGAGEMENT_KEY = "marketplace:engagement";
export const ENGAGEMENT_TYPES = Object.freeze(["play", "complete", "share", "save"]);
export const SHARE_NETS = Object.freeze(["whatsapp", "telegram", "facebook", "pinterest", "x", "email", "copy", "native"]);
const SEEN = "ll_engaged";

const isAutomated = () => {
  try {
    if (typeof navigator === "undefined") return true;
    return navigator.webdriver === true || BOT_UA.test(String(navigator.userAgent || ""));
  } catch { return true; }
};
const rid = () => `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** One engagement event for a product. `net` names the share target. Never throws. */
export async function trackEngagement(productId, type, { net = "" } = {}) {
  const pid = String(productId || "");
  if (!pid || pid.length > 80 || !ENGAGEMENT_TYPES.includes(type) || isAutomated()) return false;
  const key = `${type}:${pid}`;
  try {
    const seen = JSON.parse(sessionStorage.getItem(SEEN) || "[]");
    if (seen.includes(key)) return false;
    sessionStorage.setItem(SEEN, JSON.stringify([...seen, key].slice(-300)));
  } catch { /* private mode: still record this one */ }
  let attr = {};
  try { attr = landingAttribution() || {}; } catch { attr = {}; }
  const ev = { id: rid(), productId: pid, type, ts: Date.now(), ...attr };
  if (type === "share" && SHARE_NETS.includes(net)) ev.net = net;
  try {
    await storage.set(ENGAGEMENT_KEY, JSON.stringify([ev]), true);
    return true;
  } catch {
    return false;
  }
}

/** Props for a product <video>: a play and a watch to the end (≥ 95% of it), once per session. */
export function videoEngagementProps(productId) {
  return {
    onPlay: () => { trackEngagement(productId, "play"); },
    onTimeUpdate: (e) => {
      const v = e?.currentTarget;
      if (v && v.duration > 0 && v.currentTime / v.duration >= 0.95) trackEngagement(productId, "complete");
    },
    onEnded: () => { trackEngagement(productId, "complete"); },
  };
}
