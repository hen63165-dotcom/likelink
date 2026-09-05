/**
 * Tenant Guard — Client-side authorization helper for Studio Cloud.
 *
 * SECURITY WARNING: All checks here are for UX/fallback only.
 * REAL authorization must happen server-side. This module provides
 * convenience checks that UI code can use to hide/disable features,
 * but never for actual security decisions.
 *
 * Server-side APIs must always verify:
 *   - Tenant membership
 *   - Resource ownership
 *   - Permissions
 *
 * This module does NOT:
 *   - Make API calls
 *   - Access Supabase directly
 *   - Store authorization state
 */

import { getCurrentStudioId } from "./studio";

export async function requireStudio() {
  const studioId = await getCurrentStudioId();
  if (!studioId) {
    throw new Error("STUDIO_REQUIRED");
  }
  return studioId;
}

export async function requireOwnership(entity, entityType = "resource") {
  const studioId = await getCurrentStudioId();
  if (!studioId) {
    throw new Error("STUDIO_REQUIRED");
  }

  const entityStudioId = entity?.studioId || entity?.marketerId || entity?.ownerId || null;

  if (entityStudioId !== studioId) {
    throw new Error(`NOT_OWNER:${entityType}`);
  }

  return true;
}

export function isMarketerOwner(marketerId, currentStudioId) {
  if (!marketerId || !currentStudioId) return false;
  return marketerId === currentStudioId;
}

export function isMarketerProductOwner(product, currentStudioId) {
  if (!product || !currentStudioId) return false;
  return product.marketerId === currentStudioId;
}

export function filterOwnedProducts(products, currentStudioId) {
  if (!Array.isArray(products) || !currentStudioId) return [];
  return products.filter((p) => p.marketerId === currentStudioId);
}

export function filterOwnedCollections(collections, currentStudioId) {
  if (!Array.isArray(collections) || !currentStudioId) return [];
  return collections.filter((c) => c.marketerId === currentStudioId);
}

export function filterOwnedSales(sales, currentStudioId) {
  if (!Array.isArray(sales) || !currentStudioId) return [];
  return sales.filter((s) => s.marketerId === currentStudioId);
}

export function filterOwnedPayouts(payouts, currentStudioId) {
  if (!Array.isArray(payouts) || !currentStudioId) return [];
  return payouts.filter((p) => p.marketerId === currentStudioId);
}

export function canEditProduct(product, currentStudioId) {
  if (!product || !currentStudioId) return false;
  return product.marketerId === currentStudioId;
}

export function canDeleteProduct(product, currentStudioId) {
  return canEditProduct(product, currentStudioId);
}

export function canEditCollection(collection, currentStudioId) {
  if (!collection || !currentStudioId) return false;
  return collection.marketerId === currentStudioId;
}

export function canViewStudioData(studioId, currentStudioId) {
  if (!studioId || !currentStudioId) return false;
  return studioId === currentStudioId;
}

export async function getOwnershipFilter() {
  const studioId = await getCurrentStudioId();
  return studioId || null;
}
