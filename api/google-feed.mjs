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

export default async function handler(req) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({
        error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }

    try {
    const host = req.headers && (req.headers.host || req.headers["x-forwarded-host"]);
    const inferred = host ? `https://${String(host).replace(/:\d+$/, "")}` : "https://www.likelink.com";
    const origin = process.env.LIKELINK_BASE_URL || inferred;

    const [products, marketers] = await Promise.all([

      fetchKv(supabaseUrl, supabaseKey, SUPABASE_KEY),
      fetchKv(supabaseUrl, supabaseKey, MARKETERS_KEY),
    ]);

    const xml = buildGoogleFeed({
      products,
      marketers,
      baseUrl: origin,
      currency: process.env.LIKELINK_CURRENCY,
      brand: process.env.LIKELINK_BRAND,
    });

    // Careful: we compute the byte length AFTER UTF-8 encoding so Hebrew titles
    // don't produce a wrong Content-Length (breaking the fetch in Merchant Ctr).
    const body = toUtf8(xml);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${FEED_FILE_NAME}"`,
        "content-length": String(body.byteLength),
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("[google-feed] generation failed", error);
    return new Response(
      JSON.stringify({ error: `Failed to build the feed: ${error.message}` }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
}