/**
 * Luna Reels generator — autonomous premium video engine.
 *
 *   live storefront photos (canonical cloud origin) + Pexels aesthetic B-roll
 *   → Edge-TTS (he-IL-AvriNeural) → ASS captions (LOWER-MIDDLE, 1–2 words per flashing cue,
 *   yellow/white bold text, black outline, no boxes) + `#פרסומת` / `AI` corner
 *   tags → ffmpeg render with a text-logo closing screen and animated CTA.
 *
 * Volume: 6 viral reels a day = the 08:00 + 17:00 UTC cron runs × REELS.perRun.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AESTHETIC_KEYWORDS, BRAND, CANONICAL, CAPTION, CORNER_TAGS, PATHS, REELS, SCHEDULE,
  VOICE, pickScript, ROOT,
} from "./config.mjs";
import { buildAss } from "./captions.mjs";
import { fetchBackgrounds } from "./fetch-background.mjs";
import { makeFallbackClip, makeImageClip, renderReel } from "./render.mjs";
import { fetchStorefrontImages } from "./storefront.mjs";
import { probeDurationMs, synthesize } from "./tts.mjs";

function parseArgs(argv) {
  const opts = { dryRun: false, text: "", reels: REELS.perRun };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--text") opts.text = argv[++i] || "";
    else if (a.startsWith("--")) opts[a.slice(2)] = argv[++i] ?? true;
  }
  opts.reels = Math.max(1, Number(opts.reels) || REELS.perRun);
  return opts;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const pad = (n) => String(n + 1).padStart(2, "0");

/** One reel: narration → captions → mixed backgrounds → render. */
async function buildReel({ index, text, storefront, aestheticClips, dirs, stampId }) {
  const closingSec = BRAND.closingSec;
  const audioPath = path.join(dirs.tmp, `narration-${pad(index)}.mp3`);
  const assPath = path.join(dirs.tmp, `captions-${pad(index)}.ass`);

  const { voice } = await synthesize({ text, outFile: audioPath });
  const mainMs = await probeDurationMs(audioPath);

  const { ass, cues } = buildAss(text, mainMs, {
    closing: { startMs: mainMs, durationMs: closingSec * 1000 },
  });
  writeFileSync(assPath, ass, "utf8");

  // Backgrounds: live storefront product photos first, then aesthetic footage.
  const clips = [];
  for (const [i, photo] of storefront.files.entries()) {
    const clip = path.join(dirs.clips, `store-${pad(index)}-${pad(i)}.mp4`);
    try {
      if (!existsSync(clip)) await makeImageClip({ image: photo, out: clip, seconds: 4 });
      clips.push(clip);
    } catch (err) {
      process.stderr.write(`storefront clip skipped: ${err.message}\n`);
    }
  }
  clips.push(...aestheticClips);
  if (!clips.length) {
    const clip = path.join(dirs.clips, `gradient-${pad(index)}.mp4`);
    await makeFallbackClip({ out: clip, seconds: 6 });
    clips.push(clip);
  }

  const outFile = path.join(dirs.out, `luna-${stampId}-${pad(index)}.mp4`);
  await renderReel({ clips, audio: audioPath, assPath, out: outFile, mainSec: mainMs / 1000, closingSec });
  return {
    file: path.basename(outFile),
    bytes: existsSync(outFile) ? statSync(outFile).size : 0,
    voice,
    cues: cues.length,
    durationMs: mainMs + closingSec * 1000,
    backgrounds: clips.length,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(PATHS.tmp, { recursive: true });
  mkdirSync(PATHS.out, { recursive: true });
  const dirs = {
    tmp: PATHS.tmp,
    out: PATHS.out,
    clips: path.join(PATHS.tmp, "bg"),
    store: path.join(PATHS.tmp, "store"),
    bg: path.join(PATHS.tmp, "bg"),
  };
  mkdirSync(dirs.clips, { recursive: true });
  mkdirSync(dirs.store, { recursive: true });

  const stampId = stamp();
  const manifestPath = path.join(PATHS.out, "manifest.json");

  if (opts.dryRun) {
    const mainMs = 9000;
    const { ass, cues } = buildAss(opts.text || pickScript(), mainMs, {
      closing: { startMs: mainMs, durationMs: BRAND.closingSec * 1000 },
    });
    writeFileSync(path.join(dirs.tmp, "captions-01.ass"), ass, "utf8");
    const manifest = buildManifest({ stampId, voice: VOICE.name, origin: CANONICAL.origin, texts: [opts.text].filter(Boolean), results: [{ file: null, bytes: 0, voice: VOICE.name, cues: cues.length, durationMs: mainMs + BRAND.closingSec * 1000, backgrounds: 0 }], dryRun: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, reels: manifest.reels }, null, 2)}\n`);
    return manifest;
  }

  // Shared background layers for the whole run (fetched once, reused per reel).
  let storefront = { origin: CANONICAL.origin, files: [], products: [] };
  try {
    storefront = await fetchStorefrontImages({ dir: dirs.store, limit: REELS.productClips });
  } catch (err) {
    process.stderr.write(`storefront layer degraded: ${err.message}\n`);
  }

  let aestheticClips = [];
  let backgroundSource = "pexels";
  try {
    aestheticClips = await fetchBackgrounds({ count: REELS.aestheticClips, dir: dirs.bg });
  } catch (err) {
    process.stderr.write(`aesthetic layer degraded: ${err.message}\n`);
    backgroundSource = "fallback-gradient";
  }

  const texts = [];
  const results = [];
  for (let i = 0; i < opts.reels; i += 1) {
    const text = (opts.text || process.env.LUNA_SCRIPT || pickScript(Date.now() + i * 7919)).trim();
    texts.push(text);
    results.push(await buildReel({ index: i, text, storefront, aestheticClips, dirs, stampId }));
  }

  const manifest = buildManifest({ stampId, voice: results[0]?.voice || VOICE.name, origin: storefront.origin, backgroundSource, texts, results });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, reels: results.map((r) => r.file), origin: manifest.origin }, null, 2)}\n`);
  return manifest;
}

function buildManifest({ stampId, voice, origin, backgroundSource = "pexels", texts, results, dryRun = false }) {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    stamp: stampId,
    voice,
    origin,
    reels: results.length,
    texts,
    caption: {
      position: CAPTION.position,
      maxWordsPerFrame: CAPTION.maxWords,
      colors: [CAPTION.primaryColor, CAPTION.alternateColor],
      outline: { color: CAPTION.outlineColor, width: CAPTION.outlineWidth },
      backgroundBox: CAPTION.backgroundBox,
      cornerTags: [CORNER_TAGS.left, CORNER_TAGS.right],
      outro: BRAND.outro,
      domain: BRAND.domain,
    },
    closing: { logo: BRAND.name, tagline: BRAND.tagline, cta: BRAND.cta, animatedButton: true },
    background: { source: backgroundSource, artDirection: AESTHETIC_KEYWORDS },
    schedule: SCHEDULE,
    items: results,
    root: ROOT,
  };
}

main().catch((err) => {
  process.stderr.write(`luna-reels failed: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
