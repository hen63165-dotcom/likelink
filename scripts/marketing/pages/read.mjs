// Reads each public Notion page in read.json with Chrome (Playwright) and writes its visible text,
// its links and a full-page screenshot to page-out/. Run by .github/workflows/page-read.yml.
// Only public notion.site pages without a query string; nothing is clicked except Notion's own toggles.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PAGE_RE = /^https:\/\/[a-z0-9-]+\.notion\.site\/[A-Za-z0-9-]+$/;
const pages = JSON.parse(readFileSync("scripts/marketing/pages/read.json", "utf8"));
mkdirSync("page-out", { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const { name, url } of pages) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad name ${name}`);
  if (!PAGE_RE.test(url)) throw new Error(`not a public notion.site page without a query: ${name}`);
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(15_000);
    for (const toggle of await page.$$('[role="button"][aria-expanded="false"]')) {
      try { await toggle.click({ timeout: 2_000 }); } catch { /* a toggle that will not open stays folded */ }
    }
    await page.waitForTimeout(3_000);
    const text = await page.evaluate(() => document.body.innerText);
    const links = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith("http")))]);
    writeFileSync(`page-out/${name}.txt`, `${text}\n\nLINKS:\n${links.join("\n")}\n`);
    await page.screenshot({ path: `page-out/${name}.png`, fullPage: true, timeout: 30_000 });
    console.log(name, text.length, "chars,", links.length, "links");
  } catch (error) {
    console.log(name, "FAILED", error.message);
    writeFileSync(`page-out/${name}.txt`, `FAILED: ${error.message}\n`);
  }
  await page.close();
}
await browser.close();
