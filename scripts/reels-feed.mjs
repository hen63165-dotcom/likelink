// The site's reels, served by GitHub Pages (no cloud, no credits).
//
// scripts/luna_reels renders reels on GitHub Actions and attaches them to the
// "luna-reels" release (mp4 + preview jpg + details json). This script runs in
// .github/workflows/deploy-frontend.yml after the build: it picks, for every
// product the public site lists, the best reel made about that product (a
// talking-Luna reel before a still one, then the newest), copies the video and
// one frame of it as the cover into dist/media/reels/ and writes
// dist/media/reels/index.json.
// The site reads that file (src/lib/reelsFeed.js) on every host, so the same
// videos play on github.io and on the main address.
//
// Truth rules: only reels whose details say what made them (the engine marked
// it synthetic, or a person filmed it), whose product is listed on the site,
// with the disclosure labels burned into the frames.
// Tip reels that show no product stay on Instagram (they have no product page).
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "./prerender-products.mjs";

const SAFE = /^[a-z0-9][a-z0-9-]{0,80}$/;
// Real footage first (a person filmed it), then talking Luna, then the rest.
const LOOK_RANK = { real: 4, talking: 3, video: 2, pexels: 1, still: 1, aurora: 0 };
export const SELLER_LABELS = Object.freeze(["צילום המוצר: המוכר", "#פרסומת · קישור שותפים"]);
export const OWN_LABELS = Object.freeze(["צילום: LikeLink2", "#פרסומת · קישור שותפים"]);

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
    // Engine-made reels say so (synthetic); a real clip says a person filmed it (humanFilmed).
    const truthful = meta.synthetic === true || (meta.synthetic === false && meta.humanFilmed === true && meta.look === "real");
    if (!truthful || !Array.isArray(meta.labels) || !meta.labels.length) continue;
    const rank = LOOK_RANK[String(meta.look || (String(meta.visual || "").startsWith("video:") ? "video" : meta.visual || "still"))] ?? 0;
    const cur = best.get(productId);
    if (!cur || rank > cur.rank || (rank === cur.rank && r.updatedAt > cur.updatedAt)) best.set(productId, { ...r, rank, productId });
  }
  return [...best.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The feed entry the site reads (paths relative to index.json). */
export function feedEntry(r, owners = new Map(), poster = "") {
  const m = r.meta || {};
  const look = String(m.look || "still");
  return {
    id: `luna-${r.base}`,
    productId: r.productId,
    video: `${r.base}.mp4`,
    poster,
    title: String(m.title || "").slice(0, 120),
    seconds: Number(m.seconds) || 0,
    look,
    labels: m.labels.map((l) => String(l).slice(0, 80)).slice(0, 4),
    createdAt: r.updatedAt,
    // A real clip belongs to the studio whose product it shows (REAL_UGC needs a known source).
    ...(look === "real" && owners.get(r.productId) ? { marketerId: owners.get(r.productId) } : {}),
  };
}

/**
 * The sellers' own product videos (the "reels" release, scripts/media/product-video):
 * <productId>.mp4 (+ -b/-c variants), one per listed product, labelled as the seller's video
 * (never as UGC: nobody here knows who filmed it, or whether it was filmed at all).
 */
export function sellerReels(assets = [], listed = new Set()) {
  const by = new Map();
  for (const a of Array.isArray(assets) ? assets : []) {
    const m = String(a?.name || "").match(/^([A-Za-z0-9_-]+?)(-[bc])?\.mp4$/);
    if (!m || m[2] || !listed.has(m[1])) continue;
    by.set(m[1], { productId: m[1], mp4: a, updatedAt: Date.parse(a.updated_at || a.created_at || "") || 0 });
  }
  return [...by.values()].map((g) => ({
    ...g,
    entry: {
      id: `seller-${g.productId}`,
      productId: g.productId,
      video: `seller-${g.productId}.mp4`,
      poster: "",
      title: "",
      seconds: 0,
      look: "seller",
      labels: [...SELLER_LABELS],
      createdAt: g.updatedAt,
    },
  }));
}

/**
 * One real frame of the video as its cover. The release previews are 3-frame
 * contact sheets, which a 9:16 card would crop badly. Without ffmpeg the cover
 * stays empty and the site shows the product's own photo.
 */
export function coverFrame(mp4, jpg, at = 1) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", jpg], { timeout: 60_000 });
  return r.status === 0 && existsSync(jpg) && statSync(jpg).size > 2048;
}

/**
 * Our own footage of a product (product-video.yml "clip" → <productId>-own.mp4):
 * filmed by a person with the real product, so it is real footage; with the
 * product's studio it is REAL_UGC on the site (src/lib/reelsFeed.js, look "real").
 */
export function ownReels(assets = [], listed = new Set(), owners = new Map()) {
  const out = [];
  for (const a of Array.isArray(assets) ? assets : []) {
    const m = String(a?.name || "").match(/^([A-Za-z0-9_-]+?)-own\.mp4$/);
    if (!m || !listed.has(m[1])) continue;
    const updatedAt = Date.parse(a.updated_at || a.created_at || "") || 0;
    out.push({
      productId: m[1],
      mp4: a,
      updatedAt,
      entry: {
        id: `own-${m[1]}`,
        productId: m[1],
        video: `own-${m[1]}.mp4`,
        poster: "",
        title: "",
        seconds: 0,
        look: "real",
        labels: [...OWN_LABELS],
        createdAt: updatedAt,
        ...(owners.get(m[1]) ? { marketerId: owners.get(m[1]) } : {}),
      },
    });
  }
  return out;
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
  const listedRows = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8"))).products;
  const listed = new Set(listedRows.map((x) => String(x.product.id)));
  const owners = new Map(listedRows.map((x) => [String(x.product.id), String(x.product.marketerId || "")]));
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
      const cover = `${r.base}-cover.jpg`;
      entries.push(feedEntry(r, owners, coverFrame(join(out, `${r.base}.mp4`), join(out, cover)) ? cover : ""));
    } catch (e) {
      console.warn(`reels-feed: skipped ${r.base} (${e.message})`);
    }
  }
  // Our own footage first, then the sellers' own product videos, each labelled as whose it is.
  try {
    const assets = (await api(`/repos/${repo}/releases/tags/reels`, token)).assets;
    for (const r of [...ownReels(assets, listed, owners), ...sellerReels(assets, listed)]) {
      try {
        await download(r.mp4.url, join(out, r.entry.video), token);
        const cover = `${r.entry.id}-cover.jpg`;
        entries.push({ ...r.entry, poster: coverFrame(join(out, r.entry.video), join(out, cover)) ? cover : "" });
      } catch (e) {
        console.warn(`reels-feed: skipped ${r.entry.id} (${e.message})`);
      }
    }
  } catch { /* no reels release: Luna reels only */ }
  writeFileSync(join(out, "index.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), reels: entries }, null, 1)}\n`);
  return { reels: entries.length, of: groups.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await buildFeed({ dist: process.argv[2] || "dist" });
  console.log(r.reason ? `reels-feed: ${r.reason}` : `reels-feed: ${r.reels} product reel(s) from ${r.of} in the release`);
}
