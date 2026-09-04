#!/usr/bin/env node
// Deletes a product from the live Supabase kv store.
//
// Usage:
//   node scripts/delete-product.mjs               → deletes the known broken watch product
//   node scripts/delete-product.mjs <productId>   → deletes that product
//   node scripts/delete-product.mjs list          → lists all products, deletes nothing
//
// Credentials come from .env (same keys the app uses). A service-role key is
// preferred; the anon key also works because marketplace:products is a
// client-writable key under the current RLS policy.

import { readFileSync } from "node:fs";

const DEFAULT_TARGET = "msd6o730x773mf"; // the broken watch product

// ── load .env (no dotenv dependency) ──
const env = {};
try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch { /* .env missing — process.env only */ }

const SB_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const arg = (process.argv[2] || "").trim();
const target = arg || DEFAULT_TARGET;

if (!SB_URL || !SB_KEY) {
  console.error("✗ Missing Supabase env (VITE_SUPABASE_URL / key). Check .env");
  process.exit(1);
}

const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const key = "marketplace:products";

const res = await fetch(
  `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
  { headers, signal: AbortSignal.timeout(10000) }
);
if (!res.ok) {
  console.error(`✗ Read failed (${res.status}). If this is 401/403, run it from the Admin panel instead.`);
  process.exit(1);
}
const rows = await res.json();
const products = rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
if (!Array.isArray(products)) {
  console.error("✗ Unexpected products shape — aborting (nothing changed).");
  process.exit(1);
}

if (target === "list") {
  console.log(products.length ? products.map((p) => `• ${p.id} · ${p.title || "(no title)"} · ${p.price ?? 0} ₪`).join("\n") : "(no products)");
  process.exit(0);
}

const target_product = products.find((p) => p && p.id === target);
if (!target_product) {
  console.log(`✗ Product "${target}" not found. Current products:`);
  console.log(products.length ? products.map((p) => `• ${p.id} · ${p.title || "(no title)"}`).join("\n") : "(none)");
  process.exit(0);
}

const next = products.filter((p) => p.id !== target);
const up = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ key, value: JSON.stringify(next) }),
  signal: AbortSignal.timeout(10000),
});
if (!up.ok) {
  const body = await up.text().catch(() => "");
  console.error(`✗ Update failed (${up.status}). Nothing changed. ${body.slice(0, 200)}`);
  console.error("  → Fallback: delete it in the app: Admin tab → product → הסרה.");
  process.exit(1);
}

console.log(`✓ Deleted "${target_product.title}" (${target}). ${next.length} products remain.`);
