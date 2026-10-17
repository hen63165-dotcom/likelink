// What the Studio's Creative Engine screen reads: the engine's job ledger and
// the site's reels feed, both published on GitHub Pages by the site deploy
// (CORS open, no secrets in either). A read that fails is reported as such —
// the orchestrator then marks the stages that need it PENDING, never done.
import { REELS_FEED_HOME } from "../reelsFeed.js";

export const CREATIVE_LEDGER_URL = "https://hen63165-dotcom.github.io/likelink/media/creative/jobs.json";

async function readJson(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { cache: "no-store" });
    if (!res.ok) return { data: null, error: `http_${res.status}` };
    return { data: await res.json(), error: null };
  } catch (e) {
    return { data: null, error: String(e?.message || e).slice(0, 80) };
  }
}

/** { ledger, feed, errors: { ledger?, feed? }, readAt } */
export async function loadCreativeEvidence(fetchImpl = typeof fetch === "function" ? fetch : null) {
  if (!fetchImpl) return { ledger: null, feed: null, errors: { ledger: "no_fetch", feed: "no_fetch" }, readAt: Date.now() };
  const [ledger, feed] = await Promise.all([readJson(CREATIVE_LEDGER_URL, fetchImpl), readJson(REELS_FEED_HOME, fetchImpl)]);
  const errors = {};
  if (ledger.error || !Array.isArray(ledger.data?.jobs)) errors.ledger = ledger.error || "bad_shape";
  if (feed.error || !Array.isArray(feed.data?.reels)) errors.feed = feed.error || "bad_shape";
  return { ledger: errors.ledger ? null : ledger.data, feed: errors.feed ? null : feed.data, errors, readAt: Date.now() };
}

/** The video's public file URL (GitHub Pages), from a feed entry's relative path. */
export function feedVideoUrl(video) {
  try { return new URL(String(video || ""), REELS_FEED_HOME).href; } catch { return ""; }
}
