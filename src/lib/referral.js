/**
 * Likelink Referral System 🎯
 * ---------------------------------------------------------------
 * קורא ?ref=<slug> מה-URL, שומר ב-sessions storage, ומחזיק את המידע
 * של המפציץ (referrer) כשמוכרת חדשה נרשמת.
 *
 * זרימה:
 * 1. Visitor לוחץ קישור הפניה: likelink.vercel.app/?ref=theirSlug
 * 2. initReferral() קורא את הפרמטר ref ושומר ב-sessionStorage
 * 3. כשהמוכרת נרשמת, onSignup שואל getPendingReferral() ושומר referrerSlug
 */

import { uid } from "../utils/helpers.js";

const REFERRAL_SESSION_KEY = "referral_source";
export const REFERRER_PARAM = "ref";

/**
 * Read the `ref` query parameter from the current URL and persist it
 * to sessionStorage so it survives page reloads within the same session.
 * Safe to call on both client and server (no-ops when window is absent).
 */
export function initReferral() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get(REFERRER_PARAM);
    if (ref && ref.trim()) {
      const clean = ref.trim().slice(0, 80);
      sessionStorage.setItem(REFERRAL_SESSION_KEY, clean);
      return clean;
    }
  } catch { /* noop */ }
  return null;
}

/**
 * Returns the pending referrer slug stored during this session,
 * or null when no referral is active.
 */
export function getPendingReferral() {
  try {
    return sessionStorage.getItem(REFERRAL_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Clear the pending referral after it has been consumed
 * (e.g. right after a successful signup).
 */
export function clearPendingReferral() {
  try {
    sessionStorage.removeItem(REFERRAL_SESSION_KEY);
  } catch { /* noop */ }
}

/**
 * Attach the pending referrer slug to a newly-created marketeer record.
 * Returns the marketeer object augmented with `referrerSlug` (or null
 * if no referral was pending).
 */
export function attachReferrer(marketer) {
  const referrerSlug = getPendingReferral();
  if (!referrerSlug) return marketer;
  clearPendingReferral();
  return { ...marketer, referrerSlug };
}

/**
 * Generate a unique referral ID for a marketeer (stable, idempotent).
 * Stored per-marketeer so the same link is reused across sessions.
 */
export function generateReferralId(marketerId) {
  return `ref_${marketerId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build the full referral link for a marketeer.
 * Falls back to the marketeer's slug or id.
 */
export function buildReferralLink(marketer) {
  if (typeof window === "undefined") return "";
  const base = marketer?.slug || marketer?.id || "";
  return `${window.location.origin}/u/${base}?ref=${encodeURIComponent(base)}`;
}

/**
 * Track that a referral link was clicked.
 * Stores the click event locally for analytics.
 */
export function trackReferralClick(referrerSlug) {
  if (!referrerSlug) return;
  try {
    const clicks = JSON.parse(localStorage.getItem("marketplace:referral_clicks") || "[]");
    clicks.push({
      id: uid(),
      referrerSlug: String(referrerSlug),
      clickedAt: Date.now(),
      converted: false,
    });
    localStorage.setItem("marketplace:referral_clicks", JSON.stringify(clicks.slice(-500)));
  } catch { /* noop */ }
}

/**
 * Mark a referral click as converted when the referred marketeer
 * successfully signs up.
 */
export function trackReferralConversion(referrerSlug, newMarketerId) {
  if (!referrerSlug) return;
  try {
    const clicks = JSON.parse(localStorage.getItem("marketplace:referral_clicks") || "[]");
    const click = clicks.find((c) => c.referrerSlug === referrerSlug && !c.converted);
    if (click) {
      click.converted = true;
      click.convertedAt = Date.now();
      click.newMarketerId = newMarketerId;
      localStorage.setItem("marketplace:referral_clicks", JSON.stringify(clicks));
    }
  } catch { /* noop */ }
}

/**
 * Get referral analytics for a marketeer.
 */
export function getReferralStats(marketerId) {
  try {
    const clicks = JSON.parse(localStorage.getItem("marketplace:referral_clicks") || "[]");
    const myClicks = clicks.filter((c) => c.referrerSlug === marketerId || c.newMarketerId === marketerId);
    const totalClicks = myClicks.filter((c) => c.referrerSlug === marketerId).length;
    const conversions = myClicks.filter((c) => c.converted).length;
    const conversionRate = totalClicks > 0 ? Math.round((conversions / totalClicks) * 100) : 0;
    return {
      referralCode: marketerId,
      referralLink: buildReferralLink({ id: marketerId, slug: marketerId }),
      totalClicks,
      conversions,
      conversionRate,
    };
  } catch {
    return { referralCode: marketerId, referralLink: "", totalClicks: 0, conversions: 0, conversionRate: 0 };
  }
}

/**
 * Tiered referral bonus: more conversions → higher platform cut.
 * (Future payout integration — currently informational only.)
 */
export function calculateReferralBonus(conversions) {
  if (conversions >= 50) return 0.05;
  if (conversions >= 20) return 0.03;
  if (conversions >= 10) return 0.02;
  if (conversions >= 5) return 0.01;
  return 0;
}

export function getReferralTier(conversions) {
  if (conversions >= 50) return "legend";
  if (conversions >= 20) return "expert";
  if (conversions >= 10) return "advanced";
  if (conversions >= 5) return "starter";
  return "new";
}
