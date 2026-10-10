// After `vite build` (npm "postbuild"): give every catalog product its own
// HTML entry, so a shared /p/<id> link shows THAT product — its title, photo
// and price — in WhatsApp, Facebook, Telegram and search results, on a static
// host with no server (Netlify today). The page is the same app shell people
// always get; only the <head> differs. Vercel keeps rendering /p/:id with
// api/og.mjs; both use the one builder, buildProductSeo (surfaces.js).
//
// The products come from the catalog copy the site ships
// (public/snapshot/kv.json), filtered exactly like the public site
// (buildPublicGraph: approved, attributed, own affiliate link). Media served
// by our own cloud is dropped first (withoutCloudMedia), so no preview points
// at a file that may not answer.
//
// Also writes sitemap-static.xml (served at /sitemap.xml on Netlify by
// public/_redirects; on Vercel /sitemap.xml stays the dynamic feed).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPublicGraph } from "../src/lib/publicDiscovery.js";
import { buildProductSeo, canonicalProduct } from "../src/lib/discovery/surfaces.js";
import { withoutCloudMedia } from "../src/lib/catalogSnapshot.js";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";
import { SIZE_PAGE } from "../src/lib/sizeTool.js";
import { GUIDE } from "../src/lib/guide.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const jsonLdSafe = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

/** The app shell's <head>, rewritten for one product. */
export function productHead(shell, seo, alt = "") {
  let html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`);
  html = setMeta(html, "name", "description", seo.description);
  html = setMeta(html, "name", "robots", seo.robots);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(seo.canonical)}" />`);
  html = setMeta(html, "property", "og:type", "product");
  html = setMeta(html, "property", "og:url", seo.og.url);
  html = setMeta(html, "property", "og:title", seo.og.title);
  html = setMeta(html, "property", "og:description", seo.og.description);
  html = setMeta(html, "property", "og:image", seo.og.image);
  html = setMeta(html, "property", "og:image:alt", alt || seo.og.title);
  html = setMeta(html, "name", "twitter:title", seo.og.title);
  html = setMeta(html, "name", "twitter:description", seo.og.description);
  html = setMeta(html, "name", "twitter:image", seo.og.image);
  if (seo.jsonLd) html = html.replace("</head>", `    <script type="application/ld+json">${jsonLdSafe(seo.jsonLd)}</script>\n  </head>`);
  return html;
}

/** The app shell's <head> for a public section page (title, description, canonical, card). */
export function pageHead(shell, { title, description, canonical, jsonLd = null }) {
  let html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "name", "robots", "index,follow");
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(canonical)}" />`);
  html = setMeta(html, "property", "og:type", "website");
  html = setMeta(html, "property", "og:url", canonical);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  if (jsonLd) html = html.replace("</head>", `    <script type="application/ld+json">${jsonLdSafe(jsonLd)}</script>\n  </head>`);
  return html;
}

/** Section pages a search can land on, each with its own head (the same text the app sets). */
export function sectionPages(origin = PRODUCTION_ORIGIN) {
  const sizeUrl = `${origin}/size`;
  return [
    {
      path: "/size",
      title: `${SIZE_PAGE.seoTitle} | LikeLink2`,
      description: SIZE_PAGE.seoDescription,
      canonical: sizeUrl,
      jsonLd: [
        { "@context": "https://schema.org", "@type": "WebApplication", name: "המודד של לונה", url: sizeUrl, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", inLanguage: "he", description: SIZE_PAGE.seoDescription, offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" } },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: SIZE_PAGE.faq.map((f) => ({ "@type": "Question", name: f.q.he, acceptedAnswer: { "@type": "Answer", text: f.a.he } })) },
      ],
    },
    {
      path: "/guide",
      title: `המדריך החינמי: ${GUIDE.title.he} | LikeLink2`,
      description: "המדריך של לונה: כסף 925, מידת טבעת וצמיד, מואסניט, מתנות, מבצעים אמיתיים, בדיקת קישור והגנת קונה.",
      canonical: `${origin}/guide`,
    },
  ];
}

export function sitemapXml(origin, paths, today) {
  const urls = paths.map((p) => `  <url><loc>${esc(`${origin}${p}`)}</loc><lastmod>${today}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Products and creators the public site lists, from the shipped catalog copy. */
export function listedFromSnapshot(doc) {
  const keys = doc?.keys || {};
  const products = withoutCloudMedia("marketplace:products", Array.isArray(keys["marketplace:products"]) ? keys["marketplace:products"] : []);
  const marketers = Array.isArray(keys["marketplace:marketers"]) ? keys["marketplace:marketers"] : [];
  const graph = buildPublicGraph({ products, marketers, collections: [], clicks: [], videos: [] });
  const raw = new Map(products.map((p) => [p.id, p]));
  const owners = new Map(marketers.map((m) => [m.id, m]));
  return {
    products: graph.products.filter((p) => SAFE_ID.test(String(p.id))).map((p) => ({ product: raw.get(p.id), owner: owners.get(p.marketerId) })).filter((x) => x.product && x.owner),
    creators: graph.creators.filter((c) => SAFE_ID.test(String(c.slug))),
  };
}

export function prerender({ dist = join(ROOT, "dist"), snapshot = join(ROOT, "public/snapshot/kv.json"), origin = PRODUCTION_ORIGIN, now = new Date() } = {}) {
  const shellPath = join(dist, "index.html");
  if (!existsSync(shellPath) || !existsSync(snapshot)) return { pages: 0, skipped: true };
  const shell = readFileSync(shellPath, "utf8");
  const { products, creators } = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8")));
  const rules = [];
  for (const { product, owner } of products) {
    const seo = buildProductSeo(canonicalProduct(product, owner, origin));
    mkdirSync(join(dist, "p"), { recursive: true });
    writeFileSync(join(dist, "p", `${product.id}.html`), productHead(shell, seo, String(product.title || "")));
    rules.push(`/p/${product.id}  /p/${product.id}.html  200`);
  }
  for (const page of sectionPages(origin)) {
    const file = `${page.path.slice(1)}.html`;
    writeFileSync(join(dist, file), pageHead(shell, page));
    rules.push(`${page.path}  /${file}  200`);
  }
  // The per-product and section rules go before the SPA fallback.
  const redirectsPath = join(dist, "_redirects");
  if (existsSync(redirectsPath) && rules.length) {
    const text = readFileSync(redirectsPath, "utf8");
    const at = text.search(/^\/\*\s+\/index\.html\s+200\s*$/m);
    const block = `# Product and section pages with their own preview (scripts/prerender-products.mjs)\n${rules.join("\n")}\n\n`;
    writeFileSync(redirectsPath, at >= 0 ? text.slice(0, at) + block + text.slice(at) : `${text}\n${block}`);
  }
  const today = now.toISOString().slice(0, 10);
  const paths = ["/", "/discover", "/products", "/creators", "/reels", "/trends", "/collections", "/deals", "/guide", "/size", "/pricing", "/legal",
    ...creators.map((c) => `/u/${c.slug}`), ...products.map(({ product }) => `/p/${product.id}`)];
  writeFileSync(join(dist, "sitemap-static.xml"), sitemapXml(origin, paths, today));
  return { pages: products.length, urls: paths.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = prerender();
  console.log(result.skipped ? "prerender: no dist/ or catalog copy, skipped" : `prerender: ${result.pages} product pages, sitemap with ${result.urls} urls`);
}
