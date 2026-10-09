#!/usr/bin/env node
// Real product video → a 9:16 reel ready to post (.github/workflows/product-video.yml).
//
// Input: the seller's own product video found by find-videos.mjs. Output per
// product: three variants that differ only in the hook, so the account can
// see which opening holds viewers — <id>.mp4 (a), <id>-b.mp4, <id>-c.mp4
// (1080×1920, H.264, silent AAC 48 kHz: the trending sound is added in the
// Instagram app), each with its caption (.txt) and a 3-frame preview.
//
// The creator cut (9 s, loops cleanly):
//   0 – 2.2 s   hook text + a punch-in zoom in the first half second, so
//               something moves before the viewer can scroll
//   middle      the product's real footage, sped up ×1.25, skipping the
//               seller clip's first 0.8 s (often a logo or a still)
//   last 2.6 s  "comment רוצה and I'll send you the link" (the comment→DM loop)
// Hooks: creatorHooks (found it / look closer / save it) and buildHookSet;
// HOOK_FORBIDDEN blocks "bought it", "sold out", ratings…, and no hook names
// a price (a price burned into a video goes stale).
// Every frame carries "#פרסומת · קישור שותפים" and "צילום המוצר: המוכר".
// Hebrew text is drawn by Chromium (correct RTL shaping), composed by ffmpeg.
//
//   node scripts/media/product-video/make-reel.mjs <videos dir> <out dir>
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { HOOK_FORBIDDEN, buildHookSet, worldOf } from "../../../src/lib/growth/likeloop.js";

const W = 1080;
const H = 1920;
const TOTAL_S = 9;
const HOOK_S = 2.2;
const CTA_S = 2.6;
const SPEED = 1.25;
const SKIP_S = 0.8;
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
export function buildCaption(product, hook) {
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
    "צילום המוצר: המוכר, מעמוד המוצר בחנות.",
    "",
    tags.join(" "),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

const CSS = `
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;background:transparent;font-family:"Noto Sans Hebrew","Heebo","DejaVu Sans",sans-serif;direction:rtl}
.chips{position:absolute;top:56px;right:48px;left:48px;display:flex;gap:14px;justify-content:flex-start}
.chip{background:rgba(0,0,0,.55);color:#fff;font-size:30px;font-weight:700;padding:10px 22px;border-radius:999px}
.hook{position:absolute;top:240px;right:60px;left:60px;text-align:center}
.hook span{display:inline;background:#fff;color:#111;font-size:92px;font-weight:900;line-height:1.38;padding:6px 22px;border-radius:18px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.title{position:absolute;bottom:250px;right:60px;left:60px;text-align:center}
.title span{display:inline;background:rgba(0,0,0,.62);color:#fff;font-size:52px;font-weight:800;line-height:1.45;padding:6px 18px;border-radius:14px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.cta{position:absolute;top:0;bottom:0;right:0;left:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;background:rgba(0,0,0,.55)}
.cta .k{background:#ffd400;color:#111;font-size:150px;font-weight:900;padding:4px 60px;border-radius:30px}
.cta .l{color:#fff;font-size:66px;font-weight:900;text-align:center;line-height:1.3;padding:0 70px}
`;
const chips = `<div class="chips"><div class="chip">#פרסומת · קישור שותפים</div><div class="chip">צילום המוצר: המוכר</div></div>`;

function overlays(product, hook) {
  return {
    hook: `${chips}<div class="hook"><span>${esc(noEmoji(hook.text))}</span></div>`,
    body: `${chips}<div class="title"><span>${esc(noEmoji(product.title))}</span></div>`,
    cta: `${chips}<div class="cta"><div class="l">כתבו בתגובות</div><div class="k">${KEYWORD}</div><div class="l">ואשלח לכם את הקישור בפרטי</div></div>`,
  };
}

function seconds(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim()) || 0;
}

async function main() {
  const [videos = "product-videos", out = "reels"] = process.argv.slice(2);
  const found = JSON.parse(readFileSync(join(videos, "videos.json"), "utf8")).results.filter((r) => r.status === "FOUND");
  const doc = JSON.parse(readFileSync(new URL("../../../public/snapshot/kv.json", import.meta.url), "utf8"));
  const byId = new Map((doc.keys["marketplace:products"] || []).map((p) => [p.id, p]));
  mkdirSync(out, { recursive: true });
  summary(`## Reels from real product videos (${found.length})`);
  if (!found.length) return;

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.CHROME_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const r of found) {
    const product = byId.get(r.productId);
    const src = join(videos, `${r.productId}.mp4`);
    if (!product || !existsSync(src)) continue;
    const skip = seconds(src) >= 6 ? SKIP_S : 0;
    const hooks = variantHooks(product);
    for (const [k, hook] of hooks.entries()) {
      const name = k === 0 ? r.productId : `${r.productId}-${VARIANTS[k]}`;
      const pngs = {};
      for (const [part, html] of Object.entries(overlays(product, hook))) {
        await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        pngs[part] = join(out, `.${name}-${part}.png`);
        await page.screenshot({ path: pngs[part], omitBackground: true });
      }
      const mp4 = join(out, `${name}.mp4`);
      const ctaAt = (TOTAL_S - CTA_S).toFixed(2);
      const filter = [
        `[0:v]setpts=PTS/${SPEED},fps=30,split[a][b]`,
        `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.12[bg]`,
        `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
        // Punch-in: 1.15× → 1× over the first 15 frames (half a second).
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,zoompan=z='if(lt(on,15),1.15-0.15*on/15,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,format=yuv420p[v0]`,
        `[v0][2:v]overlay=0:0:enable='lt(t,${HOOK_S})'[v1]`,
        `[v1][3:v]overlay=0:0:enable='between(t,${HOOK_S},${ctaAt})'[v2]`,
        `[v2][4:v]overlay=0:0:enable='gte(t,${ctaAt})'[v]`,
      ].join(";");
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-stream_loop", "-1", "-ss", String(skip), "-i", src,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-loop", "1", "-i", pngs.hook, "-loop", "1", "-i", pngs.body, "-loop", "1", "-i", pngs.cta,
        "-filter_complex", filter, "-map", "[v]", "-map", "1:a",
        "-t", String(TOTAL_S), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", mp4,
      ]);
      writeFileSync(join(out, `${name}.txt`), buildCaption(product, hook) + "\n");
      // A small preview (hook · footage · call to action) for review without playing the video.
      const at = [1, TOTAL_S / 2, TOTAL_S - 1.2].map((t) => t.toFixed(2));
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        ...at.flatMap((t) => ["-ss", t, "-i", mp4]),
        "-filter_complex", "[0:v]scale=360:-2[a];[1:v]scale=360:-2[b];[2:v]scale=360:-2[c];[a][b][c]hstack=inputs=3",
        "-frames:v", "1", "-q:v", "4", join(out, `${name}-preview.jpg`),
      ]);
      summary(`- ${name}: ${TOTAL_S} s · hook (${hook.type}) "${hook.text}"`);
    }
  }
  await browser.close();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; });
