// Vercel Serverless Function — combined OG previews (/u/<slug> and /p/:id)
//
// Serves proper Open Graph / Twitter Card meta tags to link-preview crawlers
// (WhatsApp, Facebook, Twitter/X, Telegram, etc.) for BOTH creator profiles
// (/u/<slug>) AND product links (/p/<id>).
//
// Real people still get the normal React app — only known bot user agents get
// this lightweight HTML instead, so their preview card shows the creator's
// name / product title instead of a blank/generic link. Non-bot visitors are
// served the SPA's index.html (fetched from the same deployment) so the URL
// stays identical for humans and crawlers.
//
// Merged from the previous /api/creator-og and /api/product-og endpoints.

import { originFromRequest } from "./_utils/origin.mjs";
import { checkUrlSyntax, safeFetch } from "./_utils/safeUrl.mjs";
import { canonicalProduct, buildProductSeo, renderProductBody } from "../src/lib/discovery/surfaces.js";
import { MEDIA_BUCKET, isValidMediaPath } from "../src/lib/cloud/mediaStore.js";
import { guardPublicRequest, sendGuardRefusal, classifyAgent } from "./_utils/botGuard.mjs";

const BOT_PATTERN =
  /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|redditbot|vkShare|Googlebot|Applebot|Bingbot|SkypeUriPreview|Iframely/i;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name);
  return h ? h[name] : undefined;
}

// Origin for emitted OG URLs — single source of truth (api/_utils/origin.mjs).
// A legacy / unknown / hijacked Host header can never become a canonical URL:
// originFromRequest() falls back to the canonical production origin instead.
function requestOrigin(req) {
  return originFromRequest(req);
}

// ─── /r affiliate forwarder ─────────────────────────────────────────────────
// Merged from api/r.mjs (which is now deleted) so the whole deployment stays
// under the 12-serverless-function limit on the Vercel Hobby plan.
// Dispatched by vercel.json:  /r → /api/og?mode=r   and   /api/r → /api/og?mode=r
function sendRedirect(res, target, status = 302) {
  res.status(status);
  res.setHeader("Location", target);
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end();
}

// Hebrew interstitial for /r links whose destination is not a catalog product
// link (or is broken) — the visitor decides, the server never auto-redirects.
function sendRedirectPage(res, status, heading, destination) {
  const host = destination ? (() => { try { return new URL(destination).hostname; } catch { return ""; } })() : "";
  const body = destination
    ? `<p>הקישור הזה לא שייך למוצר בקטלוג של LikeLink ומוביל אל <strong dir="ltr">${escapeHtml(host)}</strong>.</p><p><a rel="nofollow noopener noreferrer" href="${escapeHtml(destination)}">להמשיך לאתר החיצוני</a></p>`
    : `<p>אפשר לחזור לקטלוג ולבחור מוצר מחדש.</p>`;
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>LikeLink</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#0b0d1a;color:#f4f6ff;display:flex;align-items:center;justify-content:center;min-height:100vh"><main style="max-width:460px;padding:24px;text-align:center;line-height:1.6"><h1 style="font-size:20px">${escapeHtml(heading)}</h1>${body}<p><a href="/" style="color:#9aa3c7">חזרה ל-LikeLink</a></p></main></body></html>`);
}

// Strict kv read: { value } on success (undefined when the row is missing),
// { failed:true } on any network/HTTP/parse failure.
async function readKvStrict(sbUrl, sbKey, key, timeoutMs = 5000) {
  try {
    const r = await fetch(`${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return { failed: true };
    const rows = await r.json();
    if (!Array.isArray(rows)) return { failed: true };
    if (!rows[0]?.value) return { value: undefined };
    let v = JSON.parse(rows[0].value);
    while (typeof v === "string" && v.length) { try { v = JSON.parse(v); } catch { break; } }
    return { value: v };
  } catch {
    return { failed: true };
  }
}

// JSON-LD inside <script>: a "</script>" in any stored field must not end the tag.
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

async function serveMedia(path, res) {
  if (!isValidMediaPath(path)) { res.status(400); res.end("Invalid media path."); return; }
  const sbUrl = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!sbUrl || !anon) { res.status(503); res.end("Media storage is not configured."); return; }
  try {
    const upstream = await fetch(`${sbUrl}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${path}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: AbortSignal.timeout(10000),
    });
    // Denied and missing look the same from outside (never reveal which).
    if (!upstream.ok) { res.status(404); res.setHeader("cache-control", "no-store"); res.end("Not found."); return; }
    const type = String(upstream.headers.get("content-type") || "application/octet-stream").split(";")[0].toLowerCase();
    if (!/^(image|video)\//.test(type)) { res.status(415); res.end("Unsupported media."); return; }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) { res.status(413); res.end("Media too large."); return; }
    res.status(200);
    res.setHeader("content-type", type);
    res.setHeader("x-content-type-options", "nosniff");
    // A stored SVG is inert when opened directly (no scripts, no network).
    if (type === "image/svg+xml") res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    // Short edge cache: a product that loses its approval stops serving soon.
    res.setHeader("cache-control", "public, max-age=600, s-maxage=3600");
    res.end(bytes);
  } catch {
    res.status(502); res.end("Media fetch failed.");
  }
}

export default async function handler(req, res) {
  const origin = requestOrigin(req);
  const url = new URL(req.url, origin);

  // /r?u=<encoded destination URL>&ref=<creator tracking id> — safe affiliate
  // forwarder. Dispatched BEFORE the bot/SPA logic so real browser clicks are
  // redirected, never served the React app.
  if (url.searchParams.get("mode") === "r") {
    // Scraping tools are refused and bursts are rate-limited; neither records a click.
    const refusal = guardPublicRequest(req, "r", { getUa: (r) => getHeader(r, "user-agent") });
    if (refusal) { sendGuardRefusal(res, refusal); return; }
    // Link-preview bots and search crawlers follow the link but are not people:
    // they are redirected without being counted as a click.
    const isCrawler = classifyAgent(getHeader(req, "user-agent")) === "crawler";
    const target = url.searchParams.get("u") || "";
    const productId = String(url.searchParams.get("pid") || "").slice(0, 80);
    const marketerId = String(url.searchParams.get("mid") || "").slice(0, 80) || null;
    const source = String(url.searchParams.get("src") || "affiliate").slice(0, 80);
    const sbUrl = process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Not an open redirect: the destination must be a product link that exists
    // in the catalog (by pid, or the exact stored affiliateUrl). Anything else
    // gets an explicit "you are leaving LikeLink" page instead of a silent 302.
    const catalog = sbUrl && sbKey ? await readKvStrict(sbUrl, sbKey, "marketplace:products", 3500) : { failed: true };
    const products = Array.isArray(catalog.value) ? catalog.value : [];
    const byPid = productId ? products.find((p) => p && String(p.id) === productId) : null;
    const storedTarget = byPid && /^https?:\/\//i.test(String(byPid.affiliateUrl || "")) ? String(byPid.affiliateUrl) : "";
    const destRaw = storedTarget || target;
    if (!destRaw) { sendRedirectPage(res, 400, "הקישור חסר יעד", null); return; }
    let dest;
    try { dest = new URL(destRaw); } catch { sendRedirectPage(res, 400, "הקישור לא תקין", null); return; }
    if (dest.protocol !== "http:" && dest.protocol !== "https:") { sendRedirectPage(res, 400, "הקישור לא תקין", null); return; }
    if (dest.origin === url.origin && dest.pathname.replace(/\/$/, "") === "/r") { sendRedirectPage(res, 400, "הקישור לא תקין", null); return; }
    const knownDestination = Boolean(storedTarget) ||
      products.some((p) => p && String(p.affiliateUrl || "") === dest.href) ||
      products.some((p) => p && String(p.affiliateUrl || "") === target);
    if (!knownDestination) {
      sendRedirectPage(res, 200, "הקישור מוביל לאתר חיצוני", dest.href);
      return;
    }
    const clickProductId = productId || String(products.find((p) => p && (String(p.affiliateUrl || "") === dest.href || String(p.affiliateUrl || "") === target))?.id || "");

    // Server-side affiliate click ledger: persist the click before redirecting.
    // This makes AliExpress outbound attribution reliable even when the browser
    // closes immediately after the tap.
    if (clickProductId && sbUrl && sbKey && !isCrawler) {
      try {
        {
          const key = "marketplace:clicks";
          // Never rewrite the 5,000-entry ledger from a failed/garbled read —
          // skip the ledger write instead (the redirect still happens).
          const ledger = await readKvStrict(sbUrl, sbKey, key, 3500);
          if (ledger.failed) throw new Error("click_ledger_read_failed");
          const clicks = ledger.value === undefined ? [] : ledger.value;
          if (!Array.isArray(clicks)) throw new Error("click_ledger_not_array");
          const productId = clickProductId;
          // Attribution comes from the catalog, not from the (editable) ?mid= param.
          const catalogOwner = products.find((p) => p && String(p.id) === productId)?.marketerId;
          const event = {
            id: `out-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: "outbound_click",
            productId,
            marketerId: catalogOwner ? String(catalogOwner) : marketerId,
            affiliateUrl: dest.toString(),
            source,
            ref: String(url.searchParams.get("ref") || "").slice(0, 80) || null,
            ts: Date.now(),
          };
          const write = await fetch(`${sbUrl}/rest/v1/kv?on_conflict=key`, {
            method: "POST",
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`,
              "content-type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({ key, value: JSON.stringify([...clicks.slice(-4999), event]) }),
            signal: AbortSignal.timeout(3500),
          });
          if (!write.ok) console.warn("[affiliate-redirect] click ledger write failed", write.status);
        }
      } catch (error) {
        console.warn("[affiliate-redirect] click ledger unavailable", error?.message || error);
      }
    }

    sendRedirect(res, dest.toString(), 302);
    return;
  }

  // ─── /api/fetch-product-info (merged from api/fetch-product-info.mjs, now
  // deleted, to stay under the 12-function Hobby limit). Dispatched by
  // vercel.json:  /api/fetch-product-info → /api/og?mode=fetch
  if (url.searchParams.get("mode") === "fetch") {
    return fetchProductInfoHandler(req, res);
  }

  // ─── /api/og?mode=image — same-origin image proxy for first-party video rendering.
  // Strict allowlist prevents this endpoint from becoming an open SSRF proxy.
  // /api/og?mode=media&path=<kind>/<id>/<file> — the private product-images
  // bucket. Storage is asked with the PUBLIC anon key, so the storage.objects
  // RLS policies decide (approved products only); this proxy adds nothing.
  if (url.searchParams.get("mode") === "media") {
    await serveMedia(url.searchParams.get("path") || "", res);
    return;
  }

  if (url.searchParams.get("mode") === "image") {
    const raw = url.searchParams.get("u") || "";
    let target;
    try { target = new URL(raw); } catch {
      res.status(400); res.end("Invalid image URL."); return;
    }
    const allowedHost =
      target.origin === origin ||
      /(^|\.)alicdn\.com$/i.test(target.hostname) ||
      /(^|\.)aliexpress-media\.com$/i.test(target.hostname) ||
      /(^|\.)supabase\.(co|in)$/i.test(target.hostname) ||
      /(^|\.)supabase-storage\.com$/i.test(target.hostname) ||
      // The catalog's own product photos are hosted here (fixed public image
      // CDN; the response must still be an image/* under 8MB).
      /^images\.unsplash\.com$/i.test(target.hostname);
    if (!allowedHost || !["http:","https:"].includes(target.protocol)) {
      res.status(403); res.end("Image host not allowed."); return;
    }
    try {
      const upstream = await fetch(target.href, {
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
        headers: { "user-agent": "Mozilla/5.0", accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
      });
      if (!upstream.ok) { res.status(upstream.status); res.end("Image fetch failed."); return; }
      const type = String(upstream.headers.get("content-type") || "").toLowerCase();
      if (!type.startsWith("image/")) { res.status(415); res.end("Not an image."); return; }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) { res.status(413); res.end("Image too large."); return; }
      res.status(200);
      res.setHeader("content-type", type.split(";")[0]);
      res.setHeader("cache-control", "public, max-age=86400, s-maxage=86400");
      res.setHeader("access-control-allow-origin", origin);
      res.end(bytes);
      return;
    } catch {
      res.status(502); res.end("Image proxy failed."); return;
    }
  }

  // ─── /grow/:id — Growth content OG previews ───────────────────────────────
  // Dispatched by vercel.json: /grow/:id → /api/og?mode=growth&id=:id
  if (url.searchParams.get("mode") === "growth") {
    const growthId = url.searchParams.get("id") || "";
    const sbUrl = process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    let growthAsset = null;
    if (sbUrl && sbKey && growthId) {
      try {
        const gRes = await fetch(
          `${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent("growth:content")}&select=value`,
          { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, signal: AbortSignal.timeout(5000) }
        );
        const gRows = await gRes.json();
        const gContent = gRows?.[0]?.value ? JSON.parse(gRows[0].value) : [];
        growthAsset = (Array.isArray(gContent) ? gContent : []).find((a) => a?.contentId === growthId) || null;
      } catch { /* fallback to generic */ }
    }
    if (growthAsset) {
      const gTitle = `${growthAsset.title} | LikeLink`;
      const gDesc = growthAsset.lunaStory || growthAsset.hooks?.[0]?.text || growthAsset.title || "";
      const gImage = growthAsset.product?.image || `${origin}/luna-face.svg`;
      const gUrl = `${origin}/grow/${encodeURIComponent(growthId)}`;
      const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(gTitle)}</title><meta property="og:title" content="${escapeHtml(gTitle)}"><meta property="og:description" content="${escapeHtml(gDesc.slice(0, 200))}"><meta property="og:image" content="${escapeHtml(gImage)}"><meta property="og:url" content="${escapeHtml(gUrl)}"><meta property="og:type" content="article"><meta property="og:site_name" content="LikeLink"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(gTitle)}"><meta name="twitter:description" content="${escapeHtml(gDesc.slice(0, 200))}"><meta name="twitter:image" content="${escapeHtml(gImage)}"><link rel="canonical" href="${escapeHtml(gUrl)}"></head><body></body></html>`;
      res.status(200);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "public, max-age=3600");
      res.end(html);
      return;
    }
    // Growth asset not found — fall through to generic
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>LikeLink</title><meta property="og:title" content="LikeLink — קניות ממליצות"><meta property="og:image" content="${origin}/luna-face.svg"><meta property="og:site_name" content="LikeLink"></head><body></body></html>`;
    res.status(200);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
    return;
  }

  const slug = url.searchParams.get("slug") || "";
  const productId = url.searchParams.get("id") || "";
  const userAgent = String(getHeader(req, "user-agent") || "");
  if (slug || productId) {
    const refusal = guardPublicRequest(req, "page", { getUa: () => userAgent });
    if (refusal) { sendGuardRefusal(res, refusal); return; }
  }

  // Real visitor — serve the normal React app from the same deployment.
  if (!BOT_PATTERN.test(userAgent) || (!slug && !productId)) {
    try {
      const app = await fetch(`${origin}/index.html`, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      const html = await app.text();
      res.status(200);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "public, max-age=0, must-revalidate");
      res.setHeader("vary", "User-Agent");
      res.end(html);
      return;
    } catch {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
  }

  
  // --- Shared data fetch (creator profile lookup for slug param) ---
  let title = "Likelink";
  let description = "Shop curated product picks, all in one place.";
  const image = `${origin}/icons/icon-512.webp`;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey && slug) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/kv?key=eq.marketplace:marketers&select=value`,
        {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          signal: AbortSignal.timeout(5000),
        }
      );
      const rows = await res.json();
      const marketers = rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
      const marketer = marketers.find((m) => m.slug === slug || m.id === slug);
      if (marketer) {
        title = `${marketer.name} — Likelink`;
        description = `Shop everything ${marketer.name} recommends, all in one place.`;
      }
    } catch {
      // Supabase unreachable — fall back to generic title/description above.
    }
  }

  // --- Product-specific handling (when id param present) ---
  // Fail-closed: unattributed / unknown products get noindex + generic card
  // (never invent marketer or product claims for crawlers).
  let product = null;
  let owner = null;
  if (productId) {
    try {
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (sbUrl && sbKey) {
        const [prodRes, mkRes] = await Promise.all([
          fetch(
            `${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent("marketplace:products")}&select=value`,
            {
              headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
              signal: AbortSignal.timeout(5000),
            }
          ),
          fetch(
            `${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent("marketplace:marketers")}&select=value`,
            {
              headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
              signal: AbortSignal.timeout(5000),
            }
          ),
        ]);
        const prodRows = await prodRes.json();
        const mkRows = await mkRes.json();
        const list = (() => {
          const v = prodRows?.[0]?.value ? JSON.parse(prodRows[0].value) : [];
          return Array.isArray(v) ? v : Object.values(v || {});
        })();
        const marketers = (() => {
          const v = mkRows?.[0]?.value ? JSON.parse(mkRows[0].value) : [];
          return Array.isArray(v) ? v : Object.values(v || {});
        })();
        const found = list.find((p) => p?.id === productId) || null;
        const mk = found ? marketers.find((m) => m && m.id === found.marketerId) : null;
        if (found && mk && found.status === "approved") {
          product = found;
          owner = mk;
        }
      }
    } catch { /* fallback to generic card below */ }

    const attributable = Boolean(product && owner);
    // SEO comes from the Luna discovery surfaces (one canonical source of
    // truth, real product fields only) — the same builder the discovery
    // engine audits, so what is checked is exactly what is served.
    const canonical = attributable ? canonicalProduct(product, owner, origin) : null;
    const seo = attributable ? buildProductSeo(canonical) : null;
    title = attributable ? escapeHtml(seo.title) : "Likelink — המוצר לא זמין";
    description = attributable
      ? escapeHtml(seo.description)
      : "המוצר אינו זמין לאינדוקס או שחסרה בעלות מאומתת.";
    const productImage =
      attributable && product?.image && /^https?:/i.test(product.image)
        ? product.image
        : `${origin}/icons/icon-512.webp`;
    const pageUrl = `${origin}/p/${encodeURIComponent(productId)}`;
    const robots = attributable ? "index,follow" : "noindex,nofollow";
    const jsonLd = attributable && seo.jsonLd ? jsonLdSafe(seo.jsonLd) : "";

    const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="${robots}" />
<link rel="canonical" href="${escapeHtml(pageUrl)}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${escapeHtml(productImage)}" />
<meta property="og:image:alt" content="${escapeHtml(product?.title || "Likelink")}" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Likelink" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${escapeHtml(productImage)}" />
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head>
<body style="margin:0;background:#f7f5f2;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#6f6b63">
<main style="max-width:560px;padding:24px;color:#2b2925">${attributable ? renderProductBody(canonical) : "מוצר לא זמין"}</main>
</body>
</html>`;

    res.status(attributable ? 200 : 404);
    res.setHeader("content-type", "text/html; charset=utf-8");
    // Crawler HTML must never be served from the shared CDN cache to people:
    // a WhatsApp/Googlebot preview fetch used to leave humans on this bare
    // page for 10 minutes (X-Vercel-Cache: HIT). Private + Vary: User-Agent.
    res.setHeader("cache-control", attributable ? "private, max-age=600" : "private, max-age=60");
    res.setHeader("vary", "User-Agent");
    res.end(html);
    return;
  }

  // --- Creator profile card (slug param) ---
  const jsonLd = jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: title.replace(/ — Likelink$/, ""),
      description,
      url: url.href,
      image,
    },
    publisher: { "@type": "Organization", name: "Likelink", url: origin },
  });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:type" content="profile">
<meta property="og:url" content="${escapeHtml(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body></body>
</html>`;

  res.status(200);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "private, max-age=600");
  res.setHeader("vary", "User-Agent");
  res.end(html);
}

// ─── fetch-product-info (merged from api/fetch-product-info.mjs, now deleted,
// to stay under the 12-function Hobby limit). Same behavior, same JSON shape:
//   /api/fetch-product-info?url=<encoded> → { ok, data: { image, title, price } }
function fpiJson(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

function fpiDecodeEntities(s) {
  const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
  return String(s)
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&nbsp;/g, (m) => named[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function fpiGetMeta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? fpiDecodeEntities(m[1]).trim() : null;
}

function fpiGetTitleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? fpiDecodeEntities(m[1]).trim().slice(0, 300) : null;
}

function fpiFindPrice(node) {
  if (!node || typeof node !== "object") return null;
  const t = Array.isArray(node) ? node : [node];
  for (const n of t) {
    if (!n || typeof n !== "object") continue;
    const type = n["@type"];
    if (type === "Product" || type === "Offer") {
      const off = n.offers;
      if (off && typeof off === "object") {
        if (Array.isArray(off) && off[0]) {
          if (off[0].price != null) return off[0].price;
        } else if (off.price != null) {
          return off.price;
        }
      }
      if (n.price != null) return n.price;
      if (n.lowPrice != null) return n.lowPrice;
    }
    for (const v of Object.values(n)) {
      const r = fpiFindPrice(v);
      if (r != null) return r;
    }
  }
  return null;
}

function fpiExtractPrice(html) {
  const metaP = fpiGetMeta(html, "og:price:amount") || fpiGetMeta(html, "product:price:amount");
  if (metaP) return metaP;
  const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    for (const chunk of ld[1].split("</script>")) {
      try {
        const root = JSON.parse(chunk.trim());
        const p = fpiFindPrice(root);
        if (p != null) return String(p);
      } catch { /* ignore malformed JSON-LD */ }
    }
  }
  return null;
}

// Fetch strategies — stores block generic datacenter UAs, so we ladder through
// identities big commerce platforms accept (real Chrome → Googlebot → Bingbot).
const FPI_STRATEGIES = [
  {
    name: "chrome",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en,he;q=0.8",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "upgrade-insecure-requests": "1",
    },
  },
  {
    name: "googlebot",
    headers: {
      "user-agent":
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en;q=0.9",
    },
  },
  {
    name: "bingbot",
    headers: {
      "user-agent":
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en;q=0.9",
    },
  },
];

async function fetchProductInfoHandler(req, res) {
  // base is REQUIRED: req.url is a relative path, and new URL() without a
  // base throws "Invalid URL" — the original standalone function had this
  // bug on Vercel (hidden by the client-side fallback). Fixed here.
  const url = new URL(req.url, "https://x");
  const target = url.searchParams.get("url") || "";
  if (!target) { fpiJson(res, { ok: false, error: "missing url" }); return; }

  let t;
  try { t = checkUrlSyntax(target); } catch { fpiJson(res, { ok: false, error: "invalid url" }); return; }

  // Ladder: try each strategy until one returns parseable content.
  let lastError = "fetch or parse error";
  for (const strategy of FPI_STRATEGIES) {
    try {
      // safeFetch: no internal/private hosts, every redirect hop re-validated.
      const fetchRes = await safeFetch(t.href, {
        signal: AbortSignal.timeout(12000),
        headers: strategy.headers,
      });
      if (!fetchRes.ok) { lastError = `fetch failed: ${fetchRes.status} (${strategy.name})`; continue; }
      const html = await fetchRes.text();
      if (!html || html.length < 200) { lastError = `empty body (${strategy.name})`; continue; }
      const image = fpiGetMeta(html, "og:image") || fpiGetMeta(html, "twitter:image");
      const title = fpiGetMeta(html, "og:title") || fpiGetMeta(html, "twitter:title") || fpiGetTitleTag(html);
      const price = fpiExtractPrice(html);
      if (!image && !title && !price) { lastError = `no metadata (${strategy.name})`; continue; }
      fpiJson(res, { ok: true, data: { image, title, price } });
      return;
    } catch {
      lastError = `fetch or parse error (${strategy.name})`;
      // continue to the next strategy
    }
  }
  fpiJson(res, { ok: false, error: lastError });
}

