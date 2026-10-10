// The premium cut of a seller's product video (make-reel.mjs renders it).
//
// What product videographers do, done to the seller's own footage, never
// invented: five shots picked from the clip (the sharpest moment of each part
// of it), framed full-screen 9:16 around the jewelry, a slow pull-back under
// the hook, one hero shot in slow motion with a single light sweep, slow
// push-ins, a dissolve between shots and a glint (white flash) into the hero,
// a gentle grade (contrast, vignette, sharpening), and quiet type: a serif
// hook, the product's name, the "רוצה" call to action. Every frame keeps the
// labels "#פרסומת · קישור שותפים" and "צילום המוצר: המוכר".
//
// The effects are camera moves and light on the whole frame, not on the
// product: nothing makes a stone bigger or brighter than the footage shows.
// Parts of a clip that could suggest a claim (a diamond tester on moissanite)
// are excluded in SHOT_EXCLUDE.
import { execFileSync } from "node:child_process";

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const XFADE = 0.24;

/** The five shots: output seconds, playback speed, zoom from → to, the light sweep. */
export const SHOTS = Object.freeze([
  { out: 2.2, speed: 1, zoom: [1.14, 1.0] },
  { out: 2.8, speed: 0.5, zoom: [1.0, 1.1], sweep: true },
  { out: 2.0, speed: 1, zoom: [1.06, 1.14] },
  { out: 2.2, speed: 0.7, zoom: [1.12, 1.02] },
  { out: 3.0, speed: 0.8, zoom: [1.0, 1.06] },
]);

// Seconds of a seller clip never used: they could read as a claim the listing does not make.
export const SHOT_EXCLUDE = Object.freeze({
  // The seller demonstrates a diamond tester on moissanite (from 0:20). Moissanite is not diamond.
  "p-live-03": [[19.5, 1e9]],
});

// Where the product sits in a clip, when it is not the middle of the frame
// (0 = top, 1 = bottom): the push-ins zoom toward it and the crop keeps it.
export const SHOT_FRAMING = Object.freeze({
  // The seller's clip shows a model; the product is the bracelet on her wrist, low in the frame.
  "p-live-02": { cy: 0.82 },
});

export function totalSeconds(shots = SHOTS, xfade = XFADE) {
  return Number((shots.reduce((s, x) => s + x.out, 0) - xfade * (shots.length - 1)).toFixed(2));
}

/** When each shot starts in the finished reel (the dissolves overlap the shots). */
export function shotStarts(shots = SHOTS, xfade = XFADE) {
  const starts = [];
  let at = 0;
  for (const s of shots) {
    starts.push(Number(at.toFixed(3)));
    at += s.out - xfade;
  }
  return starts;
}

/** The parts of a clip that may be used: skip the first moment (often a logo) and anything excluded. */
export function usableRanges(duration, exclude = [], head = 0.6, tail = 0.3) {
  let ranges = [[head, Math.max(head, duration - tail)]];
  for (const [a, b] of exclude) {
    ranges = ranges.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(e, a)], [Math.max(s, b), e]]));
  }
  return ranges.filter(([s, e]) => e - s > 0.2);
}

/**
 * One source window per shot, in clip order: shot k takes the sharpest window
 * inside the k-th part of the usable clip. A short clip lends its whole length
 * (the shot then plays a little faster, never past normal speed ×1.25).
 * @param samples [{ t, sharp, cx }] from analyze()
 */
export function planShots(samples, duration, { exclude = [], shots = SHOTS, cy = 0.5 } = {}) {
  const ranges = usableRanges(duration, exclude);
  if (!ranges.length) return [];
  const spanStart = ranges[0][0];
  const spanEnd = ranges[ranges.length - 1][1];
  const inRange = (a, b) => ranges.some(([s, e]) => a >= s - 1e-6 && b <= e + 1e-6);
  const longest = Math.max(...ranges.map(([s, e]) => e - s));
  const mean = (a, b, key) => {
    const inside = samples.filter((x) => x.t >= a && x.t <= b);
    return inside.length ? inside.reduce((s, x) => s + x[key], 0) / inside.length : null;
  };
  const plan = [];
  shots.forEach((shot, k) => {
    let srcLen = Math.min(shot.out * shot.speed, longest);
    const speed = Math.min(1.25, srcLen / shot.out);
    srcLen = Number((shot.out * speed).toFixed(3));
    const lo = spanStart + ((spanEnd - spanStart) * k) / shots.length;
    const hi = spanStart + ((spanEnd - spanStart) * (k + 1)) / shots.length;
    const candidates = [];
    for (let t = spanStart; t + srcLen <= spanEnd + 1e-6; t = Number((t + 0.25).toFixed(3))) {
      if (inRange(t, t + srcLen)) candidates.push(t);
    }
    if (!candidates.length) return;
    const score = (t) => mean(t, t + srcLen, "sharp") ?? 0;
    // Prefer footage no earlier shot used; a short clip may have to repeat some.
    const lastEnd = plan.length ? plan[plan.length - 1].in + plan[plan.length - 1].srcLen : 0;
    const fresh = candidates.filter((t) => t >= lastEnd - 1e-6);
    const inPart = fresh.filter((t) => t >= lo - srcLen / 2 && t <= hi);
    const pool = inPart.length ? inPart : fresh.length ? fresh : candidates;
    const start = pool.reduce((best, t) => (score(t) > score(best) ? t : best), pool[0]);
    const cx = mean(start, start + srcLen, "cx");
    plan.push({ ...shot, in: Number(start.toFixed(3)), srcLen, speed: Number(speed.toFixed(3)), cx: Number((cx ?? 0.5).toFixed(3)), cy });
  });
  return plan;
}

/** Full-screen framing: the scale that covers 9:16 and the crop that keeps the jewelry (cx) in view. */
export function coverCrop(w, h, cx = 0.5, outW = W, outH = H) {
  const f = Math.max(outW / w, outH / h);
  const sw = Math.ceil((w * f) / 2) * 2;
  const sh = Math.ceil((h * f) / 2) * 2;
  const x = Math.round(Math.max(0, Math.min(sw - outW, cx * sw - outW / 2)));
  return { sw, sh, x, y: Math.round((sh - outH) / 2) };
}

/** The ffmpeg filter for one shot (speed, framing, push-in, grade). */
export function shotFilter(shot, src) {
  const [z0, z1] = shot.zoom;
  // A phone clip (4K) is scaled down first to what the frame needs, so slow motion stays fast to compute.
  const need = Math.max(W / src.w, H / src.h) * Math.max(z0, z1);
  const pre = need < 1 ? `scale=trunc(iw*${need.toFixed(4)}/2)*2:-2:flags=lanczos,` : "";
  const dims = need < 1 ? { w: Math.round(src.w * need), h: Math.round(src.h * need) } : src;
  const { sw } = coverCrop(dims.w, dims.h, shot.cx);
  const d = shot.out;
  const motion = shot.speed < 1
    ? `setpts=(PTS-STARTPTS)/${shot.speed},minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`
    : `setpts=(PTS-STARTPTS)/${shot.speed},fps=${FPS}`;
  return [
    `${pre}${motion}`,
    `scale=w='trunc(${sw}*(${z0}+(${z1 - z0})*min(t/${d},1))/2)*2':h=-2:eval=frame:flags=lanczos`,
    `crop=${W}:${H}:x='max(0,min(iw-${W},${shot.cx}*iw-${W / 2}))':y='max(0,min(ih-${H},${shot.cy ?? 0.5}*ih-${H / 2}))'`,
    "eq=contrast=1.06:saturation=1.03:brightness=0.004",
    "unsharp=5:5:0.55:5:5:0",
    "vignette=angle=PI/4.6",
    "setsar=1,format=yuv420p",
  ].join(",");
}

// The clean cut, like a jewelry videographer's reel: soft wipes and dissolves, no flash.
export const CLEAN_TRANSITIONS = Object.freeze(["smoothleft", "fade", "smoothright", "fade"]);

/** The dissolve chain: a glint (white flash) into the hero shot, soft dissolves elsewhere (or the given transitions). */
export function joinFilter(shots = SHOTS, xfade = XFADE, transitions = null) {
  const starts = shotStarts(shots, xfade);
  const parts = [];
  let last = "[0:v]";
  for (let k = 1; k < shots.length; k++) {
    const transition = transitions?.[k - 1] || (shots[k].sweep ? "fadewhite" : "fade");
    const offset = (starts[k]).toFixed(3);
    const outLabel = k === shots.length - 1 ? "[cut]" : `[x${k}]`;
    parts.push(`${last}[${k}:v]xfade=transition=${transition}:duration=${xfade}:offset=${offset}${outLabel}`);
    last = outLabel;
  }
  return parts.join(";");
}

/** Samples of the clip every half second: sharpness and where the detail is (0 = left, 1 = right). */
export function analyze(file) {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).trim().split(",").map(Number);
  const sw = 160;
  const sh = Math.max(2, Math.round((h * sw) / w / 2) * 2);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=2,scale=${sw}:${sh},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const size = sw * sh;
  const samples = [];
  for (let i = 0; (i + 1) * size <= raw.length; i++) {
    const f = raw.subarray(i * size, (i + 1) * size);
    let sharp = 0;
    let mass = 0;
    let moment = 0;
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const p = y * sw + x;
        const g = Math.abs(f[p + 1] - f[p - 1]) + Math.abs(f[p + sw] - f[p - sw]);
        sharp += g;
        const e = g * g;
        mass += e;
        moment += e * x;
      }
    }
    samples.push({ t: i / 2, sharp: sharp / size, cx: mass ? moment / mass / sw : 0.5 });
  }
  return { w, h, samples };
}

export function duration(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim()) || 0;
}
