// Netlify Edge Function — serves proper Open Graph / Twitter Card meta tags
// to link-preview crawlers (WhatsApp, Facebook, Twitter/X, Telegram, etc.)
// when someone shares a creator's profile link (/u/<slug>).
//
// Real people still get the normal React app — only known bot user agents
// get this lightweight HTML instead, so their preview card shows the
// creator's name and photo instead of a blank/generic link.
//
// IMPORTANT: Edge Functions are NOT included in a plain drag-and-drop
// deploy to Netlify Drop. To use this, deploy via the Netlify CLI or a
// Git-connected site instead — see README.md, section "Pretty link
// previews (Open Graph)".

const BOT_PATTERN =
  /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|redditbot|vkShare|Googlebot|Applebot|Bingbot|SkypeUriPreview|Iframely/i;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async (request, context) => {
  const userAgent = request.headers.get("user-agent") || "";
  if (!BOT_PATTERN.test(userAgent)) {
    // Real visitor — let Netlify serve the normal React app.
    return context.next();
  }

  const url = new URL(request.url);
  const slug = url.pathname.split("/").filter(Boolean)[1];
  if (!slug) return context.next();

  const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");
  const SUPABASE_KEY = Deno.env.get("VITE_SUPABASE_ANON_KEY");

  let title = "Likelink";
  let description = "Shop curated product picks, all in one place.";
  const image = `${url.origin}/icons/icon-512.webp`;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/kv?key=eq.marketplace:marketers&select=value`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
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
</head>
<body></body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};

export const config = { path: "/u/*" };
