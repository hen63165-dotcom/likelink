// Publishing adapters — every destination LikeLink can publish a creative to,
// with the credential it needs, its current status and the code that runs it.
//
// Internal destinations are LikeLink's own public surfaces (no credential).
// External ones publish only with real credentials; a destination without
// them is NEEDS_CONNECTION — never a silent success. Credential VALUES never
// leave process.env / the server-only kv; status reports names and booleans.
import { PUBLISHABLE_CHANNELS } from "../discovery/publishers/index.js";
import { CHANNEL_ADAPTERS } from "../growth/likeloop.js";

/**
 * The publication gate every publishing path writes through: PUBLISHED (or
 * PUBLISHED_UNVERIFIED) only with the provider's own id; a "success" without
 * one is DELIVERED_UNVERIFIED. Other states pass through.
 */
export function publicationGate(status, providerId) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "PUBLISHED" || s === "PUBLISHED_UNVERIFIED") return providerId ? s : "DELIVERED_UNVERIFIED";
  return s || "PENDING";
}

/** The shared publication log (newest first, capped) every path appends to. */
export const PUBLISH_LOG_KEY = "publish:log";
export const PUBLISH_LOG_CAP = 60;

/** One log row in the shared shape, through the gate. */
export function publicationRecord(entry = {}, now = Date.now()) {
  const cut = (v, n) => (v == null || v === "" ? null : String(v).slice(0, n));
  return {
    id: entry.id || `pub_${now}_${Math.random().toString(36).slice(2, 8)}`,
    contentId: cut(entry.contentId, 120),
    contentType: cut(entry.contentType, 40) || "unknown",
    brandId: cut(entry.brandId, 80) || "platform",
    productId: cut(entry.productId, 80),
    channel: cut(entry.channel, 40) || "unknown",
    status: publicationGate(entry.status, entry.externalId),
    publishedAt: entry.publishedAt || new Date(now).toISOString(),
    externalId: cut(entry.externalId, 160),
    permalink: cut(entry.permalink, 400),
    error: cut(entry.error, 200),
    attempts: Number(entry.attempts) > 0 ? Number(entry.attempts) : 1,
    attemptOf: cut(entry.attemptOf, 80),
    text: cut(entry.text, 1200),
    link: cut(entry.link, 400),
  };
}

/** Prepend rows to a log array (pure) — the one ordering/cap rule. */
export function withPublications(rows, entries, now = Date.now()) {
  return [...entries.map((e) => publicationRecord(e, now)), ...(Array.isArray(rows) ? rows : [])].slice(0, PUBLISH_LOG_CAP);
}

/** Append through kvGet/kvSet (best effort — a log failure never undoes a publication). */
export async function appendPublicationLog({ kvGet, kvSet, now = Date.now() }, entries = []) {
  try {
    const rows = await kvGet(PUBLISH_LOG_KEY, []);
    await kvSet(PUBLISH_LOG_KEY, withPublications(rows, entries, now));
    return true;
  } catch {
    return false;
  }
}

export const DESTINATION_STATUS = Object.freeze({
  CONNECTED: "CONNECTED",
  NEEDS_CONNECTION: "NEEDS_CONNECTION",
  INTERNAL: "INTERNAL",
  NO_PUBLISHER: "NO_PUBLISHER", // credentials exist, no publisher implemented
});

/** LikeLink's own public surfaces a reel is published to (public URL each). */
export const INTERNAL_DESTINATIONS = Object.freeze([
  { id: "media", he: "קובץ המדיה (פרוקסי ציבורי)", path: (a) => a.assetUrl, codePath: "api/og.mjs mode=media (anon storage read, Range)" },
  { id: "product_page", he: "עמוד המוצר", path: (a, o) => `${o}/p/${encodeURIComponent(a.productId)}`, codePath: "api/og.mjs /p/:id (crawler) + PublicSite ProductPage" },
  { id: "reels", he: "סרטונים", path: (a, o) => `${o}/reels?r=${encodeURIComponent(`v-${a.assetId}`)}`, codePath: "src/lib/publicDiscovery.js buildPublicGraph.reels → pages.jsx ReelsPage" },
  { id: "home", he: "דף הבית (שורת הסרטונים)", path: (a, o) => `${o}/`, codePath: "pages.jsx LandingPage → graph.reels rail" },
  { id: "creator_page", he: "עמוד היוצר/ת", path: (a, o, slug) => (slug ? `${o}/u/${encodeURIComponent(slug)}` : ""), codePath: "pages.jsx CreatorPage → graph.reels by creator" },
  { id: "site_feed", he: "הפיד הציבורי של לונה", path: (a, o) => `${o}/api/store?mode=brand-pulse`, codePath: "api/store.mjs mode=brand-pulse (public JSON, newest 8) ← brand_pulse:posts" },
]);

// Platform channels — the same adapter list LikeLoop plans its calendar with
// (src/lib/growth/likeloop.js CHANNEL_ADAPTERS), plus the code that publishes.
const PLATFORM_META = {
  instagram: { he: "Instagram Reels", codePath: "src/lib/cloud/reelPublisher.js instagramPublishStep ← mode=media-pipeline&op=instagram", proof: "Instagram media id read back (permalink)" },
  telegram: { id: "telegram_brand", he: "Telegram (ערוץ המותג)", codePath: "adapters.js publishExternalReel ← reelPublisher.ingestReel · api/autopilot.mjs publishBrandPulse", proof: "telegram message_id" },
  webhook: { id: "webhook_brand", he: "Webhook (Make/Zapier/n8n)", codePath: "adapters.js publishExternalReel ← reelPublisher.ingestReel · api/autopilot.mjs publishBrandPulse", proof: "the id the webhook returns (200 alone = DELIVERED_UNVERIFIED)" },
  facebook: { he: "Facebook Page", codePath: "none for the platform page yet (creator pages: api/autopilot.mjs sendFacebook)", proof: "Graph post id" },
  tiktok: { he: "TikTok", codePath: "none (no publisher implemented)", proof: "—" },
  pinterest: { he: "Pinterest", codePath: "none for the platform board yet (creator boards: api/autopilot.mjs sendPinterest)", proof: "pin id" },
  youtube: { he: "YouTube Shorts", codePath: "none (no publisher implemented)", proof: "—" },
};

// Creator channels (marketplace:autopilot[marketer].channels): the creator
// autopilot (api/autopilot.mjs sendToChannel) + owner-approved campaigns
// (distribution-autorun) for telegram/bluesky/mastodon. Fields = what the sender needs.
const CREATOR_FIELDS = {
  telegram: ["botToken", "chatId"], webhook: ["url"], facebook: ["pageId", "pageToken"], discord: ["url"], slack: ["url"],
  whatsapp: ["phoneNumberId", "token", "chatId"], instagram: ["igUserId", "token"], x: ["bearer"], linkedin: ["personUrn", "token"],
  mastodon: ["token"], bluesky: ["handle", "token"], reddit: ["clientId", "clientSecret", "token", "subreddit"],
  pinterest: ["token", "boardId"], wordpress: ["wpUrl", "wpUser", "wpPass"],
};
const NO_POST_ID = new Set(["slack"]); // the API returns no id → DELIVERED_UNVERIFIED at best

/**
 * Every external destination with its status. Values never leave: env and
 * the server-only marketplace:autopilot map are only checked / counted.
 */
export function externalDestinations(env = {}, autopilotStore = {}) {
  const out = CHANNEL_ADAPTERS.map((a) => {
    const meta = PLATFORM_META[a.id] || { he: a.id, codePath: "—", proof: "—" };
    const missing = a.env.filter((k) => !env[k]);
    return {
      id: meta.id || a.id, he: meta.he, scope: "platform", codePath: meta.codePath, proof: meta.proof,
      implemented: Boolean(a.publisher),
      requiredCredentials: a.env,
      missing,
      status: missing.length ? DESTINATION_STATUS.NEEDS_CONNECTION : a.publisher ? DESTINATION_STATUS.CONNECTED : DESTINATION_STATUS.NO_PUBLISHER,
    };
  });
  const store = autopilotStore && typeof autopilotStore === "object" ? autopilotStore : {};
  for (const [type, fields] of Object.entries(CREATOR_FIELDS)) {
    let creators = 0;
    for (const rec of Object.values(store)) {
      if ((Array.isArray(rec?.channels) ? rec.channels : []).some((c) => c?.type === type && fields.every((k) => c[k]))) creators++;
    }
    const where = `Studio → טייס אוטומטי → ערוצים → ${type} (${fields.join(" + ")})`;
    out.push({
      id: `creator_${type}`, he: `${type} (ערוץ של יוצר/ת)`, scope: "creator",
      codePath: `api/autopilot.mjs sendToChannel${PUBLISHABLE_CHANNELS.includes(type) ? " · distribution-autorun (publishers/index.js)" : ""}`,
      proof: NO_POST_ID.has(type) ? "none — the API returns no post id (DELIVERED_UNVERIFIED)" : "provider post id",
      implemented: true,
      requiredCredentials: [where],
      missing: creators ? [] : [where],
      connectedCreators: creators,
      status: creators ? DESTINATION_STATUS.CONNECTED : DESTINATION_STATUS.NEEDS_CONNECTION,
    });
  }
  return out;
}

/**
 * Publish a reel to the brand's external channel (Telegram sendVideo, else
 * the brand webhook). PUBLISHED only with the provider's own id.
 */
export async function publishExternalReel({ env = {}, fetchImpl = globalThis.fetch } = {}, { text, videoUrl, link }) {
  const { telegramBot, telegramChat, webhook } = env;
  if (telegramBot && telegramChat) {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${telegramBot}/sendVideo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChat, video: videoUrl, caption: `${text}\n${link}`.slice(0, 1000), supports_streaming: true }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json().catch(() => null);
      const id = j?.ok ? j.result?.message_id : null;
      return id ? { channel: "telegram", status: "PUBLISHED", externalId: String(id), proof: "telegram_message_id" } : { channel: "telegram", status: "FAILED", error: String(j?.description || `http_${res.status}`).slice(0, 160) };
    } catch (e) {
      return { channel: "telegram", status: "FAILED", error: String(e?.message || e).slice(0, 160) };
    }
  }
  if (webhook) {
    try {
      const res = await fetchImpl(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "likelink_reel", text, videoUrl, link }), signal: AbortSignal.timeout(15000) });
      const j = await res.json().catch(() => null);
      const id = j?.id || j?.postId || j?.externalId || null;
      // A 200 from a webhook is delivery, not publication — success needs a provider id.
      return id ? { channel: "webhook", status: "PUBLISHED", externalId: String(id), proof: "webhook_returned_id" } : { channel: "webhook", status: res.ok ? "DELIVERED_UNVERIFIED" : "FAILED", error: res.ok ? "no_provider_id" : `http_${res.status}` };
    } catch (e) {
      return { channel: "webhook", status: "FAILED", error: String(e?.message || e).slice(0, 160) };
    }
  }
  return { channel: "external", status: "REQUIRES_CONNECTION", error: "no_external_channel_configured" };
}
