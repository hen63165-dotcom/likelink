/**
 * Netlify Function — dedicated Google Merchant Center feed endpoint.
 *
 * URL (after deploy):  BASE_URL/.netlify/functions/google-feed
 *
 * Drop that URL into Google Merchant Center as the feed's "Scheduled fetch"
 * URL. It reads the live product feed from the same Supabase `kv` table the
 * app writes to, builds `google-feed.xml` with the shared builder, and returns
 * it as a downloadable XML file.
 *
 * Environment variables (same ones the app already uses):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * Optional overrides: LIKELINK_BASE_URL, LIKELINK_CURRENCY, LIKELINK_BRAND
 */

import { buildGoogleFeed, FEED_FILE_NAME } from "../src/lib/googleFeed.js";

const SUPABASE_KEY = "marketplace:products";
const MARKETERS_KEY = "marketplace:marketers";

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

export async function handler(event) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      }),
    };
  }

  try {
    const origin =
      process.env.LIKELINK_BASE_URL ||
      (event.headers && event.headers["x-forwarded-host"]
        ? `https://${event.headers["x-forwarded-host"]}`
        : "https://www.likelink.com");

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

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${FEED_FILE_NAME}"`,
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
      body: xml,
      isBase64Encoded: false,
    };
  } catch (error) {
    console.error("[google-feed] generation failed", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: `Failed to build the feed: ${error.message}` }),
    };
  }
}