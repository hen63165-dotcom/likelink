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
import { SECTION_SEO, sectionSeo } from "../src/lib/publicSeo.js";
import { getCreatorSEO } from "../src/lib/seo.js";
import { INDEX_ROBOTS } from "../src/constants/seo.js";

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
  if (seo.jsonLd) html = html.replace("</head>", `    ${pageJsonLd(seo.jsonLd)}\n  </head>`);
  return html;
}

// The page's own JSON-LD carries the id the app's updatePageSEO replaces
// (src/lib/seo.js setJsonLd), so after load there is one, not two.
const pageJsonLd = (data) => `<script type="application/ld+json" id="likelink-jsonld">${jsonLdSafe(data)}</script>`;

/** The app shell's <head> for a public section page (title, description, canonical, card). */
export function pageHead(shell, { title, description, canonical, jsonLd = null, image = "", type = "website" }) {
  let html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "name", "robots", INDEX_ROBOTS);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(canonical)}" />`);
  html = setMeta(html, "property", "og:type", type);
  html = setMeta(html, "property", "og:url", canonical);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  if (image) html = setMeta(html, "property", "og:image", image);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  if (image) html = setMeta(html, "name", "twitter:image", image);
  if (jsonLd) html = html.replace("</head>", `    ${pageJsonLd(jsonLd)}\n  </head>`);
  return html;
}

/** Section pages a search can land on, each with its own head (publicSeo.js — the same head the app sets). */
export function sectionPages(origin = PRODUCTION_ORIGIN) {
  return Object.keys(SECTION_SEO).map((type) => sectionSeo(type, { origin }));
}

/** A creator's storefront head (the same getCreatorSEO the app uses). */
export function creatorPage(creator, products, origin = PRODUCTION_ORIGIN) {
  const seo = getCreatorSEO(creator, products);
  const canonical = `${origin}/u/${encodeURIComponent(creator.slug)}`;
  return { path: `/u/${creator.slug}`, title: seo.title, description: seo.description, canonical, image: /^https?:\/\//i.test(seo.image || "") ? seo.image : "", type: "profile", jsonLd: seo.jsonLd };
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
    // The public product (the raw record, its description without unverified
    // store claims) — the same object the app hands to buildProductSeo.
    products: graph.products.filter((p) => SAFE_ID.test(String(p.id)) && raw.has(p.id)).map((p) => ({ product: p, owner: owners.get(p.marketerId) })).filter((x) => x.product && x.owner),
    creators: graph.creators.filter((c) => SAFE_ID.test(String(c.slug))),
    graph,
  };
}

export function prerender({ dist = join(ROOT, "dist"), snapshot = join(ROOT, "public/snapshot/kv.json"), origin = PRODUCTION_ORIGIN, now = new Date() } = {}) {
  const shellPath = join(dist, "index.html");
  if (!existsSync(shellPath) || !existsSync(snapshot)) return { pages: 0, skipped: true };
  const shell = readFileSync(shellPath, "utf8");
  const { products, creators, graph } = listedFromSnapshot(JSON.parse(readFileSync(snapshot, "utf8")));
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
  // Creator storefronts (/u/<slug>): the link a creator puts in a bio, and a
  // page Google should index as itself, not as a copy of the home page.
  for (const creator of creators) {
    const page = creatorPage(creator, creator.productIds.map((id) => graph.byId.get(id)).filter(Boolean), origin);
    mkdirSync(join(dist, "u"), { recursive: true });
    writeFileSync(join(dist, "u", `${creator.slug}.html`), pageHead(shell, page));
    rules.push(`/u/${creator.slug}  /u/${creator.slug}.html  200`);
  }
  // The per-product and section rules go before the SPA fallback.
  const redirectsPath = join(dist, "_redirects");
  if (existsSync(redirectsPath) && rules.length) {
    const text = readFileSync(redirectsPath, "utf8");
    const at = text.search(/^\/\*\s+\/index\.html\s+200\s*$/m);
    const block = `# Product, section and creator pages with their own head (scripts/prerender-products.mjs)\n${rules.join("\n")}\n\n`;
    writeFileSync(redirectsPath, at >= 0 ? text.slice(0, at) + block + text.slice(at) : `${text}\n${block}`);
  }
  const today = now.toISOString().slice(0, 10);
  const paths = ["/", "/discover", "/products", "/creators", "/reels", "/trends", "/collections", "/deals", "/guide", "/size", "/join", "/pricing", "/legal",
    ...creators.map((c) => `/u/${c.slug}`), ...products.map(({ product }) => `/p/${product.id}`)];
  writeFileSync(join(dist, "sitemap-static.xml"), sitemapXml(origin, paths, today));
  return { pages: products.length, urls: paths.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = prerender();
  console.log(result.skipped ? "prerender: no dist/ or catalog copy, skipped" : `prerender: ${result.pages} product pages, sitemap with ${result.urls} urls`);
}
