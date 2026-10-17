#!/usr/bin/env node
// A contact sheet of every listed product's store gallery (public/snapshot/kv.json
// `images`), numbered, so a person can choose by eye which photos are clean
// (the product itself, no banner or spec text) before any of them reaches the
// home page (src/lib/looks.js CLEAN_STORE_PHOTOS). Read-only: it opens the
// store CDN images only, never a product page or an affiliate link.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, "audit") : "audit-out";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");

const kv = JSON.parse(readFileSync(new URL("../../public/snapshot/kv.json", import.meta.url), "utf8"));
const raw = kv.keys["marketplace:products"];
const products = typeof raw === "string" ? JSON.parse(raw) : raw;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rows = products
  .map((p) => {
    const imgs = [...new Set([p.image, ...(Array.isArray(p.images) ? p.images : [])].filter((u) => /^https:\/\//.test(String(u || ""))))];
    const cells = imgs.map((u, i) => `<figure><img src="${esc(u)}" alt=""><figcaption>${esc(p.id)} #${i}${u === p.image ? " (now)" : ""}</figcaption></figure>`).join("");
    return `<section><h2>${esc(p.id)} · ${esc(p.title || "")}</h2><div class="g">${cells}</div></section>`;
  })
  .join("");
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:16px;font:14px system-ui,sans-serif;background:#fff;color:#111}
h2{font-size:16px;margin:18px 0 8px}
.g{display:grid;grid-template-columns:repeat(6,220px);gap:10px}
figure{margin:0}img{width:220px;height:220px;object-fit:contain;background:#f2f2f2;display:block}
figcaption{font-size:12px;margin-top:4px}
</style>${rows}`;
const file = path.join(OUT, "gallery.html");
writeFileSync(file, html);
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1420, height: 900 } });
await page.goto(`file://${file}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, "gallery.jpg"), fullPage: true, type: "jpeg", quality: 82 });
await browser.close();
console.log(`gallery sheet: ${products.length} products`);
