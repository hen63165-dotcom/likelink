// The POV reel (the owner, 2026-11-16, over an Israeli creator's steamer reel:
// "reels exactly like these for our products"): real hands-on footage cut
// fast, one POV line fixed at the top for the whole reel, a beat under it.
//
// - Footage: the store's own video for the item (productdetail.get
//   product_video_url through the owner's affiliate account, the same path as
//   the Studio videos), labelled "סרטון המוכר · בעריכת LikeLink2" on every
//   frame with "#פרסומת · קישור שותפים". Never presented as our own filming.
// - A new shot every 1 s from across the clip (cover 9:16, or fitted over a
//   blurred copy for a wide clip), alternating a light punch-in.
// - The POV line is the viewer's own moment ("POV: כשמצאת…"), never a claim
//   that we bought or tried it; it passes the site's claim rules.
// - Our own beat (popbeat.py), silent cuts (no whoosh). Nothing is posted here.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HOOK_FORBIDDEN } from "../../src/lib/growth/likeloop.js";
import { DROP_FORBIDDEN } from "../../src/lib/growth/dailyDrop.js";
import { hasBrandName } from "../../src/lib/growth/deals.js";

export const W = 1080;
export const H = 1920;
export const SHOT = 1.0;
export const MIN_SHOTS = 6;
export const MAX_SHOTS = 13;

/** The POV line goes on screen only if it passes the claim rules; "POV:" + 2–12 words. */
export function povProblems(job) {
  const out = [];
  const s = String(job.pov || "").trim();
  if (!/^POV:\s/.test(s)) out.push("the line starts with 'POV: '");
  const words = s.replace(/^POV:\s*/, "").split(/\s+/).filter(Boolean).length;
  if (words < 2 || words > 12) out.push("the POV line needs 2–12 words");
  if (HOOK_FORBIDDEN.test(s)) out.push(`claim rule (hook): ${s}`);
  if (DROP_FORBIDDEN.test(s)) out.push(`claim rule (drop): ${s}`);
  if (hasBrandName(s)) out.push(`brand name: ${s}`);
  for (const c of job.scenes || []) {
    if (!c) continue;
    if (String(c).split(/\s+/).length > 7) out.push(`a scene caption needs ≤ 7 words: ${c}`);
    if (HOOK_FORBIDDEN.test(c) || DROP_FORBIDDEN.test(c)) out.push(`claim rule (scene): ${c}`);
    if (hasBrandName(c)) out.push(`brand name (scene): ${c}`);
  }
  return out;
}

/** Scene captions as time ranges: consecutive shots with the same line share one. */
export function sceneRanges(scenes = [], shots = 0, shot = SHOT) {
  const out = [];
  for (let i = 0; i < shots; i++) {
    const text = String(scenes[i] || "").trim();
    if (!text) continue;
    const last = out.at(-1);
    if (last && last.text === text && last.to === Number((i * shot).toFixed(3))) last.to = Number(((i + 1) * shot).toFixed(3));
    else out.push({ text, from: Number((i * shot).toFixed(3)), to: Number(((i + 1) * shot).toFixed(3)) });
  }
  return out;
}

/** Shot starts spread across the clip, skipping its first and last moments. */
export function shotStarts(duration, { shot = SHOT, min = MIN_SHOTS, max = MAX_SHOTS } = {}) {
  const usable = Math.max(0, duration - 0.6);
  const n = Math.max(min, Math.min(max, Math.floor(usable / shot)));
  const span = Math.max(0, usable - shot);
  return Array.from({ length: n }, (_, i) => Number((0.3 + (n === 1 ? 0 : (span * i) / (n - 1))).toFixed(3)));
}

/** One shot's filter: cover 9:16 (or fit over a blur for a wide clip), every other shot punched in. */
export function shotFilter({ wide, punch }) {
  const z = punch ? 1.08 : 1.0;
  if (!wide) return `scale=${Math.round(W * z)}:${Math.round(H * z)}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p`;
  return [
    `split[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.08[bg]`,
    `[b]scale=${Math.round(W * z)}:-2[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p`,
  ].join(";");
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function overlayHtml(job) {
  const [head, ...rest] = String(job.pov).trim().split(/\s+/);
  return `<div class="labels"><span>#פרסומת · קישור שותפים</span><span>סרטון המוכר · בעריכת LikeLink2</span></div>
<div class="pov"><b>${esc(head)}</b><span>${esc(rest.join(" "))}</span></div>`;
}

const CSS = `*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;direction:rtl;font-family:"Heebo","Noto Sans Hebrew",sans-serif}
.labels{position:absolute;top:56px;right:48px;left:48px;display:flex;gap:12px}
.labels span{background:rgba(0,0,0,.55);color:#fff;font-size:26px;font-weight:500;padding:8px 18px;border-radius:999px}
.pov{position:absolute;top:170px;right:80px;left:80px;text-align:center;color:#fff;-webkit-text-stroke:9px #000;paint-order:stroke fill;line-height:1.16;text-wrap:balance}
.pov b{display:block;font-size:68px;font-weight:900;direction:ltr}
.pov span{display:block;font-size:66px;font-weight:800}
.scene{position:absolute;top:1230px;right:90px;left:90px;text-align:center}
.scene b{display:inline-block;background:#fff;color:#0b0b0c;font-size:58px;font-weight:900;line-height:1.2;padding:16px 30px;border-radius:24px;box-shadow:0 8px 30px rgba(0,0,0,.3);text-wrap:balance}`;

function fontFaces(dir = process.env.FONTSOURCE_DIR || "/tmp/pw/node_modules/@fontsource") {
  const faces = [];
  for (const wt of [500, 800, 900]) {
    const file = join(dir, "heebo", "files", `heebo-hebrew-${wt}-normal.woff2`);
    if (existsSync(file)) faces.push(`@font-face{font-family:"Heebo";font-weight:${wt};src:url(data:font/woff2;base64,${readFileSync(file).toString("base64")}) format("woff2")}`);
    const latin = join(dir, "heebo", "files", `heebo-latin-${wt}-normal.woff2`);
    if (existsSync(latin)) faces.push(`@font-face{font-family:"Heebo";font-weight:${wt};src:url(data:font/woff2;base64,${readFileSync(latin).toString("base64")}) format("woff2")}`);
  }
  return faces.join("\n");
}

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });

function probe(file) {
  const d = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" }));
  const s = d.streams?.[0] || {};
  return { w: Number(s.width || 0), h: Number(s.height || 0), seconds: Number(d.format?.duration || 0) };
}

/** Renders one reel from a local clip. Returns the files it wrote. */
export async function renderPov({ page, job, clip, work, out }) {
  const { w, h, seconds } = probe(clip);
  if (!w || seconds < 3) throw new Error(`clip too short or unreadable (${seconds.toFixed(1)} s)`);
  const wide = w / h > 0.75;
  const starts = shotStarts(seconds);
  const segs = starts.map((t, i) => {
    const seg = join(work, `${job.id}-s${i}.mp4`);
    ff(["-ss", String(t), "-t", String(SHOT), "-i", clip, "-an", "-filter_complex", shotFilter({ wide, punch: i % 2 === 1 }), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", seg]);
    return seg;
  });
  const list = join(work, `${job.id}-list.txt`);
  writeFileSync(list, segs.map((s) => `file '${resolve(s)}'`).join("\n")); // the concat list resolves paths from its own folder
  const cut = join(work, `${job.id}-cut.mp4`);
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", cut]);
  await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${fontFaces()}${CSS}</style></head><body>${overlayHtml(job)}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = join(work, `${job.id}-overlay.png`);
  await page.screenshot({ path: png, omitBackground: true });
  const ranges = sceneRanges(job.scenes, starts.length);
  const scenePngs = [];
  for (const [k, r] of ranges.entries()) {
    await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${fontFaces()}${CSS}</style></head><body><div class="scene"><b>${esc(r.text)}</b></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const f = join(work, `${job.id}-scene${k}.png`);
    await page.screenshot({ path: f, omitBackground: true });
    scenePngs.push(f);
  }
  const total = starts.length * SHOT;
  // music: false → a silent track (the owner adds a trending sound in Instagram's app).
  const beat = join(work, `${job.id}-beat.wav`);
  if (job.music === false) ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(total), beat]);
  else execFileSync("python3", ["scripts/luna_reels/luna_reels/popbeat.py", String(total), beat], { stdio: ["ignore", "ignore", "inherit"] });
  const mp4 = join(out, `${job.id}-pov.mp4`);
  let chain = "[0:v][1:v]overlay=0:0[b0]";
  ranges.forEach((r, k) => { chain += `;[b${k}][${k + 3}:v]overlay=0:0:enable='between(t,${r.from},${(r.to - 0.001).toFixed(3)})'[b${k + 1}]`; });
  chain += `;[b${ranges.length}]format=yuv420p[v]`;
  ff(["-i", cut, "-i", png, "-i", beat, ...scenePngs.flatMap((f) => ["-i", f]), "-filter_complex", chain, "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart", mp4]);
  const sheet = join(out, `${job.id}-pov-sheet.jpg`);
  ff(["-i", mp4, "-vf", `fps=${(1 / SHOT).toFixed(3)},scale=240:-2,tile=${Math.min(starts.length, 7)}x2`, "-frames:v", "1", sheet]);
  return { mp4, sheet, shots: starts.length, seconds: total, wide };
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`video ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** The store's video for a product: the affiliate API's answer, else the seller video the catalog sync kept. */
async function findVideo(p, storeVideo, kept = new Map()) {
  await new Promise((r) => setTimeout(r, 1500));
  let v = await storeVideo(p).catch((e) => ({ status: "ERROR", reason: String(e?.message || e) }));
  if (v.status === "ERROR" && /ApiCallLimit/.test(v.reason)) {
    await new Promise((r) => setTimeout(r, 3000));
    v = await storeVideo(p).catch((e) => ({ status: "ERROR", reason: String(e?.message || e) }));
  }
  if (v.status === "FOUND") return v;
  const url = p.sellerVideo?.url || kept.get(String(p.id))?.sellerVideo?.url || "";
  if (/^https:\/\/video\.aliexpress-media\.com\/\S+\.mp4$/.test(url)) return { status: "FOUND", video: url, title: String(p.storeTitle || p.title || ""), from: "catalog" };
  return v;
}

function keptCatalog() {
  try {
    const doc = JSON.parse(readFileSync("public/snapshot/kv.json", "utf8"));
    const raw = doc.keys?.["marketplace:products"];
    const list = typeof raw === "string" ? JSON.parse(raw) : raw || [];
    return new Map(list.map((p) => [String(p.id), p]));
  } catch { return new Map(); }
}

/** The clip's shots in order (left to right, then down), one frame each, for a person to look at. */
function shotSheet(clip, work, file, id) {
  const { seconds } = probe(clip);
  const starts = shotStarts(seconds);
  const frames = starts.map((t, i) => { const f = join(work, `${id}-f${i}.jpg`); ff(["-ss", String(t + SHOT / 2), "-i", clip, "-frames:v", "1", "-vf", "scale=240:-2", f]); return f; });
  ff([...frames.flatMap((f) => ["-i", f]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]scale=240:300:force_original_aspect_ratio=decrease,pad=240:300:(ow-iw)/2:(oh-ih)/2[c${i}]`).join(";")};${frames.map((_, i) => `[c${i}]`).join("")}xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${(i % 7) * 240}_${Math.floor(i / 7) * 300}`).join("|")}:fill=black`, "-frames:v", "1", file]);
  return starts.length;
}

/**
 * The owner, 2026-11-16 ("כן למוצרים עם סרטון אמיתי"): today's hot items (the trend board's own
 * read: hotproduct.query per category, the deals rules) that are not on the site yet and come with
 * the seller's own video → their shots, so a person keeps only real hands on the real product.
 */
async function hotSheets(out, limit) {
  const { findTrends } = await import("../catalog/trend-finder.mjs");
  const { outcome, board } = await findTrends({ budgetMs: 120_000 });
  const items = (board?.categories || []).flatMap((c) => (c.items || []).map((i) => ({ ...i, category: c.key }))).filter((i) => i.video && !i.onSite).slice(0, limit);
  const work = join(out, "work");
  mkdirSync(work, { recursive: true });
  const report = [];
  for (const i of items) {
    try {
      const clip = join(work, `${i.id}-src.mp4`);
      await download(i.video, clip);
      const shots = shotSheet(clip, work, join(out, `${i.id}-shots.jpg`), i.id);
      report.push({ id: i.id, status: "SHOTS", shots, category: i.category, title: String(i.title || "").slice(0, 90), price: i.price, itemUrl: i.itemUrl });
    } catch (e) {
      report.push({ id: i.id, status: "FAILED", reason: String(e?.message || e).slice(0, 160) });
    }
  }
  writeFileSync(join(out, "hot-candidates.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outcome, withVideo: items.length, withShots: report.filter((r) => r.status === "SHOTS").length }));
}

/**
 * The owner, 2026-11-16 ("ידיים של בחורה מטופחות ויפות"): kinds whose sellers film with a
 * groomed woman's hands, because the hands sell the product. product.query by recent orders,
 * ship to IL, ILS; the deals rules (≥ 95%, ≥ 300 orders, no brand or unlisted kind) and a seller
 * video. The hands themselves are judged by eye on the shot sheets, never assumed.
 */
export const HAND_KINDS = Object.freeze(["press on nails", "women ring", "women bracelet", "nail art stickers", "women phone case", "hand cream", "women earrings", "hair claw clip"]);

async function handsSheets(out, limit) {
  const { aeCall } = await import("../../api/_utils/aliexpressAffiliate.mjs");
  const { dealCheck } = await import("../../src/lib/growth/deals.js");
  const env = process.env;
  const seen = new Set();
  const items = [];
  for (const kw of HAND_KINDS) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const json = await aeCall("aliexpress.affiliate.product.query", { keywords: kw, sort: "LAST_VOLUME_DESC", page_size: "40", target_currency: "ILS", target_language: "HE", ship_to_country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID }, { env });
      const list = json?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
      for (const x of Array.isArray(list) ? list : [list]) {
        const id = String(x?.product_id || "");
        const video = String(x?.product_video_url || "");
        if (!id || seen.has(id) || !/^https:\/\/\S+\.mp4/.test(video) || !dealCheck(x).ok) continue;
        seen.add(id);
        items.push({ id, kind: kw, video, title: String(x.product_title || "").slice(0, 90), price: Number(x.target_sale_price || x.sale_price || 0) });
      }
    } catch (e) {
      console.error(`query ${kw}: ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  const pick = items.slice(0, limit);
  const work = join(out, "work");
  mkdirSync(work, { recursive: true });
  const report = [];
  for (const i of pick) {
    try {
      const clip = join(work, `${i.id}-src.mp4`);
      await download(i.video, clip);
      const shots = shotSheet(clip, work, join(out, `${i.id}-shots.jpg`), i.id);
      report.push({ ...i, video: undefined, status: "SHOTS", shots });
    } catch (e) {
      report.push({ id: i.id, kind: i.kind, status: "FAILED", reason: String(e?.message || e).slice(0, 160) });
    }
  }
  writeFileSync(join(out, "hands-candidates.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ found: items.length, withShots: report.filter((r) => r.status === "SHOTS").length }));
}

/** Products worth a POV reel: approved, an AliExpress link, not archived. */
export function sheetCandidates(products = []) {
  return products.filter((p) => p?.id && p.status === "approved" && /aliexpress/i.test(String(p.affiliateUrl || "")));
}

/** Writes <id>-shots.jpg (the shots in order, left to right then down) for each candidate with a store video. */
async function sheetsMode(out, limit) {
  const { cloudProducts, storeVideo } = await import("../media/product-video/studio-videos.mjs");
  const work = join(out, "work");
  mkdirSync(work, { recursive: true });
  const list = sheetCandidates(await cloudProducts()).slice(0, limit);
  const report = [];
  const kept = keptCatalog();
  for (const p of list) {
    const v = await findVideo(p, storeVideo, kept);
    if (v.status !== "FOUND") { report.push({ id: p.id, status: v.status }); continue; }
    try {
      const clip = join(work, `${p.id}-src.mp4`);
      await download(v.video, clip);
      const shots = shotSheet(clip, work, join(out, `${p.id}-shots.jpg`), p.id);
      report.push({ id: p.id, status: "SHOTS", shots, title: String(p.displayTitle || p.title || "").slice(0, 80), storeTitle: v.title.slice(0, 120) });
    } catch (e) {
      report.push({ id: p.id, status: "FAILED", reason: String(e?.message || e).slice(0, 160) });
    }
  }
  writeFileSync(join(out, "candidates.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ candidates: list.length, withShots: report.filter((r) => r.status === "SHOTS").length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === "--hands") {
  await handsSheets(process.argv[3] || "pov-sheets-out", Number(process.argv[4] || 32));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === "--hot") {
  await hotSheets(process.argv[3] || "pov-sheets-out", Number(process.argv[4] || 30));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === "--sheets") {
  await sheetsMode(process.argv[3] || "pov-sheets-out", Number(process.argv[4] || 40));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [jobsFile = "scripts/marketing/pov-reels/jobs.json", out = "pov-reels-out"] = process.argv.slice(2);
  const jobs = JSON.parse(readFileSync(jobsFile, "utf8")).jobs || [];
  const { cloudProducts, storeVideo } = await import("../media/product-video/studio-videos.mjs");
  const products = new Map((await cloudProducts()).map((p) => [String(p.id), p]));
  const work = join(out, "work");
  mkdirSync(work, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const report = [];
  for (const job of jobs) {
    const problems = povProblems(job);
    // A hot item chosen from its shot sheet before it is on the site: read by its own item page.
    const product = products.get(String(job.id)) || (/^\d{8,20}$/.test(String(job.item || "")) ? { id: job.id, affiliateUrl: `https://www.aliexpress.com/item/${job.item}.html` } : null);
    if (!product) problems.push("not in the cloud catalog");
    if (problems.length) { report.push({ id: job.id, status: "REFUSED", problems }); continue; }
    try {
      // The store allows about one call a second (findVideo waits and retries once after a ban).
      const v = await findVideo(product, storeVideo, keptCatalog());
      if (v.status !== "FOUND") { report.push({ id: job.id, status: v.status, reason: v.reason || "" }); continue; }
      const clip = join(work, `${job.id}-src.mp4`);
      await download(v.video, clip);
      const r = await renderPov({ page, job, clip, work, out });
      report.push({ id: job.id, status: "RENDERED", pov: job.pov, shots: r.shots, seconds: r.seconds, wide: r.wide, storeTitle: v.title });
    } catch (e) {
      report.push({ id: job.id, status: "FAILED", reason: String(e?.message || e).slice(0, 200) });
    }
  }
  await browser.close();
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
