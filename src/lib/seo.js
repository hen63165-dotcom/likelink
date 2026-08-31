/**
 * Dynamic SEO System
 * 
 * Generates unique meta tags for every creator page,
 * helping them rank in Google for their name + products.
 */

export function updatePageSEO(options) {
  const {
    title,
    description,
    image,
    url,
    type = 'website',
    locale = 'he_IL'
  } = options;

  // Update document title
  document.title = title || 'לייקלינק — קניות מהיוצרות המובילות בישראל';

  // Update or create meta tags
  setMetaTag('description', description);
  setMetaTag('og:title', title);
  setMetaTag('og:description', description);
  setMetaTag('og:image', image);
  setMetaTag('og:url', url);
  setMetaTag('og:type', type);
  setMetaTag('og:locale', locale);
  setMetaTag('twitter:card', 'summary_large_image');
  setMetaTag('twitter:title', title);
  setMetaTag('twitter:description', description);
  setMetaTag('twitter:image', image);
  
  // Update canonical link
  setCanonicalUrl(url);
}

function setMetaTag(name, content) {
  if (!content) return;
  
  let tag = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  
  if (!tag) {
    tag = document.createElement('meta');
    if (name.startsWith('og:')) {
      tag.setAttribute('property', name);
    } else {
      tag.setAttribute('name', name);
    }
    document.head.appendChild(tag);
  }
  
  tag.setAttribute('content', content);
}

function setCanonicalUrl(url) {
  if (!url) return;
  
  let link = document.querySelector('link[rel="canonical"]');
  
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  
  link.setAttribute('href', url);
}

// Generate SEO data for a creator page
export function getCreatorSEO(creator, products = []) {
  const name = creator?.name || 'יוצר/ת';
  const productCount = products.length;
  const productNames = products.slice(0, 3).map(p => p.title).join(', ');
  
  const title = `${name} — חנות אונליין | לייקלינק`;
  const description = productCount > 0
    ? `גלו את המוצרים הכי חמים של ${name}: ${productNames}. משלוח מהיר, החזרה חופשית, ומחירים משתלמים.`
    : `חנות האונליין של ${name} בלייקלינק — מוצרים ייחודיים, משלוח מהיר ושירות מעולה.`;
  
  return {
    title,
    description,
    image: creator?.avatar || products[0]?.image || 'https://likelink.vercel.app/og-image.png',
    url: `https://likelink.vercel.app/u/${creator?.slug || creator?.id}`,
    type: 'profile'
  };
}

// Generate SEO data for a product page
export function getProductSEO(product) {
  if (!product) return null;
  
  const title = `${product.title} — ₪${product.price} | לייקלינק`;
  const description = product.description || `קנו ${product.title} ב-₪${product.price} בלייקלינק. משלוח מהיר והחזרה חופשית.`;
  
  return {
    title,
    description,
    image: product.image,
    url: `https://likelink.vercel.app/p/${product.id}`,
    type: 'product'
  };
}

// Generate default SEO for the main pages
export function getDefaultSEO(page = 'home') {
  const pages = {
    home: {
      title: 'לייקלינק — קניות מהיוצרות המובילות בישראל',
      description: 'פלטפורמת האפילייט הכי גדולה בישראל. גלו מוצרים ייחודיים מהיוצרות והיוצרים הכי טובים, עם עמלה על כל מכירה.',
      type: 'website'
    },
    feed: {
      title: 'פיד מוצרים | לייקלינק',
      description: 'גלו את המוצרים הכי חמים באינטרנט — מופעל על ידי יוצרים ישראליים.',
      type: 'website'
    },
    studio: {
      title: 'פתחו סטודיו מכירה | לייקלינק',
      description: 'הצטרפו ללייקלינק והתחילו למכור בקליק. כלי שיווק חכמים, מעקב מכירות, ותשלום מהיר.',
      type: 'website'
    }
  };
  
  return pages[page] || pages.home;
}
