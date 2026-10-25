#!/usr/bin/env node
// Studio videos — runner side (.github/workflows/studio-videos.yml, hourly).
// The pure rules are in src/lib/growth/studioVideos.js.
//
//   plan   <dir>          the cloud's approved AliExpress products still without a video → <dir>/plan.json
//   fetch  <dir>          each one's store video from the owner's affiliate account → <dir>/videos/<id>.mp4
//   finish <dir> <reels>  the outcome of every planned product → <dir>/studio-videos.json (the state)
//   feed   <dist>         (deploy-frontend.yml) READY videos + media/studio/index.json on GitHub Pages
//
// Read-only everywhere: the products come from the cloud's public row (anon
// key, the same read every visitor makes); the store is asked through the
// official API (no page visit, no CAPTCHA); the store's video is downloaded
// once. Nothing is posted, and nothing is written to the cloud.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLOUD } from "../../../src/constants/cloud.js";
import { SELLER_SKIP } from "../../../src/lib/reelsFeed.js";
import { STUDIO_VIDEO_STATUS as S, publicIndex, recordOutcome, studioVideoCandidates } from "../../../src/lib/growth/studioVideos.js";
import { aeCall, aeStatus, aliexpressItemFromLink } from "../../../api/_utils/aliexpressAffiliate.mjs";

const RELEASE = "reels";
const STATE = "studio-videos.json";
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const readJson = (f, fallback) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fallback; } };
const gh = (args, opts = {}) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const https = (u) => String(u || "").trim().replace(/^http:\/\//, "https://").replace(/^\/\//, "https://");
const STORE_VIDEO = /^https:\/\/[a-z0-9.-]*(aliexpress-media\.com|alicdn\.com|alivideo\.com|aliexpress\.com)\/\S+\.mp4(\?\S*)?$/i;
const HEBREW = /[֐-׿]/;

/** The cloud's public product row (anon key: the same read every visitor makes). */
export async function cloudProducts(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${CLOUD.url}/rest/v1/kv?key=eq.marketplace%3Aproducts&select=value`, {
    headers: { apikey: CLOUD.anonKey, authorization: `Bearer ${CLOUD.anonKey}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`cloud_read_${res.status}`);
  const rows = await res.json();
  const value = rows?.[0]?.value;
  const list = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(list) ? list : [];
}

function releaseAssets() {
  try {
    return JSON.parse(gh(["release", "view", RELEASE, "--json", "assets"])).assets.map((a) => a.name);
  } catch {
    return [];
  }
}

function releasedState(dir) {
  try {
    gh(["release", "download", RELEASE, "-p", STATE, "-D", dir, "--clobber"]);
  } catch { /* no state yet */ }
  return readJson(join(dir, STATE), {});
}

async function plan(dir) {
  mkdirSync(dir, { recursive: true });
  const products = await cloudProducts();
  const state = releasedState(dir);
  const released = new Set(releaseAssets());
  const candidates = studioVideoCandidates(products, { state, released, skip: SELLER_SKIP });
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ at: new Date().toISOString(), candidates }, null, 2));
  output("count", candidates.length);
  const fromAli = products.filter((p) => /aliexpress\./i.test(String(p?.affiliateUrl || "")));
  const counts = {
    approved: fromAli.filter((p) => p.status === "approved").length,
    drafts: fromAli.filter((p) => p.status !== "approved").length,
    withVideo: fromAli.filter((p) => released.has(`${p.id}.mp4`) || state?.videos?.[p.id]?.status === "READY").length,
  };
  summary(`## Studio videos — ${new Date().toISOString()}\n${products.length} products in the cloud · from AliExpress: ${counts.approved} published, ${counts.drafts} not published, ${counts.withVideo} with a video · ${candidates.length} to make this run${candidates.length ? `: ${candidates.map((p) => p.id).join(", ")}` : ""}`);
}

/** The store's own video (and Hebrew title) for one product, from the owner's affiliate account. */
export async function storeVideo(product, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const itemId = await aliexpressItemFromLink(product.affiliateUrl, fetchImpl);
  if (!itemId) return { status: S.NOT_RETURNED, reason: "the link does not open a store item" };
  const json = await aeCall("aliexpress.affiliate.productdetail.get", {
    product_ids: itemId, target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
  }, { env, fetchImpl });
  const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  if (!result || Number(result.resp_code) !== 200) return { status: S.NOT_RETURNED, reason: `store answer ${result?.resp_code ?? "none"}` };
  const list = result.result?.products?.product;
  const x = (Array.isArray(list) ? list : list ? [list] : []).find((p) => String(p?.product_id) === itemId);
  if (!x) return { status: S.NOT_RETURNED, reason: "the store did not return the item" };
  const video = https(x.product_video_url);
  const title = String(x.product_title || "").trim().slice(0, 200);
  if (!STORE_VIDEO.test(video)) return { status: S.NO_SELLER_VIDEO, title };
  return { status: "FOUND", video, title, itemId };
}

function probe(file) {
  const d = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", file], { encoding: "utf8" }));
  return { video: (d.streams || []).some((s) => s.codec_type === "video"), seconds: Number(d.format?.duration || 0) };
}

async function fetchVideos(dir) {
  const { candidates = [] } = readJson(join(dir, "plan.json"), {});
  const videos = join(dir, "videos");
  mkdirSync(videos, { recursive: true });
  const outcomes = {};
  const results = [];
  const products = [];
  if (!aeStatus(process.env).configured) {
    summary("- AliExpress affiliate account not connected on this runner (REQUIRES_CONNECTION): nothing to fetch");
    for (const p of candidates) outcomes[p.id] = { status: S.NOT_RETURNED, reason: "store connection required" };
  }
  for (const p of aeStatus(process.env).configured ? candidates : []) {
    try {
      const found = await storeVideo(p);
      if (found.status !== "FOUND") {
        outcomes[p.id] = { status: found.status, reason: found.reason };
        summary(`- ${p.id}: ${found.status}${found.reason ? ` (${found.reason})` : ""}`);
        continue;
      }
      const file = join(videos, `${p.id}.mp4`);
      execFileSync("curl", ["-fsSL", "--max-time", "120", "--max-filesize", "200000000", "-o", file, found.video]);
      const info = probe(file);
      if (!info.video || info.seconds < 3) {
        outcomes[p.id] = { status: S.FAILED, reason: "the store's video did not open as a video" };
        continue;
      }
      results.push({ productId: p.id, status: "FOUND", source: "aliexpress_api", seconds: info.seconds });
      // The creator's own title when it is Hebrew; else the store's own Hebrew title (her account's API answer).
      products.push({ ...p, title: HEBREW.test(String(p.title || "")) || !found.title ? p.title : found.title });
      summary(`- ${p.id}: store video ${info.seconds.toFixed(1)} s`);
    } catch (e) {
      outcomes[p.id] = { status: S.FAILED, reason: String(e?.message || e).slice(0, 120) };
      summary(`- ${p.id}: FAILED (${String(e?.message || e).slice(0, 120)})`);
    }
  }
  writeFileSync(join(videos, "videos.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  writeFileSync(join(dir, "products.json"), JSON.stringify(products, null, 2));
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes, null, 2));
}

function finish(dir, reels) {
  const { candidates = [] } = readJson(join(dir, "plan.json"), {});
  const outcomes = readJson(join(dir, "outcomes.json"), {});
  let state = readJson(join(dir, STATE), {});
  for (const p of candidates) {
    const made = existsSync(join(reels, `${p.id}.mp4`));
    const caption = made && existsSync(join(reels, `${p.id}.txt`)) ? readFileSync(join(reels, `${p.id}.txt`), "utf8").trim() : "";
    const outcome = made
      ? {
        status: S.READY,
        video: `${p.id}.mp4`,
        variants: ["b", "c"].map((v) => `${p.id}-${v}.mp4`).filter((f) => existsSync(join(reels, f))),
        poster: existsSync(join(reels, `${p.id}-preview.jpg`)) ? `${p.id}-preview.jpg` : "",
        caption,
        hook: caption.split("\n")[0] || "",
      }
      : outcomes[p.id] || { status: S.FAILED, reason: "not enough usable footage for a cut" };
    state = recordOutcome(state, p, outcome);
  }
  writeFileSync(join(dir, STATE), JSON.stringify(state, null, 2));
  summary(`State: ${Object.keys(state.videos || {}).length} products (${Object.values(state.videos || {}).filter((v) => v.status === S.READY).length} ready)`);
}

/** GitHub Pages: the READY videos (from the release) and the index the Studio reads. */
function feed(dist) {
  const dir = join(dist, "media", "studio");
  mkdirSync(dir, { recursive: true });
  const index = publicIndex(releasedState(dir));
  rmSync(join(dir, STATE), { force: true }); // the state names the creators' links: it stays in the release
  for (const v of index.videos) {
    for (const f of [v.video, ...(v.variants || []), v.poster].filter(Boolean)) {
      try {
        gh(["release", "download", RELEASE, "-p", f, "-D", dir, "--clobber"]);
      } catch {
        // A missing file is never shown as ready.
        for (const k of ["video", "variants", "poster", "caption", "hook"]) delete v[k];
        v.status = S.FAILED;
        break;
      }
    }
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index));
  console.log(`media/studio: ${index.videos.filter((v) => v.status === S.READY).length} ready of ${index.videos.length}`);
}

async function main() {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "plan") return plan(a || "studio");
  if (mode === "fetch") return fetchVideos(a || "studio");
  if (mode === "finish") return finish(a || "studio", b || "reels");
  if (mode === "feed") return feed(a || "dist");
  throw new Error("usage: studio-videos.mjs plan|fetch|finish <dir> [reels] | feed <dist>");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; });
