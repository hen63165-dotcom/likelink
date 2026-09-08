/**
 * LikeLink Unified Commerce System
 * ================================
 * Single source of truth for plans, subscriptions, entitlements, and billing.
 *
 * Consolidates the previous dual system (subscriptions.js + pricing.js) into one.
 *
 * PLAN → CHECKOUT → PAYMENT → SUBSCRIPTION → ENTITLEMENT → STUDIO ACCESS
 *
 * Security: entitlements are ALWAYS verified server-side. Client state is never trusted.
 */

import { PLANS, getPlanById, PLAN_ENTITLEMENTS } from './plans.js';

// Subscription statuses
export const SUB_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PAST_DUE: 'past_due',
  SUSPENDED: 'suspended',
  TRIAL: 'trial',
  PENDING: 'pending',
};

// Billing periods
export const BILLING = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

/**
 * Get the effective plan for a user, checking subscription status.
 * Returns FREE if no active subscription or subscription expired.
 */
export function getEffectivePlan(subscription) {
  if (!subscription) return PLANS.FREE;
  if (subscription.status !== SUB_STATUS.ACTIVE && subscription.status !== SUB_STATUS.TRIAL) {
    return PLANS.FREE;
  }
  // Check expiry
  if (subscription.expiresAt && new Date(subscription.expiresAt).getTime() < Date.now()) {
    return PLANS.FREE;
  }
  return getPlanById(subscription.planId);
}

/**
 * Check if a feature is available for a given plan.
 */
export function hasFeature(planId, feature) {
  const plan = getPlanById(planId);
  const val = plan.features[feature];
  return val === true || val === Infinity;
}

/**
 * Check if user can add more products.
 */
export function canAddProduct(planId, currentCount) {
  const plan = getPlanById(planId);
  const max = plan.features.maxProducts;
  return max === Infinity || currentCount < max;
}

/**
 * Get platform fee for a plan.
 */
export function getPlatformFee(planId) {
  return getPlanById(planId).platformFee;
}

/**
 * Calculate sale split between platform and seller.
 */
export function calculateSaleSplit(saleAmount, planId) {
  const fee = getPlatformFee(planId);
  const platformCut = Math.round((saleAmount * fee / 100) * 100) / 100;
  return {
    saleAmount,
    platformFee: platformCut,
    sellerEarnings: Math.round((saleAmount - platformCut) * 100) / 100,
    feePercent: fee,
  };
}

/**
 * Validate a subscription record.
 */
export function isValidSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  if (!sub.planId || !getPlanById(sub.planId)) return false;
  if (!sub.status) return false;
  return true;
}

/**
 * Create a new subscription record.
 */
export function createSubscription({ planId, userId, billingPeriod = BILLING.MONTHLY, paypalSubscriptionId = null }) {
  const plan = getPlanById(planId);
  const now = Date.now();
  const durationMs = billingPeriod === BILLING.YEARLY ? 365 * 86400000 : 30 * 86400000;
  return {
    id: `sub_${now}_${Math.random().toString(36).slice(2, 8)}`,
    planId: plan.id,
    userId,
    status: SUB_STATUS.PENDING,
    billingPeriod,
    paypalSubscriptionId,
    createdAt: new Date(now).toISOString(),
    startedAt: null,
    expiresAt: new Date(now + durationMs).toISOString(),
    cancelledAt: null,
    lastBillingAt: null,
    nextBillingAt: new Date(now + durationMs).toISOString(),
  };
}

/**
 * Activate a subscription (after payment confirmed).
 */
export function activateSubscription(sub) {
  const now = Date.now();
  return {
    ...sub,
    status: SUB_STATUS.ACTIVE,
    startedAt: sub.startedAt || new Date(now).toISOString(),
    lastBillingAt: new Date(now).toISOString(),
  };
}

/**
 * Cancel a subscription.
 */
export function cancelSubscription(sub) {
  return {
    ...sub,
    status: SUB_STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
  };
}

/**
 * Check if subscription needs renewal.
 */
export function isRenewalDue(sub) {
  if (!sub || sub.status !== SUB_STATUS.ACTIVE) return false;
  if (!sub.nextBillingAt) return false;
  return new Date(sub.nextBillingAt).getTime() <= Date.now();
}

/**
 * Get all plans for display.
 */
export function getAllPlans() {
  return Object.values(PLANS);
}

// SUB_STATUS and BILLING are already exported above
