// One entry point for every channel LikeLink can publish to for free, with a
// provider post id and a public verification:
//   telegram (bot + public channel) · bluesky (handle + app password) ·
//   mastodon (instance + token)
// Credentials live in the creator's autopilot channel settings
// (marketplace:autopilot, server-only) or, for the platform scope, the brand
// Telegram bot env. They never leave the server.
import { publishToTelegram, verifyTelegramPublic, TELEGRAM_OWNER_ACTION } from "./telegram.js";
import { publishToBluesky, verifyBlueskyPublic, publishToMastodon, verifyMastodonPublic } from "./fediverse.js";

export const PUBLISHABLE_CHANNELS = Object.freeze(["telegram", "bluesky", "mastodon"]);

export const OWNER_ACTIONS = Object.freeze({
  telegram: TELEGRAM_OWNER_ACTION,
  bluesky: "ב-Bluesky: הגדרות ← Privacy and security ← App passwords ← יצירת סיסמת אפליקציה. בסטודיו ← טייס אוטומטי ← ערוצים ← Bluesky: שם המשתמש (handle) וסיסמת האפליקציה. לא הסיסמה הרגילה.",
  mastodon: "בשרת ה-Mastodon שלך: Preferences ← Development ← New application עם הרשאת write:statuses ← העתקת ה-Access token. בסטודיו ← טייס אוטומטי ← ערוצים ← Mastodon: הטוקן וכתובת השרת.",
});

const valid = {
  telegram: (c) => c?.botToken && c?.chatId,
  bluesky: (c) => c?.handle && c?.token,
  mastodon: (c) => c?.token,
};

/** channel → credentials for this scope (creator autopilot channels; brand Telegram for the platform). */
export async function channelCredentials({ kvGet, env = {}, scope }) {
  const out = {};
  if (!scope?.marketerIds) {
    if (env.BRAND_TELEGRAM_BOT && env.BRAND_TELEGRAM_CHAT) out.telegram = { botToken: env.BRAND_TELEGRAM_BOT, chatId: env.BRAND_TELEGRAM_CHAT, source: "brand" };
    return out;
  }
  const store = (await kvGet("marketplace:autopilot", {})) || {};
  for (const id of scope.marketerIds) {
    for (const ch of Array.isArray(store?.[id]?.channels) ? store[id].channels : []) {
      if (PUBLISHABLE_CHANNELS.includes(ch?.type) && !out[ch.type] && valid[ch.type](ch)) out[ch.type] = { ...ch, source: "creator" };
    }
  }
  return out;
}

/**
 * Publish one post and verify it publicly.
 * @returns {Promise<{ok:true, provider, providerPostId, publicUrl, verification, verificationNote} | {ok:false, error}>}
 */
export async function publishPost({ channel, creds, text, photoUrl = "", fetchImpl = fetch }) {
  let sent;
  let check = { ok: false, reason: "not_checked" };
  if (channel === "telegram") {
    sent = await publishToTelegram({ botToken: creds.botToken, chatId: creds.chatId, text, photoUrl, fetchImpl });
    if (sent.ok) check = sent.publicUrl ? await verifyTelegramPublic(sent.publicUrl, { fetchImpl }) : { ok: false, reason: "private_chat" };
  } else if (channel === "bluesky") {
    sent = await publishToBluesky({ handle: creds.handle, token: creds.token, instance: creds.instance || undefined, text, fetchImpl });
    if (sent.ok) check = await verifyBlueskyPublic(sent.providerPostId, { fetchImpl });
  } else if (channel === "mastodon") {
    sent = await publishToMastodon({ token: creds.token, instance: creds.instance || undefined, text, fetchImpl });
    if (sent.ok) check = await verifyMastodonPublic(sent.instance, sent.providerPostId, { fetchImpl });
  } else {
    return { ok: false, error: "channel_requires_connection" };
  }
  if (!sent.ok) return sent;
  return {
    ok: true, provider: channel, providerPostId: sent.providerPostId, publicUrl: sent.publicUrl || null,
    verification: check.ok ? "PUBLIC_VERIFIED" : "PROVIDER_CONFIRMED", verificationNote: check.ok ? null : check.reason,
  };
}
