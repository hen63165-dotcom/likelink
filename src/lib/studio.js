/**
 * Studio/Tenant Compatibility Layer for LikeLink Studio Cloud.
 *
 * This module provides a tenant abstraction over the existing "marketer" model.
 * It is a MINIMAL compatibility layer — existing code using marketers/marketerId
 * continues to work exactly as before. This layer adds studio concepts on top.
 *
 * TENANT MODEL:
 *   A Studio is the top-level tenant entity. Currently backed by "marketer" data.
 *   Over time, this will be migrated to a proper studios table with full
 *   multi-tenant isolation. For now, we maintain backward compatibility.
 *
 * KEY PRINCIPLES:
 *   - Existing marketerId references remain valid
 *   - A marketer IS a studio (1:1 for now)
 *   - Future: studios table with multiple members per studio
 *
 * SECURITY:
 *   - All tenant resolution must be verified server-side
 *   - Client-side studio context is for UI only, never for authorization
 */

import { storage } from "./storage";
import { K } from "../constants/keys";

export const STUDIO_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING: "pending",
  ARCHIVED: "archived",
};

export function studioFromMarketer(marketer) {
  if (!marketer) return null;
  return {
    id: marketer.id,
    studioId: marketer.id,
    marketerId: marketer.id,
    name: marketer.name,
    email: marketer.email,
    slug: marketer.slug,
    bio: marketer.bio || "",
    color: marketer.color || "#6366f1",
    avatarUrl: marketer.avatarUrl || null,
    trackingId: marketer.trackingId || "",
    status: STUDIO_STATUS.ACTIVE,
    createdAt: marketer.createdAt || Date.now(),
    updatedAt: marketer.updatedAt || marketer.createdAt || Date.now(),
    ownerId: marketer.id,
  };
}

export async function getCurrentStudioId() {
  try {
    const res = await storage.get(K.session, false);
    if (res?.value) {
      const session = JSON.parse(res.value);
      return session?.marketerId || null;
    }
  } catch {}
  return null;
}

export async function getCurrentStudio(marketers = []) {
  const studioId = await getCurrentStudioId();
  if (!studioId) return null;
  const marketer = marketers.find((m) => m.id === studioId) || null;
  return studioFromMarketer(marketer);
}

export function resolveStudio(studioId, studios = []) {
  if (!studioId) return null;
  const studio = studios.find((s) => s.id === studioId || s.studioId === studioId) || null;
  return studio;
}

export function isStudioActive(studio) {
  return studio?.status === STUDIO_STATUS.ACTIVE;
}

export function canManageStudio(studio, marketerId) {
  if (!studio || !marketerId) return false;
  return studio.ownerId === marketerId || studio.ownerId === marketerId;
}

export function getStudioSlug(studio) {
  return studio?.slug || studio?.name?.toLowerCase().replace(/\s+/g, "-") || "";
}

export function getStudioUrl(studio, domain = null) {
  if (!studio) return null;
  const slug = getStudioSlug(studio);
  if (domain) {
    return `https://${domain}`;
  }
  return `/u/${slug}`;
}

export function isValidStudioId(id) {
  if (!id || typeof id !== "string") return false;
  return id.length > 0 && id.length <= 100;
}

export function isValidStudioSlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.toLowerCase());
}

export const STUDIO_LIMIT = {
  MAX_NAME_LENGTH: 60,
  MAX_BIO_LENGTH: 500,
  MAX_SLUG_LENGTH: 50,
  MAX_PRODUCTS: 1000,
  MAX_COLLECTIONS: 100,
};
