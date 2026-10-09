/**
 * Edge-TTS audio layer — free, fluent Hebrew neural narration.
 * Voice: he-IL-AvriNeural (verified by the workflow via `--list-voices`).
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { VOICE } from "./config.mjs";

export const pythonBin = () => process.env.LUNA_PYTHON || "python";

function run(bin, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0
      ? resolve({ out, err })
      : reject(new Error(`${bin} exited ${code}: ${err.slice(-800) || out.slice(-800)}`))));
  });
}

/**
 * Synthesize Hebrew narration to `outFile` (.mp3).
 * @returns {Promise<{file:string, voice:string, bytes:number}>}
 */
export async function synthesize({ text, outFile, voice = VOICE.name, rate = VOICE.rate, pitch = VOICE.pitch, volume = VOICE.volume }) {
  if (!text || !text.trim()) throw new Error("tts_empty_text");
  await run(pythonBin(), ["-m", "edge_tts", "--version"]).catch((e) => {
    throw new Error(`edge_tts_missing — install with: python -m pip install edge-tts (${e.message})`);
  });
  await run(pythonBin(), [
    "-m", "edge_tts",
    `--voice=${voice}`,
    `--rate=${rate}`,
    `--pitch=${pitch}`,
    `--volume=${volume}`,
    `--text=${text}`,
    `--write-media=${outFile}`,
  ]);
  if (!existsSync(outFile) || statSync(outFile).size < 1024) throw new Error("tts_empty_output");
  return { file: outFile, voice, bytes: statSync(outFile).size };
}

/** Duration in milliseconds via ffprobe (throws when ffprobe/ffmpeg is absent). */
export function probeDurationMs(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ], { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      const seconds = Number.parseFloat(out.trim());
      if (code !== 0 || !Number.isFinite(seconds) || seconds <= 0) {
        reject(new Error(`ffprobe_failed: ${err.slice(-400) || out.slice(-200)}`));
        return;
      }
      resolve(Math.round(seconds * 1000));
    });
  });
}

export { run as runTool };
