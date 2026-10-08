#!/usr/bin/env node
// Talking-object tip reel (series F) → MP4 (H.264 720x1280 30fps + AAC 48 kHz).
//   node scripts/media/tips/render-tip.mjs --spec scripts/media/tips/specs/<id>.json
//        [--voice voice.m4a | --voice-lines samples/<id>-lines.json --variant lively]
//        [--out DIR] [--fonts node_modules/@fontsource/heebo/files]
// The character is an original AI image (scripts/media/ai-image/generate.py);
// every line says only what is true / what the site does today. Without a
// voice track the reel carries LikeLink's own beat (generated from math).
// Preview frames (hook, middle, end) are written next to the MP4 for review.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const specPath = path.resolve(arg("spec"));
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const OUT = path.resolve(arg("out", path.join(ROOT, "public", "content", "tips")));
const FONTS = path.resolve(arg("fonts", path.join(ROOT, "node_modules", "@fontsource", "heebo", "files")));
const VOICE = arg("voice", null);
mkdirSync(OUT, { recursive: true });

// --voice-lines <lines.json from scripts/media/voice/speak.py> [--variant id]:
// one clip per sentence (hook, each line, end card). The voice sets the pace:
// every caption stays up exactly as long as its sentence, and the character
// "talks" only while the voice plays.
const VOICE_LINES = arg("voice-lines", null);
let voiceClips = null;
if (VOICE_LINES) {
  const report = JSON.parse(readFileSync(VOICE_LINES, "utf8"));
  const want = arg("variant", null);
  const v = want ? report.variants.find((x) => x.id === want) : report.variants[0];
  if (!v) throw new Error(`variant ${want} is not in ${VOICE_LINES}`);
  if (v.clips.length !== spec.lines.length + 2) throw new Error(`need ${spec.lines.length + 2} clips (hook, lines, end), got ${v.clips.length}`);
  const dir = path.dirname(path.resolve(VOICE_LINES));
  const LEAD = 0.1, TAIL = 0.3;
  const fit = (s, min) => Math.max(min, Number((LEAD + s + TAIL).toFixed(2)));
  spec.hookDur = fit(v.clips[0].seconds, 1.4);
  spec.hookVoice = LEAD + v.clips[0].seconds;
  spec.lines.forEach((l, i) => { const c = v.clips[i + 1]; l.dur = fit(c.seconds, 1.2); l.voice = LEAD + c.seconds; });
  spec.end.dur = fit(v.clips[v.clips.length - 1].seconds, spec.end.dur);
  const starts = [LEAD];
  let t = spec.hookDur;
  for (const l of spec.lines) { starts.push(t + LEAD); t += l.dur; }
  starts.push(t + LEAD);
  voiceClips = v.clips.map((c, i) => ({ file: path.join(dir, c.file), at: starts[i] }));
}

const dataUrl = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", woff2: "font/woff2" }[ext] || "application/octet-stream";
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
};
const font = (w) => dataUrl(path.join(FONTS, `heebo-hebrew-${w}-normal.woff2`));

// LikeLink's own beat (original, generated from math, no third-party music).
const OWN_BEAT = (() => {
  const kick = "0.85*sin(2*PI*52*t*(1+1.6*exp(-28*mod(t,0.5))))*exp(-8*mod(t,0.5))";
  const hat = "0.10*(2*random(0)-1)*exp(-70*mod(t+0.25,0.5))";
  const pad = "0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.25*t))";
  const e = `0.55*(${kick}+${hat}+${pad})`.replace(/,/g, "\\,");
  return `aevalsrc=exprs=${e}|${e}:s=48000`;
})();

function run(cmd, argv, feed) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ["pipe", "inherit", "inherit"] });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
    if (feed) feed(p.stdin); else p.stdin.end();
  });
}

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
await page.goto(pathToFileURL(path.join(HERE, "tip.html")).href);
const total = await page.evaluate(([s, a]) => window.load(s, a), [spec, {
  character: dataUrl(path.resolve(ROOT, spec.character)),
  endImage: dataUrl(path.resolve(ROOT, spec.endImage)),
  font400: font(400), font800: font(800), font900: font(900),
}]);

const fps = 30;
const frames = Math.round(total * fps);
const mp4 = path.join(OUT, `${spec.id}.mp4`);
const hasVoice = Boolean(voiceClips) || Boolean(VOICE && existsSync(VOICE));
const lineAudio = () => {
  const n = voiceClips.length;
  const placed = voiceClips.map((c, i) => `[${i + 1}:a]aresample=48000,adelay=delays=${Math.round(c.at * 1000)}:all=1[v${i}]`);
  const voices = voiceClips.map((_, i) => `[v${i}]`).join("");
  return [
    ...voiceClips.flatMap((c) => ["-i", c.file]),
    "-f", "lavfi", "-t", String(total), "-i", OWN_BEAT,
    "-filter_complex", [
      ...placed,
      `${voices}amix=inputs=${n}:duration=longest:normalize=0,loudnorm=I=-15:TP=-1.5,aresample=48000[vo]`,
      `[${n + 1}:a]volume=0.16[b]`,
      "[vo][b]amix=inputs=2:duration=longest:normalize=0[a]",
    ].join(";"),
    "-map", "0:v", "-map", "[a]",
  ];
};
const audioArgs = voiceClips ? lineAudio()
  : hasVoice
    ? ["-i", VOICE, "-f", "lavfi", "-t", String(total), "-i", OWN_BEAT,
       "-filter_complex", "[2:a]volume=0.18[b];[1:a][b]amix=inputs=2:duration=longest:normalize=0[a]", "-map", "0:v", "-map", "[a]"]
    : ["-f", "lavfi", "-t", String(total), "-i", OWN_BEAT, "-map", "0:v", "-map", "1:a"];
const previewAt = { hook: 0.9, middle: spec.hookDur + 3.2, end: total - 0.8 };

await run("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  ...audioArgs,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-r", String(fps),
  "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", String(total), "-movflags", "+faststart", mp4,
], async (stdin) => {
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    await page.evaluate((x) => window.renderAt(x), t);
    const jpg = await page.screenshot({ type: "jpeg", quality: 90 });
    for (const [name, at] of Object.entries(previewAt)) {
      if (Math.abs(t - at) < 0.5 / fps) await page.screenshot({ path: path.join(OUT, `${spec.id}-${name}.jpg`), type: "jpeg", quality: 85 });
    }
    if (!stdin.write(jpg)) await new Promise((r) => stdin.once("drain", r));
  }
  stdin.end();
});
await browser.close();
console.log(JSON.stringify({ ok: true, id: spec.id, mp4, seconds: total, frames, voice: hasVoice }));
