/**
 * Live storefront loader — the video engine pulls real product photos straight
 * from the canonical cloud subdomain's catalog snapshot (a clean `netlify.app`
 * origin, no "github" anywhere). Until that subdomain is claimed the fetch
 * transparently falls back to the always-on production origin, so the daily
 * reel cron never breaks.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CANONICAL } from "./config.mjs";

const isHttp = (value) => /^https?:\/\//i.test(String(value || ""));

/** Approved products carrying a real photo — first `limit` (pure, testable). */
export function pickProductImages(doc, limit = 3) {
  const list = Array.isArray(doc?.keys?.["marketplace:products"]) ? doc.keys["marketplace:products"] : [];
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (out.length >= limit) break;
    if (String(p?.status || "").toLowerCase() !== "approved") continue;
    if (!isHttp(p?.image) || seen.has(p.image)) continue;
    seen.add(p.image);
    out.push({ id: String(p.id || `p${out.length}`), title: String(p.title || "").slice(0, 80), image: p.image });
  }
  return out;
}

export async function loadSnapshot({ origin, fetchImpl = fetch }) {
  const res = await fetchImpl(`${origin}${CANONICAL.snapshotPath}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`snapshot_${res.status}@${origin}`);
  return res.json();
}

async function download(url, dest, { fetchImpl = fetch, referer = `${CANONICAL.origin}/` } = {}) {
  const res = await fetchImpl(url, { headers: { Referer: referer } });
  if (!res.ok || !res.body) throw new Error(`image_download_${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  if (statSync(dest).size < 1024) throw new Error("image_truncated");
  return dest;
}

/**
 * Download `limit` live product photos into `dir`.
 * @returns {Promise<{origin:string, files:string[], products:object[]}>}
 */
export async function fetchStorefrontImages({
  dir, limit = 3, origin = CANONICAL.origin, fallbackOrigin = CANONICAL.fallbackOrigin, fetchImpl = fetch,
} = {}) {
  mkdirSync(dir, { recursive: true });
  let doc = null;
  let usedOrigin = "";
  let lastError = null;
  for (const candidate of [origin, fallbackOrigin]) {
    try {
      doc = await loadSnapshot({ origin: candidate, fetchImpl });
      usedOrigin = candidate;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!doc) throw new Error(`storefront_unreachable: ${lastError?.message || "no origin"}`);

  const picks = pickProductImages(doc, limit);
  const files = [];
  for (const [i, pick] of picks.entries()) {
    const dest = path.join(dir, `store-${String(i + 1).padStart(2, "0")}.jpg`);
    try {
      if (!existsSync(dest)) await download(pick.image, dest, { fetchImpl, referer: `${usedOrigin}/` });
      files.push(dest);
    } catch (err) {
      process.stderr.write(`storefront image skipped (${pick.id}): ${err.message}\n`);
    }
  }
  if (!files.length) throw new Error("storefront_no_images");
  return { origin: usedOrigin, files, products: picks };
}
