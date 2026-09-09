/**
 * Luna's Google Publishing Engine
 * ================================
 * Luna publishes to Google Discover, Google Shopping, and Google Search.
 * No OAuth needed — everything works through code.
 */

import { AMBASSADOR, lunaHook } from '../lib/ambassador.js';
import { trendSummary } from './trends.js';
import { generateContentPack, generatePixarStory } from './contentStudio.js';

/**
 * Generate a Google Web Story for a product.
 * Web Stories appear in Google Discover — massive traffic source.
 */
export function generateWebStory(product, { origin } = {}) {
  if (!product) return null;

  const hook = lunaHook(product.id);
  const image = product.image || '';
  const price = product.price || 0;
  const title = `${AMBASSADOR.name} מציגה: ${product.title}`;

  return {
    id: `story_${product.id}`,
    title: title.slice(0, 90),
    productId: product.id,
    image,
    price,
    hook,
    pages: [
      { type: 'cover', headline: hook, title: product.title, image, price: `₪${price}`, character: AMBASSADOR.name },
      { type: 'benefits', headline: 'למה זה מעניין?', bullets: product.description?.split('.').filter(Boolean).slice(0, 3) || [], image },
      { type: 'cta', headline: `קני עכשיו — ₪${price}`, link: `${origin}/?product=${product.id}`, character: AMBASSADOR.name },
    ],
    metadata: {
      title: title.slice(0, 90),
      description: `${hook} — ${product.title} ב-₪${price} בלד`,
      image,
      canonical: `${origin}/story/${product.id}`,
      keywords: product.tags || [],
    },
  };
}

/**
 * Generate an SEO-optimized content page for Google Search.
 */
export function generateSeoPage(product, { origin } = {}) {
  if (!product) return null;

  const hook = lunaHook(product.id);
  const title = product.title || '';
  const price = product.price || 0;
  const category = product.category || '';

  const seoTitle = `${title} — קני אונליין ב-₪${price} | ${AMBASSADOR.name} ממליצה`;
  const seoDescription = `${hook} — ${title} במחיר של ₪${price} בלבד. משלוח מהיר, החזרה מלאה.`;

  return {
    id: `seo_${product.id}`,
    productId: product.id,
    slug: `buy-${product.id}-${title.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
    seo: { title: seoTitle.slice(0, 60), description: seoDescription.slice(0, 160), canonical: `${origin}/buy/${product.id}` },
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description: product.description,
      image: product.image,
      brand: { '@type': 'Brand', name: 'Likelink' },
      offers: { '@type': 'Offer', price, priceCurrency: 'ILS', availability: 'https://schema.org/InStock' },
      author: { '@type': 'Person', name: AMBASSADOR.name },
    },
    content: { hook, intro: `${hook} — ${product.title} זה אחד המוצרים ש${AMBASSADOR.name} בוחרת להמליץ עליהם.`, benefits: product.description, price: `₪${price}`, cta: 'קני עכשיו' },
  };
}

/**
 * Generate RSS feed for backlinks and syndication.
 */
export function generateRssFeed(products = [], { origin, title = 'Likelink - מוצרים מומלצים' } = {}) {
  const items = products.slice(0, 20).map((p) => {
    const hook = lunaHook(p.id);
    return `<item><title>${esc(p.title)}</title><link>${origin}/?product=${p.id}</link><description>${esc(hook)} — ${esc(p.title)} ב-₪${p.price}</description><pubDate>${new Date(p.createdAt || Date.now()).toUTCString()}</pubDate></item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(title)}</title><link>${origin}</link><description>המוצרים הכי חמים נבחרים על ידי ${AMBASSADOR.name}</description><language>he</language>${items}</channel></rss>`;
}

/**
 * Generate sitemap entries for Google indexing.
 */
export function generateSitemapEntries(products = [], { origin } = {}) {
  const now = new Date().toISOString();
  return [
    ...products.map((p) => ({ loc: `${origin}/?product=${p.id}`, lastmod: now, changefreq: 'daily', priority: '0.8' })),
    ...products.map((p) => ({ loc: `${origin}/buy/${p.id}`, lastmod: now, changefreq: 'weekly', priority: '0.6' })),
    ...products.filter((p) => p.image).map((p) => ({ loc: `${origin}/story/${p.id}`, lastmod: now, changefreq: 'weekly', priority: '0.5' })),
  ];
}

/**
 * Ping Google to index new content.
 */
export async function pingGoogle({ origin } = {}) {
  const sitemapUrl = `${origin}/sitemap.xml`;
  const results = [];
  for (const url of [`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`]) {
    try { const res = await fetch(url, { signal: AbortSignal.timeout(10000) }); results.push({ status: res.status, ok: res.ok }); } catch (e) { results.push({ error: String(e.message || e) }); }
  }
  return results;
}

function esc(s) { return String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[c]); }