import { uid } from '../utils/helpers';

const REFERRALS_KEY = 'marketplace:referrals';
const REFERRER_PARAM = 'ref';

/**
 * Referral & Viral Loop System
 * 
 * How it works:
 * 1. Every seller gets a unique referral link: likelink.vercel.app/u/theirname?ref=ID
 * 2. When someone clicks a referral link, we store: { referrerId, clickedAt }
 * 3. When that person signs up as a seller, we credit the referrer
 * 4. Referrer gets: badge, priority in feed, and commission bonus
 */

// Generate a unique referral ID for a seller
export function generateReferralId(sellerId) {
  return `ref_${sellerId}_${Date.now().toString(36)}`;
}

// Get or create referral code for a seller
export function getReferralCode(sellerId) {
  const codes = getReferralCodes();
  if (codes[sellerId]) return codes[sellerId];
  
  const code = generateReferralId(sellerId);
  codes[sellerId] = code;
  saveReferralCodes(codes);
  return code;
}

// Store that someone clicked a referral link
export function trackReferralClick(referrerCode) {
  if (!referrerCode) return;
  
  const clicks = getReferralClicks();
  clicks.push({
    id: uid(),
    referrerCode,
    clickedAt: Date.now(),
    converted: false
  });
  saveReferralClicks(clicks);
  
  // Also store in session so we know who referred this user
  try {
    sessionStorage.setItem('referral_source', referrerCode);
  } catch { /* noop */ }
}

// Mark a referral as converted (new seller signed up)
export function trackReferralConversion(referrerCode, newSellerId) {
  if (!referrerCode) return;
  
  const clicks = getReferralClicks();
  const click = clicks.find(c => c.referrerCode === referrerCode && !c.converted);
  if (click) {
    click.converted = true;
    click.convertedAt = Date.now();
    click.newSellerId = newSellerId;
    saveReferralClicks(clicks);
  }
}

// Get referral stats for a seller
export function getReferralStats(sellerId) {
  const code = getReferralCode(sellerId);
  const clicks = getReferralClicks();
  
  const myClicks = clicks.filter(c => c.referrerCode === code);
  const totalClicks = myClicks.length;
  const conversions = myClicks.filter(c => c.converted).length;
  const conversionRate = totalClicks > 0 ? Math.round((conversions / totalClicks) * 100) : 0;
  
  return {
    referralCode: code,
    referralLink: `${window.location.origin}/u/${sellerId}?ref=${code}`,
    totalClicks,
    conversions,
    conversionRate
  };
}

// Get all referrals (for admin)
export function getAllReferrals() {
  return getReferralClicks();
}

// Check if current user came from a referral
export function getPendingReferral() {
  try {
    return sessionStorage.getItem('referral_source');
  } catch {
    return null;
  }
}

// Clear pending referral after signup
export function clearPendingReferral() {
  try {
    sessionStorage.removeItem('referral_source');
  } catch { /* noop */ }
}

// --- Storage helpers ---

function getReferralCodes() {
  try {
    const raw = localStorage.getItem('marketplace:referral_codes');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReferralCodes(codes) {
  try {
    localStorage.setItem('marketplace:referral_codes', JSON.stringify(codes));
  } catch { /* noop */ }
}

function getReferralClicks() {
  try {
    const raw = localStorage.getItem(REFERRALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReferralClicks(clicks) {
  try {
    localStorage.setItem(REFERRALS_KEY, JSON.stringify(clicks));
  } catch { /* noop */ }
}

// Calculate referral bonus (for future payout system)
export function calculateReferralBonus(conversions) {
  // Tiered bonus system
  if (conversions >= 50) return 0.05; // 5% bonus for 50+ referrals
  if (conversions >= 20) return 0.03; // 3% bonus for 20+ referrals
  if (conversions >= 10) return 0.02; // 2% bonus for 10+ referrals
  if (conversions >= 5) return 0.01;  // 1% bonus for 5+ referrals
  return 0; // No bonus yet
}

// Get referral tier name
export function getReferralTier(conversions) {
  if (conversions >= 50) return 'legend';
  if (conversions >= 20) return 'expert';
  if (conversions >= 10) return 'advanced';
  if (conversions >= 5) return 'starter';
  return 'new';
}
