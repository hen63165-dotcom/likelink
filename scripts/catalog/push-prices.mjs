#!/usr/bin/env node
// The daily store prices → the cloud copy the live site reads
// (.github/workflows/catalog-sync.yml, after the catalog copy is committed).
//
//   POST /api/store?mode=media-pipeline&op=catalog-prices   (Bearer AUTOPILOT_SECRET)
//
// Sends only the store fields of the listed products in public/snapshot/kv.json
// (price, originalPrice, currency, priceFrom, priceSource, priceCheckedAt, the
// store gallery). The server accepts only newer AliExpress-API checks of
// products it already has, keeps the previous values and reads the write back
// (src/lib/cloud/catalogPrices.js). --dry-run prints the payload and sends nothing.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = String(process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.AUTOPILOT_SECRET || "";
const DRY = process.argv.includes("--dry-run");
const BATCH = 200;
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${l}\n`); };

/** The update rows for the listed products that carry a store-API price (pure). */
export function priceUpdates(kv) {
  return (kv?.keys?.["marketplace:products"] || [])
    .filter((p) => p && p.status === "approved" && p.priceSource === "aliexpress_api" && Number(p.price) > 0)
    .map((p) => ({
      id: p.id,
      price: p.price,
      ...(p.originalPrice != null ? { originalPrice: p.originalPrice } : {}),
      currency: p.currency,
      priceFrom: p.priceFrom === true,
      priceSource: p.priceSource,
      priceCheckedAt: p.priceCheckedAt,
      ...(Array.isArray(p.images) ? { images: p.images } : {}),
    }));
}

async function main() {
  const kv = JSON.parse(readFileSync(new URL("../../public/snapshot/kv.json", import.meta.url), "utf8"));
  const products = priceUpdates(kv);
  summary(`## Store prices → cloud (${products.length} products)`);
  if (DRY) { console.log(JSON.stringify({ products }, null, 1)); return; }
  if (!SECRET) { summary("REQUIRES_CONNECTION: the AUTOPILOT_SECRET secret is missing. Nothing was sent."); process.exitCode = 1; return; }
  // The server reads at most 200 updates per request: send them in batches.
  let failed = false;
  for (let i = 0; i < products.length; i += BATCH) {
    const res = await fetch(`${API}/api/store?mode=media-pipeline&op=catalog-prices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, Origin: API, "content-type": "application/json" },
      body: JSON.stringify({ products: products.slice(i, i + BATCH) }),
      signal: AbortSignal.timeout(60_000),
    });
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    for (const a of json?.applied || []) summary(`- ${a.id}: ₪${a.from.price ?? "—"} (${a.from.priceCheckedAt || "no check"}) → ₪${a.to.price} (${a.to.priceCheckedAt})`);
    for (const r of json?.refused || []) summary(`- ${r.id}: not applied (${r.error})`);
    summary(`HTTP ${res.status} · proof ${json?.proof?.status || json?.error || "none"}`);
    // "not_newer" is the normal answer for a check the cloud already has; any other refusal is a real problem.
    if (!res.ok || !json?.ok || (json.refused || []).some((r) => r.error !== "not_newer")) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
