// Vercel Serverless Function — creator OG previews (/u/<slug>)
//
// Serves proper Open Graph / Twitter Card meta tags to link-preview crawlers
// (WhatsApp, Facebook, Twitter/X, Telegram, etc.) when someone shares a
// creator's profile link (/u/<slug>).
//
// Real people still get the normal React app — only known bot user agents get
// this lightweight HTML instead, so their preview card shows the creator's
// name and photo instead of a blank/generic link. Non-bot visitors are served
// the SPA's index.html (fetched from the same deployment) so the URL stays
// identical for humans and crawlers.
//
// Ported from netlify/edge-functions/creator-og.js. Routed via vercel.json:
//   /u/:slug  →  /api/creator-og?slug=:slug

const BOT_PATTERN =
  /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|redditbot|vkShare|Googlebot|Applebot|Bingbot|SkypeUriPreview|Iframely/i;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name); // Web Headers
  return h ? h[name] : undefined; // plain Node headers object
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
  const userAgent = String(getHeader(req, "user-agent") || "");

  // Real visitor — serve the normal React app from the same deployment.
  if (!BOT_PATTERN.test(userAgent) || !slug) {
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  let title = "Likelink";
  let description = "Shop curated product picks, all in one place.";
  const image = `${origin}/icons/icon-512.webp`;

  if (supabaseUrl && supabaseKey) {
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
