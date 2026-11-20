// The lens end to end in a real browser (src/lib/growth/lens.js, the "📸 יש לי צילום מסך" tab on /magic):
// a served build, Chrome on the runner, a real store photo given to the file input, and the answer the
// page shows (the model loads from the CDN and Hugging Face in the browser, as on a phone). Read-only:
// the funnel write goes to a fake endpoint here, so nothing reaches the cloud.
//   AUDIT_BASE=http://127.0.0.1:4173 node scripts/audit/lens-ui.mjs <out dir>
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.AUDIT_BASE || "http://127.0.0.1:4173";
const out = process.argv[2] || "lens-ui";
mkdirSync(out, { recursive: true });
const kv = JSON.parse(readFileSync("public/snapshot/kv.json", "utf8"));
const photos = (kv.keys["marketplace:products"] || []).filter((p) => /^p-live-0[15]$/.test(p.id) || /חצובת סלפי/.test(p.title || "")).slice(0, 3);
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text().slice(0, 160)); });
await page.route("**/api/store**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
let n = 0;
for (const p of photos) {
  const img = await (await fetch(p.image)).arrayBuffer();
  const file = join(out, `photo-${p.id}.jpg`);
  writeFileSync(file, Buffer.from(img));
  await page.goto(`${base}/magic`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /צילום מסך/ }).click();
  const started = Date.now();
  await page.locator('input[type="file"]').setInputFiles(file);
  const answer = page.locator("text=/נראה כמו|אולי:|מתלבטת|נעצרה/").first();
  try {
    await answer.waitFor({ timeout: 240_000 });
    console.log(`${p.id} (${String(p.title).slice(0, 30)}): "${(await answer.innerText()).trim()}" in ${Math.round((Date.now() - started) / 1000)} s`);
    n++;
  } catch { console.log(`${p.id}: no answer within 4 minutes`); }
  await page.screenshot({ path: join(out, `lens-${p.id}.png`), fullPage: false });
}
console.log(`lens ui: ${n} of ${photos.length} answered`);
await browser.close();
