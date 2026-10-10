#!/usr/bin/env node
// Real product video → a 9:16 reel ready to post (.github/workflows/product-video.yml).
//
// Input: the seller's own product video found by find-videos.mjs. Output per
// product: three variants that differ only in the hook, so the account can
// see which opening holds viewers — <id>.mp4 (a), <id>-b.mp4, <id>-c.mp4
// (1080×1920, H.264, silent AAC 48 kHz: the trending sound is added in the
// Instagram app), each with its caption (.txt) and a 3-frame preview.
//
// The premium cut (premium.mjs, ~11 s): five shots picked from the seller's
// clip, full-screen 9:16 around the jewelry, a slow pull-back under the serif
// hook, a slow-motion hero shot with one light sweep, push-ins, dissolves and
// a glint, a gentle grade; then the product's name and, at the end, "comment
// רוצה and I'll send you the link" (the comment→DM loop).
// Hooks: creatorHooks (found it / look closer / save it) and buildHookSet;
// HOOK_FORBIDDEN blocks "bought it", "sold out", ratings…, and no hook names
// a price (a price burned into a video goes stale).
// Every frame carries "#פרסומת · קישור שותפים" and "צילום המוצר: המוכר".
// Hebrew text is drawn by Chromium (correct RTL shaping), composed by ffmpeg.
//
//   node scripts/media/product-video/make-reel.mjs <videos dir> <out dir>
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { HOOK_FORBIDDEN, buildHookSet, worldOf } from "../../../src/lib/growth/likeloop.js";
import { CLEAN_TRANSITIONS, FPS, H, SHOT_EXCLUDE, SHOT_FRAMING, SHOTS, W, XFADE, analyze, duration, joinFilter, planShots, shotFilter, shotStarts, totalSeconds } from "./premium.mjs";

export const VARIANTS = ["a", "b", "c"];
export const KEYWORD = "רוצה";
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };

const HASHTAGS = {
  Accessories: ["#תכשיטים", "#אקססוריז", "#מציאות", "#אליאקספרס", "#מתנה"],
  Fashion: ["#אופנה", "#מציאות", "#אליאקספרס", "#סטייל", "#לוק"],
  Beauty: ["#טיפוח", "#ביוטי", "#מציאות", "#אליאקספרס", "#סקינקר"],
  Home: ["#עיצובהבית", "#לבית", "#מציאות", "#אליאקספרס", "#גאדגטים"],
  Tech: ["#גאדגטים", "#טכנולוגיה", "#מציאות", "#אליאקספרס", "#טק"],
  Other: ["#מציאות", "#אליאקספרס", "#שווהלבדוק", "#קניותאונליין", "#גאדגטים"],
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const noEmoji = (s) => String(s ?? "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();
const firstSentence = (s) => (String(s || "").split(/(?<=[.!?])\s/)[0] || "").trim().slice(0, 140);

const fromAliExpress = (p) => /aliexpress/i.test(`${p?.affiliateUrl || ""} ${p?.imageSource?.itemUrl || ""}`);

/**
 * Creator-style hooks: what top product accounts open with, kept true. "Found
 * it" is the account's own act (it chose and listed the product), "on Ali"
 * only when the product really is an AliExpress item; nothing about buying,
 * using, stock, popularity or price.
 */
export function creatorHooks(product) {
  const w = worldOf(product?.category);
  const where = fromAliExpress(product) ? "באלי" : "ברשת";
  return [
    { type: "found", text: `מצאתי את ה${w.noun} הזה ${where}` },
    { type: "closeup", text: "תסתכלי על הפרטים מקרוב" },
    { type: "save", text: "שמרי את זה לפעם הבאה שתחפשי מתנה" },
  ].filter((h) => !HOOK_FORBIDDEN.test(h.text) && !/₪|\d/.test(h.text));
}

/** The three hooks a product's variants open with (a, b, c). */
export function variantHooks(product) {
  const creator = creatorHooks(product);
  const set = buildHookSet(product).filter((h) => !/₪|\d/.test(h.text));
  const pick = (list, type) => list.find((h) => h.type === type);
  return [pick(creator, "found") || creator[0], pick(set, "question") || pick(set, "problem") || set[0], pick(creator, "save") || creator[1]].filter(Boolean);
}

/** The hook for this product: a fixed rotation over honest hook types. */
export function pickHook(product, index = 0) {
  const hooks = buildHookSet(product);
  // No price hooks: a price burned into a video goes stale when the store changes it.
  const order = ["question", "problem", "didnt_know", "gift", "story"];
  const type = order[index % order.length];
  return hooks.find((h) => h.type === type) || hooks[0];
}

/** The post caption: hook, the product's own facts, the comment keyword, disclosure. */
export function buildCaption(product, hook, footage = "seller") {
  const tags = HASHTAGS[product.category] || HASHTAGS.Other;
  return [
    hook.text,
    "",
    `${product.title}`,
    firstSentence(product.description),
    "",
    `כתבו "${KEYWORD}" בתגובות ואשלח לכם את הקישור בפרטי 📩`,
    "",
    "#פרסומת · קישור שותפים: אם תקנו דרכו ייתכן שאקבל עמלה, בלי עלות נוספת לכם. המחיר והמלאי הסופיים נקבעים בחנות.",
    footage === "owner" ? "צילום: LikeLink2, צילום אמיתי של המוצר." : "צילום המוצר: המוכר, מעמוד המוצר בחנות.",
    "",
    tags.join(" "),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

const FONTS = [
  ["Frank Ruhl Libre", "frank-ruhl-libre", [500, 700, 900]],
  ["Heebo", "heebo", [400, 500, 700, 800]],
];

/** The two Hebrew typefaces, embedded so Chromium draws them with no network (Google Fonts via @fontsource). */
export function fontFaces(dir = process.env.FONTSOURCE_DIR || "/tmp/pw/node_modules/@fontsource") {
  const faces = [];
  for (const [family, pkg, weights] of FONTS) {
    for (const wt of weights) {
      const file = join(dir, pkg, "files", `${pkg}-hebrew-${wt}-normal.woff2`);
      if (existsSync(file)) faces.push(`@font-face{font-family:"${family}";font-weight:${wt};src:url(data:font/woff2;base64,${readFileSync(file).toString("base64")}) format("woff2")}`);
    }
  }
  return faces.join("\n");
}

const CSS = `
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;direction:rtl;font-family:"Heebo","Noto Sans Hebrew","DejaVu Sans",sans-serif}
.serif{font-family:"Frank Ruhl Libre","Noto Serif Hebrew","Heebo",serif}
.labels{position:absolute;top:54px;right:44px;left:44px;display:flex;gap:12px}
.labels span{background:rgba(0,0,0,.36);color:#fff;font-size:25px;font-weight:500;letter-spacing:.2px;padding:8px 18px;border-radius:999px;backdrop-filter:blur(6px)}
.hook{position:absolute;top:300px;right:70px;left:70px;text-align:center;color:#fff;font-size:100px;font-weight:700;line-height:1.18;text-shadow:0 4px 28px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.6)}
.hook::before{content:"";position:absolute;inset:-120px -70px;z-index:-1;background:radial-gradient(closest-side,rgba(0,0,0,.34),rgba(0,0,0,0))}
.name{position:absolute;bottom:250px;right:90px;left:90px;text-align:center;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.6)}
.name i{display:block;width:84px;height:2px;margin:0 auto 22px;background:#e9c46a}
.name b{display:block;font-size:46px;font-weight:500;line-height:1.35;letter-spacing:.4px}
.cta{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:26px;padding-bottom:260px;background:linear-gradient(to top,rgba(0,0,0,.72) 0%,rgba(0,0,0,.45) 38%,rgba(0,0,0,0) 62%)}
.cta .l{color:#fff;font-size:54px;font-weight:500;text-align:center;line-height:1.3;padding:0 80px}
.cta .k{background:#e9c46a;color:#1b1406;font-size:128px;font-weight:900;padding:0 64px 10px;border-radius:26px;box-shadow:0 10px 40px rgba(233,196,106,.35)}
.sweep{position:absolute;inset:0;background:linear-gradient(105deg,rgba(255,255,255,0) 38%,rgba(255,250,235,.16) 46%,rgba(255,255,255,.42) 50%,rgba(255,250,235,.16) 54%,rgba(255,255,255,0) 62%)}
`;
// Whose footage it is: the seller's (from the product page) or our own (filmed with the real product).
export const FOOTAGE_LABEL = Object.freeze({ seller: "צילום המוצר: המוכר", owner: "צילום: LikeLink2" });
const labelsFor = (footage) => `<div class="labels"><span>#פרסומת · קישור שותפים</span><span>${FOOTAGE_LABEL[footage] || FOOTAGE_LABEL.seller}</span></div>`;
const shortName = (title) => {
  const t = noEmoji(title).replace(/\s+/g, " ").trim();
  if (t.length <= 42) return t;
  // Cut at a whole word, never in the middle of one.
  const cut = t.slice(0, 42).replace(/\s+\S*$/, "");
  return `${cut || t.slice(0, 41)}…`;
};

/** The overlay layers of a premium reel (transparent PNGs drawn by Chromium). */
export function overlays(product, hook, footage = "seller") {
  return {
    labels: labelsFor(footage),
    hook: `<div class="hook serif">${esc(noEmoji(hook.text))}</div>`,
    name: `<div class="name"><i></i><b>${esc(shortName(product.title))}</b></div>`,
    cta: `<div class="cta"><div class="l">כתבי בתגובות</div><div class="k serif">${KEYWORD}</div><div class="l">ואשלח לך את הקישור בפרטי</div></div>`,
    sweep: `<div class="sweep"></div>`,
  };
}

export const TOTAL_S = totalSeconds();
export const HOOK_END_S = 2.0;
export const CTA_AT_S = Number((shotStarts()[SHOTS.length - 1] + 0.3).toFixed(2));
export const SWEEP_AT_S = Number((shotStarts()[1] + 0.7).toFixed(2));
const SWEEP_S = 0.9;

function renderShots(src, product, dir) {
  const info = analyze(src);
  const plan = planShots(info.samples, duration(src), { exclude: SHOT_EXCLUDE[product.id] || [], cy: SHOT_FRAMING[product.id]?.cy ?? 0.5 });
  if (plan.length !== SHOTS.length) return null;
  return plan.map((shot, k) => {
    const file = join(dir, `${product.id}-shot${k}.mp4`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-ss", String(shot.in), "-t", String(shot.srcLen), "-i", src,
      "-vf", shotFilter(shot, info), "-t", String(shot.out), "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", file,
    ]);
    return { file, shot };
  });
}

// Variant a is the clean cut (what product videographers post: no text on the
// footage, the teaser goes in the caption); b and c keep the hook on screen so
// the account can compare openings.
export const CLEAN_VARIANT = 0;
export const LAYERS = Object.freeze({ clean: ["labels", "name", "sweep"], hook: ["labels", "hook", "name", "cta", "sweep"] });

/**
 * The finishing filter: the shots joined, the labels on every frame, the hook,
 * the product name and the call to action fading in turn, one light sweep.
 * Inputs: n shots, the silent audio, then the images of LAYERS (clean: labels,
 * name, sweep; hook: labels, hook, name, cta, sweep).
 */
export function reelFilter(n = SHOTS.length, { clean = false } = {}) {
  const img = (i) => n + 1 + i; // input index of each overlay image
  const fade = (st, d, end) => `format=rgba,fade=t=in:st=${st}:d=${d}:alpha=1${end ? `,fade=t=out:st=${end}:d=0.25:alpha=1` : ""}`;
  if (clean) {
    return [
      joinFilter(SHOTS, XFADE, CLEAN_TRANSITIONS),
      `[${img(1)}:v]${fade(CTA_AT_S, 0.6)}[nm]`,
      `[cut][${img(0)}:v]overlay=0:0[v1]`,
      `[v1][nm]overlay=0:0[v2]`,
      `[v2][${img(2)}:v]overlay=x='-w+(t-${SWEEP_AT_S})*(W+w)/${SWEEP_S}':y=0:enable='between(t,${SWEEP_AT_S},${SWEEP_AT_S + SWEEP_S})',format=yuv420p[v]`,
    ].join(";");
  }
  return [
    joinFilter(),
    `[${img(1)}:v]${fade(0.12, 0.35, (HOOK_END_S - 0.25).toFixed(2))}[hk]`,
    `[${img(2)}:v]${fade(HOOK_END_S, 0.45, (CTA_AT_S - 0.25).toFixed(2))}[nm]`,
    `[${img(3)}:v]${fade(CTA_AT_S, 0.4)}[ct]`,
    `[cut][${img(0)}:v]overlay=0:0[v1]`,
    `[v1][hk]overlay=0:0[v2]`,
    `[v2][nm]overlay=0:0[v3]`,
    `[v3][ct]overlay=0:0[v4]`,
    `[v4][${img(4)}:v]overlay=x='-w+(t-${SWEEP_AT_S})*(W+w)/${SWEEP_S}':y=0:enable='between(t,${SWEEP_AT_S},${SWEEP_AT_S + SWEEP_S})',format=yuv420p[v]`,
  ].join(";");
}

function renderReel(shots, pngs, mp4, clean = false) {
  const n = shots.length;
  const filter = reelFilter(n, { clean });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    ...shots.flatMap((s) => ["-i", s.file]),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    ...LAYERS[clean ? "clean" : "hook"].flatMap((k) => ["-loop", "1", "-framerate", String(FPS), "-i", pngs[k]]),
    "-filter_complex", filter, "-map", "[v]", "-map", `${n}:a`,
    "-t", String(TOTAL_S), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", mp4,
  ]);
}

async function main() {
  const [videos = "product-videos", out = "reels"] = process.argv.slice(2);
  const found = JSON.parse(readFileSync(join(videos, "videos.json"), "utf8")).results.filter((r) => r.status === "FOUND");
  // FOOTAGE=owner: a clip we filmed ourselves (product-video.yml "clip"); its reels are <id>-own*.mp4.
  const footage = process.env.FOOTAGE === "owner" ? "owner" : "seller";
  const suffix = footage === "owner" ? "-own" : "";
  const doc = JSON.parse(readFileSync(new URL("../../../public/snapshot/kv.json", import.meta.url), "utf8"));
  const byId = new Map((doc.keys["marketplace:products"] || []).map((p) => [p.id, p]));
  mkdirSync(out, { recursive: true });
  const work = join(out, ".work");
  mkdirSync(work, { recursive: true });
  summary(footage === "owner" ? `## Premium reels from our own footage (${found.length})` : `## Premium reels from the sellers' product videos (${found.length})`);
  if (!found.length) return;

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.CHROME_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const faces = fontFaces();
  for (const r of found) {
    const product = byId.get(r.productId);
    const src = join(videos, `${r.productId}.mp4`);
    if (!product || !existsSync(src)) continue;
    const shots = renderShots(src, product, work);
    if (!shots) {
      summary(`- ${r.productId}: skipped (not enough usable footage)`);
      continue;
    }
    for (const [k, hook] of variantHooks(product).entries()) {
      const name = k === 0 ? `${r.productId}${suffix}` : `${r.productId}${suffix}-${VARIANTS[k]}`;
      const pngs = {};
      for (const [part, html] of Object.entries(overlays(product, hook, footage))) {
        await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${faces}${CSS}</style></head><body>${html}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        pngs[part] = join(work, `${name}-${part}.png`);
        await page.screenshot({ path: pngs[part], omitBackground: true });
      }
      const mp4 = join(out, `${name}.mp4`);
      renderReel(shots, pngs, mp4, k === CLEAN_VARIANT);
      writeFileSync(join(out, `${name}.txt`), buildCaption(product, hook, footage) + "\n");
      // A small preview (hook · hero · call to action) for review without playing the video.
      const at = [1.2, SWEEP_AT_S + 0.2, TOTAL_S - 1].map((t) => t.toFixed(2));
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        ...at.flatMap((t) => ["-ss", t, "-i", mp4]),
        "-filter_complex", "[0:v]scale=360:-2[a];[1:v]scale=360:-2[b];[2:v]scale=360:-2[c];[a][b][c]hstack=inputs=3",
        "-frames:v", "1", "-q:v", "4", join(out, `${name}-preview.jpg`),
      ]);
      summary(`- ${name}: ${TOTAL_S} s premium cut${k === CLEAN_VARIANT ? " (clean)" : ""} · shots ${shots.map((s) => `${s.shot.in}s×${s.shot.speed}`).join(", ")} · hook (${hook.type}) "${hook.text}"`);
    }
  }
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; });
