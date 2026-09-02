// Vercel Serverless Function — product OG previews (/p/:id)
//
// Mirrors api/creator-og for shared PRODUCT links: WhatsApp / Facebook /
// X / Telegram / LinkedIn crawlers receive a beautiful card that says
// "Buy in one tap · made in a Likelink studio" instead of a blank preview.
// Real visitors still get the normal React app (same URL, best of both).
//
// Routed via vercel.json:  /p/:id  →  /api/product-og?id=:id

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
  const id = url.searchParams.get("id") || "";
  const userAgent = String(getHeader(req, "user-agent") || "");

  // Real visitor — serve the normal React app from the same deployment.
  if (!BOT_PATTERN.test(userAgent) || !id) {
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

  let product = null;
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
      product = list.find((p) => p?.id === id) || null;
    }
  } catch { /* fallback to generic card below */ }

  const title = product?.title
    ? `${escapeHtml(product.title)} — קנייה בקליק`
    : "Likelink — סטודיו חכם שרץ לבד";
  const description = product
    ? "הפריט הזה פורסם אוטומטית בעברית לכל רשת · נבחר בקליק בסטודיו של Likelink 💜"
    : "פותחים סטודיו, מדביקים לינק — והמערכת מפרסמת, עוקבת ומשלמת לבד.";
  const image =
    product?.image && /^https?:/i.test(product.image)
      ? product.image
      : `${origin}/icons/icon-512.webp`;
  const pageUrl = `${origin}/p/${encodeURIComponent(id)}`;

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="robots" content="noindex" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:alt" content="${escapeHtml(product?.title || "Likelink")}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Likelink" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head>
<body style="margin:0;background:#f7f5f2;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#6f6b63">
<div style="text-align:center;padding:24px">לינק מוצר · נוצר בסטודיו של Likelink 💜</div>
</body>
</html>`;

  res.status(200);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=600");
  res.end(html);
}