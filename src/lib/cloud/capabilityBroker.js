/**
 * LikeLink Capability Broker — central decision layer.
 *
 * Supported intents:
 *   publishProduct, launchProduct, createCreative, shareProduct,
 *   publishContent, refreshProductContent, discoverTrend, prepareAffiliateProduct
 *
 * Reuses existing modules only:
 *   - launch.js
 *   - campaign.js
 *   - contentStudio.js
 *   - trends.js / trendScanner.js
 *   - growth.js
 *   - connectionManager.js
 *
 * Never fakes publication. Never invents data. Never bypasses OAuth.
 */

import { launchProduct, summarizeLaunch } from "./launch.js";
import { buildCampaign, planDistribution } from "./campaign.js";
import { generateContentPack } from "./contentStudio.js";
import { trendScore, rankByTrend, trendSummary } from "./trends.js";
import { selectOpportunity, productSignals } from "./growth.js";
import { createProduct, isPublicCatalogProduct, deduplicate } from "./catalog.js";
import {
  CONNECTION_STATE,
  getConnectionState,
  summarizeConnectionHealth,
  listConnectionStates,
} from "./connectionManager.js";

export const INTENT = {
  PUBLISH_PRODUCT: "publishProduct",
  LAUNCH_PRODUCT: "launchProduct",
  CREATE_CREATIVE: "createCreative",
  SHARE_PRODUCT: "shareProduct",
  PUBLISH_CONTENT: "publishContent",
  REFRESH_PRODUCT_CONTENT: "refreshProductContent",
  DISCOVER_TREND: "discoverTrend",
  PREPARE_AFFILIATE_PRODUCT: "prepareAffiliateProduct",
};

export function evaluateCapability(ctx, intent, payload = {}) {
  const { store = {}, origin = "", env = {} } = ctx;
  const health = summarizeConnectionHealth(store);
  const channels = listConnectionStates(store);
  const readyChannels = channels.filter((c) => c.state === CONNECTION_STATE.CONNECTED).length;
  const blockedChannels = channels.filter((c) => c.state === CONNECTION_STATE.BLOCKED || c.state === CONNECTION_STATE.REAUTH_REQUIRED).length;

  let capability = "READY";
  let actionRequired = null;
  let detail = "";

  switch (intent) {
    case INTENT.LAUNCH_PRODUCT:
    case INTENT.PUBLISH_PRODUCT: {
      const product = payload.product;
      if (!product) {
        capability = "BLOCKED";
        detail = "no_product";
        actionRequired = "Provide a valid product record.";
        break;
      }
      if (product.status !== "approved") {
        capability = "BLOCKED";
        detail = `product_status_${product.status}`;
        actionRequired = "Approve the product before launching.";
        break;
      }
      if (!product.marketerId) {
        capability = "BLOCKED";
        detail = "missing_marketerId";
        actionRequired = "Assign a verified marketerId to the product.";
        break;
      }
      const conn = getConnectionState(store, "autopilot");
      if (conn && conn.state === CONNECTION_STATE.REAUTH_REQUIRED) {
        capability = "ACTION_REQUIRED";
        detail = "autopilot_reconnect";
        actionRequired = "Reconnect autopilot channels to resume publishing.";
        break;
      }
      if (readyChannels === 0 && blockedChannels === 0) {
        capability = "ACTION_REQUIRED";
        detail = "no_authorized_channels";
        actionRequired = "Connect at least one channel in studio settings.";
        break;
      }
      capability = readyChannels > 0 ? "READY" : "ACTION_REQUIRED";
      detail = readyChannels > 0 ? "channels_ready" : "channels_blocked";
      actionRequired = readyChannels > 0 ? null : "Review blocked channels and reconnect.";
      break;
    }
    case INTENT.CREATE_CREATIVE:
    case INTENT.PUBLISH_CONTENT: {
      const product = payload.product;
      if (!product) {
        capability = "BLOCKED";
        detail = "no_product";
        actionRequired = "Provide a valid product record.";
        break;
      }
      capability = "READY";
      detail = "content_generation_ready";
      break;
    }
    case INTENT.SHARE_PRODUCT: {
      const product = payload.product;
      if (!product?.affiliateUrl && !product?.id) {
        capability = "BLOCKED";
        detail = "no_shareable_target";
        actionRequired = "Product needs an affiliateUrl or public product id.";
        break;
      }
      capability = "READY";
      detail = "share_ready";
      break;
    }
    case INTENT.DISCOVER_TREND: {
      capability = "READY";
      detail = "trends_use_first_party_data";
      break;
    }
    case INTENT.PREPARE_AFFILIATE_PRODUCT: {
      const product = payload.product;
      if (!product?.affiliateUrl) {
        capability = "ACTION_REQUIRED";
        detail = "missing_affiliate_url";
        actionRequired = "Add a legitimate affiliateUrl from the source program.";
        break;
      }
      capability = "READY";
      detail = "affiliate_tracking_ready";
      break;
    }
    default:
      capability = "UNAVAILABLE";
      detail = "unknown_intent";
  }

  return {
    intent,
    capability,
    detail,
    actionRequired,
    readyChannels,
    blockedChannels,
    connectionHealth: health,
    evaluatedAt: Date.now(),
  };
}

export async function executeIntent(ctx, intent, payload = {}) {
  const evaluation = evaluateCapability(ctx, intent, payload);
  if (evaluation.capability !== "READY") {
    return { ok: false, capability: evaluation.capability, detail: evaluation.detail, actionRequired: evaluation.actionRequired };
  }

  try {
    switch (intent) {
      case INTENT.LAUNCH_PRODUCT: {
        const result = await launchProduct(payload.product, {
          marketer: payload.marketer,
          products: payload.products,
          clicks: payload.clicks,
          config: payload.config || { enabled: false },
        });
        return { ok: result.ok, capability: result.ok ? "READY" : "BLOCKED", detail: result.blockedReason || result.error || "launched", result };
      }
      case INTENT.CREATE_CREATIVE: {
        const pack = generateContentPack(payload.product, { format: payload.format || "all" });
        return { ok: !!pack, capability: "READY", detail: "content_pack_created", result: pack };
      }
      case INTENT.DISCOVER_TREND: {
        const summary = trendSummary(payload.products || [], { sales: payload.sales || [], clicks: payload.clicks || [] });
        return { ok: true, capability: "READY", detail: "trends_computed", result: summary };
      }
      case INTENT.PREPARE_AFFILIATE_PRODUCT: {
        const signals = productSignals(payload.product, { sales: payload.sales || [], clicks: payload.clicks || [] });
        const campaign = buildCampaign(payload.product, { storeUrl: payload.storeUrl || "" });
        return { ok: true, capability: "READY", detail: "affiliate_assets_prepared", result: { signals, campaign } };
      }
      default:
        return { ok: false, capability: "UNAVAILABLE", detail: "intent_not_implemented" };
    }
  } catch (e) {
    return { ok: false, capability: "ERROR", detail: String(e.message || e) };
  }
}
