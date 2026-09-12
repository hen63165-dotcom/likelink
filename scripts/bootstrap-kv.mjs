/**
 * Bootstrap KV store — writes all seed + live products to marketplace:products.
 * 
 * Usage: node scripts/bootstrap-kv.mjs
 * 
 * Requires env vars:
 *   VITE_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 * 
 * This script:
 * 1. Reads SEED_PRODUCTS from src/data/seed.js (includes LIVE_PRODUCTS)
 * 2. Reads existing marketplace:products from KV
 * 3. Merges: keeps existing products with valid attribution, adds new ones
 * 4. Writes back to KV
 * 
 * SAFE: does not delete products, only adds/updates.
 */

import { SEED_PRODUCTS } from "../src/data/seed.js";

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("ERROR: Missing required env vars.");
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function kvGet(key) {
  const res = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kvGet failed: ${res.status}`);
  const data = await res.json();
  if (!data || !data.length) return null;
  const raw = data[0]?.value;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function kvSet(key, value) {
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kvSet failed: ${res.status}`);
}

function deduplicate(existing, incoming) {
  const seen = new Map();
  for (const p of existing || []) {
    if (p && p.id) seen.set(p.id, p);
  }
  for (const p of incoming || []) {
    if (p && p.id && !seen.has(p.id)) seen.set(p.id, p);
  }
  return Array.from(seen.values());
}

async function main() {
  console.log("=== LikeLink KV Bootstrap ===\n");

  // 1. Read existing
  let existing = [];
  try {
    existing = (await kvGet("marketplace:products")) || [];
    console.log(`Existing products in KV: ${existing.length}`);
  } catch (e) {
    console.log(`No existing products (first run): ${e.message}`);
  }

  // 2. Merge
  const merged = deduplicate(existing, SEED_PRODUCTS);
  console.log(`After merge: ${merged.length} products`);

  // 3. Write
  await kvSet("marketplace:products", merged);
  console.log("✅ Written to marketplace:products");

  // 4. Verify
  const verify = (await kvGet("marketplace:products")) || [];
  console.log(`✅ Verified: ${verify.length} products in KV`);

  // 5. Show sample
  const sample = verify.slice(0, 3).map((p) => `  - ${p.id}: ${p.title?.substring(0, 40)}... (${p.image?.substring(0, 50)}...)`);
  console.log("\nSample products:");
  sample.forEach((s) => console.log(s));

  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
