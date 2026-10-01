// Monthly quotas — enforced on the server exactly as published on the
// pricing page (src/lib/plans.js → entitlements.capabilities.quotas).
//
// A limit of 0 = the feature is not in this plan (→ plan_required).
// A limit of null = unlimited (the internal owner plan).
// Usage is counted per studio per calendar month (Asia/Jerusalem is close
// enough to UTC for a monthly reset; the month key is UTC).
import { getAllPlans } from "../plans.js";

export const QUOTA_ERROR = Object.freeze({ PLAN_REQUIRED: "plan_required", EXCEEDED: "quota_exceeded" });

export function monthKey(now = Date.now()) {
  const d = new Date(Number(now));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const quotaStoreKey = (scopeKey, now = Date.now()) => `quota:${scopeKey}:${monthKey(now)}`;

/** The cheapest purchasable plan that includes a quota — for the upgrade message. */
export function planIncluding(quotaKey) {
  const p = getAllPlans().filter((x) => x.purchasable && !x.comingSoon).sort((a, b) => a.price - b.price)
    .find((x) => Number(x.quotas?.[quotaKey]) > 0);
  return p ? { id: p.id, name: p.name.he, price: p.price } : null;
}

/**
 * @param {object} entitlement  resolveEntitlement() result
 * @param {string} quotaKey     distributionPlans | campaigns | recruitDrafts | gptDrafts
 * @param {number} used         usage this month
 */
export function checkQuota(entitlement, quotaKey, used = 0) {
  const limit = entitlement?.capabilities?.quotas ? entitlement.capabilities.quotas[quotaKey] : 0;
  if (limit === null) return { allowed: true, limit: null, used, remaining: null }; // unlimited (owner)
  const lim = Number(limit) || 0;
  if (lim <= 0) return { allowed: false, error: QUOTA_ERROR.PLAN_REQUIRED, limit: 0, used, remaining: 0, upgrade: planIncluding(quotaKey) };
  if (used >= lim) return { allowed: false, error: QUOTA_ERROR.EXCEEDED, limit: lim, used, remaining: 0 };
  return { allowed: true, limit: lim, used, remaining: lim - used };
}

export const PRODUCT_LIMIT_ERROR = "plan_limit_products";

/** The cheapest purchasable plan that allows more products than `limit`. */
export function productUpgrade(limit) {
  const p = getAllPlans().filter((x) => x.purchasable && !x.comingSoon).sort((a, b) => a.price - b.price)
    .find((x) => Number(x.quotas?.maxProducts) > Number(limit || 0));
  return p ? { id: p.id, name: p.name.he, price: p.price, maxProducts: p.quotas.maxProducts } : null;
}

/** A product-count write is allowed when it stays within the plan, or does not grow the catalog. */
export function productLimitAllows(entitlement, beforeCount, afterCount) {
  const limit = entitlement?.capabilities?.quotas?.maxProducts;
  if (limit === null) return true;
  return afterCount <= Number(limit || 0) || afterCount <= beforeCount;
}
