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
import { AMBASSADOR, lunaHook, lunaStoryText } from "../src/lib/ambassador.js";

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
    // Luna's Google Web Stories — one full-screen story per qualifying product,
    // surfaced by Google Discover ("story, but on Google" growth loop).
    ...products.filter((p) => p?.id && p?.status === "approved" && /^https?:/i.test(String(p.image || ""))).map((p) => ({ loc: `${origin}/story/${encodeURIComponent(p.id)}`, lastmod: now, priority: "0.5", changefreq: "weekly" })),
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
  if (kind === "story") return storyHandler(req, res);
  return googleFeedHandler(req, res);
}

// ─── /story/:id — Luna's Google Web Story per product ───────────────────────
// Merged into this function (12-function Hobby limit): vercel.json rewrites
// /story/:id → /api/google-feed?kind=story&id=:id. A full-screen, tappable
// amp-story — indexable by Google and surfaced in Discover. "Instagram stories,
// but on Google", narrated by Luna, the platform's digital ambassador.
async function storyHandler(req, res) {
  const getH = (n) => (typeof req.headers?.get === "function" ? req.headers.get(n) : req.headers?.[n]);
  const proto = String(getH("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = getH("x-forwarded-host") || getH("host") || "likelink.com";
  const origin = process.env.LIKELINK_BASE_URL || `${proto}://${host}`;

  const id = new URL(req.url, "https://x").searchParams.get("id") || "";
  let product = null;
  try {
    const products = await getProducts();
    product = products.find((p) => p && p.id === id && p.status === "approved") || null;
  } catch { /* handled below */ }

  const image = product && /^https?:/i.test(String(product.image || "")) ? String(product.image).trim() : "";
  if (!product || !image) {
    res.status(404);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><meta charset='utf-8'>הסטורי לא נמצא 💜 Likelink");
    return;
  }

  const hook = lunaHook(product.id);
  const pageUrl = `${origin}/?product=${encodeURIComponent(product.id)}`;
  const canonical = `${origin}/story/${encodeURIComponent(product.id)}`;
  const title = xmlEscape(`${AMBASSADOR.name} מציגה: ${product.title}`.slice(0, 90));
  const desc = xmlEscape(lunaStoryText(product, hook).split("\n")[0]);
  const t = (v) => xmlEscape(v);

  const html = `<!doctype html>
<html ⚡ lang="he">
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-0.1.js"></script>
<title>${title}</title>
<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
<link rel="canonical" href="${canonical}">
<meta name="description" content="${desc}">
<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
<style amp-custom>
  body { font-family: 'Heebo', system-ui, sans-serif; background: #12061f; }
  .grad { background: linear-gradient(180deg, rgba(18,6,31,.15) 0%, rgba(18,6,31,.93) 80%); }
  .txt { color: #fff; padding: 28px; text-align: center; }
  .hook { font-size: 30px; font-weight: 800; line-height: 1.3; margin: 0 0 14px; }
  .name { font-size: 19px; opacity: .95; margin: 0 0 8px; }
  .price { font-size: 24px; font-weight: 700; color: #d9c7ff; margin: 0; }
  .brand { letter-spacing: .2em; font-size: 11px; opacity: .8; text-transform: uppercase; margin: 0 0 14px; }
</style>
</head>
<body>
<amp-story standalone
  title="${title}"
  publisher="Likelink"
  publisher-logo-src="${origin}/icons/icon-512.webp"
  poster-portrait-src="${image}"
  poster-square-src="${image}"
  poster-landscape-src="${image}">
  <amp-story-page id="cover">
    <amp-story-grid-layer template="fill">
      <amp-img src="${image}" width="720" height="1280" layout="responsive" alt="${t(product.title)}"></amp-img>
    </amp-story-grid-layer>
    <amp-story-grid-layer template="vertical" class="grad">
      <p class="brand">Likelink · ${t(AMBASSADOR.name)}</p>
      <h1 class="hook">${t(hook)}</h1>
      <p class="name">${t(product.title)}</p>
      ${Number(product.price) > 0 ? `<p class="price">${Number(product.price)} ₪</p>` : ""}
    </amp-story-grid-layer>
  </amp-story-page>
  <amp-story-page id="cta">
    <amp-story-grid-layer template="fill">
      <amp-img src="${image}" width="720" height="1280" layout="responsive" alt="${t(product.title)}"></amp-img>
    </amp-story-grid-layer>
    <amp-story-grid-layer template="vertical" class="grad">
      <p class="hook">${t(hook)}</p>
      <p class="name">לצפייה ולרכישה בסטודיו 💜</p>
    </amp-story-grid-layer>
    <amp-story-page-outlink layout="nodisplay" cta-accent-color="#6C4CF1">
      <a href="${pageUrl}">קני עכשיו</a>
    </amp-story-page-outlink>
  </amp-story-page>
</amp-story>
</body>
</html>`;

  res.status(200);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=600");
  res.end(html);
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