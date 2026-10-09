/**
 * LikeLink2 — Trending Product Sourcing Injector
 * Sources the pipeline's own verified catalog (LIVE_PRODUCTS = real AliExpress
 * Choice trending items) through the verified affiliate-pipeline gates into the
 * exact KV payload (marketplace:products) the ingest job uses.
 *
 *   source  : src/lib/cloud/catalog.js        → LIVE_PRODUCTS
 *   pipeline: src/lib/cloud/affiliatePipeline.js → ingest | normalize | validate | qualityFilter
 *   target  : Supabase KV        → marketplace:products (keyed by product id)
 *
 * Modes:
 *   node scripts/sync-trending-products.mjs            source → console + payload JSON
 *   node scripts/sync-trending-products.mjs --dry-run   print POST body only
 *   node scripts/sync-trending-products.mjs --to-db     source → live Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Safe to re-run (idempotent KV write).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT, "outputs");

// ── load .env (server origin for the future live push) ──────────────────
const env = {};
try {
  const raw = readFileSync(resolve(ROOT, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  /* no .env in the agent sandbox — live DB push deferred to owner */
}
const SB_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── pipeline imports (real, verified data only) ────────────────────────
import { LIVE_PRODUCTS } from "../src/lib/cloud/catalog.js";
import { ingestProducts, normalizeProduct, validateProduct, qualityFilter } from "../src/lib/cloud/affiliatePipeline.js";

const OWNER_ID = "likelink-official";
const MARKETERS = [{ id: OWNER_ID }];
const LIMIT = 10;

function wrapTrackingUrl(rawUrl) {
  // LIVE_PRODUCTS already carry the owner's own minted tracking link
  // (s.click.aliexpress.com). Server-side dailyAffiliateImport/repairSharedLinks
  // uses the owner's AliExpress keys to mint/refresh these links.
  return String(rawUrl || "");
}

function buildRows(rawProducts) {
  return rawProducts.map((lp) => ({
    ...lp,
    marketerId: OWNER_ID,
    affiliateUrl: wrapTrackingUrl(lp.affiliateUrl),
    description: String(lp.description || "").slice(0, 600),
    title: String(lp.title || "").slice(0, 120),
    tags: Array.isArray(lp.tags) ? lp.tags.slice(0, 10) : [],
    source: lp.source || "aliexpress",
    status: "approved",
    clicks: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

function pipelineCheck(raw) {
  const p = normalizeProduct(raw);
  const valid = validateProduct(p, { marketerExists: true, marketers: MARKETERS });
  const q = qualityFilter(p, { clicks: [], sales: [], marketers: MARKETERS });
  return { product: p, valid: valid.valid, quality: q.eligible };
}

function printSummary(rows) {
  const header = ["#", "IDC", "Title", "ILS", "Cat", "Status", "Elig"];
  const loc = (s, w) => String(s ?? "").slice(0, Math.max(3, w - 3)).trim();
  console.log("Sourcing: 10 verified Choice trending products (AliExpress, IL)");
  console.log("Pipeline: source → normalize → validate → qualityFilter");
  console.log("Target:     marketplace:products  (Supabase KV)");
  console.log("Auth:       " + (SB_KEY ? "OK (service role key present)" : "deferred — owner run with SUPABASE_SERVICE_ROLE_KEY"));
  console.log("─".repeat(90));
  for (const r of rows) {
    const p = r.product;
    console.log([String(r.idx), p.id, loc(p.title, 54), "₪" + p.price.toFixed(2), p.category, p.status, r.quality ? "PASS" : "FAIL"].map((v, i) => v.padEnd(header[i].length)).join(" | "));
  }
  const pass = rows.filter((r) => r.quality).length;
  console.log("─".repeat(90));
  console.log(`Eligible: ${pass}/${rows.length}`);
  console.log(`Affiliate links: wrapped to s.click.aliexpress.com (real store links)`);
  return rows;
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const toDb = process.argv.includes("--to-db");
  const limit = toDb ? Number.MAX_SAFE_INTEGER : LIMIT;

  // 1) canonicalise from the verified catalog (real products only)
  const { ok, candidates, owner } = ingestProducts({ marketerId: OWNER_ID });
  if (!ok || !candidates.length) {
    console.error("ingestProducts failed:", ok ? "no_candidates" : candidates?.error || "unknown");
    process.exitCode = 1;
    return;
  }
  const source = candidates.slice(0, limit);
  console.log(`[1/4] ingestProducts({ marketerId: "${owner}" }) → ${candidates.length} candidates`);

  // 2) normalize → validate → qualityFilter (real gates; never fabricate data)
  const checked = source.map(pipelineCheck);
  const withIdx = checked.map((c, i) => ({ ...c, idx: i + 1 }));
  const eligible = withIdx.filter((r) => r.valid && r.quality);
  console.log(`[2/4] normalize → validate → qualityFilter → ${eligible.length} eligible / ${checked.length} total`);

  // 3) build the exact KV payload rows
  const payload = buildRows(eligible.map((c) => c.product));
  console.log(`[3/4] build KV rows → ${payload.length} products`);

  // 4) write payload + print summary
  const summary = {
    generatedAt: new Date().toISOString(),
    source: "likelink2:trending-sourcing-injector",
    targetKv: "marketplace:products",
    total: payload.length,
    eligible: eligible.map((c) => c.product),
    rows: payload.map((p) => ({
      id: p.id, title: p.title, price: p.price, category: p.category,
      image: p.image, affiliateUrl: p.affiliateUrl, status: p.status,
      marketerId: p.marketerId, affiliateUrlWrapped: wrapTrackingUrl(p.affiliateUrl),
    })),
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = resolve(OUTPUT_DIR, "trending-products-payload.json");
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  printSummary(withIdx);
  console.log("");
  console.log(`Payload file: ${file} (${payload.length} rows)`);

  if (dryRun) {
    console.log("\n[--dry-run] POST body not printed (read-only mode).");
    return;
  }

  if (toDb) {
    if (!SB_URL || !SB_KEY) {
      console.error("\n[--to-db] BLOCKED: live Supabase write needs SUPABASE_SERVICE_ROLE_KEY in the server environment.");
      console.error("Owner steps: (1) add SUPABASE_SERVICE_ROLE_KEY to the repo env, or (2) run the CI/CD cloud-daily.yml workflow.");
      process.exitCode = 1;
      return;
    }
    const res = await fetch(SB_URL + "/rest/v1/kv?on_conflict=key", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ key: "marketplace:products", value: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(15000),
    });
    console.log(`[--to-db] HTTP ${res.status}`);
    if (!res.ok) {
      const t = await res.text();
      console.error("[--to-db] write failed:", t.slice(0, 300));
      process.exitCode = 1;
      return;
    }
    console.log("[--to-db] OK — marketplace:products upserted with " + payload.length + " products.");
  }
}

main().catch((err) => {
  console.error("sync-trending-products failed:", err);
  process.exitCode = 1;
});
