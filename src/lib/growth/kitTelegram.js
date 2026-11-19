// The WhatsApp group kit, posted by itself to the brand Telegram channel every morning (the owner,
// 19.11: "שישלח לבד"; WhatsApp gives no program a legal way to post into a group, Telegram's Bot API
// does). Pure; the sender is scripts/marketing/wa-telegram.mjs, the schedule .github/workflows/wa-telegram.yml.
// The posts are exactly the kit's (src/lib/growth/whatsappKit.js): the disclosure in every one, her own
// affiliate links on the product pages, no brand name. A product goes out at most once in REPEAT_DAYS;
// nothing on Saturday (Israel time).
import { WA_AD } from "./whatsappKit.js";

export const KIT_TG = Object.freeze({ max: 4, repeatDays: 14, captionMax: 1024 });
const DAY_MS = 86_400_000;

/** Saturday in Israel. */
export function isSaturdayInIsrael(now = Date.now()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date(now)) === "Sat";
}

/** Today's posts for the channel: the kit's own order, never a product sent in the last REPEAT_DAYS. */
export function telegramPicks(posts = [], sent = [], { now = Date.now(), max = KIT_TG.max, repeatDays = KIT_TG.repeatDays } = {}) {
  const since = now - repeatDays * DAY_MS;
  const recent = new Set((Array.isArray(sent) ? sent : []).filter((x) => Date.parse(x?.sentAt) >= since).map((x) => x?.id));
  return (Array.isArray(posts) ? posts : [])
    .filter((p) => p && p.id && p.file && typeof p.text === "string" && p.text.includes(WA_AD) && p.text.length <= KIT_TG.captionMax)
    .filter((p) => !recent.has(p.id))
    .slice(0, Math.max(0, max));
}
