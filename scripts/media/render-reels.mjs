#!/usr/bin/env node
// LikeLink native reel renderer — the executor of the media pipeline.
//
//   GET  /api/store?mode=media-pipeline&op=plan     (what to render; server decides)
//   →    render: Chromium canvas frames (scripts/media/reel-scene.html)
//   →    encode: ffmpeg → H.264 MP4 (yuv420p, faststart) + JPEG poster
//   →    probe:  ffprobe (codec, size, duration, frames) + sha256
//   POST /api/store?mode=media-pipeline&op=ingest   (server stores, verifies,
//        registers, publishes and returns the proof)
//
// Runs on the GitHub Actions runner (.github/workflows/media-render.yml): a
// Vercel function cannot render video. Auth: Authorization: Bearer
// $AUTOPILOT_SECRET (api/_utils/cronAuth.mjs).
//
// Usage:
//   node scripts/media/render-reels.mjs [--api https://likelink2.vercel.app] [--limit 3]
//   node scripts/media/render-reels.mjs --plan-file plan.json --out dir --no-upload   (local)

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, [])
);
const API = String(args.api || process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const LIMIT = Number(args.limit || 3);
const OUT = path.resolve(String(args.out || path.join(process.cwd(), "reel-out")));
const SECRET = process.env.AUTOPILOT_SECRET || "";
const UPLOAD = !args["no-upload"];
const RENDERER = "reel-canvas-v2";
mkdirSync(OUT, { recursive: true });

function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const req = createRequire(import.meta.url);
    return req(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright");
  }
}

async function api(op, { method = "GET", body, query = "" } = {}) {
  const res = await fetch(`${API}/api/store?mode=media-pipeline&op=${op}${query}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, Origin: API, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function imageDataUrl(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (LikeLink reel renderer)", accept: "image/*" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`image_fetch_${res.status}`);
  const type = String(res.headers.get("content-type") || "").split(";")[0];
  if (!type.startsWith("image/")) throw new Error("image_not_image");
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
}

function run(cmd, argv, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [], err = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(-400)}`))));
    if (input) input(p.stdin);
    else p.stdin.end();
  });
}

async function renderOne(page, item) {
  const { concept } = item;
  const dataUrl = await imageDataUrl(concept.image);
  await page.evaluate(([c, d]) => window.loadConcept(c, d), [concept, dataUrl]);
  const frames = Math.round((concept.durationMs / 1000) * concept.fps);
  const base = path.join(OUT, `${item.productId}-${item.style}`);
  const mp4 = `${base}.mp4`, poster = `${base}.jpg`;

  const encode = async (crf) => {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(concept.fps), "-c:v", "mjpeg", "-i", "-",
      // Instagram's Reels API requires an AAC track: a silent 48 kHz stereo bed (no third-party music).
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-shortest",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(concept.fps),
      "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-movflags", "+faststart", mp4], {
      input: async (stdin) => {
        for (let f = 0; f < frames; f++) {
          const jpeg = await page.evaluate((t) => window.renderFrame(t, 0.9), (f * 1000) / concept.fps);
          const ok = stdin.write(Buffer.from(jpeg.split(",")[1], "base64"));
          if (!ok) await new Promise((r) => stdin.once("drain", r));
        }
        stdin.end();
      },
    });
  };
  let crf = 24;
  await encode(crf);
  while (readFileSync(mp4).length > 2_600_000 && crf < 34) { crf += 3; await encode(crf); }

  for (const q of [0.82, 0.72, 0.6, 0.5]) {
    const posterJpeg = await page.evaluate(([t, quality]) => window.renderFrame(t, quality), [Math.min(concept.durationMs - 100, 3600), q]);
    writeFileSync(poster, Buffer.from(posterJpeg.split(",")[1], "base64"));
    if (readFileSync(poster).length <= 250_000) break;
  }

  const probeRaw = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,width,height,nb_read_frames,pix_fmt", "-show_entries", "format=duration", "-of", "json", mp4]);
  const pj = JSON.parse(probeRaw);
  const s = pj.streams?.[0] || {};
  const audioRaw = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate", "-of", "json", mp4]);
  const a = JSON.parse(audioRaw).streams?.[0] || {};
  const probe = { audio: a.codec_name || "none", audioRate: Number(a.sample_rate) || 0, codec: s.codec_name, width: Number(s.width), height: Number(s.height), frames: Number(s.nb_read_frames), pixFmt: s.pix_fmt, durationMs: Math.round(Number(pj.format?.duration || 0) * 1000), crf };
  const video = readFileSync(mp4);
  const sha256 = createHash("sha256").update(video).digest("hex");
  return { mp4, poster, video, posterBytes: readFileSync(poster), probe, sha256 };
}

async function main() {
  let plan;
  if (args["plan-file"]) {
    plan = JSON.parse(readFileSync(String(args["plan-file"]), "utf8")).plan;
  } else {
    if (!SECRET) throw new Error("AUTOPILOT_SECRET is required to fetch the plan");
    const r = await api("plan", { query: `&limit=${LIMIT}` });
    if (r.status !== 200 || !r.json?.ok) throw new Error(`plan_failed ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
    plan = r.json.plan;
  }
  summary(`## LikeLink native reels — ${new Date().toISOString()}`);
  summary(`Plan: ${plan.length} render(s) from ${args["plan-file"] ? "file" : API}`);
  if (!plan.length) return;

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  if (args["block-fonts"]) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(pathToFileURL(path.join(HERE, "reel-scene.html")).href, { waitUntil: "load" });

  let failures = 0;
  for (const item of plan) {
    const tag = `${item.productId} · ${item.style}`;
    try {
      const r = await renderOne(page, item);
      summary(`- rendered ${tag}: ${r.probe.codec} ${r.probe.width}x${r.probe.height}, ${r.probe.frames} frames, ${r.probe.durationMs} ms, ${r.video.length} bytes, sha256 ${r.sha256.slice(0, 16)}…`);
      if (!UPLOAD) continue;
      const res = await api("ingest", {
        method: "POST",
        body: {
          productId: item.productId,
          style: item.style,
          renderer: RENDERER,
          conceptId: item.concept.id,
          probe: r.probe,
          sha256: r.sha256,
          video: r.video.toString("base64"),
          poster: r.posterBytes.toString("base64"),
        },
      });
      if (res.status === 200 && res.json?.ok) {
        const p = res.json.proof || {};
        summary(`  - ingested: truth ${res.json.truth}, asset ${res.json.assetId}, media ${p.media?.status} (${p.media?.bytes} bytes, sha256 match ${p.media?.sha256Match}), publication ${res.json.publication?.status} ${res.json.publication?.externalId || ""}`);
      } else {
        failures += 1;
        summary(`  - ingest FAILED (${res.status}): ${JSON.stringify(res.json).slice(0, 400)}`);
      }
    } catch (e) {
      failures += 1;
      summary(`- FAILED ${tag}: ${String(e?.message || e).slice(0, 300)}`);
    }
  }
  await browser.close();
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
