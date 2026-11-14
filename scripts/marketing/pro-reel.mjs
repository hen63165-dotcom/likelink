// The "pro" reel for Instagram: what the owner's best post did (a real ring
// close-up, 1,079 views) in one uniform look for every product, instead of
// cartoons, dark text slides, site screenshots and photos framed on a page.
//
// - The store's own photos, full screen 9:16, a new picture every 1.25 s,
//   each with a slow push-in or pull-back (2× oversampled, so it is smooth).
// - One caption style for every reel and every line: black words on a white
//   rounded box, in the upper third, where the grid's 3:4 crop keeps it, so
//   the cover shows the hook and the product.
// - Three lines: the hook (0–2.5 s), what it is, a tip. Then the end card:
//   the name and "תגיבי 'אני'" (the AutoDM sends the link).
// - "#פרסומת · קישור שותפים" and "תמונות: המוכר" on every frame.
// - A music bed made here from numbers (luna_reels/music.py, no licence to
//   clear) and a soft whoosh on every cut. Instagram's Reels API needs audio.
// Every line passes the site's claim rules (HOOK_FORBIDDEN, DROP_FORBIDDEN,
// no brand names) or the reel is refused. Nothing is posted from here.
//
//   node scripts/marketing/pro-reel.mjs scripts/marketing/pro-reels/jobs.json out/
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HOOK_FORBIDDEN } from "../../src/lib/growth/likeloop.js";
import { DROP_FORBIDDEN } from "../../src/lib/growth/dailyDrop.js";
import { hasBrandName } from "../../src/lib/growth/deals.js";

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const SHOT = 1.25;
export const SHOTS = 6;
export const END = 2.5;
export const TOTAL = SHOT * SHOTS + END;

/** Which line shows when: the hook on shots 1–2, the "what" on 3–4, the tip on 5–6. */
export function timeline() {
  return [
    { part: "hook", from: 0, to: SHOT * 2 },
    { part: "what", from: SHOT * 2, to: SHOT * 4 },
    { part: "tip", from: SHOT * 4, to: SHOT * 6 },
    { part: "end", from: SHOT * 6, to: TOTAL },
  ];
}

/** A line is burned into the video only if it passes the site's claim rules. */
export function lineProblems(job) {
  const lines = [job.hook, job.what, job.tip, job.name, job.cta || ""].filter(Boolean);
  const out = [];
  for (const s of lines) {
    if (HOOK_FORBIDDEN.test(s)) out.push(`claim rule (hook): ${s}`);
    if (DROP_FORBIDDEN.test(s)) out.push(`claim rule (drop): ${s}`);
    if (hasBrandName(s)) out.push(`brand name: ${s}`);
  }
  if (!job.hook || job.hook.trim().split(/\s+/).length > 8) out.push("the hook needs 1–8 words");
  return out;
}

/** The photo order for the shots: the chosen gallery indexes (1-based), else the gallery in order. */
export function shotPhotos(images, pick) {
  const list = Array.isArray(pick) && pick.length ? pick.map((i) => images[i - 1]).filter(Boolean) : images.slice(0, SHOTS);
  if (!list.length) return [];
  return Array.from({ length: SHOTS }, (_, k) => list[k % list.length]);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// A line may carry its own break ("\n"), where the words read best.
const escBr = (s) => esc(s).replace(/\n/g, "<br>");

function fontFaces(dir = process.env.FONTSOURCE_DIR || "/tmp/pw/node_modules/@fontsource") {
  const faces = [];
  for (const wt of [500, 700, 800, 900]) {
    const file = join(dir, "heebo", "files", `heebo-hebrew-${wt}-normal.woff2`);
    if (existsSync(file)) faces.push(`@font-face{font-family:"Heebo";font-weight:${wt};src:url(data:font/woff2;base64,${readFileSync(file).toString("base64")}) format("woff2")}`);
  }
  return faces.join("\n");
}

const CSS = `
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;direction:rtl;font-family:"Heebo","Noto Sans Hebrew",sans-serif}
.labels{position:absolute;top:56px;right:48px;left:48px;display:flex;gap:12px}
.labels span{background:rgba(0,0,0,.55);color:#fff;font-size:26px;font-weight:500;padding:8px 18px;border-radius:999px}
.cap{position:absolute;top:300px;right:70px;left:70px;display:flex;justify-content:center}
.cap b{display:inline-block;background:#fff;color:#0b0b0c;font-weight:900;text-align:center;border-radius:28px;padding:22px 34px;box-shadow:0 10px 40px rgba(0,0,0,.28);line-height:1.18;text-wrap:balance}
.hook b{font-size:80px}
.small b{font-size:60px;font-weight:800}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;padding:0 80px;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.62) 45%,rgba(0,0,0,.7))}
.end h1{font-size:84px;font-weight:900;line-height:1.12;text-shadow:0 4px 24px rgba(0,0,0,.4)}
.end p{margin-top:26px;font-size:46px;font-weight:700}
.end .cta{margin-top:40px;background:#fff;color:#0b0b0c;font-size:58px;font-weight:900;padding:22px 44px;border-radius:999px}
.end small{margin-top:30px;font-size:34px;font-weight:500;opacity:.9}
`;

export function overlayHtml(job) {
  return {
    labels: `<div class="labels"><span>#פרסומת · קישור שותפים</span><span>${esc(job.credit || "תמונות: המוכר")}</span></div>`,
    hook: `<div class="cap hook"><b>${escBr(job.hook)}</b></div>`,
    what: `<div class="cap small"><b>${escBr(job.what)}</b></div>`,
    tip: `<div class="cap small"><b>${escBr(job.tip)}</b></div>`,
    end: `<div class="end"><h1>${escBr(job.name)}</h1><p>רוצה את הקישור?</p><div class="cta">${esc(job.cta || "תגיבי 'אני'")}</div><small>ואשלח לך בהודעה פרטית</small></div>`,
  };
}

async function drawOverlays(page, job, dir) {
  const faces = fontFaces();
  const out = {};
  for (const [part, html] of Object.entries(overlayHtml(job))) {
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${faces}${CSS}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    out[part] = join(dir, `${job.id}-${part}.png`);
    await page.screenshot({ path: out[part], omitBackground: true });
  }
  return out;
}

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });

/** One full-screen shot: the photo covers 9:16 around its focus, with a slow move. */
export function shotFilter({ seconds, zoom, cx = 0.5, cy = 0.5 }) {
  const n = Math.round(seconds * FPS);
  const [z0, z1] = zoom;
  const bw = W * 2;
  const bh = H * 2;
  return [
    `scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${bw}:${bh}:(iw-${bw})*${cx}:(ih-${bh})*${cy}`,
    `zoompan=z='${z0}+(${(z1 - z0).toFixed(4)})*on/${n - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS}`,
    "eq=contrast=1.05:saturation=1.04:brightness=0.01",
    "unsharp=5:5:0.4:5:5:0",
    "setsar=1",
  ].join(",");
}

/**
 * A wide product (a pair of hoops, a bag from the side) would lose its ends in a
 * 9:16 crop: the whole photo moves across the full width, over a blurred,
 * darker copy of itself that fills the screen.
 */
export function fitFilter({ seconds, zoom }) {
  const n = Math.round(seconds * FPS);
  const [z0, z1] = zoom;
  const s2 = W * 2;
  return [
    `[0:v]split[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12:saturation=0.9[bg]`,
    `[b]scale=${s2}:${s2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${s2}:${s2},zoompan=z='${z0}+(${(z1 - z0).toFixed(4)})*on/${n - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${W}:fps=${FPS},eq=contrast=1.05:saturation=1.04,unsharp=5:5:0.4:5:5:0[fg]`,
    `[bg][fg]overlay=0:${Math.round((H - W) / 2) + 80}:shortest=1,setsar=1[v]`,
  ].join(";");
}

async function fetchTo(url, file) {
  if (!/^https:\/\//.test(url)) { writeFileSync(file, readFileSync(url)); return file; }
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 LikeLink2 reel renderer" } });
  if (!r.ok) throw new Error(`photo ${r.status}: ${url}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

/** All the store's photos, numbered, so a person picks the order by eye. */
function gallerySheet(files, out) {
  const n = files.length;
  const cells = files.map((_, i) => `[${i}:v]scale=360:360:force_original_aspect_ratio=decrease,pad=360:400:(ow-iw)/2:0:white,drawtext=text='${i + 1}':x=10:y=362:fontsize=32:fontcolor=black[c${i}]`);
  const cols = Math.min(n, 6);
  const layout = files.map((_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 400}`).join("|");
  ff([...files.flatMap((f) => ["-i", f]), "-filter_complex", `${cells.join(";")};${files.map((_, i) => `[c${i}]`).join("")}xstack=inputs=${n}:layout=${layout}:fill=white`, "-frames:v", "1", "-q:v", "4", out]);
}

function music(seconds, dir) {
  const bed = join(dir, "bed.m4a");
  const whoosh = join(dir, "whoosh.m4a");
  const py = `import sys; sys.path.insert(0, "scripts/luna_reels"); from pathlib import Path; from luna_reels.music import write_bed, write_whoosh; write_bed(${seconds}, Path("${bed}"), db=-14.0); write_whoosh(Path("${whoosh}"))`;
  execFileSync("python3", ["-c", py], { stdio: ["ignore", "ignore", "inherit"] });
  return { bed, whoosh };
}

export async function renderReel({ page, job, product, work, out }) {
  const problems = lineProblems(job);
  if (problems.length) throw new Error(`${job.id}: ${problems.join("; ")}`);
  const images = (product.images || []).filter((u) => /^https:\/\//.test(u) || (process.env.PRO_REEL_LOCAL === "1" && existsSync(u)));
  if (!images.length) throw new Error(`${job.id}: no store photos`);
  const local = [];
  for (let i = 0; i < images.length; i++) local.push(await fetchTo(images[i], join(work, `${job.id}-g${i + 1}.jpg`)));
  gallerySheet(local, join(out, `${job.id}-gallery.jpg`));
  // crop: per photo number [x, y, w, h] (fractions of the photo), chosen by eye to leave out the store's
  // printed text and marks; the shot then covers or fits the cropped part.
  // A crop may also make a new photo number from another photo ({ "from": 1, "box": [...] }), so one
  // clean photo can give several shots when the others carry a mark.
  const originals = [...local];
  for (const [num, spec] of Object.entries(job.crop || {})) {
    const i = Number(num) - 1;
    const from = Array.isArray(spec) ? i : Number(spec?.from) - 1;
    const box = Array.isArray(spec) ? spec : spec?.box;
    if (!originals[from] || !Array.isArray(box) || box.length !== 4 || box.some((v) => !(v >= 0 && v <= 1))) throw new Error(`${job.id}: bad crop for photo ${num}`);
    const [x, y, w, h] = box;
    const cropped = join(work, `${job.id}-g${num}c.jpg`);
    ff(["-i", originals[from], "-vf", `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y}`, "-q:v", "2", cropped]);
    local[i] = cropped;
  }
  const photos = shotPhotos(local, job.photos);
  const focus = job.focus || {};
  const png = await drawOverlays(page, job, work);
  const segs = [];
  for (let k = 0; k < SHOTS; k++) {
    const file = join(work, `${job.id}-s${k}.mp4`);
    const idx = (job.photos && job.photos[k % job.photos.length]) || (k % images.length) + 1;
    const f = focus[idx] || {};
    const zoom = k % 2 ? [1.12, 1.0] : [1.0, 1.12];
    const vf = (job.fit || []).includes(idx)
      ? ["-filter_complex", fitFilter({ seconds: SHOT, zoom }), "-map", "[v]"]
      : ["-vf", shotFilter({ seconds: SHOT, zoom, cx: f.cx ?? 0.5, cy: f.cy ?? 0.5 })];
    ff(["-loop", "1", "-framerate", String(FPS), "-t", String(SHOT), "-i", photos[k], ...vf, "-t", String(SHOT), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", file]);
    segs.push(file);
  }
  // The end card: the first chosen photo, held, under the dark card.
  const endFile = join(work, `${job.id}-end.mp4`);
  ff(["-loop", "1", "-framerate", String(FPS), "-t", String(END), "-i", photos[0], "-vf", shotFilter({ seconds: END, zoom: [1.06, 1.0] }), "-t", String(END), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", endFile]);
  segs.push(endFile);
  const { bed, whoosh } = music(TOTAL, work);
  const n = segs.length;
  const concat = `${segs.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS},format=yuv420p,setsar=1[v${i}]`).join(";")};${segs.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[cut]`;
  const parts = ["labels", ...timeline().map((t) => t.part)];
  const pIdx = (part) => n + 2 + parts.indexOf(part);
  let chain = `${concat};[cut][${pIdx("labels")}:v]overlay=0:0[l0]`;
  let last = "[l0]";
  timeline().forEach((t, i) => {
    const lab = `[t${i}]`;
    const fade = t.part === "end" ? `,fade=t=in:st=${t.from}:d=0.3:alpha=1` : "";
    chain += `;[${pIdx(t.part)}:v]format=rgba${fade}[o${i}];${last}[o${i}]overlay=0:0:enable='between(t,${t.from},${t.to - 0.001})'${lab}`;
    last = lab;
  });
  // Audio: the bed, a whoosh on every cut (each delayed to its cut).
  const cuts = Array.from({ length: SHOTS }, (_, k) => Number(((k + 1) * SHOT - 0.15).toFixed(3)));
  const wIn = n + 1;
  const aParts = cuts.map((c, i) => `[${wIn}:a]adelay=${Math.round(c * 1000)}|${Math.round(c * 1000)}[w${i}]`);
  const audio = `${aParts.join(";")};[${n}:a]${cuts.map((_, i) => `[w${i}]`).join("")}amix=inputs=${cuts.length + 1}:normalize=0,atrim=0:${TOTAL},afade=t=out:st=${TOTAL - 0.8}:d=0.8,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  const mp4 = join(out, `${job.id}.mp4`);
  ff([
    ...segs.flatMap((f) => ["-i", f]),
    "-i", bed, "-i", whoosh,
    ...parts.flatMap((p) => ["-loop", "1", "-framerate", String(FPS), "-t", String(TOTAL), "-i", png[p]]),
    "-filter_complex", `${chain};${last}format=yuv420p[v];${audio}`,
    "-map", "[v]", "-map", "[a]", "-t", String(TOTAL), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", mp4,
  ]);
  const at = [0.6, 1.9, 3.1, 4.4, 5.6, 6.9, 8.8];
  ff([...at.flatMap((t) => ["-ss", String(t), "-i", mp4]), "-filter_complex", `${at.map((_, i) => `[${i}:v]scale=270:-2[s${i}]`).join(";")};${at.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${at.length}`, "-frames:v", "1", "-q:v", "4", join(out, `${job.id}-preview.jpg`)]);
  // The grid cover: what the profile shows (the 3:4 middle of the first frame).
  ff(["-ss", "0.6", "-i", mp4, "-vf", `crop=${W}:${Math.round(W * 4 / 3)}:0:${Math.round((H - W * 4 / 3) / 2)},scale=540:-2`, "-frames:v", "1", "-q:v", "3", join(out, `${job.id}-cover.jpg`)]);
  return { mp4, seconds: TOTAL };
}

/** The catalog copy's products by id (the snapshot the site ships). */
export function catalogProducts(file = "public/snapshot/kv.json") {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const raw = doc.keys?.["marketplace:products"];
  const list = typeof raw === "string" ? JSON.parse(raw) : raw || [];
  return new Map(list.map((p) => [String(p.id), p]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [jobsFile = "scripts/marketing/pro-reels/jobs.json", out = "pro-reels-out"] = process.argv.slice(2);
  const jobs = JSON.parse(readFileSync(jobsFile, "utf8")).jobs || [];
  const products = catalogProducts();
  // A product the owner added in the Studio is only in the live catalog (the browser's own anon read);
  // the copy's records win for their ids, and a failed read keeps the copy alone.
  if (process.env.PRO_REELS_LIVE !== "0" && jobs.some((j) => !products.has(String(j.id)))) {
    const { loadLiveKeys } = await import("../catalog/live-catalog.mjs");
    const live = await loadLiveKeys();
    for (const p of live.ok ? live.keys["marketplace:products"] : []) if (p?.id && !products.has(String(p.id))) products.set(String(p.id), p);
    if (!live.ok) console.error("live catalog not read:", live.reason);
  }
  const work = join(out, "work");
  mkdirSync(work, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const report = [];
  for (const job of jobs) {
    const product = products.get(String(job.id));
    if (!product) { report.push({ id: job.id, status: "NOT_IN_CATALOG" }); continue; }
    try {
      const r = await renderReel({ page, job, product, work, out });
      report.push({ id: job.id, status: "RENDERED", seconds: r.seconds });
    } catch (e) {
      report.push({ id: job.id, status: "FAILED", error: String(e.message || e).slice(0, 300) });
    }
  }
  await browser.close();
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.some((r) => r.status !== "RENDERED")) process.exitCode = 1;
}
