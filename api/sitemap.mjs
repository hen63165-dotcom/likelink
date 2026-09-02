// Vercel Serverless Function — dynamic sitemap.xml
//
// Generates a live sitemap from the shared kv store so every creator profile
// (/u/<slug>) is discoverable by Google. The SPA alone can't offer this —
// crawlers would only ever see a single empty index.html.
//
// Routed via vercel.json:  /sitemap.xml → /api/sitemap

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

export default async function handler(req) {
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
    ...marketers
      .filter((m) => m?.slug)
      .map((m) => ({
        loc: `${origin}/u/${encodeURIComponent(m.slug)}`,
        lastmod: m.updatedAt ? new Date(m.updatedAt).toISOString() : now,
        priority: "0.8",
        changefreq: "weekly",
      })),
    // Public product showcase pages — every approved product is crawlable
    // and acts as a viral entry point back to the platform.
    ...products
      .filter((p) => p?.id && p?.status === "approved")
      .map((p) => ({
        loc: `${origin}/p/${encodeURIComponent(p.id)}`,
        lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString() : now,
        priority: "0.6",
        changefreq: "daily",
      })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>${
      u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""
    }
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
