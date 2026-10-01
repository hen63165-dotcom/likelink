// Publishing adapters — every destination LikeLink can publish a creative to,
// with the credential it needs, its current status and the code that runs it.
//
// Internal destinations are LikeLink's own public surfaces (no credential).
// External ones publish only with real credentials; a destination without
// them is NEEDS_CONNECTION — never a silent success. Credential VALUES never
// leave process.env / the server-only kv; status reports names and booleans.
import { PUBLISHABLE_CHANNELS } from "../discovery/publishers/index.js";

export const DESTINATION_STATUS = Object.freeze({
  CONNECTED: "CONNECTED",
  NEEDS_CONNECTION: "NEEDS_CONNECTION",
  INTERNAL: "INTERNAL",
});

/** LikeLink's own public surfaces a reel is published to (public URL each). */
export const INTERNAL_DESTINATIONS = Object.freeze([
  { id: "media", he: "קובץ המדיה (פרוקסי ציבורי)", path: (a) => a.assetUrl, codePath: "api/og.mjs mode=media (anon storage read, Range)" },
  { id: "product_page", he: "עמוד המוצר", path: (a, o) => `${o}/p/${encodeURIComponent(a.productId)}`, codePath: "api/og.mjs /p/:id (crawler) + PublicSite ProductPage" },
  { id: "reels", he: "סרטונים", path: (a, o) => `${o}/reels?r=${encodeURIComponent(`v-${a.assetId}`)}`, codePath: "src/lib/publicDiscovery.js buildPublicGraph.reels → pages.jsx ReelsPage" },
  { id: "home", he: "דף הבית (שורת הסרטונים)", path: (a, o) => `${o}/`, codePath: "pages.jsx LandingPage → graph.reels rail" },
  { id: "creator_page", he: "עמוד היוצר/ת", path: (a, o, slug) => (slug ? `${o}/u/${encodeURIComponent(slug)}` : ""), codePath: "pages.jsx CreatorPage → graph.reels by creator" },
]);

const ENV_DESTINATIONS = [
  { id: "telegram_brand", he: "Telegram (ערוץ המותג)", required: ["BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT"], codePath: "src/lib/publishing/adapters.js publishExternalReel ← reelPublisher.ingestReel", proof: "telegram message_id" },
  { id: "webhook_brand", he: "Webhook (Make/Zapier/n8n)", required: ["BRAND_WEBHOOK_URL"], codePath: "src/lib/publishing/adapters.js publishExternalReel ← reelPublisher.ingestReel", proof: "the id the webhook returns (200 alone = DELIVERED_UNVERIFIED)" },
  { id: "instagram", he: "Instagram Reels", required: ["IG_USER_ID", "IG_ACCESS_TOKEN"], codePath: "src/lib/cloud/reelPublisher.js instagramPublishStep ← mode=media-pipeline&op=instagram", proof: "Instagram media id read back (permalink)" },
];

const CREATOR_DESTINATIONS = {
  telegram: { he: "Telegram (ערוץ של יוצר/ת)", required: ["Studio → טייס אוטומטי → ערוצים → Telegram (bot token + @channel)"] },
  bluesky: { he: "Bluesky", required: ["Studio → טייס אוטומטי → ערוצים → Bluesky (handle + app password)"] },
  mastodon: { he: "Mastodon", required: ["Studio → טייס אוטומטי → ערוצים → Mastodon (instance + token)"] },
};

const valid = {
  telegram: (c) => c?.botToken && c?.chatId,
  bluesky: (c) => c?.handle && c?.token,
  mastodon: (c) => c?.token,
};

/**
 * Every external destination with its status. `autopilotStore` is the
 * server-only marketplace:autopilot map (only counted, never returned).
 */
export function externalDestinations(env = {}, autopilotStore = {}) {
  const out = ENV_DESTINATIONS.map((d) => {
    const missing = d.required.filter((k) => !env[k]);
    return {
      id: d.id, he: d.he, scope: "platform", codePath: d.codePath, proof: d.proof,
      requiredCredentials: d.required,
      missing,
      status: missing.length ? DESTINATION_STATUS.NEEDS_CONNECTION : DESTINATION_STATUS.CONNECTED,
    };
  });
  for (const ch of PUBLISHABLE_CHANNELS) {
    let creators = 0;
    for (const rec of Object.values(autopilotStore && typeof autopilotStore === "object" ? autopilotStore : {})) {
      if ((Array.isArray(rec?.channels) ? rec.channels : []).some((c) => c?.type === ch && valid[ch](c))) creators++;
    }
    out.push({
      id: `creator_${ch}`, he: CREATOR_DESTINATIONS[ch].he, scope: "creator",
      codePath: "src/lib/discovery/publishers/index.js publishPost ← distribution-autorun (owner-approved campaigns)",
      proof: "provider post id + public verification",
      requiredCredentials: CREATOR_DESTINATIONS[ch].required,
      missing: creators ? [] : CREATOR_DESTINATIONS[ch].required,
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
