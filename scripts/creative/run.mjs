#!/usr/bin/env node
// The Creative Engine's runner (.github/workflows/creative-engine.yml).
//
//   node scripts/creative/run.mjs render   plan every listed product, bring the
//                                          job ledger up to date, check which
//                                          stored videos are live, render the
//                                          due jobs, run QC
//   node scripts/creative/run.mjs commit   after the upload: a job is STORED
//                                          only when the release really holds
//                                          its file with the same size
//
// Env: LEDGER (jobs.json path), OUT (output dir), SOURCES (seller clips,
// <productId>.mp4), CACHE (downloaded photos), PRODUCTS (ids, optional),
// FORCE=1 (render again even if stored), STAGE=live|preview, RELEASE (tag),
// GITHUB_REPOSITORY, GH_TOKEN. Nothing here calls a paid service: the plan's
// providers are checked against ZERO_PAID_CREDITS before any work starts.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";
import { REELS_FEED_HOME } from "../../src/lib/reelsFeed.js";
import { ENGINE_VERSION, JOB, MODES, emptyLedger, engineMode, liveProof, markFailed, markLive, markRendered, markStored, planProduct, qcVerdict, reconcile, updateJob } from "../../src/lib/creative/engine.js";
import { renderLookbook } from "./lookbook.mjs";

const env = process.env;
const summary = (l) => { console.log(l); if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${l}\n`); };
const readJson = (f, fallback) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fallback; } };
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function loadCatalog(file = new URL("../../public/snapshot/kv.json", import.meta.url)) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const raw = doc.keys["marketplace:products"] || [];
  return { raw, listed: listedFromSnapshot(doc).products.map((x) => x.product) };
}

/** The seller clips on hand (the product-video-sources release, downloaded by the workflow). */
export function sellerVideosIn(dir) {
  if (!dir || !existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).map((f) => f.match(/^([A-Za-z0-9_-]+)\.mp4$/)?.[1]).filter(Boolean));
}

/** Download one store photo (image/*, ≥4 KB), cached by URL. */
async function fetchPhoto(url, cache) {
  const name = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const file = join(cache, `${name}.img`);
  if (existsSync(file) && statSync(file).size >= 4096) return file;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "image/*" } });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !/^image\//.test(type)) throw new Error(`no_media: ${url} answered ${res.status} ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4096) throw new Error(`no_media: ${url} is ${buf.length} bytes`);
  writeFileSync(file, buf);
  return file;
}

/** ffprobe + signalstats samples for QC. */
export function measure(mp4) {
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", mp4], { encoding: "utf8" }));
  const seconds = Number(probe.format?.duration) || 0;
  const stat = (args, key) => {
    const out = execFileSync("ffmpeg", ["-v", "error", ...args, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
    return [...out.matchAll(new RegExp(`${key}=([\\d.]+)`, "g"))].map((m) => Number(m[1]));
  };
  const luma = [1, seconds / 2, Math.max(1, seconds - 1)].map((t) => stat(["-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-"], "lavfi.signalstats.YAVG")[0] ?? 0);
  const diffs = stat(["-i", mp4, "-vf", "fps=5,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-"], "lavfi.signalstats.YDIF").slice(1);
  const motion = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0;
  return { probe, stats: { luma: luma.map((y) => Number(y.toFixed(1))), motion: Number(motion.toFixed(2)) } };
}

async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** STORED jobs whose video the site's reels feed now serves, with the same bytes → LIVE. */
async function checkLive(ledger, now) {
  let feed;
  try {
    feed = await (await fetch(REELS_FEED_HOME, { signal: AbortSignal.timeout(20_000), cache: "no-store" })).json();
  } catch (e) {
    summary(`- live check skipped: the reels feed could not be read (${e.message})`);
    return ledger;
  }
  for (const job of ledger.jobs.filter((j) => j.status === JOB.STORED)) {
    const entry = (feed.reels || []).find((e) => e?.id === `lookbook-${job.productId}`);
    let bytes = 0;
    if (entry) {
      try {
        const head = await fetch(new URL(entry.video, REELS_FEED_HOME), { method: "HEAD", signal: AbortSignal.timeout(20_000) });
        bytes = Number(head.headers.get("content-length")) || 0;
      } catch { /* not served yet */ }
    }
    const proof = liveProof(feed, job, bytes);
    if (proof.live) {
      ledger = updateJob(ledger, job.id, (j) => markLive(j, { ...proof, feed: REELS_FEED_HOME, page: `/p/${job.productId}`, checkedAt: now }, now));
      summary(`- ${job.asset}: LIVE — in the site's reels feed, ${bytes} bytes served`);
    } else {
      summary(`- ${job.asset}: stored, not live yet (${proof.reason})`);
    }
  }
  return ledger;
}

export async function render() {
  const now = Date.now();
  const mode = engineMode(env);
  const out = env.OUT || "creative-out";
  const work = join(out, ".work");
  const cache = env.CACHE || join(out, ".cache");
  const ledgerFile = env.LEDGER || "creative-ledger/jobs.json";
  for (const d of [out, work, cache, dirname(ledgerFile)]) mkdirSync(d, { recursive: true });
  const only = new Set(String(env.PRODUCTS || "").split(/[\s,]+/).filter(Boolean));
  const { raw, listed } = loadCatalog();
  const sellerVideos = sellerVideosIn(env.SOURCES);
  summary(`## Creative Engine (${ENGINE_VERSION}) · mode ${mode} · stage ${env.STAGE || "preview"}`);
  if (mode !== MODES.ZERO_PAID_CREDITS) summary("- note: paid providers allowed by CREATIVE_MODE (no template uses one today)");

  const plans = listed.filter((p) => !only.size || only.has(p.id)).map((p) => planProduct(p, { products: raw, sellerVideos, mode }));
  for (const p of plans.filter((x) => !x.ok)) summary(`- ${p.productId}: no lookbook (${p.stage}: ${p.reason})${p.delegate ? ` → ${p.delegate.template} by ${p.delegate.executor}` : ""}`);

  let ledger = readJson(ledgerFile, emptyLedger());
  if ((env.STAGE || "preview") === "live") ledger = await checkLive(ledger, now);
  const r = reconcile(ledger, plans, { now, force: env.FORCE === "1" });
  ledger = r.ledger;
  for (const id of r.reused) summary(`- ${id}: reused (same inputs already stored)`);
  for (const w of r.waiting) summary(`- ${w.id}: waiting (${w.reason}${w.until ? ` until ${new Date(w.until).toISOString()}` : ""})`);

  const planByKey = new Map(plans.filter((x) => x.ok).map((p) => [p.key, p]));
  const rendered = [];
  let page = null;
  let browser = null;
  for (const id of r.due) {
    const job = ledger.jobs.find((j) => j.id === id);
    const plan = planByKey.get(job.key);
    try {
      if (!page) {
        const { chromium } = createRequire(import.meta.url)(env.PLAYWRIGHT_MODULE || "playwright");
        browser = await chromium.launch(env.CHROME_PATH ? { executablePath: env.CHROME_PATH } : { channel: env.CHROME_CHANNEL || "chrome" }).catch(() => chromium.launch());
        page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      }
      const photos = [];
      for (const ph of plan.media.photos) photos.push(await fetchPhoto(ph.url, cache));
      const video = plan.media.video ? join(env.SOURCES || "", plan.media.video.file) : "";
      const made = await renderLookbook({ page, plan, photos, video, work, out });
      const { probe, stats } = measure(made.mp4);
      const qc = qcVerdict(probe, stats);
      if (!qc.pass) throw new Error(`qc_failed: ${qc.checks.filter((c) => !c.pass).map((c) => c.name).join(",")}`);
      const output = { file: `${plan.asset}.mp4`, bytes: statSync(made.mp4).size, sha256: sha256(made.mp4), seconds: made.seconds, segments: made.segments };
      const meta = {
        id: plan.asset,
        engine: ENGINE_VERSION,
        template: plan.template,
        look: plan.look,
        product: { id: plan.productId },
        labels: plan.script.labels,
        synthetic: false,
        humanFilmed: false,
        presenter: null,
        media: { photos: plan.media.photos.map((x) => ({ url: x.url, kind: x.kind, rights: x.rights })), video: plan.media.video },
        script: plan.script,
        key: plan.key,
        seconds: made.seconds,
        createdAt: new Date(now).toISOString(),
      };
      writeFileSync(join(out, `${plan.asset}.json`), `${JSON.stringify(meta, null, 1)}\n`);
      ledger = updateJob(ledger, id, (j) => markRendered(j, output, qc, Date.now()));
      rendered.push({ id, asset: plan.asset, bytes: output.bytes });
      summary(`- ${plan.asset}: rendered ${made.seconds} s (${made.segments.join(" → ")}), QC passed · motion ${stats.motion} · luma ${stats.luma.join("/")}`);
    } catch (e) {
      ledger = updateJob(ledger, id, (j) => markFailed(j, e, Date.now()));
      const j = ledger.jobs.find((x) => x.id === id);
      summary(`- ${plan?.asset || id}: ${j.status} (${j.error?.class}: ${j.error?.message})`);
    }
  }
  if (browser) await browser.close();
  rmSync(work, { recursive: true, force: true });
  // A dot file: the upload step's globs never send it to the release.
  writeFileSync(join(out, ".manifest.json"), `${JSON.stringify({ rendered }, null, 1)}\n`);
  // The seller clips this run planned with: the Studio's orchestrator plans with
  // exactly these, so its plan keys are the runner's (src/lib/creative/orchestrator.js).
  ledger = { ...ledger, clipsOnHand: [...sellerVideos].sort(), clipsReadAt: now };
  writeFileSync(ledgerFile, `${JSON.stringify(ledger, null, 1)}\n`);
  return { rendered, ledger };
}

export async function commit() {
  const now = Date.now();
  const out = env.OUT || "creative-out";
  const ledgerFile = env.LEDGER || "creative-ledger/jobs.json";
  const tag = env.RELEASE || "creative-preview";
  const repo = env.GITHUB_REPOSITORY || "hen63165-dotcom/likelink";
  let ledger = readJson(ledgerFile, emptyLedger());
  const { rendered = [] } = readJson(join(out, ".manifest.json"), {});
  let assets = [];
  try {
    assets = (await gh(`/repos/${repo}/releases/tags/${tag}`, env.GH_TOKEN || env.GITHUB_TOKEN)).assets || [];
  } catch (e) {
    summary(`- the release "${tag}" could not be read (${e.message})`);
  }
  for (const r of rendered) {
    const a = assets.find((x) => x.name === `${r.asset}.mp4`);
    if (a && Number(a.size) === Number(r.bytes)) {
      ledger = updateJob(ledger, r.id, (j) => markStored(j, { tag, name: a.name, bytes: a.size, url: a.browser_download_url }, now));
      summary(`- ${r.asset}: STORED in the "${tag}" release (${a.size} bytes)`);
    } else {
      ledger = updateJob(ledger, r.id, (j) => markFailed(j, new Error(`render: upload not confirmed (${a ? `size ${a.size} ≠ ${r.bytes}` : "no asset"})`), now));
      summary(`- ${r.asset}: upload not confirmed — will retry`);
    }
  }
  writeFileSync(ledgerFile, `${JSON.stringify(ledger, null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const step = process.argv[2] || "render";
  (step === "commit" ? commit() : render()).catch((e) => { console.error(e); process.exitCode = 1; });
}
