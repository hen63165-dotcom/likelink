// Reads a public Instagram post the owner sent as a style reference (2026-11-14: "make me a video
// like this for the squishy on the site"). This session's container cannot reach instagram.com; a
// runner can. Chrome opens the post's public embed page (no login, no account), saves a screenshot
// and its visible text (the caption), and keeps the post's own video file so a person can study the
// format: the shots, the pace, the on-screen text. The file is a reference for review only. It is
// never edited, reposted or used in a LikeLink2 video (another creator's footage is never ours).
// Only https://www.instagram.com/p|reel/<code>/ with no query string (a share link's tracking token
// is never sent or stored). Output: ig-out/ → the "page-reads" pre-release.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const POST_RE = /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]{5,20}\/$/;
const MAX_BYTES = 40 * 1024 * 1024;
const posts = JSON.parse(readFileSync("scripts/marketing/pages/instagram.json", "utf8"));
mkdirSync("ig-out", { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
for (const { name, url } of posts) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad name ${name}`);
  if (!POST_RE.test(url)) throw new Error(`not a public Instagram post address without a query: ${name}`);
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: "he-IL" });
  const page = await context.newPage();
  const videos = new Set();
  page.on("response", (r) => {
    const type = r.headers()["content-type"] || "";
    if (type.startsWith("video/") || /\.mp4(\?|$)/.test(r.url())) videos.add(r.url().replace(/&bytestart=\d+&byteend=\d+/, ""));
  });
  try {
    await page.goto(`${url}embed/captioned/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(6_000);
    await page.screenshot({ path: `ig-out/${name}-embed.png`, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    // The embed page carries the video address in its markup or starts it when the play button is pressed.
    const inPage = await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.currentSrc || v.src).filter(Boolean));
    inPage.forEach((u) => videos.add(u));
    if (!videos.size) {
      await page.mouse.click(270, 400).catch(() => {});
      await page.waitForTimeout(6_000);
      (await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.currentSrc || v.src).filter(Boolean))).forEach((u) => videos.add(u));
    }
    const html = await page.content();
    for (const m of html.matchAll(/"video_url":"([^"]+)"/g)) videos.add(JSON.parse(`"${m[1]}"`));
    writeFileSync(`ig-out/${name}.txt`, `${text}\n\nVIDEO ADDRESSES FOUND: ${videos.size}\n`);
    console.log(name, "text", text.length, "chars; video addresses:", videos.size);
    let saved = false;
    for (const v of [...videos].filter((u) => u.startsWith("https://"))) {
      try {
        const res = await context.request.get(v, { timeout: 60_000 });
        const body = await res.body();
        if (!res.ok() || body.length < 50_000 || body.length > MAX_BYTES) continue;
        writeFileSync(`ig-out/${name}.mp4`, body);
        console.log(name, "video saved", body.length, "bytes");
        saved = true;
        break;
      } catch (e) { console.log(name, "video fetch failed", e.message); }
    }
    if (!saved) console.log(name, "NO VIDEO SAVED");
  } catch (error) {
    console.log(name, "FAILED", error.message);
    writeFileSync(`ig-out/${name}-failed.txt`, `${error.message}\n`);
  }
  await context.close();
}
await browser.close();
