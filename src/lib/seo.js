/**
 * Dynamic SEO System
 *
 * Generates unique meta tags for every creator/product page,
 * helping them rank in Google for their name + products.
 * Private/admin/studio surfaces use noindex.
 */

export const PUBLIC_ORIGIN = "https://likelink.com";

export function updatePageSEO(options) {
  const {
    title,
    description,
    image,
    url,
    type = "website",
    locale = "he_IL",
    robots = "index,follow",
    jsonLd = null,
  } = options || {};

  document.title = title || "לייקלינק — קניות מהיוצרות המובילות בישראל";

  setMetaTag("description", description);
  setMetaTag("robots", robots);
  setMetaTag("og:title", title);
  setMetaTag("og:description", description);
  setMetaTag("og:image", image);
  setMetaTag("og:url", url);
  setMetaTag("og:type", type);
  setMetaTag("og:locale", locale);
  setMetaTag("og:site_name", "Likelink");
  setMetaTag("twitter:card", "summary_large_image");
  setMetaTag("twitter:title", title);
  setMetaTag("twitter:description", description);
  setMetaTag("twitter:image", image);

  setCanonicalUrl(url);
  setJsonLd(jsonLd);
}

/** Mark authenticated/admin/studio routes as non-indexable. */
export function setNoIndex(reason = "private") {
  setMetaTag("robots", `noindex,nofollow`);
  setMetaTag("googlebot", "noindex,nofollow");
  void reason;
}

function setMetaTag(name, content) {
  if (!content) return;

  let tag = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    if (name.startsWith("og:") || name.startsWith("fb:")) {
      tag.setAttribute("property", name);
    } else {
      tag.setAttribute("name", name);
    }
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function setCanonicalUrl(url) {
  if (!url) return;

  let link = document.querySelector('link[rel="canonical"]');

  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }

  link.setAttribute("href", url);
}

function setJsonLd(data) {
  const id = "likelink-jsonld";
  let el = document.getElementById(id);
  if (!data) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

// Generate SEO data for a creator page
export function getCreatorSEO(creator, products = []) {
  const name = creator?.name || "יוצר/ת";
  const productCount = products.length;
  const productNames = products
    .slice(0, 3)
    .map((p) => p.title)
    .join(", ");
  const slug = creator?.slug || creator?.id;
  const url = `${PUBLIC_ORIGIN}/u/${encodeURIComponent(slug || "")}`;

  const title = `${name} — חנות אונליין | לייקלינק`;
  const description =
    productCount > 0
      ? `גלו את המוצרים הכי חמים של ${name}: ${productNames}. משלוח מהיר, החזרה חופשית, ומחירים משתלמים.`
      : `חנות האונליין של ${name} בלייקלינק — מוצרים ייחודיים, משלוח מהיר ושירות מעולה.`;

  return {
    title,
    description,
    image: creator?.avatar || products[0]?.image || `${PUBLIC_ORIGIN}/icons/icon-512.webp`,
    url,
    type: "profile",
    robots: "index,follow",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name,
        description,
        url,
        image: creator?.avatar || undefined,
      },
      publisher: { "@type": "Organization", name: "Likelink", url: PUBLIC_ORIGIN },
    },
  };
}

// Generate SEO data for a product page (requires attributable owner)
export function getProductSEO(product, owner = null) {
  if (!product || !owner?.id) return null;

  const title = `${product.title} — ₪${product.price} | לייקלינק`;
  const description =
    product.description ||
    `קנו ${product.title} ב-₪${product.price} בלייקלינק. משלוח מהיר והחזרה חופשית.`;
  const url = `${PUBLIC_ORIGIN}/p/${encodeURIComponent(product.id)}`;
  const creatorUrl = `${PUBLIC_ORIGIN}/u/${encodeURIComponent(owner.slug || owner.id)}`;

  return {
    title,
    description,
    image: product.image || `${PUBLIC_ORIGIN}/icons/icon-512.webp`,
    url,
    type: "product",
    robots: "index,follow",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description,
      image: product.image || undefined,
      url,
      sku: product.id,
      offers: {
        "@type": "Offer",
        priceCurrency: product.currency || "ILS",
        price: String(product.price ?? ""),
        availability: "https://schema.org/InStock",
        url,
      },
      brand: { "@type": "Brand", name: owner.name || "Likelink" },
      isRelatedTo: { "@type": "Person", name: owner.name, url: creatorUrl },
    },
  };
}

// Generate default SEO for the main pages
export function getDefaultSEO(page = "home") {
  const pages = {
    home: {
      title: "לייקלינק — קניות מהיוצרות המובילות בישראל",
      description:
        "פלטפורמת האפילייט הכי גדולה בישראל. גלו מוצרים ייחודיים מהיוצרות והיוצרים הכי טובים, עם עמלה על כל מכירה.",
      type: "website",
      url: `${PUBLIC_ORIGIN}/`,
      robots: "index,follow",
    },
    feed: {
      title: "פיד מוצרים | לייקלינק",
      description: "גלו את המוצרים הכי חמים באינטרנט — מופעל על ידי יוצרים ישראליים.",
      type: "website",
      url: `${PUBLIC_ORIGIN}/feed`,
      robots: "index,follow",
    },
    studio: {
      title: "סטודיו מכירה | לייקלינק",
      description: "הצטרפו ללייקלינק והתחילו למכור בקליק.",
      type: "website",
      url: `${PUBLIC_ORIGIN}/studio`,
      robots: "noindex,nofollow",
    },
    admin: {
      title: "Admin | לייקלינק",
      description: "Private admin area",
      type: "website",
      url: `${PUBLIC_ORIGIN}/admin`,
      robots: "noindex,nofollow",
    },
  };

  return pages[page] || pages.home;
}
