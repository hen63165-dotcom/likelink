// Reads each public Notion page in read.json with Chrome (Playwright) and writes its visible text,
// its links and a screenshot to page-out/. Run by .github/workflows/page-read.yml.
// Only public notion.site pages without a query string. With `download: true`, the page's .zip
// file block is clicked once and the file is saved (at most 5 MB) for a person to read; it is
// never unpacked or run here.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PAGE_RE = /^https:\/\/[a-z0-9-]+\.notion\.site\/[A-Za-z0-9-]+$/;
const MAX_BYTES = 5 * 1024 * 1024;
const pages = JSON.parse(readFileSync("scripts/marketing/pages/read.json", "utf8"));
mkdirSync("page-out", { recursive: true });

const safeName = (s) => s.replace(/[^A-Za-z0-9._-]/g, "_");

// Notion opens a file block either as a download or in a new tab on its file host; take either.
async function saveOfferedZip(page, name) {
  const fileUrls = [];
  page.context().on("request", (r) => {
    const u = r.url();
    if (/file\.notion\.so|amazonaws\.com|\.zip(\?|$)/.test(u)) fileUrls.push(u);
  });
  const file = page.getByText(/\.zip$/).first();
  const fileName = safeName((await file.innerText()).trim());
  const download = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
  const popup = page.context().waitForEvent("page", { timeout: 30_000 }).catch(() => null);
  await file.click({ timeout: 10_000 });
  const got = await Promise.race([download, popup]);
  let body;
  if (got && typeof got.saveAs === "function") {
    const path = `page-out/${name}-${safeName(got.suggestedFilename())}`;
    await got.saveAs(path);
    return path;
  }
  if (got && typeof got.url === "function") {
    await got.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
    fileUrls.push(got.url());
  }
  await page.waitForTimeout(3_000);
  const url = fileUrls.reverse().find((u) => u.startsWith("https://"));
  if (!url) throw new Error("the file block opened no download and no file address");
  const res = await page.context().request.get(url, { timeout: 30_000 });
  if (!res.ok()) throw new Error(`file answered ${res.status()}`);
  body = await res.body();
  if (body.length > MAX_BYTES) throw new Error(`file too large: ${body.length}`);
  const path = `page-out/${name}-${fileName}`;
  writeFileSync(path, body);
  return path;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const entry of pages) {
  const { name, url } = entry;
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad name ${name}`);
  if (!PAGE_RE.test(url)) throw new Error(`not a public notion.site page without a query: ${name}`);
  const context = await browser.newContext({ viewport: { width: 1100, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(15_000);
    const text = await page.evaluate(() => document.body.innerText);
    const links = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith("http")))]);
    writeFileSync(`page-out/${name}.txt`, `${text}\n\nLINKS:\n${links.join("\n")}\n`);
    await page.screenshot({ path: `page-out/${name}.png`, timeout: 30_000 });
    console.log(name, text.length, "chars,", links.length, "links");
    if (entry.download) {
      try {
        const saved = await saveOfferedZip(page, name);
        console.log(name, "saved", saved);
      } catch (error) {
        console.log(name, "DOWNLOAD FAILED", error.message);
        writeFileSync(`page-out/${name}-download-failed.txt`, `${error.message}\n`);
      }
    }
  } catch (error) {
    console.log(name, "FAILED", error.message);
    writeFileSync(`page-out/${name}-failed.txt`, `${error.message}\n`);
  }
  await context.close();
}
await browser.close();
