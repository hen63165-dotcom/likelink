// The site's reels, served by GitHub Pages (no cloud, no credits).
//
// scripts/luna_reels renders reels on GitHub Actions and attaches them to the
// "luna-reels" release (mp4 + preview jpg + details json). This script runs in
// .github/workflows/deploy-frontend.yml after the build: it picks, for every
// product the public site lists, the best reel made about that product (a
// talking-Luna reel before a still one, then the newest), copies the video and
// its preview into dist/media/reels/ and writes dist/media/reels/index.json.
// The site reads that file (src/lib/reelsFeed.js) on every host, so the same
// videos play on github.io and on the main address.
//
// Truth rules: only reels the engine marked synthetic, whose product is listed
// on the site, with the disclosure labels the engine burned into the frames.
// Tip reels that show no product stay on Instagram (they have no product page).
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "./prerender-products.mjs";

const SAFE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const LOOK_RANK = { talking: 3, video: 2, pexels: 1, still: 1, aurora: 0 };

/** Assets of the release → [{ base, mp4, json, jpg, updatedAt }] for each reel. */
export function groupAssets(assets = []) {
  const by = new Map();
  for (const a of Array.isArray(assets) ? assets : []) {
    const name = String(a?.name || "");
    const m = name.match(/^([a-z0-9-]+?)(-preview\.jpg|\.mp4|\.json)$/);
    if (!m || !SAFE.test(m[1])) continue;
    const g = by.get(m[1]) || { base: m[1] };
    const kind = m[2] === ".mp4" ? "mp4" : m[2] === ".json" ? "json" : "jpg";
    g[kind] = a;
    if (kind === "mp4") g.updatedAt = Date.parse(a.updated_at || a.created_at || "") || 0;
    by.set(m[1], g);
  }
  return [...by.values()].filter((g) => g.mp4 && g.json);
}

/**
 * One reel per listed product: talking Luna first, then the newest.
 * @param reels [{ base, meta, updatedAt }]
 * @param listed Set of product ids the public site lists
 */
export function pickReels(reels, listed) {
  const best = new Map();
  for (const r of reels) {
    const meta = r.meta || {};
    const productId = String(meta.product?.id || "");
    if (!productId || !listed.has(productId)) continue;
    if (meta.synthetic !== true || !Array.isArray(meta.labels) || !meta.labels.length) continue;
    const rank = LOOK_RANK[String(meta.look || (String(meta.visual || "").startsWith("video:") ? "video" : meta.visual || "still"))] ?? 0;
    const cur = best.get(productId);
    if (!cur || rank > cur.rank || (rank === cur.rank && r.updatedAt > cur.updatedAt)) best.set(productId, { ...r, rank, productId });
  }
  return [...best.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The feed entry the site reads (paths relative to index.json). */
export function feedEntry(r) {
  const m = r.meta || {};
  return {
    id: `luna-${r.base}`,
    productId: r.productId,
    video: `${r.base}.mp4`,
    poster: r.jpg ? `${r.base}-preview.jpg` : "",
    title: String(m.title || "").slice(0, 120),
    seconds: Number(m.seconds) || 0,
    look: String(m.look || "still"),
    labels: m.labels.map((l) => String(l).slice(0, 80)).slice(0, 4),
    createdAt: r.updatedAt,
  };
}

async function api(path, token) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function download(url, file, token) {
  const res = await fetch(url, { headers: { accept: "application/octet-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

export async function buildFeed({ dist = "dist", repo = process.env.GITHUB_REPOSITORY || "hen63165-dotcom/likelink", token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  if (!existsSync(snapshot)) return { reels: 0, reason: "no catalog copy in dist" };
  const listed = new Set(listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8"))).products.map((x) => String(x.product.id)));
  let release;
  try {
    release = await api(`/repos/${repo}/releases/tags/luna-reels`, token);
  } catch (e) {
    return { reels: 0, reason: `no luna-reels release (${e.message})` };
  }
  const groups = groupAssets(release.assets);
  const withMeta = [];
  for (const g of groups) {
    try {
      const res = await fetch(g.json.browser_download_url, { redirect: "follow" });
      if (res.ok) withMeta.push({ ...g, meta: await res.json() });
    } catch { /* a reel without readable details is skipped */ }
  }
  const chosen = pickReels(withMeta, listed);
  const out = join(dist, "media", "reels");
  mkdirSync(out, { recursive: true });
  const entries = [];
  for (const r of chosen) {
    try {
      await download(r.mp4.url, join(out, `${r.base}.mp4`), token);
      if (r.jpg) await download(r.jpg.url, join(out, `${r.base}-preview.jpg`), token);
      entries.push(feedEntry(r));
    } catch (e) {
      console.warn(`reels-feed: skipped ${r.base} (${e.message})`);
    }
  }
  writeFileSync(join(out, "index.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), reels: entries }, null, 1)}\n`);
  return { reels: entries.length, of: groups.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await buildFeed({ dist: process.argv[2] || "dist" });
  console.log(r.reason ? `reels-feed: ${r.reason}` : `reels-feed: ${r.reels} product reel(s) from ${r.of} in the release`);
}
