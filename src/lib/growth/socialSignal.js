// 🗣️ People talking, and 📢 brands advertising (the owner, 2026-11-21: "surpass every company, one by one").
//
// Brandwatch, Talkwalker and Sprinklr listen to social networks at scale; the radar listens where the
// door is open by design: Bluesky's public AppView (the AT Protocol is an open network; its search is
// public, read-only), counting the posts that name a kind this week against the week before. Minea and
// the ad-spy tools read ads; the radar reads Meta's own Ad Library API (the official door, opened by
// Meta for every ad shown in the EU), counting the ads that started this week for a kind, only once the
// owner has her own access token (META_ADLIB_TOKEN; without it REQUIRES_CONNECTION and nothing is
// asked). robots.txt first on each host; counts only — no post or ad text is kept; a failed answer is
// FAILED, never zero. Pure: the runner reads.

export const SOCIAL = Object.freeze({
  bsky: { host: "https://public.api.bsky.app", path: "/xrpc/app.bsky.feed.searchPosts" },
  ads: { host: "https://graph.facebook.com", path: "/v21.0/ads_archive", countries: ["DE", "FR", "IT", "ES", "NL", "PL", "SE", "IE"] },
  maxKinds: 25, // kinds listened to a run (two searches each)
  pageSize: 100,
  maxPages: 3, // up to 300 posts a week counted per kind
  minWeek: 10, // a week with fewer posts says nothing about direction
});

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** One week's Bluesky search for an exact phrase (`since`/`until` in ms). */
export function bskyUrl(phrase, { since, until, cursor = null } = {}) {
  const q = `"${String(phrase).replace(/"/g, "").trim()}"`;
  const p = new URLSearchParams({ q, sort: "latest", limit: String(SOCIAL.pageSize), since: iso(since), until: iso(until) });
  if (cursor) p.set("cursor", cursor);
  return `${SOCIAL.bsky.host}${SOCIAL.bsky.path}?${p}`;
}

/** A search answer: how many posts and the next cursor, or null when it is not a search answer. */
export function bskyPage(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.posts)) return null;
  return { n: json.posts.length, cursor: typeof json.cursor === "string" && json.cursor ? json.cursor : null };
}

/** This week against last week; `capped` when a week filled every page (the count is then a floor). */
export function talkOf(week, prev) {
  if (!Number.isFinite(week) || !Number.isFinite(prev)) return null;
  const cap = SOCIAL.pageSize * SOCIAL.maxPages;
  return {
    week, prev,
    weekPct: prev >= SOCIAL.minWeek && week < cap ? Math.round((week / prev - 1) * 1000) / 10 : null,
    capped: week >= cap,
  };
}

/** The ads that started in the EU for a phrase since `since` (ms), through Meta's Ad Library API. */
export function adsUrl(phrase, { token, since }) {
  const p = new URLSearchParams({
    search_terms: String(phrase).trim(),
    ad_type: "ALL",
    ad_active_status: "ALL",
    ad_reached_countries: JSON.stringify(SOCIAL.ads.countries),
    ad_delivery_date_min: new Date(since).toISOString().slice(0, 10),
    fields: "id",
    limit: "500",
    access_token: token,
  });
  return `${SOCIAL.ads.host}${SOCIAL.ads.path}?${p}`;
}

/** An Ad Library answer: how many ads (a floor when there is a next page), or null. */
export function adsPage(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.data)) return null;
  return { n: json.data.length, more: Boolean(json.paging?.next) };
}

/** The kinds worth listening to today: the moving ones first (EMERGING, RISING, a new-listings surge), then by Alpha. */
export function socialKinds(concepts = [], { max = SOCIAL.maxKinds } = {}) {
  const rank = (c) => (c.stage === "EMERGING" ? 0 : c.stage === "RISING" ? 1 : c.factory?.born ? 2 : c.early?.level === "WATCH" || c.early?.level === "CALL" ? 3 : 4);
  return [...concepts]
    .filter((c) => c?.id && /^[\w\s'&.-]{3,80}$/.test(String(c.en || "")))
    .sort((a, b) => rank(a) - rank(b) || (Number(b.alpha?.score) || 0) - (Number(a.alpha?.score) || 0) || (a.id < b.id ? -1 : 1))
    .slice(0, max);
}
