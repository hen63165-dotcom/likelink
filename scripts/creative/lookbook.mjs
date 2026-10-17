// The lookbook template of the Creative Engine (src/lib/creative/engine.js):
// a 9:16 reel made only of the product's own media, like an editorial
// jewelry reel. The seller's model photos sit framed on an ivory page with a
// slow camera move (zoompan on a 4× oversampled still, so the motion is
// smooth), the seller's own clip (when a person checked it) plays full screen
// in between in the premium cut's grade (premium.mjs), soft dissolves join
// them, a serif opening line comes first and the product's name closes.
// "#פרסומת · קישור שותפים" and whose media it is stay on every frame.
// Hebrew type is drawn by Chromium (RTL shaping), composed by ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FPS, H, SHOT_EXCLUDE, SHOT_FRAMING, W, analyze, duration, planShots, shotFilter } from "../media/product-video/premium.mjs";
import { fontFaces } from "../media/product-video/make-reel.mjs";

export const IVORY = "0xF4EFE8";
export const PHOTO = 1080; // the framed photo: 1080×1080
export const PHOTO_Y = 400;
export const XF = 0.45;

/** The segments in order: photos framed, the seller's clip full screen, the end card. */
export function segments(photos, withVideo) {
  const p = (i) => photos[i % photos.length];
  return withVideo
    ? [
        { kind: "photo", photo: p(0), seconds: 2.8, zoom: [1.0, 1.07], text: "opening" },
        { kind: "video", shot: 0, seconds: 2.4 },
        { kind: "photo", photo: p(1), seconds: 2.4, zoom: [1.08, 1.0] },
        { kind: "video", shot: 1, seconds: 2.4 },
        { kind: "photo", photo: p(2), seconds: 2.4, zoom: [1.0, 1.06] },
        { kind: "photo", photo: p(photos.length > 3 ? 3 : 0), seconds: 3.0, zoom: [1.06, 1.0], text: "end" },
      ]
    : [
        { kind: "photo", photo: p(0), seconds: 2.8, zoom: [1.0, 1.07], text: "opening" },
        { kind: "photo", photo: p(1), seconds: 2.4, zoom: [1.08, 1.0] },
        { kind: "photo", photo: p(2), seconds: 2.4, zoom: [1.0, 1.06] },
        { kind: "photo", photo: p(photos.length > 3 ? 3 : 1), seconds: 2.4, zoom: [1.07, 1.0] },
        { kind: "photo", photo: p(0), seconds: 3.0, zoom: [1.0, 1.05], text: "end" },
      ];
}

export function totalSeconds(segs, xf = XF) {
  return Number((segs.reduce((s, x) => s + x.seconds, 0) - xf * (segs.length - 1)).toFixed(2));
}

/** The seller clip's two shots: a slow-motion close-up and a steadier one. */
export const VIDEO_SHOTS = Object.freeze([
  { out: 2.4, speed: 0.6, zoom: [1.0, 1.08] },
  { out: 2.4, speed: 0.8, zoom: [1.08, 1.0] },
]);

/** The zoompan filter for one framed photo (the 4× oversample keeps the move smooth). */
export function photoFilter(seg) {
  const n = Math.round(seg.seconds * FPS);
  const [z0, z1] = seg.zoom;
  const big = PHOTO * 4;
  return [
    `scale=${big}:${big}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${big}:${big}`,
    `zoompan=z='${z0}+(${(z1 - z0).toFixed(4)})*on/${n - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${PHOTO}x${PHOTO}:fps=${FPS}`,
    "eq=contrast=1.04:saturation=1.02",
    "unsharp=5:5:0.35:5:5:0",
    "setsar=1",
  ].join(",");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CSS = `
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;direction:rtl;font-family:"Heebo","Noto Sans Hebrew",sans-serif}
.serif{font-family:"Frank Ruhl Libre","Noto Serif Hebrew","Heebo",serif}
.labels{position:absolute;top:48px;right:44px;left:44px;display:flex;gap:12px}
.labels span{background:rgba(20,18,16,.62);color:#fff;font-size:25px;font-weight:500;padding:8px 18px;border-radius:999px}
.open{position:absolute;top:150px;right:80px;left:80px;height:${PHOTO_Y - 170}px;display:flex;align-items:center;justify-content:center;text-align:center;color:#1b1a17;font-size:76px;font-weight:500;line-height:1.16}
.end{position:absolute;top:${PHOTO_Y + PHOTO + 40}px;right:80px;left:80px;text-align:center;color:#1b1a17}
.end i{display:block;width:84px;height:2px;margin:0 auto 26px;background:#b8955a}
.end b{display:block;font-size:50px;font-weight:500;line-height:1.3}
.end span{display:block;margin-top:22px;font-size:32px;font-weight:500;color:#4a4540}
.end small{display:block;margin-top:14px;font-size:26px;color:#7a736b}
`;

/** The overlay pages: the labels (every frame), the opening line, the end card. */
export function overlayHtml(script) {
  return {
    labels: `<div class="labels">${script.labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`,
    opening: `<div class="open serif">${esc(script.opening.text)}</div>`,
    end: `<div class="end"><i></i><b class="serif">${esc(script.name)}</b><span>${esc(script.end.line)}</span><small>${esc(script.end.sub)}</small></div>`,
  };
}

/** Draw the overlays as transparent 1080×1920 PNGs with the runner's Chromium. */
export async function drawOverlays(page, script, dir, name) {
  const faces = fontFaces();
  const out = {};
  for (const [part, html] of Object.entries(overlayHtml(script))) {
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${faces}${CSS}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    out[part] = join(dir, `${name}-${part}.png`);
    await page.screenshot({ path: out[part], omitBackground: true });
  }
  return out;
}

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });

/** One framed photo segment: ivory page, the moving photo, its text fading in. */
function renderPhoto(seg, file, text) {
  const d = seg.seconds.toFixed(2);
  const inputs = ["-f", "lavfi", "-i", `color=c=${IVORY}:s=${W}x${H}:r=${FPS}:d=${d}`, "-i", seg.photo];
  let filter = `[1:v]${photoFilter(seg)}[ph];[0:v][ph]overlay=0:${PHOTO_Y}:shortest=1[base]`;
  if (text) {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", d, "-i", text);
    filter += `;[2:v]format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1[tx];[base][tx]overlay=0:0[v]`;
  } else filter += ";[base]null[v]";
  ff([...inputs, "-filter_complex", filter, "-map", "[v]", "-t", d, "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", file]);
}

/** One full-screen shot of the seller's clip, picked and graded like the premium cut. */
function renderVideoShots(src, productId, work) {
  const info = analyze(src);
  const plan = planShots(info.samples, duration(src), { exclude: SHOT_EXCLUDE[productId] || [], shots: VIDEO_SHOTS, cy: SHOT_FRAMING[productId]?.cy ?? 0.5 });
  if (plan.length !== VIDEO_SHOTS.length) throw new Error("render: not enough usable seller footage");
  return plan.map((shot, k) => {
    const file = join(work, `${productId}-vshot${k}.mp4`);
    ff(["-ss", String(shot.in), "-t", String(shot.srcLen), "-i", src, "-vf", shotFilter(shot, info), "-t", String(shot.out), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", file]);
    return file;
  });
}

/**
 * Render the lookbook: segments → dissolves → labels on every frame → silent
 * AAC 48 kHz (Instagram's Reels API needs an audio track; the trending sound
 * is added in the app) → H.264 1080×1920, faststart.
 * @param photos local image files, in plan order (worn first)
 * @param video local seller clip or ""
 */
export async function renderLookbook({ page, plan, photos, video = "", work, out }) {
  const withVideo = Boolean(video && existsSync(video));
  const segs = segments(photos, withVideo);
  const png = await drawOverlays(page, plan.script, work, plan.asset);
  const shots = withVideo ? renderVideoShots(video, plan.productId, work) : [];
  const files = segs.map((seg, k) => {
    const file = join(work, `${plan.asset}-seg${k}.mp4`);
    if (seg.kind === "video") return shots[seg.shot];
    renderPhoto(seg, file, seg.text ? png[seg.text] : "");
    return file;
  });
  // The dissolve chain (every input on one timebase and frame rate first, or xfade refuses).
  const parts = files.map((_, k) => `[${k}:v]settb=AVTB,fps=${FPS},format=yuv420p,setsar=1[n${k}]`);
  let last = "[n0]";
  let at = 0;
  for (let k = 1; k < segs.length; k++) {
    at += segs[k - 1].seconds - XF;
    const label = k === segs.length - 1 ? "[cut]" : `[x${k}]`;
    parts.push(`${last}[n${k}]xfade=transition=fade:duration=${XF}:offset=${at.toFixed(3)}${label}`);
    last = label;
  }
  const total = totalSeconds(segs);
  const n = files.length;
  const filter = `${parts.join(";")};[cut][${n + 1}:v]overlay=0:0,format=yuv420p[v]`;
  const mp4 = join(out, `${plan.asset}.mp4`);
  ff([
    ...files.flatMap((f) => ["-i", f]),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-loop", "1", "-framerate", String(FPS), "-i", png.labels,
    "-filter_complex", filter, "-map", "[v]", "-map", `${n}:a`,
    "-t", String(total), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", mp4,
  ]);
  // A contact sheet (six moments) for a person to review without playing it.
  const at6 = [1.2, total * 0.25, total * 0.42, total * 0.58, total * 0.75, total - 0.6].map((t) => t.toFixed(2));
  ff([...at6.flatMap((t) => ["-ss", t, "-i", mp4]), "-filter_complex", `${at6.map((_, i) => `[${i}:v]scale=300:-2[s${i}]`).join(";")};${at6.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${at6.length}`, "-frames:v", "1", "-q:v", "4", join(out, `${plan.asset}-preview.jpg`)]);
  writeFileSync(join(out, `${plan.asset}.txt`), `${plan.caption}\n`);
  return { mp4, seconds: total, segments: segs.map((s) => s.kind), withVideo };
}
