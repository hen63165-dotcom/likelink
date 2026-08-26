// Vercel Serverless Function — fetch-product-info
//
// Server-side product-link preview tool (LTK-style). Fetches the target URL
// server-side — no CORS, follows redirects — and extracts og:image, og:title,
// and a price (from Open Graph price meta or JSON-LD Product markup).
// Partial results are fine (e.g. image found, no price).
//
// Called as:  /api/fetch-product-info?url=<encoded>
// Returns:    { ok, data: { image, title, price } }
//
// Ported from netlify/edge-functions/fetch-product-info.js so the same
// endpoint works on Vercel deployments too.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function decodeEntities(s) {
  const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
  return String(s)
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&nbsp;/g, (m) => named[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function getMeta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}

function getTitleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim().slice(0, 300) : null;
}

function findPrice(node) {
  if (!node || typeof node !== "object") return null;
  const t = Array.isArray(node) ? node : [node];
  for (const n of t) {
    if (!n || typeof n !== "object") continue;
    const type = n["@type"];
    if (type === "Product" || type === "Offer") {
      const off = n.offers;
      if (off && typeof off === "object") {
        if (Array.isArray(off) && off[0]) {
          if (off[0].price != null) return off[0].price;
        } else if (off.price != null) {
          return off.price;
        }
      }
      if (n.price != null) return n.price;
      if (n.lowPrice != null) return n.lowPrice;
    }
    for (const v of Object.values(n)) {
      const r = findPrice(v);
      if (r != null) return r;
    }
  }
  return null;
}

function extractPrice(html) {
  const metaP = getMeta(html, "og:price:amount") || getMeta(html, "product:price:amount");
  if (metaP) return metaP;
  const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    for (const chunk of ld[1].split("</script>")) {
      try {
        const root = JSON.parse(chunk.trim());
        const p = findPrice(root);
        if (p != null) return String(p);
      } catch { /* ignore malformed JSON-LD */ }
    }
  }
  return null;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") || "";
  if (!target) return json({ ok: false, error: "missing url" });

  let t;
  try { t = new URL(target); } catch { return json({ ok: false, error: "invalid url" }); }
  if (t.protocol !== "http:" && t.protocol !== "https:") {
    return json({ ok: false, error: "invalid url protocol" });
  }

  try {
    const res = await fetch(t.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 LikelinkBot/1.0",
        "accept-language": "en,he;q=0.8",
      },
    });
    if (!res.ok) return json({ ok: false, error: `fetch failed: ${res.status}` });
    const html = await res.text();
    const image = getMeta(html, "og:image") || getMeta(html, "twitter:image");
    const title = getMeta(html, "og:title") || getMeta(html, "twitter:title") || getTitleTag(html);
    const price = extractPrice(html);
    return json({ ok: true, data: { image, title, price } });
  } catch {
    return json({ ok: false, error: "fetch or parse error" });
  }
}
