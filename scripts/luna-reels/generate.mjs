/**
 * Luna Reels generator — autonomous premium video engine.
 *
 *   script → Edge-TTS (he-IL-AvriNeural) → ASS captions (lower-middle,
 *   2–3 words, corner tags) → Pexels aesthetic backgrounds → ffmpeg render
 *   (text-logo closing screen + animated CTA button) → out/luna-reels/
 *
 * Runs by itself from .github/workflows/luna-reels.yml at 08:00 & 17:00 UTC.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AESTHETIC_KEYWORDS, BRAND, CAPTION, CORNER_TAGS, PATHS, SCHEDULE, VOICE,
  pickScript, ROOT,
} from "./config.mjs";
import { buildAss } from "./captions.mjs";
import { fetchBackgrounds } from "./fetch-background.mjs";
import { makeFallbackClip, renderReel } from "./render.mjs";
import { probeDurationMs, synthesize } from "./tts.mjs";

function parseArgs(argv) {
  const opts = { dryRun: false, text: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--text") opts.text = argv[++i] || "";
    else if (a.startsWith("--")) opts[a.slice(2)] = argv[++i] ?? true;
  }
  return opts;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const text = (opts.text || process.env.LUNA_SCRIPT || pickScript()).trim();
  mkdirSync(PATHS.tmp, { recursive: true });
  mkdirSync(PATHS.out, { recursive: true });

  const closingSec = BRAND.closingSec;
  const assPath = path.join(PATHS.tmp, "captions.ass");
  const manifestPath = path.join(PATHS.out, "manifest.json");

  if (opts.dryRun) {
    const mainMs = 9000;
    const { ass, cues } = buildAss(text, mainMs, {
      closing: { startMs: mainMs, durationMs: closingSec * 1000 },
    });
    writeFileSync(assPath, ass, "utf8");
    const manifest = buildManifest({ voice: VOICE.name, mainMs, cues, clips: [], out: null, dryRun: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, cues: cues.length, assPath }, null, 2)}\n`);
    return manifest;
  }

  // 1 ── audio layer (free, fluent Hebrew neural voice)
  const audioPath = path.join(PATHS.tmp, "narration.mp3");
  const { voice } = await synthesize({ text, outFile: audioPath });
  const mainMs = await probeDurationMs(audioPath);

  // 2 ── caption layer
  const { ass, cues } = buildAss(text, mainMs, {
    closing: { startMs: mainMs, durationMs: closingSec * 1000 },
  });
  writeFileSync(assPath, ass, "utf8");

  // 3 ── background layer (Pexels aesthetic lifestyle keywords, gradient fallback)
  const clipCount = Math.min(6, Math.max(3, Math.ceil(mainMs / 4000)));
  const bgDir = path.join(PATHS.tmp, "bg");
  let clips = [];
  let source = "pexels";
  try {
    clips = await fetchBackgrounds({ count: clipCount, dir: bgDir });
  } catch (err) {
    source = "fallback-gradient";
    process.stderr.write(`background fetch degraded: ${err.message}\n`);
    mkdirSync(bgDir, { recursive: true });
    for (let i = 0; i < clipCount; i += 1) {
      const clip = path.join(bgDir, `bg-${String(i + 1).padStart(2, "0")}.mp4`);
      if (!existsSync(clip)) await makeFallbackClip({ out: clip, seconds: 6 });
      clips.push(clip);
    }
  }

  // 4 ── render
  const outFile = path.join(PATHS.out, `luna-${stamp()}.mp4`);
  await renderReel({
    clips,
    audio: audioPath,
    assPath,
    out: outFile,
    mainSec: mainMs / 1000,
    closingSec,
  });

  const manifest = buildManifest({ voice, mainMs, cues, clips, out: outFile, source });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, outFile, cues: cues.length, source }, null, 2)}\n`);
  return manifest;
}

function buildManifest({ voice, mainMs, cues, clips, out, source = "pexels", dryRun = false }) {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    voice,
    durationMs: mainMs + BRAND.closingSec * 1000,
    caption: {
      position: CAPTION.position,
      maxWordsPerFrame: CAPTION.maxWords,
      colors: [CAPTION.primaryColor, CAPTION.alternateColor],
      outline: { color: CAPTION.outlineColor, width: CAPTION.outlineWidth },
      backgroundBox: CAPTION.backgroundBox,
      cornerTags: [CORNER_TAGS.left, CORNER_TAGS.right],
    },
    closing: { logo: BRAND.name, tagline: BRAND.tagline, cta: BRAND.cta, animatedButton: true },
    background: { source, count: clips.length, keywords: AESTHETIC_KEYWORDS, clips: clips.map((c) => path.basename(c)) },
    schedule: SCHEDULE,
    cues: cues.length,
    file: out ? path.basename(out) : null,
    bytes: out && existsSync(out) ? statSync(out).size : 0,
    root: ROOT,
  };
}

main().catch((err) => {
  process.stderr.write(`luna-reels failed: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
