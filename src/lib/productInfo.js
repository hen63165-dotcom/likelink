import { fetchOgImage } from "../utils/helpers";

/**
 * Fetch a product's image / title / price from its link.
 *
 * PRIMARY: server-side Netlify Edge Function (/api/fetch-product-info) — no CORS,
 * follows redirects. FALLBACK: client-side fetchOgImage (same-origin/CORS-friendly
 * sites only). Returns partial data when only some fields are found; on total
 * failure returns null fields so the creator can fill them manually.
 */
export async function fetchProductInfo(url) {
  const info = { image: null, title: null, price: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`/api/fetch-product-info?url=${encodeURIComponent(url)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data && data.ok && data.data) {
      info.image = data.data.image ? String(data.data.image) : null;
      info.title = data.data.title ? String(data.data.title) : null;
      info.price = data.data.price != null ? String(data.data.price) : null;
      return info;
    }
  } catch {
    /* edge function unavailable (e.g. plain `npm run dev`) — fall through */
  }
  try {
    info.image = await fetchOgImage(url);
  } catch {
    /* ignore */
  }
  return info;
}
