/**
 * Vercel Serverless Function — dedicated Google Merchant Center feed endpoint.
 *
 * URL (after deploy):  BASE_URL/api/google-feed
 *
 * Paste that URL into Google Merchant Center as a "Scheduled fetch" (or the
 * hosted file for Google Shopping Ads). It reads the live product feed from the
 * same Supabase `kv` table the app writes to, builds `google-feed.xml` with the
 * shared builder in `src/lib/googleFeed.js`, and returns it as an attachment so
 * Merchant Center downloads a clean, versioned file on every poll.
 *
 * Environment variables (same ones the app already uses):
 *   VITE_SUPABASE_URL      required
 *   VITE_SUPABASE_ANON_KEY required
 * Optional overrides:
 *   LIKELINK_BASE_URL      the public origin used in g:link (defaults to the
 *                          inbound request origin, then a hardcoded default)
 *   LIKELINK_CURRENCY      ISO code (default "ILS")
 *   LIKELINK_BRAND         brand for every item (default "Likelink")
 */

import { buildGoogleFeed, FEED_FILE_NAME } from "../src/lib/googleFeed.js";

const SUPABASE_KEY = "marketplace:products";
const MARKETERS_KEY = "marketplace:marketers";

/** UTF-8 encode while keeping non-ASCII (Hebrew) text intact. */
const toUtf8 = (str) =>
  new TextEncoder().encode(str);

/** Read a JSON blob from the Supabase `kv` table via the REST API. */
async function fetchKv(supabaseUrl, supabaseKey, key) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase kv request failed (${res.status}) for ${key}`);
  }
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

// ─── sitemap.xml ────────────────────────────────────────────────────────────
// Merged from api/sitemap.mjs (which is now deleted) so the whole deployment
// stays under the 12-serverless-function limit on the Vercel Hobby plan.
// Dispatched by vercel.json:  /sitemap.xml → /api/google-feed?kind=sitemap
// Logic below is byte-for-byte the original sitemap implementation.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function xmlEscape(s) {
  return String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

async function getMarketers() {
  if (!SB_URL || !SB_KEY) return [];
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent("marketplace:marketers")}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    const v = rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
    return Array.isArray(v) ? v : Object.values(v || {});
  } catch {
    return [];
  }
}

async function getProducts() {
  if (!SB_URL || !SB_KEY) return [];
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent("marketplace:products")}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    const v = rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
    return Array.isArray(v) ? v : Object.values(v || {});
  } catch {
    return [];
  }
}

async function sitemapHandler(req, res) {
  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);
  const proto = String(getH("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = getH("x-forwarded-host") || getH("host") || "likelink.app";
  const origin = `${proto}://${host}`;
  const marketers = await getMarketers();
  const products = await getProducts();
  const now = new Date().toISOString();
  const urls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
    ...marketers.filter((m) => m?.slug).map((m) => ({ loc: `${origin}/u/${encodeURIComponent(m.slug)}`, lastmod: m.updatedAt ? new Date(m.updatedAt).toISOString() : now, priority: "0.8", changefreq: "weekly" })),
    ...products.filter((p) => p?.id && p?.status === "approved").map((p) => ({ loc: `${origin}/p/${encodeURIComponent(p.id)}`, lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString() : now, priority: "0.6", changefreq: "daily" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</mod>` : ""}\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n")}\n</urlset>`;
  res.status(200);
  res.setHeader("content-type", "application/xml; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=3600, s-maxage=3600");
  res.end(xml);
}

export default async function handler(req, res) {
  // ?kind=sitemap → dynamic sitemap.xml (merged in from the deleted
  // api/sitemap.mjs). No param (or kind=google) → the original Google Merchant
  // Center feed, so /api/google-feed keeps working unchanged for Merchant
  // Center's scheduled fetch and the in-app Admin download button.
  const kind = new URL(req.url, "https://x").searchParams.get("kind");
  if (kind === "sitemap") return sitemapHandler(req, res);
  return googleFeedHandler(req, res);
}

async function googleFeedHandler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." }));
    return;
  }

  try {
    const host = req.headers && (req.headers.host || req.headers["x-forwarded-host"]);
    const inferred = host ? `https://${String(host).replace(/:\d+$/, "")}` : "https://www.likelink.com";
    const origin = process.env.LIKELINK_BASE_URL || inferred;
    const [products, marketers] = await Promise.all([
      fetchKv(supabaseUrl, supabaseKey, SUPABASE_KEY),
      fetchKv(supabaseUrl, supabaseKey, MARKETERS_KEY),
    ]);
    const xml = buildGoogleFeed({ products, marketers, baseUrl: origin, currency: process.env.LIKELINK_CURRENCY, brand: process.env.LIKELINK_BRAND });
    const body = toUtf8(xml);
    res.status(200);
    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${FEED_FILE_NAME}"`);
    res.setHeader("content-length", String(body.byteLength));
    res.setHeader("cache-control", "no-store");
    res.setHeader("access-control-allow-origin", "*");
    res.end(body);
  } catch (error) {
    console.error("[google-feed] generation failed", error);
    res.status(500);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: `Failed to build the feed: ${error.message}` }));
  }
}