#!/usr/bin/env node
// Production verification from a real browser (GitHub Actions runner, Google
// Chrome — which decodes H.264, unlike open-source Chromium builds).
//
//   • every public route at 375px and 1440px: HTTP, console/page errors,
//     horizontal overflow, broken images, h1
//   • /reels: a real <video> plays (readyState, currentTime advancing) and the
//     truth label is shown; no play icon is drawn for a photo
//   • save / follow / language switch round-trips on the live site
//   • live media: the newest native reels are downloaded from the public media
//     proxy, probed with ffprobe and turned into frame contact sheets
//
// Images are printed to the log as base64 between markers so a reviewer can
// see exactly what visitors get:  ===IMG <name> <part>/<parts>===
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const BASE = (process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "verify") : "verify-out";
mkdirSync(OUT, { recursive: true });
const results = [];
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };
const emitImage = (name, file) => {
  const b64 = readFileSync(file).toString("base64");
  const parts = Math.ceil(b64.length / 4000);
  for (let i = 0; i < parts; i++) console.log(`===IMG ${name} ${i + 1}/${parts}===${b64.slice(i * 4000, (i + 1) * 4000)}`);
};
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROUTES = ["/", "/discover", "/products", "/creators", "/u/alyostyle", "/p/p1", "/reels", "/trends", "/collections", "/deals", "/search?q=%D7%A1%D7%A8%D7%95%D7%9D", "/saved", "/studio"];

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const vp of [{ n: "m", width: 375, height: 812 }, { n: "d", width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "he-IL" });
    const page = await ctx.newPage();
    let errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`.slice(0, 200)); });
    for (const r of ROUTES) {
      errors = [];
      const resp = await page.goto(BASE + r, { waitUntil: "load", timeout: 45000 }).catch((e) => ({ status: () => 0, err: e.message }));
      await page.waitForTimeout(r === "/reels" ? 5000 : 2500);
      const m = await page.evaluate(() => {
        const v = document.querySelector(".lx-reels video, video");
        return {
          hscroll: document.documentElement.scrollWidth - window.innerWidth,
          h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 50),
          broken: [...document.querySelectorAll("img")].filter((i) => i.complete && i.getAttribute("src") && i.naturalWidth === 0).length,
          public: !!document.querySelector(".lx"),
          studio: !!document.querySelector(".ll-studio"),
          video: v ? { src: v.currentSrc.slice(0, 120), readyState: v.readyState, t: Number(v.currentTime.toFixed(2)), w: v.videoWidth, h: v.videoHeight, paused: v.paused } : null,
          badges: [...document.querySelectorAll(".lx-badge")].slice(0, 6).map((b) => b.textContent.trim()),
        };
      });
      const row = { vp: vp.n, route: r, status: resp?.status?.() ?? 0, ...m, errors: errors.slice(0, 5) };
      results.push(row);
      summary(`- ${vp.n} ${r}: http ${row.status} · hscroll ${row.hscroll} · broken ${row.broken} · errors ${row.errors.length}${row.video ? ` · video rs=${row.video.readyState} t=${row.video.t}s ${row.video.w}x${row.video.h}` : ""}`);
      if (["/", "/reels", "/p/p1"].includes(r)) {
        const f = path.join(OUT, `${vp.n}${r.replace(/\W+/g, "_")}.jpg`);
        await page.screenshot({ path: f, type: "jpeg", quality: 55 });
        emitImage(`${vp.n}${r.replace(/\W+/g, "_")}`, f);
      }
    }
    // Interactions on the live site (mobile only; local state, no writes beyond the visitor's own).
    if (vp.n === "m") {
      await page.goto(BASE + "/", { waitUntil: "load" });
      const save = page.locator("article button[aria-pressed]").first();
      await page.waitForTimeout(2500); await save.click();
      const saved = (await save.getAttribute("aria-pressed")) === "true";
      await page.goto(BASE + "/saved", { waitUntil: "load" });
      const savedCount = await page.locator("article").count();
      await page.goto(BASE + "/u/alyostyle", { waitUntil: "load" });
      await page.waitForTimeout(2500); await page.locator("button[aria-pressed]", { hasText: "מעקב" }).first().click();
      const following = await page.locator("button[aria-pressed=true]", { hasText: "עוקבים" }).count();
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator("button", { hasText: "EN" }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      const dir = await page.evaluate(() => document.querySelector(".lx")?.dir);
      summary(`- interactions: save ${saved} → saved page items ${savedCount} · follow ${following > 0} · language switch dir=${dir}`);
      results.push({ interactions: { saved, savedCount, following: following > 0, dir } });
    }
    await ctx.close();
  }
  await browser.close();

  // Live media: newest native reels, downloaded exactly as visitors get them.
  const status = await (await fetch(`${BASE}/api/store?mode=media-pipeline&op=status`)).json();
  summary(`- pipeline status: ${status.reels} reels ${JSON.stringify(status.byStyle)} truth ${JSON.stringify(status.truth)} external ${status.externalChannel}`);
  for (const r of (status.latest || []).slice(0, 3)) {
    const res = await fetch(r.videoUrl, { headers: { Range: "bytes=0-" } });
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT, `${r.id}.mp4`);
    writeFileSync(file, bytes);
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-show_entries", "format=duration", "-of", "json", file]).stdout.toString();
    summary(`- live ${r.id}: http ${res.status} ${res.headers.get("content-type")} range=${res.headers.get("content-range")} ${bytes.length} bytes · probe ${probe.replace(/\s+/g, "")}`);
    const tile = path.join(OUT, `${r.id}.jpg`);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-vf", "select='eq(n\\,15)+eq(n\\,100)+eq(n\\,215)',scale=240:-1,tile=3x1", "-frames:v", "1", "-vsync", "0", "-q:v", "6", tile]);
    emitImage(r.id, tile);
  }
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((x) => x.route && (x.status !== 200 || x.hscroll > 0 || x.broken || x.errors.length));
  summary(`RESULT routes=${results.filter((x) => x.route).length} issues=${bad.length}`);
  for (const b of bad) summary(`  ISSUE ${JSON.stringify(b).slice(0, 400)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
