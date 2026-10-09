/**
 * Rendering layer — one ffmpeg pass composes:
 *   backgrounds (9:16, looped) → burned ASS captions (lower-middle + corner
 *   tags) → minimal closing screen with an animated CTA button + Hebrew TTS.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { BRAND, CAPTION, ROOT, VIDEO } from "./config.mjs";

export function runTool(bin, args, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0
      ? resolve({ out, err })
      : reject(new Error(`${bin} exited ${code}: ${(err || out).slice(-1500)}`))));
  });
}

const hex = (value) => `0x${String(value).replace("#", "")}`;
const ffPath = (p) => String(p).split(path.sep).join("/").replace(/:/g, "\\:");
const n3 = (v) => Number(v).toFixed(3);

/** Full ffmpeg argv for a reel (backgrounds + captions + closing + audio). */
export function buildRenderArgs({
  clips, audio, assPath, out, mainSec, closingSec, cwd = ROOT,
}) {
  if (!Array.isArray(clips) || !clips.length) throw new Error("render_no_clips");
  const { w, h, fps } = VIDEO;
  const perClip = mainSec / clips.length;
  const inputs = [];
  const filters = [];

  clips.forEach((clip, i) => {
    inputs.push("-stream_loop", "-1", "-t", n3(perClip), "-i", String(clip));
    filters.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1,trim=duration=${n3(perClip)},setpts=PTS-STARTPTS[v${i}]`);
  });

  const colorIdx = clips.length;
  inputs.push("-f", "lavfi", "-t", n3(closingSec), "-i", `color=c=${hex(BRAND.bg)}:s=${w}x${h}:r=${fps}`);
  filters.push(`[${colorIdx}:v]format=yuv420p,trim=duration=${n3(closingSec)},setpts=PTS-STARTPTS[close]`);

  const audioIdx = colorIdx + 1;
  inputs.push("-i", String(audio));
  const silenceIdx = audioIdx + 1;
  inputs.push("-f", "lavfi", "-t", n3(closingSec), "-i", "anullsrc=r=44100:cl=stereo");

  filters.push(`${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[main]`);
  filters.push(`[main][close]concat=n=2:v=1:a=0[cat]`);

  const relAss = ffPath(path.relative(cwd, assPath));
  const fontsDir = path.dirname(CAPTION.fontFile);
  const fontsArg = existsSync(fontsDir) ? `:fontsdir='${ffPath(fontsDir)}'` : "";
  filters.push(`[cat]subtitles='${relAss}'${fontsArg}[sub]`);

  // Animated CTA button: grows in, then breathes (pure geometry — text is ASS).
  const S = n3(mainSec);
  const S0 = n3(mainSec + 0.35);
  filters.push(`[sub]drawbox=x=(iw-360)/2:y=876:w='if(lt(t,${S0}),max(4,360*(t-${S})/0.35),360+14*sin(2*PI*(t-${S})*2.2))':h=112:color=${hex(BRAND.accent)}@0.95:t=fill:enable='gte(t,${S0})'[vout]`);

  filters.push(`[${audioIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end=${n3(mainSec)},asetpts=PTS-STARTPTS[a0]`);
  filters.push(`[${silenceIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end=${n3(closingSec)},asetpts=PTS-STARTPTS[a1]`);
  filters.push(`[a0][a1]concat=n=2:v=0:a=1[aout]`);

  return [
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", VIDEO.preset, "-crf", String(VIDEO.crf),
    "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
    "-shortest", "-movflags", "+faststart",
    String(out),
  ];
}

/** Render the reel; returns the absolute output path. */
export async function renderReel(opts) {
  const out = opts.out;
  mkdirSync(path.dirname(out), { recursive: true });
  await runTool("ffmpeg", buildRenderArgs({ ...opts, cwd: opts.cwd || ROOT }));
  if (!existsSync(out)) throw new Error("render_missing_output");
  return out;
}

/** Offline fallback background (no Pexels key): slow luxury gradient loop. */
export async function makeFallbackClip({ out, seconds = 6 }) {
  mkdirSync(path.dirname(out), { recursive: true });
  const gradient = [
    "-y", "-f", "lavfi", "-t", n3(seconds),
    "-i", `gradients=s=${VIDEO.w}x${VIDEO.h}:c0=${hex("#211C16")}:c1=${hex("#B78F4F")}:speed=0.03`,
    "-r", String(VIDEO.fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    String(out),
  ];
  try {
    await runTool("ffmpeg", gradient);
  } catch {
    await runTool("ffmpeg", [
      "-y", "-f", "lavfi", "-t", n3(seconds),
      "-i", `color=c=${hex("#211C16")}:s=${VIDEO.w}x${VIDEO.h}:r=${VIDEO.fps}`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      String(out),
    ]);
  }
  return out;
}
