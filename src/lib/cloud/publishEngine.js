/**
 * Universal Publishing Engine — unified publish interface.
 * ==============
 * Extends the EXISTING architecture:
 *   - connectionManager.js (connection state, idempotency, recovery)
 *   - capabilityBroker.js (intent resolution, capability evaluation)
 *   - preflight.js (ownership, approval, channel validation)
 *   - contentStudio.js (creative pack generation)
 *   - campaign.js (tracked links, hook angles)
 *   - distributionIntelligence.js (distribution state resolution)
 *
 * Never fakes publication. Never bypasses OAuth. Never stores tokens in
 * localStorage or browser bundles.
 *
 * Normalized publish(intent) result:
 * {
 *   status: "PUBLISHED" | "PROCESSING" | "ACTION_REQUIRED" | "ASSISTED" |
 *           "BLOCKED" | "FAILED" | "UNAVAILABLE",
 *   provider,
 *   platformPostId,
 *   publishedUrl,
 *   message,
 *   retryable,
 *   nextAction,
 *   results: [{ provider, status, detail, platformPostId, publishedUrl, message }],
 *   assisted: { copy, open, share, download, caption, link, hashtags },
 *   idempotencyKey
 * }
 */

import { evaluateCapability, executeIntent, INTENT } from "./capabilityBroker.js";
import { preflightPublishProduct } from "./preflight.js";
import { generateContentPack } from "./contentStudio.js";
import { buildCampaign } from "./campaign.js";
import { recommendHookAngles } from "./hooks.js";
import { resolveDistributionState, DISTRIBUTION_STATES, getBestFallback, DISTRIBUTION_FALLBACKS } from "./distributionIntelligence.js";
import { createProvenance, EVIDENCE_LEVELS, validateGrowthSignal } from "./securityControls.js";
import {
  CONNECTION_STATE, getProviderConnectionState, CONNECTED_STATES,
  getConnectionState, listConnectionStates, summarizeConnectionHealth,
} from "./connectionManager.js";
import { buildEditSpec } from "./videoEditing.js";
import { generateVoiceoverScript } from "./voiceoverScript.js";

export const PUBLISH_STATUS = Object.freeze({
  PUBLISHED: "PUBLISHED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  ACTION_REQUIRED: "ACTION_REQUIRED",
  ASSISTED: "ASSISTED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  UNAVAILABLE: "UNAVAILABLE",
});

export const PROVIDER_TYPE = Object.freeze({
  TELEGRAM: "telegram",
  WEBHOOK: "webhook",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  X: "x",
  LINKEDIN: "linkedin",
  DISCORD: "discord",
  SLACK: "slack",
  PINTEREST: "pinterest",
  WORDPRESS: "wordpress",
  MASTODON: "mastodon",
  BLUESKY: "bluesky",
  REDDIT: "reddit",
  WHATSAPP: "whatsapp",
  OWNED_WEB: "owned_web",
  UNKNOWN: "unknown",
});

const PROVIDER_LABELS = {
  telegram: { he: "טלגרם", en: "Telegram" },
  webhook: { he: "וובהוק", en: "Webhook" },
  facebook: { he: "פייסבוק", en: "Facebook" },
  instagram: { he: "אינסטגרם", en: "Instagram" },
  x: { he: "X (טוויטר)", en: "X (Twitter)" },
  linkedin: { he: "לינקדין", en: "LinkedIn" },
  discord: { he: "דיסקורד", en: "Discord" },
  slack: { he: "סלאק", en: "Slack" },
  pinterest: { he: "פינטרסט", en: "Pinterest" },
  wordpress: { he: "וורדפרס", en: "WordPress" },
  mastodon: { he: "מסטודון", en: "Mastodon" },
  bluesky: { he: "בלוסקי", en: "Bluesky" },
  reddit: { he: "רדדיט", en: "Reddit" },
  whatsapp: { he: "וואטסאפ", en: "WhatsApp" },
  owned_web: { he: "אתר אישי", en: "Personal Site" },
};

export function labelProvider(provider, lang = "he") {
  const entry = PROVIDER_LABELS[provider] || { he: String(provider), en: String(provider) };
  return entry[lang] || entry.he || String(provider);
}

export const PROVIDER_CAPABILITIES = Object.freeze({
  [PROVIDER_TYPE.TELEGRAM]: { publish: true, media: true, text: true, schedule: true, analytics: true },
  [PROVIDER_TYPE.WEBHOOK]: { publish: true, media: true, text: true, schedule: true, analytics: false },
  [PROVIDER_TYPE.FACEBOOK]: { publish: true, media: true, text: true, schedule: true, analytics: true },
  [PROVIDER_TYPE.INSTAGRAM]: { publish: true, media: true, text: true, schedule: false, analytics: true },
  [PROVIDER_TYPE.X]: { publish: true, media: true, text: true, schedule: false, analytics: true },
  [PROVIDER_TYPE.LINKEDIN]: { publish: true, media: false, text: true, schedule: false, analytics: true },
  [PROVIDER_TYPE.DISCORD]: { publish: true, media: true, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.SLACK]: { publish: true, media: true, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.PINTEREST]: { publish: true, media: true, text: true, schedule: false, analytics: true },
  [PROVIDER_TYPE.WORDPRESS]: { publish: true, media: true, text: true, schedule: true, analytics: true },
  [PROVIDER_TYPE.MASTODON]: { publish: true, media: false, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.BLUESKY]: { publish: true, media: false, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.REDDIT]: { publish: true, media: false, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.WHATSAPP]: { publish: true, media: true, text: true, schedule: false, analytics: false },
  [PROVIDER_TYPE.OWNED_WEB]: { publish: true, media: true, text: true, schedule: true, analytics: true },
});

export const SOCIAL_CHANNEL_TYPES = [
  PROVIDER_TYPE.TELEGRAM, PROVIDER_TYPE.WEBHOOK,
  PROVIDER_TYPE.FACEBOOK, PROVIDER_TYPE.INSTAGRAM,
  PROVIDER_TYPE.X, PROVIDER_TYPE.LINKEDIN,
  PROVIDER_TYPE.DISCORD, PROVIDER_TYPE.SLACK,
  PROVIDER_TYPE.PINTEREST, PROVIDER_TYPE.WORDPRESS,
  PROVIDER_TYPE.MASTODON, PROVIDER_TYPE.BLUESKY,
  PROVIDER_TYPE.REDDIT, PROVIDER_TYPE.WHATSAPP,
  PROVIDER_TYPE.OWNED_WEB,
];

function buildIdempotencyKey({ product, provider, marketerId, mode }) {
  const ts = Math.floor(Date.now() / 1000);
  return `${provider}:${marketerId || "unknown"}:${product?.id || "unknown"}:${mode || "direct"}:${ts}`;
}

function safeText(text, maxLen = 2000) {
  return String(text || "").slice(0, maxLen);
}

export function buildPublishIntent({ product, marketer, content, link, language = "he", format = "post", channel = null, idempotencyKey = null }) {
  return {
    product: product || null,
    marketer: marketer || null,
    content: content || "",
    link: link || "",
    language,
    format,
    channel,
    idempotencyKey: idempotencyKey || buildIdempotencyKey({ product, provider: channel || "any", marketerId: marketer?.id }),
    timestamp: Date.now(),
  };
}

export function buildCreativePackForPublish({ product, marketer, store = {}, language = "he", channel = null, clicks = [] }) {
  const pack = {};
  try {
    const contentPack = generateContentPack(product, { format: "all" });
    const allFormat = contentPack?.formats?.all;
    pack.caption = (allFormat?.body || allFormat?.headline || contentPack?.hook || product.title);
    pack.hook = contentPack?.hook || "";
    pack.formats = contentPack?.formats || {};
    pack.hashtags = contentPack?.hashtags || [];
  } catch {
    pack.caption = product.title;
    pack.hook = "";
    pack.formats = {};
    pack.hashtags = [];
  }

  try {
    const measured = clicks?.length ? recommendHookAngles(clicks) : { byAngle: [] };
    const angleStats = Object.fromEntries((measured.byAngle || []).map((r) => [r.angle, r.clicks]));
    const storeUrl = typeof window !== "undefined"
      ? `${window.location.origin}/p/${product.id}`
      : `https://likelink2.vercel.app/p/${product.id}`;
    const campaign = buildCampaign(product, { storeUrl, angleStats });
    pack.campaign = campaign;
    pack.trackedUrl = campaign?.trackedUrl || storeUrl;
    pack.chosenHook = campaign?.chosenHook?.text || "";
  } catch {
    pack.trackedUrl = typeof window !== "undefined"
      ? `${window.location.origin}/p/${product.id}`
      : `https://likelink2.vercel.app/p/${product.id}`;
  }

  try {
    const editSpec = buildEditSpec({ creative: { product, creativeType: "reel" }, product });
    pack.editSpec = editSpec;
  } catch {
    pack.editSpec = null;
  }

  try {
    const vo = generateVoiceoverScript({ creative: { product }, product });
    pack.voiceover = vo;
  } catch {
    pack.voiceover = null;
  }

  pack.language = language;
  pack.channel = channel;
  return pack;
}

export function resolveProviderCapability({ provider, store = {} }) {
  const conn = getProviderConnectionState(provider, store);
  const caps = PROVIDER_CAPABILITIES[provider] || { publish: false, media: false, text: false, schedule: false, analytics: false };

  return {
    provider,
    label: labelProvider(provider),
    connected: CONNECTED_STATES.includes(conn) || conn === "READY" || conn === "DEGRADED",
    connectionState: conn,
    capabilities: caps,
    publishSupported: caps.publish,
    mediaSupported: caps.media,
    textSupported: caps.text,
    scheduleSupported: caps.schedule,
    analyticsSupported: caps.analytics,
    canDirectPublish: caps.publish && CONNECTED_STATES.includes(conn),
    canAssist: caps.publish && !CONNECTED_STATES.includes(conn),
    requiresAuth: !conn || conn === CONNECTION_STATE.NOT_CONNECTED || conn === CONNECTION_STATE.REAUTH_REQUIRED || conn === CONNECTION_STATE.EXPIRED,
  };
}

export function computePublishReadiness({ product, marketer, store = {}, channels = [] }) {
  const preflight = preflightPublishProduct({ product, marketer, store, channels });
  const health = summarizeConnectionHealth(store);
  const channelStates = channels.length > 0
    ? channels.map((ch) => resolveProviderCapability({ provider: ch, store }))
    : SOCIAL_CHANNEL_TYPES.map((ch) => resolveProviderCapability({ provider: ch, store }));

  const ready = channelStates.filter((c) => c.canDirectPublish);
  const needsAuth = channelStates.filter((c) => c.requiresAuth);
  const canAssist = channelStates.filter((c) => c.canAssist && c.publishSupported);
  const blocked = channelStates.filter((c) => !c.publishSupported);

  const bestProvider = ready.length > 0 ? ready[0].provider : null;

  let overallStatus;
  let message;
  let nextAction;

  if (ready.length > 0) {
    overallStatus = PUBLISH_STATUS.READY;
    message = `Ready: ${ready.length} channel(s) can publish directly`;
    nextAction = null;
  } else if (canAssist.length > 0) {
    overallStatus = PUBLISH_STATUS.ASSISTED;
    message = `No connected channel — ${canAssist.length} channel(s) can be set up for assisted publishing`;
    nextAction = "connect_provider";
  } else if (needsAuth.length > 0) {
    overallStatus = PUBLISH_STATUS.ACTION_REQUIRED;
    message = `Action required: ${needsAuth.length} channel(s) need authorization`;
    nextAction = "authorize_provider";
  } else if (blocked.length > 0) {
    overallStatus = PUBLISH_STATUS.UNAVAILABLE;
    message = `No publishable channels available`;
    nextAction = "add_channel";
  } else {
    overallStatus = PUBLISH_STATUS.UNAVAILABLE;
    message = `No publishing channels configured`;
    nextAction = "configure_channels";
  }

  return {
    preflight,
    overallStatus,
    message,
    nextAction,
    bestProvider,
    channels: channelStates,
    readyCount: ready.length,
    needsAuthCount: needsAuth.length,
    canAssistCount: canAssist.length,
    blockedCount: blocked.length,
    connectionHealth: health,
  };
}

export function buildAssistedPackage({ product, marketer, creativePack, channel, language = "he" }) {
  if (!product) return null;

  const caption = safeText(creativePack?.caption || creativePack?.chosenHook || product.title, 2200);
  const link = creativePack?.trackedUrl || (typeof window !== "undefined"
    ? `${window.location.origin}/p/${product.id}`
    : `https://likelink2.vercel.app/p/${product.id}`);

  const hashtags = (creativePack?.hashtags || []).slice(0, 10);
  const hook = safeText(creativePack?.chosenHook || "", 200);

  const platformCaptions = {
    telegram: caption,
    webhook: caption,
    facebook: caption,
    instagram: safeText([caption, hashtags.join(" ")].filter(Boolean).join("\n"), 2200),
    x: safeText([hook || caption, link].filter(Boolean).join("\n"), 270),
    linkedin: safeText(caption + "\n\n" + link, 3000),
    discord: caption,
    slack: caption,
    pinterest: safeText(caption.slice(0, 500), 500),
    wordpress: {
      title: safeText(product.title, 80),
      content: safeText(caption.replace(/\n/g, "<br>") + `<br><br><a href="${link}">${link}</a>`, 2000),
    },
    mastodon: safeText([caption, link].filter(Boolean).join("\n"), 500),
    bluesky: safeText([caption, link].filter(Boolean).join("\n"), 300),
    reddit: safeText([hook || product.title, link].filter(Boolean).join("\n"), 300),
    whatsapp: safeText([caption, link].filter(Boolean).join("\n"), 4096),
    owned_web: {
      title: product.title,
      description: caption,
      url: link,
      image: product.image || null,
    },
  };

  const platformText = platformCaptions[channel] || caption;

  return {
    status: PUBLISH_STATUS.ASSISTED,
    provider: channel,
    caption: platformText,
    link,
    hashtags,
    hook,
    cta: "קנה עכשיו",
    utm: `?utm_source=likelink&utm_medium=${channel || "share"}&utm_campaign=${product.id}`,
    product: {
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      url: link,
    },
    language,
    fallback: {
      copy: platformText,
      open: link,
      share: `${platformText}\n\n${link}`,
      download: JSON.stringify({ product, caption, link, hashtags }, null, 2),
    },
  };
}

export function resolveIdempotency({ store, idempotencyKey, provider }) {
  if (!idempotencyKey) return { exists: false };
  const key = store?.[`publish:idem:${provider}:${idempotencyKey}`] || store?.[`publish:idem:${idempotencyKey}`];
  if (key) {
    return {
      exists: true,
      result: key,
      alreadyPublished: key.status === PUBLISH_STATUS.PUBLISHED,
    };
  }
  return { exists: false };
}

export function evaluatePublishIntent(ctx, intent) {
  const { store = {}, product, marketer } = ctx;
  return evaluateCapability({ store, origin: ctx.origin, env: ctx.env || {} }, INTENT.PUBLISH_PRODUCT, { product, marketer });
}

export function preflightPublish(ctx, intent) {
  const { store = {}, product, marketer, channels = [] } = ctx;
  return preflightPublishProduct({ product, marketer, store, channels });
}

export async function publishToChannel(ctx, channel, creativePack, intent) {
  const { store = {}, product, marketer } = ctx;
  const provider = resolveProviderCapability({ provider: channel, store });

  const idempotency = resolveIdempotency({ store, idempotencyKey: intent.idempotencyKey, provider: channel });
  if (idempotency.exists) {
    return {
      provider: channel,
      status: idempotency.alreadyPublished ? PUBLISH_STATUS.PUBLISHED : PUBLISH_STATUS.PROCESSING,
      message: "Duplicate prevention: publish already attempted for this idempotency key",
      platformPostId: idempotency.result?.platformPostId || null,
      publishedUrl: idempotency.result?.publishedUrl || null,
      idempotencyKey: intent.idempotencyKey,
    };
  }

  if (!provider.canDirectPublish) {
    if (provider.canAssist) {
      const assisted = buildAssistedPackage({ product, marketer, creativePack, channel: channel });
      return {
        provider: channel,
        status: PUBLISH_STATUS.ASSISTED,
        message: "No direct connection — assisted publishing package prepared",
        assisted,
      };
    }
    if (provider.requiresAuth) {
      return {
        provider: channel,
        status: PUBLISH_STATUS.ACTION_REQUIRED,
        message: "Connection required — provider needs authorization",
        nextAction: "connect",
      };
    }
    return {
      provider: channel,
      status: PUBLISH_STATUS.UNAVAILABLE,
      message: "Publish not supported for this provider",
      nextAction: "add_channel",
    };
  }

  return {
    provider: channel,
    status: PUBLISH_STATUS.PROCESSING,
    message: "Ready for direct publish — dispatched to server-side autopilot (api/autopilot.mjs) with credentials",
    nextAction: "use_autopilot",
    detail: "Token-bearing channels are published server-side only — never exposed to browser bundles",
  };
}

export async function publishProductIntent(ctx, opts = {}) {
  const { store = {}, product, marketer, language = "he", channel = null, channels = [], clicks = [] } = ctx;
  const forceChannels = channel ? [channel] : (channels.length > 0 ? channels : SOCIAL_CHANNEL_TYPES);

  const readiness = computePublishReadiness({ product, marketer, store, channels: forceChannels });
  if (readiness.preflight.status === "BLOCKED") {
    return {
      status: PUBLISH_STATUS.BLOCKED,
      message: readiness.preflight.nextAction,
      nextAction: readiness.preflight.nextAction,
      preflight: readiness.preflight,
      results: [],
      idempotencyKey: buildIdempotencyKey({ product, provider: "preflight_blocked", marketerId: marketer?.id }),
    };
  }

  const idempotencyKey = opts.idempotencyKey || buildIdempotencyKey({ product, provider: channel || "multi", marketerId: marketer?.id });

  const creativePack = buildCreativePackForPublish({ product, marketer, store, language, channel, clicks });

  const results = [];
  let anyPublished = false;
  let anyAssisted = false;
  let anyActionRequired = false;
  let anyFailed = false;
  let anyProcessing = false;

  for (const ch of forceChannels) {
    try {
      const result = await publishToChannel(ctx, ch, creativePack, { product, marketer, idempotencyKey, channel: ch });
      results.push(result);

      if (result.status === PUBLISH_STATUS.PUBLISHED) anyPublished = true;
      else if (result.status === PUBLISH_STATUS.ASSISTED) anyAssisted = true;
      else if (result.status === PUBLISH_STATUS.ACTION_REQUIRED) anyActionRequired = true;
      else if (result.status === PUBLISH_STATUS.FAILED) anyFailed = true;
      else if (result.status === PUBLISH_STATUS.PROCESSING) anyProcessing = true;
    } catch (e) {
      results.push({
        provider: ch,
        status: PUBLISH_STATUS.FAILED,
        message: String(e.message || e).slice(0, 120),
        retryable: true,
      });
      anyFailed = true;
    }
  }

  let overallStatus;
  let message;

  if (anyPublished) {
    overallStatus = PUBLISH_STATUS.PUBLISHED;
    message = "Published successfully";
  } else if (anyProcessing) {
    overallStatus = PUBLISH_STATUS.PROCESSING;
    message = "Publishing in progress";
  } else if (anyAssisted) {
    overallStatus = PUBLISH_STATUS.ASSISTED;
    message = "No direct connections — assisted packages prepared";
  } else if (anyActionRequired) {
    overallStatus = PUBLISH_STATUS.ACTION_REQUIRED;
    message = "Action required: connect authorization channels";
  } else if (anyFailed) {
    overallStatus = PUBLISH_STATUS.FAILED;
    message = "Publish failed on all channels";
  } else {
    overallStatus = PUBLISH_STATUS.UNAVAILABLE;
    message = "No publishable channels available";
  }

  const provenance = createProvenance({
    source: "publishEngine",
    actor: marketer?.id || "anonymous",
    product,
    provider: channel || "multi-channel",
    eventType: "publish_intent",
    evidenceLevel: EVIDENCE_LEVELS.SYSTEM_GENERATED,
  });

  return {
    status: overallStatus,
    message,
    provider: channel || "multi",
    results,
    readiness,
    creativePack,
    idempotencyKey,
    retryable: anyFailed || anyProcessing,
    provenance,
    published: results.filter((r) => r.status === PUBLISH_STATUS.PUBLISHED),
    assisted: results.filter((r) => r.status === PUBLISH_STATUS.ASSISTED),
  };
}

export function computeBrandChannelsConfigured(store = {}) {
  const channels = listConnectionStates(store);
  const hasConnected = channels.some((c) =>
    (c.state === CONNECTION_STATE.CONNECTED || c.state === CONNECTION_STATE.READY) && c.lastVerified
  );
  const hasReadyProvider = SOCIAL_CHANNEL_TYPES.some((p) => {
    const conn = getConnectionState(store, p);
    return conn && (conn.state === CONNECTION_STATE.CONNECTED || conn.state === CONNECTION_STATE.READY) && conn.lastVerified;
  });

  return {
    configured: hasConnected || hasReadyProvider,
    connectedChannels: channels.filter((c) =>
      c.state === CONNECTION_STATE.CONNECTED || c.state === CONNECTION_STATE.READY
    ),
    blockedChannels: channels.filter((c) =>
      c.state === CONNECTION_STATE.BLOCKED || c.state === CONNECTION_STATE.REAUTH_REQUIRED ||
      c.state === CONNECTION_STATE.EXPIRED || c.state === CONNECTION_STATE.ERROR
    ),
    needsAttentionChannels: channels.filter((c) =>
      c.state === CONNECTION_STATE.REAUTH_REQUIRED || c.state === CONNECTION_STATE.EXPIRED ||
      c.state === CONNECTION_STATE.DEGRADED
    ),
    totalChannels: channels.length,
  };
}

export default {
  publishProductIntent,
  computePublishReadiness,
  buildPublishIntent,
  buildCreativePackForPublish,
  resolveProviderCapability,
  buildAssistedPackage,
  computeBrandChannelsConfigured,
  evaluatePublishIntent,
  preflightPublish,
  resolveIdempotency,
  PROVIDER_TYPE,
  PROVIDER_CAPABILITIES,
  SOCIAL_CHANNEL_TYPES,
  labelProvider,
  buildIdempotencyKey,
  PUBLISH_STATUS,
};
