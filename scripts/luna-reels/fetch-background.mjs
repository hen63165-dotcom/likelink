/**
 * Background fetch module — pulls free vertical stock footage from the Pexels
 * API using pure aesthetic lifestyle keywords (no people-focused/brand stock).
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AESTHETIC_KEYWORDS, PEXELS } from "./config.mjs";

export function apiKeyFromEnv(env = process.env) {
  return (env.PEXELS_API_KEY || env.PEXELS_TOKEN || "").trim();
}

/** One aesthetic query — rotated deterministically so runs stay varied. */
export function pickKeywords(count = 1, seed = Math.floor(Date.now() / 3600000)) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(AESTHETIC_KEYWORDS[(seed + i * 3) % AESTHETIC_KEYWORDS.length]);
  }
  return out;
}

/** Best portrait rendition: ≥720 wide, tall enough for 9:16, smallest file. */
export function pickVideoFile(video, { w = 720, h = 1280, minHeight = PEXELS.minHeight } = {}) {
  const files = Array.isArray(video?.video_files) ? video.video_files : [];
  const usable = files.filter((f) => f?.link
    && (f.height || 0) >= Math.min(minHeight, h)
    && (f.width || 0) >= Math.min(720, w));
  const pool = usable.length ? usable : files.filter((f) => f?.link);
  if (!pool.length) return null;
  return pool.slice().sort((a, b) => {
    const da = Math.abs((a.height || 0) - h) + Math.abs((a.width || 0) - w);
    const db = Math.abs((b.height || 0) - h) + Math.abs((b.width || 0) - w);
    return da - db || (a.file_type || "").localeCompare(b.file_type || "");
  })[0];
}

/** Search Pexels for portrait aesthetic videos. */
export async function searchPexels({ query, apiKey = apiKeyFromEnv(), perPage = PEXELS.perPage, orientation = PEXELS.orientation, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("PEXELS_API_KEY_missing");
  const url = new URL(PEXELS.endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", String(perPage));
  const res = await fetchImpl(url, { headers: { Authorization: apiKey, Accept: "application/json" } });
  if (!res.ok) throw new Error(`pexels_${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Array.isArray(data?.videos) ? data.videos : [];
}

export async function download(url, dest, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: { Referer: "https://www.pexels.com/" } });
  if (!res.ok || !res.body) throw new Error(`download_failed_${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  if (statSync(dest).size < 4096) throw new Error("download_truncated");
  return dest;
}

/**
 * Fetch `count` background clips (unique videos) into `dir`.
 * @returns {Promise<string[]>} absolute file paths
 */
export async function fetchBackgrounds({ count = 4, dir, apiKey = apiKeyFromEnv(), keywords = null, seed = null, fetchImpl = fetch } = {}) {
  mkdirSync(dir, { recursive: true });
  const queries = keywords || pickKeywords(Math.max(2, Math.ceil(count / 2)), seed ?? Math.floor(Date.now() / 3600000));
  const picked = [];
  const seen = new Set();
  for (const query of queries) {
    if (picked.length >= count) break;
    let videos = [];
    try {
      videos = await searchPexels({ query, apiKey, fetchImpl });
    } catch (err) {
      if (picked.length) continue;      // keep what we already have
      throw err;
    }
    for (const video of videos) {
      if (picked.length >= count) break;
      if (seen.has(video.id)) continue;
      const file = pickVideoFile(video);
      if (!file) continue;
      seen.add(video.id);
      picked.push({ id: video.id, query, link: file.link, author: video?.user?.name || "" });
    }
  }
  if (!picked.length) throw new Error("pexels_no_results");
  const files = [];
  for (const [i, clip] of picked.entries()) {
    const dest = path.join(dir, `bg-${String(i + 1).padStart(2, "0")}.mp4`);
    if (!existsSync(dest)) await download(clip.link, dest, { fetchImpl });
    files.push(dest);
  }
  return files;
}
