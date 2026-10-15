// Cuts the storefront's clean product images (src/lib/looks.js) from the
// sellers' videos in the `reels` release: one frame per product at the time
// and crop in LOOKS, 900×1125 JPEG → public/looks/<productId>.jpg.
// Read-only on the release; nothing is posted.
//   node scripts/media/look-frames.mjs            (needs ffmpeg)
// Commit the changed files in public/looks/ afterwards.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LOOKS, lookFile } from "../../src/lib/looks.js";

const RELEASE = "https://github.com/hen63165-dotcom/likelink/releases/download/reels";

/** ffmpeg arguments for one frame: seek, crop, scale to 900×1125 (a light unsharp when the spec asks). */
export function frameArgs({ at, crop, sharpen = false }, input, output) {
  const vf = `crop=${crop},scale=900:1125:flags=lanczos${sharpen ? ",unsharp=5:5:0.6" : ""}`;
  return ["-v", "error", "-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-vf", vf, "-q:v", "3", output];
}

/** Every frame to cut: [productId, spec, output file name]. */
export function plan() {
  return Object.entries(LOOKS).map(([id, spec]) => [id, spec, lookFile(id)]);
}

export async function cutLooks({ out = "public/looks", fetchImpl = fetch } = {}) {
  mkdirSync(out, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "looks-"));
  const videos = new Map();
  try {
    for (const [id, spec, file] of plan()) {
      if (!videos.has(id)) {
        const res = await fetchImpl(`${RELEASE}/${id}.mp4`);
        if (!res.ok) throw new Error(`${id}.mp4: HTTP ${res.status}`);
        const path = join(tmp, `${id}.mp4`);
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        videos.set(id, path);
      }
      const r = spawnSync("ffmpeg", frameArgs(spec, videos.get(id), join(out, file)), { timeout: 60_000 });
      if (r.status !== 0) throw new Error(`${file}: ffmpeg failed (${String(r.stderr || "").slice(0, 200)})`);
      console.log(`look-frames: ${file}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cutLooks();
}
