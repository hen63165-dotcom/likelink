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

function requestOrigin(req) {
  const proto = (getHeader(req, "x-forwarded-proto") || "https").split(",")[0].trim();
  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host") || "likelink.com";
  return `${proto}://${host}`;
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

export default async function handler(req, res) {
  const origin = requestOrigin(req);
  const url = new URL(req.url, origin);

  // /r?u=<encoded destination URL>&ref=<creator tracking id> — safe affiliate
  // forwarder. Dispatched BEFORE the bot/SPA logic so real browser clicks are
  // redirected, never served the React app.
  if (url.searchParams.get("mode") === "r") {
    const target = url.searchParams.get("u") || "";
    void url.searchParams.get("ref");
    if (!target) { res.status(400); res.end("Missing destination (u)."); return; }
    let dest;
    try { dest = new URL(target); } catch { res.status(400); res.end("Invalid destination (u)."); return; }
    if (dest.protocol !== "http:" && dest.protocol !== "https:") { res.status(400); res.end("Invalid destination protocol."); return; }
    if (dest.origin === url.origin && dest.pathname.replace(/\/$/, "") === "/r") { res.status(400); res.end("Redirect loop."); return; }
    sendRedirect(res, dest.toString(), 302);
    return;
  }

  // ─── /api/fetch-product-info (merged from api/fetch-product-info.mjs, now
  // deleted, to stay under the 12-function Hobby limit). Dispatched by
  // vercel.json:  /api/fetch-product-info → /api/og?mode=fetch
  if (url.searchParams.get("mode") === "fetch") {
    return fetchProductInfoHandler(req, res);
  }

  const slug = url.searchParams.get("slug") || "";
  const productId = url.searchParams.get("id") || "";
  const userAgent = String(getHeader(req, "user-agent") || "");

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
  let product = null;
  if (productId) {
    try {
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (sbUrl && sbKey) {
        const res = await fetch(
          `${sbUrl}/rest/v1/kv?key=eq.${encodeURIComponent("marketplace:products")}&select=value`,
          {
            headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        const rows = await res.json();
        const v = rows?.[0]?.value ? JSON.parse(rows[0].value) : [];
        const list = Array.isArray(v) ? v : Object.values(v || {});
        product = list.find((p) => p?.id === productId) || null;
      }
    } catch { /* fallback to generic card below */ }

    title = product?.title
      ? `${escapeHtml(product.title)} — קנייה בקליק`
      : "Likelink — סטודיו חכם שרץ לבד";
    description = product
      ? "הפריט הזה פורסם אוטומטית בעברית לכל רשת · נבחר בקליק בסטודיו של Likelink 💜"
      : "פותחים סטודיו, מדביקים לינק — והמערכת מפרסמת, עוקבת ומשלמת לבד.";
    const productImage = product?.image && /^https?:/i.test(product.image)
      ? product.image
      : `${origin}/icons/icon-512.webp`;
    const pageUrl = `${origin}/p/${encodeURIComponent(productId)}`;

    const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${productImage}" />
<meta property="og:image:alt" content="${escapeHtml(product?.title || "Likelink")}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Likelink" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${productImage}" />
</head>
<body style="margin:0;background:#f7f5f2;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#6f6b63">
<div style="text-align:center;padding:24px">לינק מוצר · נוצר בסטודיו של Likelink 💜</div>
</body>
</html>`;

    res.status(200);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=600");
    res.end(html);
    return;
  }

  // --- Creator profile card (slug param) ---
  const jsonLd = JSON.stringify({
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
<meta property="og:image" content="${image}">
<meta property="og:type" content="profile">
<meta property="og:url" content="${url.href}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body></body>
</html>`;

  res.status(200);
  res.setHeader("content-type", "text/html; charset=utf-8");
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

async function fetchProductInfoHandler(req, res) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") || "";
  if (!target) { fpiJson(res, { ok: false, error: "missing url" }); return; }

  let t;
  try { t = new URL(target); } catch { fpiJson(res, { ok: false, error: "invalid url" }); return; }
  if (t.protocol !== "http:" && t.protocol !== "https:") {
    fpiJson(res, { ok: false, error: "invalid url protocol" });
    return;
  }

  try {
    const fetchRes = await fetch(t.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 LikelinkBot/1.0",
        "accept-language": "en,he;q=0.8",
      },
    });
    if (!fetchRes.ok) { fpiJson(res, { ok: false, error: `fetch failed: ${fetchRes.status}` }); return; }
    const html = await fetchRes.text();
    const image = fpiGetMeta(html, "og:image") || fpiGetMeta(html, "twitter:image");
    const title = fpiGetMeta(html, "og:title") || fpiGetMeta(html, "twitter:title") || fpiGetTitleTag(html);
    const price = fpiExtractPrice(html);
    fpiJson(res, { ok: true, data: { image, title, price } });
  } catch {
    fpiJson(res, { ok: false, error: "fetch or parse error" });
  }
}

