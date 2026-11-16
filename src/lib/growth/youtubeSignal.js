// YouTube as an early signal for the radar's new products (the owner, 2026-11-16: "כן ליוטיוב").
// Through the official YouTube Data API v3 (the owner's own free key, secret YOUTUBE_API_KEY; never
// scraping): for a product's phrase, how many videos were published in the last 7 days and how many
// views those videos have. A few new videos = the first creators found it (EARLY); many, or a lot of
// views = everyone already talks about it (BUZZ, so the radar does not show it). Pure: URLs and the
// verdict; the runner (scripts/catalog/trend-radar.mjs) asks. Quota: search.list costs 100 units of
// the free 10,000 a day, so at most YT.maxSearches phrases a day.
export const YT = Object.freeze({ days: 7, buzzVideos: 50, buzzViews: 1_000_000, maxSearches: 24 });

const API = "https://www.googleapis.com/youtube/v3";

export function ytSearchUrl(phrase, { key, now = Date.now(), days = YT.days, short = false } = {}) {
  const after = new Date(now - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  // short: videos under 4 minutes, where YouTube's Shorts (the reels of YouTube) sit.
  const q = new URLSearchParams({ part: "id", type: "video", q: `"${String(phrase || "").trim()}"`, publishedAfter: after, maxResults: "50", order: "viewCount", ...(short ? { videoDuration: "short" } : {}), key: String(key || "") });
  return `${API}/search?${q}`;
}

export function ytVideosUrl(ids = [], { key } = {}) {
  const q = new URLSearchParams({ part: "statistics", id: ids.slice(0, 50).join(","), key: String(key || "") });
  return `${API}/videos?${q}`;
}

/** The ids of a search answer (null when the answer is not usable). */
export function ytIdsOf(answer) {
  if (!answer || !Array.isArray(answer.items)) return null;
  return answer.items.map((i) => i?.id?.videoId).filter((v) => typeof v === "string" && /^[\w-]{6,20}$/.test(v));
}

/** Total views of a videos answer (null when not usable). */
export function ytViewsOf(answer) {
  if (!answer || !Array.isArray(answer.items)) return null;
  return answer.items.reduce((s, v) => s + (Number(v?.statistics?.viewCount) || 0), 0);
}

/** NONE (no new video yet), EARLY (the first creators), BUZZ (everyone already talks about it). */
export function ytSignal({ videos = null, views = null } = {}, rules = YT) {
  if (!Number.isFinite(videos) || !Number.isFinite(views)) return null;
  const level = videos >= rules.buzzVideos || views >= rules.buzzViews ? "BUZZ" : videos > 0 ? "EARLY" : "NONE";
  return { videos, views, level, days: rules.days };
}
