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

export default async function handler(req, res) {
  const origin = requestOrigin(req);
  const url = new URL(req.url, origin);
  const slug = url.searchParams.get("slug") || "";
  const productId = url.searchParams.get("id") || "";
  const userAgent = String(getHeader(req, "user-agent") || "");

  // Real visitor — serve the normal React app from the same deployment.
  if (!BOT_PATTERN.test(userAgent) || (!slug && !productId)) {
    try {
      const app = await fetch(`${origin}/index.html`, { redirect: "follow" });
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
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
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
          { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
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
<meta name="robots" content="noindex" />
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

