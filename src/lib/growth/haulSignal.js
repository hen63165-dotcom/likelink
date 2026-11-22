// 🎥 The first creators (the owner, 22.11: "exactly the way the squishy was found, for every product,
// before it is a hit"). The worldwide check that day traced the squishy's path: Chinese factories sold
// it on the marketplaces first (the radar already reads their orders), then English-speaking bloggers
// showed what they had bought there in "haul" videos (late 2023), then a YouTuber said it was becoming a
// TikTok trend (16.8.2024), and only in 2026 did the trade reports (Faire, search surveys) name it. None
// of the big trend companies we checked had named it before. The radar now reads that second step every
// morning, through the official YouTube Data API with the owner's own free key: the newest haul and
// "finds" videos, the two-word product phrases in their titles and descriptions, and how many different
// channels show each phrase this week against the week before. A phrase that 3+ channels started to
// show, that AliExpress sells (3+ matching items, 300+ orders together), and that is no brand, unlisted
// kind or holiday, joins the radar as a trial concept, so the stages, the world gap and the sealed calls
// measure it from the next morning. Counts and phrases only; no video text is kept. Pure: the runner reads.

import { hasBrandName, isNotListedKind } from "./deals.js";
import { covered, phrasesOf } from "./radarDiscovery.js";
import { isSeasonal } from "./freshRisers.js";

export const HAULS = Object.freeze({
  queries: Object.freeze(["aliexpress haul", "temu haul", "aliexpress finds", "temu finds", "amazon finds", "tiktok made me buy it"]),
  days: 2, // each morning reads the videos of the last two days (the windows overlap; channels are counted once)
  minChannels: 3, // different channels that showed the phrase in the last 7 days
  keepDays: 21,
  perDay: 6, // phrases checked on AliExpress a run
  minItems: 3,
  minOrders: 300,
});

const API = "https://www.googleapis.com/youtube/v3";

/** The newest videos for one haul search (snippet: title and description; 100 quota units). */
export function haulSearchUrl(q, { key, now = Date.now(), days = HAULS.days } = {}) {
  const after = new Date(now - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const p = new URLSearchParams({ part: "snippet", type: "video", q, publishedAfter: after, maxResults: "50", order: "date", relevanceLanguage: "en", key: String(key || "") });
  return `${API}/search?${p}`;
}

/** A search answer's videos (null when it is no search answer). */
export function haulVideos(answer) {
  if (!answer || !Array.isArray(answer.items)) return null;
  return answer.items
    .map((i) => ({ id: i?.id?.videoId, channel: i?.snippet?.channelId, text: `${i?.snippet?.title || ""} ${String(i?.snippet?.description || "").slice(0, 300)}` }))
    .filter((v) => typeof v.id === "string" && typeof v.channel === "string" && v.channel);
}

// The haul's own vocabulary: says how the video was made, never what was bought.
const HAUL_WORDS = new Set(`haul hauls aliexpress temu amazon shein finds find tiktok made buy bought buying unboxing review reviews
must have haves worth viral products links link part episode shopping order ordered orders try trying tried test testing honest
cheap dupes dupe under dollar dollars things stuff favorites favourites wishlist storefront code coupon discount affiliate
subscribe channel video videos shorts short vlog today week month 2025 2026 2027 here what this that these those you your`.split(/\s+/));

/** The product phrases one video shows (two adjacent meaningful words, without the haul's own words). */
export function videoPhrases(text = "") {
  const clean = String(text || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w && !HAUL_WORDS.has(w)).join(" ");
  return [...phrasesOf(clean)];
}

/** Today's channels per phrase merged into the kept days (state: phrase → day → channel ids). */
export function mergeHauls(state = {}, videos = [], today, { rules = HAULS } = {}) {
  const out = {};
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const [phrase, days] of Object.entries(state || {})) {
    const kept = Object.fromEntries(Object.entries(days || {}).filter(([d]) => d >= oldest));
    if (Object.keys(kept).length) out[phrase] = kept;
  }
  for (const v of Array.isArray(videos) ? videos : []) {
    for (const p of videoPhrases(v.text)) {
      const day = (out[p] ||= {});
      const list = (day[today] ||= []);
      if (!list.includes(v.channel) && list.length < 50) list.push(v.channel);
    }
  }
  return out;
}

const channelsIn = (days, from, to) => new Set(Object.entries(days || {}).filter(([d]) => d > from && d <= to).flatMap(([, ch]) => ch));

/** The phrases that more channels started to show: this week's channels against the week before. */
export function haulRisers(state = {}, today, { concepts = [], rules = HAULS } = {}) {
  const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const rows = [];
  for (const [phrase, days] of Object.entries(state || {})) {
    const now = channelsIn(days, day(7), today);
    if (now.size < rules.minChannels) continue;
    const before = channelsIn(days, day(14), day(7));
    if (now.size <= before.size) continue;
    if (hasBrandName(phrase) || isNotListedKind(phrase) || isSeasonal(phrase) || covered(phrase, concepts)) continue;
    rows.push({ phrase, channels: now.size, before: before.size });
  }
  return rows.sort((a, b) => b.channels - a.channels || b.channels - b.before - (a.channels - a.before) || (a.phrase < b.phrase ? -1 : 1));
}

/** Does AliExpress sell it? Items whose title holds every word of the phrase, and their orders together. */
export function haulOnStore(phrase, items = [], { rules = HAULS } = {}) {
  const words = String(phrase || "").split(" ").map((w) => w.replace(/(?:es|s)$/, "")).filter(Boolean);
  const match = (Array.isArray(items) ? items : []).filter((x) => { const t = String(x?.title || "").toLowerCase(); return words.every((w) => t.includes(w)); });
  const orders = match.reduce((s, x) => s + (Number(x.orders) || 0), 0);
  return { ok: match.length >= rules.minItems && orders >= rules.minOrders, items: match.length, orders };
}
