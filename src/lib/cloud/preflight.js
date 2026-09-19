/**
 * LikeLink Pre-flight — validates every real action before execution.
 *
 * Returns:
 *   READY
 *   ACTION_REQUIRED
 *   BLOCKED
 *
 * If ACTION_REQUIRED: tells the user exactly one simple next action.
 */

import { isPublicCatalogProduct, hasValidAttribution } from "./catalog.js";
import { CONNECTION_STATE, getConnectionState, summarizeConnectionHealth } from "./connectionManager.js";
import { assertOwnership } from "./securityControls.js";

export const PREFLIGHT = {
  READY: "READY",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  BLOCKED: "BLOCKED",
};

export function preflightPublishProduct({ product, marketer, store = {}, channels = [] }) {
  if (!product) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_product", nextAction: "Create a product first." };
  }
  if (product.status !== "approved") {
    return { status: PREFLIGHT.BLOCKED, reason: "not_approved", nextAction: "Approve the product in admin." };
  }
  if (!product.marketerId) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_marketerId", nextAction: "Assign a marketer to the product." };
  }
  const ownership = assertOwnership({ actor: marketer, resourceOwnerId: product.marketerId, resourceType: "product" });
  if (!ownership.ok) {
    return { status: PREFLIGHT.BLOCKED, reason: ownership.reason, nextAction: ownership.action };
  }

  const health = summarizeConnectionHealth(store);
  if (health.blocked > 0 && health.connected === 0) {
    return { status: PREFLIGHT.ACTION_REQUIRED, reason: "channels_blocked", nextAction: "Reconnect blocked channels in settings." };
  }
  if (health.connected === 0 && channels.length === 0) {
    return { status: PREFLIGHT.ACTION_REQUIRED, reason: "no_channels", nextAction: "Connect at least one channel to publish." };
  }

  return { status: PREFLIGHT.READY, reason: "all_checks_passed", nextAction: null };
}

export function preflightLaunch({ product, marketer, products, clicks, config }) {
  if (!product) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_product", nextAction: "Select a product to launch." };
  }
  if (product.status !== "approved") {
    return { status: PREFLIGHT.BLOCKED, reason: "not_approved", nextAction: "Approve the product before launch." };
  }
  if (!product.marketerId) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_marketerId", nextAction: "Assign ownership to the product." };
  }

  return { status: PREFLIGHT.READY, reason: "launch_ready", nextAction: null };
}

export function preflightShare({ product, marketer }) {
  if (!product) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_product", nextAction: "Select a product to share." };
  }
  if (!product.affiliateUrl && !product.id) {
    return { status: PREFLIGHT.BLOCKED, reason: "no_shareable_link", nextAction: "Add an affiliateUrl or publish the product first." };
  }
  return { status: PREFLIGHT.READY, reason: "share_ready", nextAction: null };
}
