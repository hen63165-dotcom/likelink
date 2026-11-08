// UGC edit: the owner's own phone video (a screen recording of the magic button, her hands with a
// product, her face) → a 9:16 reel in the style of the comment-to-DM creators she follows: a hook in
// the first second, short story captions timed to her video, a soft music bed under her own sound,
// and an end card that asks for one comment keyword (the AutoDM answers it in private).
// Real footage only: nothing is generated, nothing is posted from here.
//
//   node scripts/marketing/ugc-edit.mjs <clip.mp4|.mov> <job.json> <out-dir>
// job.json: { "id", "hook", "beats": [{ "at": s, "text" }], "keyword", "endLine",
//             "ad": true|false (a product: "#פרסומת · קישור שותפים" on every frame),
//             "credit": "צילום: LikeLink2" (optional), "trim": [from, to] (optional) }
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HOOK_FORBIDDEN } from "../../src/lib/growth/likeloop.js";
import { DROP_FORBIDDEN } from "../../src/lib/growth/dailyDrop.js";
import { hasBrandName } from "../../src/lib/growth/deals.js";

export const W = 1080, H = 1920, FPS = 30, END = 2.6;

/** Every burned-in line passes the site's claim rules, or the edit is refused. */
export function ugcProblems(job) {
  const lines = [job.hook, ...(job.beats || []).map((b) => b.text), job.endLine || ""].filter(Boolean);
  const out = [];
  for (const s of lines) {
    if (HOOK_FORBIDDEN.test(s)) out.push(`claim rule (hook): ${s}`);
    if (DROP_FORBIDDEN.test(s)) out.push(`claim rule (drop): ${s}`);
    if (hasBrandName(s)) out.push(`brand name: ${s}`);
  }
  if (!job.hook || job.hook.trim().split(/\s+/).length > 10) out.push("the hook needs 1–10 words");
  if (!/^[֐-׿a-zA-Z]{2,12}$/.test(String(job.keyword || ""))) out.push("one comment keyword, one word");
  return out;
}

/** When each caption shows: the hook from 0 to the first beat (at least 2.2 s), each beat until the next. */
export function captionTimes(job, clipSeconds) {
  const beats = [...(job.beats || [])].sort((a, b) => a.at - b.at);
  const first = Math.max(2.2, beats[0]?.at ?? 2.2);
  const out = [{ part: "hook", from: 0, to: Math.min(first, clipSeconds) }];
  beats.forEach((b, i) => out.push({ part: `b${i}`, from: Math.max(b.at, first), to: Math.min(beats[i + 1]?.at ?? clipSeconds, clipSeconds) }));
  return out.filter((c) => c.to - c.from > 0.4);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/\n/g, "<br>");
function fontFaces(dir = process.env.FONTSOURCE_DIR || "/tmp/pw/node_modules/@fontsource") {
  const out = [];
  for (const wt of [500, 700, 800, 900]) for (const sub of ["hebrew", "latin"]) {
    const f = join(dir, "heebo", "files", `heebo-${sub}-${wt}-normal.woff2`);
    if (existsSync(f)) out.push(`@font-face{font-family:"Heebo";font-weight:${wt};src:url(data:font/woff2;base64,${readFileSync(f).toString("base64")}) format("woff2")}`);
  }
  return out.join("\n");
}
const CSS = `
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;direction:rtl;font-family:"Heebo",sans-serif}
.labels{position:absolute;top:56px;right:48px;left:48px;display:flex;gap:12px}
.labels span{background:rgba(0,0,0,.55);color:#fff;font-size:26px;font-weight:500;padding:8px 18px;border-radius:999px}
.cap{position:absolute;top:300px;right:60px;left:60px;display:flex;justify-content:center}
.cap b{display:inline-block;background:#fff;color:#0b0b0c;font-weight:900;text-align:center;border-radius:26px;padding:20px 32px;box-shadow:0 10px 40px rgba(0,0,0,.3);line-height:1.2;text-wrap:balance}
.hook b{font-size:76px} .beat b{font-size:58px;font-weight:800}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;padding:0 80px;background:rgba(0,0,0,.62)}
.end h1{font-size:78px;font-weight:900;line-height:1.15}
.end .cta{margin-top:44px;background:#fff;color:#0b0b0c;font-size:70px;font-weight:900;padding:24px 52px;border-radius:999px}
.end small{margin-top:28px;font-size:40px;font-weight:700;opacity:.92}
`;
export function overlayHtml(job) {
  const labels = [job.ad ? "#פרסומת · קישור שותפים" : "", job.credit || ""].filter(Boolean);
  const pages = {
    labels: labels.length ? `<div class="labels">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : "",
    hook: `<div class="cap hook"><b>${esc(job.hook)}</b></div>`,
    end: `<div class="end"><h1>${esc(job.endLine || "רוצה גם?")}</h1><div class="cta">כתבי ״${esc(job.keyword)}״</div><small>ואשלח לך את הקישור בפרטי</small></div>`,
  };
  (job.beats || []).forEach((b, i) => { pages[`b${i}`] = `<div class="cap beat"><b>${esc(b.text)}</b></div>`; });
  return pages;
}

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
const probe = (f, what) => execFileSync("ffprobe", ["-v", "error", ...what, "-of", "csv=p=0", f]).toString().trim();

export async function editUgc({ page, clip, job, work, out }) {
  const problems = ugcProblems(job);
  if (problems.length) throw new Error(problems.join("; "));
  mkdirSync(work, { recursive: true }); mkdirSync(out, { recursive: true });
  const [t0, t1] = job.trim || [0, Number(probe(clip, ["-show_entries", "format=duration"]))];
  const len = Math.min(45, t1 - t0);
  const hasAudio = probe(clip, ["-select_streams", "a", "-show_entries", "stream=index"]) !== "";
  // 1 · the clip, covering 9:16 (a screen recording is taller: its middle is kept)
  const base = join(work, `${job.id}-base.mp4`);
  ff(["-ss", String(t0), "-t", String(len), "-i", clip, "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", base]);
  // 2 · the end card holds the last frame
  const last = join(work, `${job.id}-last.png`);
  ff(["-sseof", "-0.1", "-i", base, "-frames:v", "1", last]);
  // 3 · captions drawn by Chromium (RTL shaping), one transparent page per line
  const faces = fontFaces(), png = {};
  for (const [part, html] of Object.entries(overlayHtml(job))) {
    if (!html) continue;
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${faces}${CSS}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    png[part] = join(work, `${job.id}-${part}.png`);
    await page.screenshot({ path: png[part], omitBackground: true });
  }
  const total = len + END;
  const times = captionTimes(job, len);
  const inputs = ["-i", base, "-loop", "1", "-framerate", String(FPS), "-t", String(END), "-i", last];
  const parts = Object.keys(png);
  parts.forEach((p) => inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(total), "-i", png[p]));
  const idx = (p) => 2 + parts.indexOf(p);
  let fc = `[0:v]setsar=1[a];[1:v]scale=${W}:${H},setsar=1[b];[a][b]concat=n=2:v=1:a=0[v0]`;
  let lastLabel = "[v0]", n = 0;
  const lay = (p, from, to, fade = "") => { fc += `;[${idx(p)}:v]format=rgba${fade}[o${n}];${lastLabel}[o${n}]overlay=0:0:enable='between(t,${from.toFixed(2)},${(to - 0.001).toFixed(3)})'[v${n + 1}]`; lastLabel = `[v${n + 1}]`; n++; };
  for (const c of times) if (png[c.part]) lay(c.part, c.from, c.to);
  lay("end", len, total, `,fade=t=in:st=${len.toFixed(2)}:d=0.25:alpha=1`);
  if (png.labels) lay("labels", 0, total);
  // 4 · sound: her own audio on top, the bed under it (luna_reels/music.py, made from numbers)
  const bed = join(work, `${job.id}-bed.m4a`);
  execFileSync("python3", ["-c", `import sys; sys.path.insert(0, "scripts/luna_reels"); from pathlib import Path; from luna_reels.music import write_bed; write_bed(${total.toFixed(2)}, Path("${bed}"), db=${hasAudio ? -24 : -14}.0)`], { stdio: ["ignore", "ignore", "inherit"] });
  const audioIn = hasAudio ? ["-ss", String(t0), "-t", String(len), "-i", clip] : [];
  const bedIdx = 2 + parts.length, voiceIdx = bedIdx + 1;
  fc += hasAudio
    ? `;[${voiceIdx}:a]apad=whole_dur=${total.toFixed(2)}[vo];[${bedIdx}:a][vo]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.5,alimiter=limit=0.85:level=false,aresample=48000[a]`
    : `;[${bedIdx}:a]loudnorm=I=-16:TP=-1.5,alimiter=limit=0.85:level=false,aresample=48000[a]`;
  const mp4 = join(out, `${job.id}.mp4`);
  ff([...inputs, "-i", bed, ...audioIn, "-filter_complex", `${fc};${lastLabel}format=yuv420p[v]`, "-map", "[v]", "-map", "[a]", "-t", total.toFixed(2), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", mp4]);
  const at = [0.8, ...times.slice(1).map((c) => (c.from + c.to) / 2), len + 1.2];
  ff([...at.flatMap((t) => ["-ss", t.toFixed(2), "-i", mp4]), "-filter_complex", `${at.map((_, i) => `[${i}:v]scale=270:-2[s${i}]`).join(";")};${at.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${at.length}`, "-frames:v", "1", "-q:v", "4", join(out, `${job.id}-preview.jpg`)]);
  return { mp4, seconds: Number(total.toFixed(2)), captions: times.length, ownAudio: hasAudio };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [clip, jobFile, out = "ugc-out"] = process.argv.slice(2);
  if (!clip || !jobFile) { console.error("usage: ugc-edit.mjs <clip> <job.json> [out-dir]"); process.exit(2); }
  const job = JSON.parse(readFileSync(jobFile, "utf8"));
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try { console.log(JSON.stringify(await editUgc({ page, clip, job, work: join(out, "work"), out }), null, 2)); }
  finally { await browser.close(); }
}
