/**
 * CLI script — generate `google-feed.xml` for Google Merchant Center.
 *
 * Reads Likelink products (and marketers) from one of two sources and writes
 * the feed to a file (default: `google-feed.xml` in the project root):
 *
 *   1. A JSON export file containing { products, marketers }
 *        node scripts/generate-google-feed.mjs --input feed-input/products.json
 *   2. Supabase directly (uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from
 *      the environment or a local `.env` file):
 *        node scripts/generate-google-feed.mjs
 *
 * Options:
 *   --input <path>    JSON file with { products, marketers }
 *   --output <path>   output XML path (default ./google-feed.xml)
 *   --base <url>      public origin used in g:link (default https://www.likelink.com)
 *   --currency <code> ISO currency (default ILS)
 *   --brand <name>    brand for every item (default Likelink)
 *
 * Examples:
 *   npm run feed:google -- --input feed-input/products.json
 *   npm run feed:google
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { buildGoogleFeed, FEED_FILE_NAME } from "../src/lib/googleFeed.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");

/** Minimal .env loader (VITE_SUPABASE_* + LIKELINK_*) — no extra dependencies. */
function loadDotEnv() {
  const vars = {};
  try {
    const text = fs.readFileSync(ENV_FILE, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) vars[key] = value;
    }
  } catch {
    /* no .env file — fine */
  }
  return vars;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      opts[key] = next && !next.startsWith("--") ? next : true;
      if (opts[key] !== true) i += 1;
    }
  }
  return opts;
}

/** Load a { products, marketers } JSON file, tolerating a bare products array. */
function loadInputFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return { products: data, marketers: [] };
  if (data && Array.isArray(data.products)) {
    return { products: data.products, marketers: Array.isArray(data.marketers) ? data.marketers : [] };
  }
  throw new Error(`Input file must contain a "products" array (or be a bare array). Got: ${filePath}`);
}

/** Fetch { products, marketers } straight from the Supabase `kv` table. */
async function loadFromSupabase(env) {
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase is not configured. Either pass --input <file> or set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env / the environment."
    );
  }

  async function fetchKv(key) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) throw new Error(`Supabase kv request failed (${res.status}) for ${key}`);
    const rows = await res.json();
    const raw = rows && rows[0] ? rows[0].value : "";
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const [products, marketers] = await Promise.all([
    fetchKv("marketplace:products"),
    fetchKv("marketplace:marketers"),
  ]);
  return { products, marketers };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = { ...loadDotEnv(), ...process.env };

  let data;
  if (opts.input) {
    data = loadInputFile(path.resolve(ROOT, opts.input));
  } else {
    data = await loadFromSupabase(env);
  }

  const baseUrl = opts.base || env.LIKELINK_BASE_URL || "https://www.likelink.com";
  const currency = opts.currency || env.LIKELINK_CURRENCY || "ILS";
  const brand = opts.brand || env.LIKELINK_BRAND || "Likelink";

  const xml = buildGoogleFeed({
    products: data.products,
    marketers: data.marketers,
    baseUrl,
    currency,
    brand,
  });

  const outPath = path.resolve(ROOT, opts.output || FEED_FILE_NAME);
  fs.writeFileSync(outPath, xml, "utf8");

  const items = (xml.match(/<item>/g) || []).length;
  console.log(`[google-feed] wrote ${items} products to ${outPath}`);
  console.log(`[google-feed] g:link base = ${baseUrl} · currency = ${currency} · brand = ${brand}`);
}

main().catch((error) => {
  console.error(`[google-feed] ${error.message}`);
  process.exit(1);
});