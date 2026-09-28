/**
 * LikeLink Ads API Endpoint — Autonomous Advertising System
 * ========================================================
 * Real campaign management, creative generation, event tracking, and analytics.
 * All data validated, persisted via secure storage, and tied to real products/marketers.
 * No fake metrics, no fabricated conversions, no placeholder content.
 */

import { readBody } from "./_utils/readBody.mjs";
import { jsonCors, isApprovedOrigin } from "./_utils/cors.js";
import { verifyAdminToken } from "./_utils/adminAuth.js";
import { audit } from "./_utils/audit.js";
import { kvGet, kvSet, kvDelete } from "./store.mjs";
import {
  CAMPAIGN_OBJECTIVE,
  CAMPAIGN_STATUS,
  CREATIVE_FORMAT,
  CREATIVE_TYPE,
  PLACEMENT,
  CAMPAIGN_TIER,
  isValidObjective,
  isValidStatus,
  isValidFormat,
  isValidType,
  isValidPlacement,
  isValidTier,
} from "../src/lib/ads/types.js";
import {
  validateCampaign,
  createCampaign,
  updateCampaign,
  canTransitionStatus,
  getTierLimits,
  canAddCreative,
  canCreateCampaign,
  calculateCampaignHealth,
  calculateROAS,
  calculateCTR,
  calculateCPC,
  calculateConversionRate,
  updateMetrics,
  createCampaignEvent,
  buildCampaignUTM,
  buildTrackedUrl,
} from "../src/lib/ads/campaignManager.js";
import {
  generateCreative,
  buildCreativePack,
  getAvailableCreativeTypesForPlacement,
  getRecommendedCreativeTypeForPlacement,
} from "../src/lib/ads/creativeStudio.js";
import {
  makeLunaDecision,
  analyzeCampaignPerformance,
  analyzeCreativePerformance,
  recommendCreativeAction,
  generateLunaInsights,
  recordLunaDecision,
} from "../src/lib/ads/lunaAdsBrain.js";
import {
  getPlacementSpec,
  getAllNativePlacements,
  getPlacementsForCampaign,
  getAvailablePlacementsForTier,
  createPlacementInstance,
  validatePlacementConfig,
  calculatePlacementScore,
  getPlacementLabels,
} from "../src/lib/ads/nativeNetwork.js";
import {
  createAdEvent,
  buildAttributionChain,
  buildAttributionReport,
  calculateAttribution,
  buildEventFromClient,
  sendBeacon,
  queueEventForBatch,
} from "../src/lib/ads/tracking.js";
import {
  findSponsoredCandidates,
  selectSponsoredProducts,
  buildContextualAdUnit,
  createContextualRecommendation,
  buildSponsoredFeedUnit,
  buildSponsoredSearchUnit,
  buildSponsoredDiscoveryUnit,
} from "../src/lib/ads/contextualEngine.js";

const CAMPAIGNS_KV_KEY = "ads:campaigns";
const CREATIVES_KV_KEY = "ads:creatives";
const EVENTS_KV_KEY = "ads:events";
const ATTRIBUTION_KV_KEY = "ads:attribution";
const SESSION_KV_KEY = "ads:sessions";
const PLACEMENTS_KV_KEY = "ads:placements";
const LUNA_DECISIONS_KV_KEY = "ads:luna:decisions";

const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_EVENTS_PER_MINUTE = 100;
const eventRateMap = new Map(); // ip => [timestamps]

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

async function getCampaigns() {
  const campaigns = await kvGet(CAMPAIGNS_KV_KEY);
  return Array.isArray(campaigns) ? campaigns : [];
}

async function setCampaigns(campaigns) {
  await kvSet(CAMPAIGNS_KV_KEY, campaigns);
}

async function getCreatives() {
  const creatives = await kvGet(CREATIVES_KV_KEY);
  return Array.isArray(creatives) ? creatives : [];
}

async function setCreatives(creatives) {
  await kvSet(CREATIVES_KV_KEY, creatives);
}

async function getEvents() {
  const events = await kvGet(EVENTS_KV_KEY);
  return Array.isArray(events) ? events : [];
}

async function setEvents(events) {
  await kvSet(EVENTS_KV_KEY, events);
}

async function getPlacements() {
  const placements = await kvGet(PLACEMENTS_KV_KEY);
  return Array.isArray(placements) ? placements : [];
}

async function setPlacements(placements) {
  await kvSet(PLACEMENTS_KV_KEY, placements);
}

async function getLunaDecisions() {
  const decisions = await kvGet(LUNA_DECISIONS_KV_KEY);
  return Array.isArray(decisions) ? decisions : [];
}

async function setLunaDecisions(decisions) {
  await kvSet(LUNA_DECISIONS_KV_KEY, decisions);
}

function generateId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rateLimitByIp(ip) {
  if (!ip) return true; // Allow unknown IPs for now (can be tightened later)
  const now = Date.now();
  const window = (eventRateMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (window.length >= MAX_EVENTS_PER_MINUTE) return false;
  window.push(now);
  eventRateMap.set(ip, window);
  return true;
}

function sanitizeHtml(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "&#039;");
}

export default async function adsHandler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const origin = getHeader(req, "origin");
  if (!isApprovedOrigin(origin)) {
    json(res, { ok: false, error: "origin_not_allowed" }, 403, req);
    return;
  }

  const action = new URL(req.url, "https://x").searchParams.get("mode") || "list";
  const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";

  try {
    switch (action) {
      // === CAMPAIGN MANAGEMENT ===
      case "list": {
        const campaigns = await getCampaigns();
        const marketerId = getHeader(req, "x-marketer-id");
        const filtered = marketerId
          ? campaigns.filter((c) => c.marketerId === marketerId)
          : campaigns;
        json(res, { ok: true, campaigns: filtered, count: filtered.length }, 200, req);
        break;
      }

      case "create": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id") || body.marketerId;
        if (!marketerId) {
          json(res, { ok: false, error: "marketer_id_required" }, 401, req);
          return;
        }

        const productId = body.productId;
        if (!productId) {
          json(res, { ok: false, error: "product_id_required" }, 400, req);
          return;
        }

        // Verify product exists in catalog
        const products = await kvGet("marketplace:products") || [];
        const product = products.find((p) => p.id === productId);
        if (!product) {
          json(res, { ok: false, error: "product_not_found" }, 404, req);
          return;
        }

        // Validate campaign data
        const validation = validateCampaign(body, { tier: body.tier || "starter", marketerId });
        if (!validation.valid) {
          json(res, { ok: false, errors: validation.errors }, 400, req);
          return;
        }

        const limits = getTierLimits(body.tier || "starter");
        const campaigns = await getCampaigns();
        if (!canCreateCampaign(campaigns.length, body.tier || "starter")) {
          json(
            res,
            {
              ok: false,
              error: `campaign_limit_exceeded`,
              details: `Maximum ${limits.maxCampaigns} campaigns allowed for ${body.tier || "starter"} tier`,
            },
            403,
            req
          );
          return;
        }

        const campaignResult = createCampaign(body, { tier: body.tier || "starter", marketerId });
        if (!campaignResult.ok) {
          json(res, { ok: false, errors: campaignResult.errors }, 400, req);
          return;
        }

        const campaign = campaignResult.campaign;
        const updatedCampaigns = [...campaigns, campaign];
        await setCampaigns(updatedCampaigns);

        audit.logApiSuccess(
          { type: "campaign_created", campaignId: campaign.id, productId: product.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, campaign }, 201, req);
        break;
      }

      case "get": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const campaigns = await getCampaigns();
        const campaign = campaigns.find((c) => c.id === campaignId);
        if (!campaign) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        json(res, { ok: true, campaign }, 200, req);
        break;
      }

      case "update": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const campaignId = body.id;
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex((c) => c.id === campaignId);
        if (index === -1) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const campaign = campaigns[index];
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        // Validate status transition if provided
        if (body.status && body.status !== campaign.status) {
          if (!canTransitionStatus(campaign.status, body.status)) {
            json(
              res,
              {
                ok: false,
                error: `invalid_status_transition`,
                details: `Cannot transition from ${campaign.status} to ${body.status}`,
              },
              400,
              req
            );
            return;
          }
        }

        // Validate creative limits if creatives are being added
        if (body.creatives && Array.isArray(body.creatives)) {
          const currentCreativeCount = campaign.creatives?.length || 0;
          const newCreativeCount = body.creatives.length;
          if (!canAddCreative(campaign, currentCreativeCount + newCreativeCount)) {
            const limits = getTierLimits(campaign.tier);
            json(
              res,
              {
                ok: false,
                error: `creative_limit_exceeded`,
                details: `Maximum ${limits.maxCreatives} creatives allowed for ${campaign.tier} tier`,
              },
              403,
              req
            );
            return;
          }
        }

        const updatedCampaign = updateCampaign(campaign, body);
        campaigns[index] = updatedCampaign;
        await setCampaigns(campaigns);

        audit.logApiSuccess(
          { type: "campaign_updated", campaignId: campaign.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, campaign: updatedCampaign }, 200, req);
        break;
      }

      case "delete": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex((c) => c.id === campaignId);
        if (index === -1) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const campaign = campaigns[index];
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        // Only allow deletion of draft/completed/archived campaigns
        if (!["draft", "completed", "archived"].includes(campaign.status)) {
          json(
            res,
            {
              ok: false,
              error: `cannot_delete_active_campaign`,
              details: `Active or paused campaigns cannot be deleted. Pause or complete first.`,
            },
            400,
            req
          );
          return;
        }

        campaigns.splice(index, 1);
        await setCampaigns(campaigns);

        audit.logApiSuccess(
          { type: "campaign_deleted", campaignId: campaign.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, message: "campaign_deleted" }, 200, req);
        break;
      }

      case "activate": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex((c) => c.id === campaignId);
        if (index === -1) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const campaign = campaigns[index];
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        if (!["draft", "pending_review", "paused"].includes(campaign.status)) {
          json(
            res,
            {
              ok: false,
              error: `invalid_status_for_activation`,
              details: `Campaign must be in draft, pending_review, or paused status to activate`,
            },
            400,
            req
          );
          return;
        }

        const updatedCampaign = updateCampaign(campaign, { status: "active" });
        campaigns[index] = updatedCampaign;
        await setCampaigns(campaigns);

        audit.logApiSuccess(
          { type: "campaign_activated", campaignId: campaign.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, campaign: updatedCampaign }, 200, req);
        break;
      }

      case "pause": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex((c) => c.id === campaignId);
        if (index === -1) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const campaign = campaigns[index];
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        if (campaign.status !== "active") {
          json(
            res,
            {
              ok: false,
              error: `invalid_status_for_pause`,
              details: `Only active campaigns can be paused`,
            },
            400,
            req
          );
          return;
        }

        const updatedCampaign = updateCampaign(campaign, { status: "paused" });
        campaigns[index] = updatedCampaign;
        await setCampaigns(campaigns);

        audit.logApiSuccess(
          { type: "campaign_paused", campaignId: campaign.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, campaign: updatedCampaign }, 200, req);
        break;
      }

      case "complete": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const index = campaigns.findIndex((c) => c.id === campaignId);
        if (index === -1) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }

        const campaign = campaigns[index];
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        if (!["active", "paused"].includes(campaign.status)) {
          json(
            res,
            {
              ok: false,
              error: `invalid_status_for_completion`,
              details: `Only active or paused campaigns can be completed`,
            },
            400,
            req
          );
          return;
        }

        const updatedCampaign = updateCampaign(campaign, { status: "completed" });
        campaigns[index] = updatedCampaign;
        await setCampaigns(campaigns);

        audit.logApiSuccess(
          { type: "campaign_completed", campaignId: campaign.id },
          { type: "ads_campaign" },
          { _req: req }
        );

        json(res, { ok: true, campaign: updatedCampaign }, 200, req);
        break;
      }

      // === CREATIVE GENERATION ===
      case "creative-generate": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id") || body.marketerId;
        if (!marketerId) {
          json(res, { ok: false, error: "marketer_id_required" }, 401, req);
          return;
        }

        const productId = body.productId;
        if (!productId) {
          json(res, { ok: false, error: "product_id_required" }, 400, req);
          return;
        }

        const products = await kvGet("marketplace:products") || [];
        const product = products.find((p) => p.id === productId);
        if (!product) {
          json(res, { ok: false, error: "product_not_found" }, 404, req);
          return;
        }

        const type = body.type || "ugc";
        const placementId = body.placementId || "feed_sponsored";
        const campaignId = body.campaignId;

        if (!isValidType(type)) {
          json(res, { ok: false, error: "invalid_creative_type" }, 400, req);
          return;
        }

        if (!isValidPlacement(placementId)) {
          json(res, { ok: false, error: "invalid_placement" }, 400, req);
          return;
        }

        // Check if campaign exists and belongs to marketer
        let campaign = null;
        if (campaignId) {
          const campaigns = await getCampaigns();
          campaign = campaigns.find((c) => c.id === campaignId);
          if (!campaign) {
            json(res, { ok: false, error: "campaign_not_found" }, 404, req);
            return;
          }
          if (marketerId && campaign.marketerId !== marketerId) {
            json(res, { ok: false, error: "unauthorized" }, 403, req);
            return;
          }
          if (!canAddCreative(campaign, (campaign.creatives?.length || 0) + 1)) {
            const limits = getTierLimits(campaign.tier);
            json(
              res,
              {
                ok: false,
                error: `creative_limit_exceeded`,
                details: `Maximum ${limits.maxCreatives} creatives allowed for ${campaign.tier} tier`,
              },
              403,
              req
            );
            return;
          }
        }

        const trackedUrl = body.trackedUrl || product.affiliateUrl || product.url || "";
        const creative = generateCreative(product, type, placementId, {
          marketerId,
          trackedUrl,
          lang: "he",
        });

        if (!creative) {
          json(res, { ok: false, error: "creative_generation_failed" }, 500, req);
          return;
        }

        const creatives = await getCreatives();
        creatives.push(creative);
        await setCreatives(creatives);

        // Update campaign if provided
        if (campaignId) {
          const campaigns = await getCampaigns();
          const campaignIndex = campaigns.findIndex((c) => c.id === campaignId);
          if (campaignIndex !== -1) {
            const updatedCampaign = {
              ...campaigns[campaignIndex],
              creatives: [...(campaigns[campaignIndex].creatives || []), creative.id],
            };
            campaigns[campaignIndex] = updatedCampaign;
            await setCampaigns(campaigns);
          }
        }

        audit.logApiSuccess(
          {
            type: "creative_generated",
            creativeId: creative.id,
            productId: product.id,
            campaignId: campaignId || null,
            type,
            placementId,
          },
          { type: "ads_creative" },
          { _req: req }
        );

        json(res, { ok: true, creative }, 201, req);
        break;
      }

      case "creative-pack": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id") || body.marketerId;
        if (!marketerId) {
          json(res, { ok: false, error: "marketer_id_required" }, 401, req);
          return;
        }

        const productId = body.productId;
        if (!productId) {
          json(res, { ok: false, error: "product_id_required" }, 400, req);
          return;
        }

        const products = await kvGet("marketplace:products") || [];
        const product = products.find((p) => p.id === productId);
        if (!product) {
          json(res, { ok: false, error: "product_not_found" }, 404, req);
          return;
        }

        const placementId = body.placementId || "feed_sponsored";
        const campaignId = body.campaignId;
        const types = body.types || ["ugc", "cinematic_3d", "product_demo", "lifestyle"];

        if (!isValidPlacement(placementId)) {
          json(res, { ok: false, error: "invalid_placement" }, 400, req);
          return;
        }

        // Validate types
        for (const type of types) {
          if (!isValidType(type)) {
            json(res, { ok: false, error: `invalid_creative_type: ${type}` }, 400, req);
            return;
          }
        }

        // Check campaign limits
        if (campaignId) {
          const campaigns = await getCampaigns();
          const campaign = campaigns.find((c) => c.id === campaignId);
          if (!campaign) {
            json(res, { ok: false, error: "campaign_not_found" }, 404, req);
            return;
          }
          if (marketerId && campaign.marketerId !== marketerId) {
            json(res, { ok: false, error: "unauthorized" }, 403, req);
            return;
          }
          const currentCount = campaign.creatives?.length || 0;
          if (!canAddCreative(campaign, currentCount + types.length)) {
            const limits = getTierLimits(campaign.tier);
            json(
              res,
              {
                ok: false,
                error: `creative_limit_exceeded`,
                details: `Maximum ${limits.maxCreatives} creatives allowed for ${campaign.tier} tier`,
              },
              403,
              req
            );
            return;
          }
        }

        const trackedUrl = body.trackedUrl || product.affiliateUrl || product.url || "";
        const pack = buildCreativePack(product, placementId, types, {
          marketerId,
          trackedUrl,
          lang: "he",
        });

        if (!pack) {
          json(res, { ok: false, error: "creative_pack_generation_failed" }, 500, req);
          return;
        }

        const creatives = await getCreatives();
        creatives.push(...pack.creatives);
        await setCreatives(creatives);

        // Update campaign if provided
        if (campaignId) {
          const campaigns = await getCampaigns();
          const campaignIndex = campaigns.findIndex((c) => c.id === campaignId);
          if (campaignIndex !== -1) {
            const updatedCampaign = {
              ...campaigns[campaignIndex],
              creatives: [
                ...(campaigns[campaignIndex].creatives || []),
                ...pack.creatives.map((c) => c.id),
              ],
            };
            campaigns[campaignIndex] = updatedCampaign;
            await setCampaigns(campaigns);
          }
        }

        audit.logApiSuccess(
          {
            type: "creative_pack_generated",
            packSize: pack.creatives.length,
            productId: product.id,
            campaignId: campaignId || null,
            placementId,
            types,
          },
          { type: "ads_creative" },
          { _req: req }
        );

        json(res, { ok: true, pack }, 201, req);
        break;
      }

      // === EVENT TRACKING ===
      case "event": {
        // Rate limiting
        if (!rateLimitByIp(ip)) {
          json(res, { ok: false, error: "rate_limit_exceeded" }, 429, req);
          return;
        }

        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        // Build trusted event from client data
        const eventResult = createAdEvent(body);
        if (!eventResult.ok) {
          json(res, { ok: false, error: eventResult.error }, 400, req);
          return;
        }

        const event = eventResult.event;

        // Validate references exist
        const [campaigns, creatives, products, placements] = await Promise.all([
          getCampaigns(),
          getCreatives(),
          kvGet("marketplace:products") || [],
          getPlacements(),
        ]);

        if (event.campaignId) {
          const campaign = campaigns.find((c) => c.id === event.campaignId);
          if (!campaign) {
            json(res, { ok: false, error: "campaign_not_found" }, 404, req);
            return;
          }
          // Optional: verify marketer ownership for write-protected events
        }

        if (event.creativeId) {
          const creative = creatives.find((c) => c.id === event.creativeId);
          if (!creative) {
            json(res, { ok: false, error: "creative_not_found" }, 404, req);
            return;
          }
        }

        if (event.productId) {
          const product = products.find((p) => p.id === event.productId);
          if (!product) {
            json(res, { ok: false, error: "product_not_found" }, 404, req);
            return;
          }
        }

        if (event.placementId) {
          const placement = placements.find((p) => p.id === event.placementId);
          if (!placement) {
            json(res, { ok: false, error: "placement_not_found" }, 404, req);
            return;
          }
        }

        // Generate trusted server event ID and timestamp
        const trustedEvent = {
          ...event,
          id: generateId("evt"),
          timestamp: Date.now(),
          // Server-generated fields that override client
          meta: {
            ...(event.meta || {}),
            serverId: generateId("srv"),
            processedAt: Date.now(),
            sourceIp: ip,
          },
        };

        // Update campaign metrics if campaignId provided
        if (trustedEvent.campaignId) {
          const campaigns = await getCampaigns();
          const campaignIndex = campaigns.findIndex(
            (c) => c.id === trustedEvent.campaignId
          );
          if (campaignIndex !== -1) {
            const campaign = campaigns[campaignIndex];
            const updatedCampaign = updateMetrics(campaign, trustedEvent);
            campaigns[campaignIndex] = updatedCampaign;
            await setCampaigns(campaigns);
          }
        }

        // Store event
        const events = await getEvents();
        events.push(trustedEvent);
        // Keep only last 10000 events to prevent unbounded growth
        if (events.length > 10000) {
          events.splice(0, events.length - 10000);
        }
        await setEvents(events);

        audit.logApiSuccess(
          {
            type: "event_tracked",
            eventId: trustedEvent.id,
            eventType: trustedEvent.type,
            campaignId: trustedEvent.campaignId || null,
            creativeId: trustedEvent.creativeId || null,
          },
          { type: "ads_event" },
          { _req: req }
        );

        json(res, { ok: true, event: trustedEvent }, 201, req);
        break;
      }

      // === ANALYTICS & INSIGHTS ===
      case "analytics": {
        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const creatives = await getCreatives();
        const events = await getEvents();

        const filteredCampaigns = marketerId
          ? campaigns.filter((c) => c.marketerId === marketerId)
          : campaigns;
        const filteredCreatives = marketerId
          ? creatives.filter((c) => c.marketerId === marketerId)
          : creatives;
        const filteredEvents = marketerId
          ? events.filter((e) => e.marketerId === marketerId)
          : events;

        // Calculate overview metrics
        const overviewMetrics = filteredCampaigns.reduce(
          (acc, c) => {
            const m = c.metrics || {};
            acc.impressions += m.impressions || 0;
            acc.creativeViews += m.creativeViews || 0;
            acc.clicks += m.clicks || 0;
            acc.productViews += m.productViews || 0;
            acc.outboundClicks += m.outboundClicks || 0;
            acc.purchases += m.purchases || 0;
            acc.spend += m.spend || 0;
            acc.revenue += m.revenue || 0;
            return acc;
          },
          {
            impressions: 0,
            creativeViews: 0,
            clicks: 0,
            productViews: 0,
            outboundClicks: 0,
            purchases: 0,
            spend: 0,
            revenue: 0,
          }
        );

        const ctr =
          overviewMetrics.impressions > 0
            ? overviewMetrics.clicks / overviewMetrics.impressions
            : 0;
        const cpc =
          overviewMetrics.clicks > 0
            ? overviewMetrics.spend / overviewMetrics.clicks
            : 0;
        const roas =
          overviewMetrics.spend > 0
            ? overviewMetrics.revenue / overviewMetrics.spend
            : 0;
        const conversionRate =
          overviewMetrics.outboundClicks > 0
            ? overviewMetrics.purchases / overviewMetrics.outboundClicks
            : 0;

        // Campaign health summary
        const healthSummary = {
          healthy: 0,
          needs_attention: 0,
          needs_optimization: 0,
          critical: 0,
          unknown: 0,
        };
        for (const c of filteredCampaigns) {
          const health = c.health || calculateCampaignHealth(c);
          healthSummary[health.status] = (healthSummary[health.status] || 0) + 1;
        }

        // Placement performance
        const placementStats = {};
        for (const c of filteredCampaigns) {
          for (const placement of c.placements || []) {
            if (!placementStats[placement]) {
              placementStats[placement] = {
                impressions: 0,
                clicks: 0,
                ctr: 0,
                campaigns: 0,
              };
            }
            placementStats[placement].campaigns += 1;
            const m = c.metrics || {};
            placementStats[placement].impressions += m.impressions || 0;
            placementStats[placement].clicks += m.clicks || 0;
          }
        }
        for (const placement in placementStats) {
          const stats = placementStats[placement];
          stats.ctr =
            stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
        }

        // Creative type performance
        const creativeTypeStats = {};
        for (const c of filteredCreatives) {
          const type = c.type;
          if (!creativeTypeStats[type]) {
            creativeTypeStats[type] = {
              impressions: 0,
              clicks: 0,
              ctr: 0,
              creatives: 0,
            };
          }
          creativeTypeStats[type].creatives += 1;
          const m = c.metrics || {};
          creativeTypeStats[type].impressions += m.impressions || 0;
          creativeTypeStats[type].clicks += m.clicks || 0;
        }
        for (const type in creativeTypeStats) {
          const stats = creativeTypeStats[type];
          stats.ctr =
            stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
        }

        // Luna insights
        const lunaInsights = generateLunaInsights(
          filteredCampaigns,
          filteredCreatives,
          filteredEvents
        );

        json(res, {
          ok: true,
          analytics: {
            overview: {
              ...overviewMetrics,
              ctr,
              cpc,
              roas,
              conversionRate,
            },
            healthSummary,
            placementStats,
            creativeTypeStats,
            lunaInsights,
            timestamp: Date.now(),
          },
        }, 200, req);
        break;
      }

      case "luna": {
        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const creatives = await getCreatives();
        const events = await getEvents();

        const filteredCampaigns = marketerId
          ? campaigns.filter((c) => c.marketerId === marketerId)
          : campaigns;
        const filteredCreatives = marketerId
          ? creatives.filter((c) => c.marketerId === marketerId)
          : creatives;
        const filteredEvents = marketerId
          ? events.filter((e) => e.marketerId === marketerId)
          : events;

        const lunaInsights = generateLunaInsights(
          filteredCampaigns,
          filteredCreatives,
          filteredEvents
        );

        const lunaDecisions = await getLunaDecisions();
        const filteredDecisions = marketerId
          ? lunaDecisions.filter((d) => d.marketerId === marketerId)
          : lunaDecisions;

        json(res, {
          ok: true,
          luna: {
            insights: lunaInsights,
            recentDecisions: filteredDecisions.slice(-10), // Last 10 decisions
          },
        }, 200, req);
        break;
      }

      // === PLACEMENT & CONTEXTUAL ===
      case "placements": {
        const tier = getHeader(req, "x-tier") || "starter";
        const placements = getAvailablePlacementsForTier(tier);
        const labels = getPlacementLabels("he");
        const placementData = placements.map((p) => ({
          ...p,
          label: labels[p.id] || p.id,
        }));

        json(res, { ok: true, placements: placementData, tier }, 200, req);
        break;
      }

      case "contextual": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const products = await kvGet("marketplace:products") || [];
        const context = {
          category: body.category,
          intent: body.intent,
          priceMin: body.priceMin ? Number(body.priceMin) : undefined,
          priceMax: body.priceMax ? Number(body.priceMax) : undefined,
        };

        const placementId = body.placementId || PLACEMENT.CONTEXTUAL_RECOMMENDATION;
        if (!isValidPlacement(placementId)) {
          json(res, { ok: false, error: "invalid_placement" }, 400, req);
          return;
        }

        const count = body.count ? Math.min(Math.max(Number(body.count), 1), 10) : 3;
        const campaignFilters = body.campaignFilters || {};

        const candidates = findSponsoredCandidates(
          products,
          context,
          placementId,
          campaignFilters
        );
        const selected = selectSponsoredProducts(
          products,
          context,
          placementId,
          count,
          campaignFilters
        );

        json(res, {
          ok: true,
          contextual: {
            placementId,
            context,
            candidates: candidates.map((p) => ({
              id: p.id,
              title: p.title,
              price: p.price,
              image: p.image,
              category: p.category,
              affiliateUrl: p.affiliateUrl,
              url: p.url,
            })),
            selected: selected.map((p) => ({
              id: p.id,
              title: p.title,
              price: p.price,
              image: p.image,
              category: p.category,
              affiliateUrl: p.affiliateUrl,
              url: p.url,
            })),
            count: selected.length,
          },
        }, 200, req);
        break;
      }

      case "sponsored-unit": {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          json(res, { ok: false, error: "invalid_json" }, 400, req);
          return;
        }

        const productId = body.productId;
        if (!productId) {
          json(res, { ok: false, error: "product_id_required" }, 400, req);
          return;
        }

        const products = await kvGet("marketplace:products") || [];
        const product = products.find((p) => p.id === productId);
        if (!product) {
          json(res, { ok: false, error: "product_not_found" }, 404, req);
          return;
        }

        const creativeId = body.creativeId;
        let creative = null;
        if (creativeId) {
          const creatives = await getCreatives();
          creative = creatives.find((c) => c.id === creativeId);
          if (!creative) {
            json(res, { ok: false, error: "creative_not_found" }, 404, req);
            return;
          }
        }

        const placementId = body.placementId || PLACEMENT.FEED_SPONSORED;
        if (!isValidPlacement(placementId)) {
          json(res, { ok: false, error: "invalid_placement" }, 400, req);
          return;
        }

        const sessionId = body.sessionId || generateId("ses");
        const options = { sessionId };

        let unit = null;
        switch (placementId) {
          case PLACEMENT.FEED_SPONSORED:
            if (!product || !creative) {
              json(res, { ok: false, error: "product_or_creative_required" }, 400, req);
              return;
            }
            unit = buildSponsoredFeedUnit(product, creative, placementId, options);
            break;
          case PLACEMENT.SEARCH_SPONSORED:
            if (!product || !creative) {
              json(res, { ok: false, error: "product_or_creative_required" }, 400, req);
              return;
            }
            if (!body.query) {
              json(res, { ok: false, error: "query_required_for_search" }, 400, req);
              return;
            }
            unit = buildSponsoredSearchUnit(
              product,
              creative,
              placementId,
              body.query,
              options
            );
            break;
          case PLACEMENT.DISCOVERY_SPONSORED:
            if (!product || !creative) {
              json(res, { ok: false, error: "product_or_creative_required" }, 400, req);
              return;
            }
            unit = buildSponsoredDiscoveryUnit(product, creative, placementId, options);
            break;
          case PLACEMENT.CONTEXTUAL_RECOMMENDATION:
            unit = createContextualRecommendation(
              product,
              { category: body.category, intent: body.intent },
              options
            );
            break;
          default:
            json(res, { ok: false, error: "unsupported_placement_for_unit" }, 400, req);
            return;
        }

        if (!unit) {
          json(res, { ok: false, error: "unit_creation_failed" }, 500, req);
          return;
        }

        // Store placement for tracking
        const placements = await getPlacements();
        const placementInstance = createPlacementInstance(
          placementId,
          body.campaignId || null,
          creativeId || null,
          { bid: 0.5 } // Default bid
        );
        if (placementInstance) {
          placements.push(placementInstance);
          await setPlacements(placements);
        }

        json(res, { ok: true, unit }, 201, req);
        break;
      }

      // === LUNA DECISIONS ===
      case "luna-decision": {
        const campaignId = getHeader(req, "x-campaign-id");
        if (!campaignId) {
          json(res, { ok: false, error: "campaign_id_required" }, 400, req);
          return;
        }

        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const campaign = campaigns.find((c) => c.id === campaignId);
        if (!campaign) {
          json(res, { ok: false, error: "campaign_not_found" }, 404, req);
          return;
        }
        if (marketerId && campaign.marketerId !== marketerId) {
          json(res, { ok: false, error: "unauthorized" }, 403, req);
          return;
        }

        const creatives = await getCreatives();
        const campaignCreatives = creatives.filter((c) =>
          campaign.creatives?.includes(c.id)
        );

        const lunaDecision = makeLunaDecision(campaign, campaignCreatives);
        const lunaAnalysis = analyzeCampaignPerformance(campaign);

        // Record the decision
        const lunaDecisionRecord = recordLunaDecision(
          campaign.id,
          lunaDecision,
          lunaAnalysis
        );

        const decisions = await getLunaDecisions();
        decisions.push(lunaDecisionRecord);
        await setLunaDecisions(decisions);

        audit.logApiSuccess(
          {
            type: "luna_decision_made",
            campaignId: campaign.id,
            decision: lunaDecision.decision,
            confidence: lunaDecision.confidence,
          },
          { type: "ads_luna" },
          { _req: req }
        );

        json(res, {
          ok: true,
          luna: {
            decision: lunaDecision,
            analysis: lunaAnalysis,
            record: lunaDecisionRecord,
          },
        }, 200, req);
        break;
      }

      case "luna-insights": {
        const marketerId = getHeader(req, "x-marketer-id");
        const campaigns = await getCampaigns();
        const creatives = await getCreatives();
        const events = await getEvents();

        const filteredCampaigns = marketerId
          ? campaigns.filter((c) => c.marketerId === marketerId)
          : campaigns;
        const filteredCreatives = marketerId
          ? creatives.filter((c) => c.marketerId === marketerId)
          : creatives;
        const filteredEvents = marketerId
          ? events.filter((e) => e.marketerId === marketerId)
          : events;

        const insights = generateLunaInsights(
          filteredCampaigns,
          filteredCreatives,
          filteredEvents
        );

        json(res, { ok: true, insights }, 200, req);
        break;
      }

      // === HEALTH & METRICS ===
      case "health": {
        const campaigns = await getCampaigns();
        const creatives = await getCreatives();
        const events = await getEvents();

        const healthData = {
          campaigns: campaigns.length,
          creatives: creatives.length,
          events: events.length,
          activeCampaigns: campaigns.filter((c) => c.status === "active").length,
          pendingCampaigns: campaigns.filter(
            (c) => c.status === "pending_review"
          ).length,
          draftCampaigns: campaigns.filter((c) => c.status === "draft").length,
          completedCampaigns: campaigns.filter(
            (c) => c.status === "completed"
          ).length,
          archivedCampaigns: campaigns.filter((c) => c.status === "archived").length,
          pausedCampaigns: campaigns.filter((c) => c.status === "paused").length,
          totalSpend: campaigns.reduce(
            (sum, c) => sum + (c.metrics?.spend || 0),
            0
          ),
          totalRevenue: campaigns.reduce(
            (sum, c) => sum + (c.metrics?.revenue || 0),
            0
          ),
          totalImpressions: campaigns.reduce(
            (sum, c) => sum + (c.metrics?.impressions || 0),
            0
          ),
          totalClicks: campaigns.reduce(
            (sum, c) => sum + (c.metrics?.clicks || 0),
            0
          ),
        };

        json(res, { ok: true, health: healthData }, 200, req);
        break;
      }

      default: {
        json(res, { ok: false, error: `unknown_mode: ${action}` }, 400, req);
        break;
      }
    }
  } catch (error) {
    console.error("Ads API error:", error);
    json(res, { ok: false, error: "internal_server_error" }, 500, req);
  }
}