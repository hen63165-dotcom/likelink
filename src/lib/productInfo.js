import { fetchOgImage } from "../utils/helpers.js";

/**
 * Fetch a product's image / title / price from its link.
 *
 * PRIMARY: server-side Netlify Edge Function (/api/fetch-product-info) — no CORS,
 * follows redirects. FALLBACK: client-side fetchOgImage (same-origin/CORS-friendly
 * sites only). Returns partial data when only some fields are found; on total
 * failure returns null fields so the creator can fill them manually.
 */
export async function fetchProductInfo(url) {
  // reason: why nothing came back, when the server knows (e.g. the store's
  // official connection is not set up) — the Studio says it instead of a guess.
  const info = { image: null, title: null, price: null, currency: null, reason: null };
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
      info.currency = data.data.currency ? String(data.data.currency) : null;
      return info;
    }
    if (data && typeof data.reason === "string") {
      info.reason = data.reason.slice(0, 40);
      return info; // the page is not readable from a browser either
    }
  } catch {
    /* edge function unavailable (e.g. plain `npm run dev`) — fall through */
  }
  // Fallback: client-side og:image preview (same-origin / CORS-friendly sites only).
  try {
    const img = await fetchOgImage(url);
    if (img) info.image = img;
  } catch {
    /* ignore */
  }
  return info;
}
