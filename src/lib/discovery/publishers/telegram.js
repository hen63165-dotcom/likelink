// Telegram publisher — the one external channel LikeLink can publish to with
// nothing more than a bot the owner creates (no app review).
//
// A post counts as PUBLISHED only with Telegram's own message_id, and is
// PUBLIC_VERIFIED only when the post is visible on the public channel page
// (https://t.me/<channel>/<message_id>). Credentials come from the creator's
// own autopilot channel settings (or, for the platform scope, the brand bot);
// they are never logged, returned or stored by this module.

const API = "https://api.telegram.org";

export const TELEGRAM_OWNER_ACTION = [
  "ב-Telegram: שיחה עם ‎@BotFather ← ‎/newbot ← שם לבוט → מתקבל טוקן.",
  "יוצרים ערוץ ציבורי עם שם משתמש (‎@…), ומוסיפים את הבוט כמנהל עם הרשאה לפרסם הודעות.",
  "בסטודיו ← טייס אוטומטי ← ערוצים ← Telegram: מדביקים את הטוקן, ובשדה ה-Chat את שם הערוץ (למשל ‎@my_channel).",
].join(" ");

const tokenOk = (t) => /^\d{5,12}:[A-Za-z0-9_-]{30,}$/.test(String(t || ""));

/**
 * @returns {Promise<{ok:true, providerPostId:string, chatUsername:string|null, publicUrl:string|null} | {ok:false, error:string}>}
 */
export async function publishToTelegram({ botToken, chatId, text, photoUrl = "", fetchImpl = fetch }) {
  if (!tokenOk(botToken) || !chatId) return { ok: false, error: "telegram_not_configured" };
  const caption = String(text || "").trim();
  if (!caption) return { ok: false, error: "empty_post" };
  // A photo caption is limited to 1024 characters; longer posts go as text with a link preview.
  const asPhoto = Boolean(photoUrl) && caption.length <= 1024;
  const method = asPhoto ? "sendPhoto" : "sendMessage";
  const body = asPhoto ? { chat_id: chatId, photo: photoUrl, caption } : { chat_id: chatId, text: caption.slice(0, 4096), disable_web_page_preview: false };
  let res;
  try {
    res = await fetchImpl(`${API}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, error: "telegram_unreachable" };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const code = Number(data?.error_code || res.status) || 0;
    return { ok: false, error: code === 401 ? "telegram_bad_token" : code === 400 || code === 403 ? "telegram_chat_not_allowed" : code === 429 ? "telegram_rate_limited" : `telegram_failed_${code}` };
  }
  const id = data.result?.message_id;
  if (id == null) return { ok: false, error: "telegram_no_message_id" };
  const username = data.result?.chat?.username || null;
  return { ok: true, providerPostId: String(id), chatUsername: username, publicUrl: username ? `https://t.me/${username}/${id}` : null };
}

/** Is the post visible on the public channel page? Read-only; never needs credentials. */
export async function verifyTelegramPublic(publicUrl, { fetchImpl = fetch } = {}) {
  const m = String(publicUrl || "").match(/^https:\/\/t\.me\/([A-Za-z0-9_]{4,64})\/(\d+)$/);
  if (!m) return { ok: false, reason: "not_a_public_channel_post" };
  try {
    const res = await fetchImpl(`${publicUrl}?embed=1&mode=tme`, { signal: AbortSignal.timeout(10000) });
    const html = await res.text().catch(() => "");
    const found = res.ok && html.includes(`data-post="${m[1]}/${m[2]}"`) && !html.includes("tgme_widget_message_error");
    return found ? { ok: true, checkedAt: Date.now() } : { ok: false, reason: "not_visible_publicly" };
  } catch {
    return { ok: false, reason: "verification_unreachable" };
  }
}
