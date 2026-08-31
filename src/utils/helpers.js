import { PAYOUT_INTERVAL_DAYS } from "../constants/keys";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const CURRENCY = { he: "₪", en: "$" };

export function money(n, lang = "en") {
  return `${CURRENCY[lang] || "$"}${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

export function slugify(str) {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
      .replace(/^-+|-+$/g, "") || "creator"
  );
}

export function uniqueSlug(base, existingSlugs) {
  let slug = base;
  let i = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

export function getTopCreatorIds(products, n = 3) {
  const totals = {};
  products.forEach((p) => {
    if (p.status === "approved") totals[p.marketerId] = (totals[p.marketerId] || 0) + (p.clicks || 0);
  });
  return new Set(
    Object.entries(totals)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id)
  );
}

export function groupByDay(sales, valueKey, days = 14) {
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  sales.forEach((s) => {
    const key = new Date(s.ts).toISOString().slice(0, 10);
    if (byKey[key]) byKey[key].value += s[valueKey] || 0;
  });
  return buckets;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || "").trim());
}

/** True only for absolute http(s) URLs (blocks javascript:, data:, etc.). */
export function isSafeHttpUrl(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  try {
    const u = new URL(v, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Check if URL is safe (http/https only) */
export function isSafeHttpUrl(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Empty is allowed (no image); otherwise only http(s) or inline data: images. */
export function isSafeImageUrl(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (v.startsWith("data:image/")) return true;
  return isSafeHttpUrl(v);
}

/**
 * Resolve a possibly-relative / protocol-relative URL against a base into an
 * absolute http(s) URL, an inline `data:image/...` URL, or null when unsafe.
 * (og:image values are frequently relative or protocol-relative.)
 */
export function resolveUrl(raw, base) {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (/^data:image\//i.test(v)) return v;
  try {
    const u = new URL(v, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Normalize an image URL to an absolute, safe value (or null). */
export function normalizeImageUrl(raw, base) {
  const url = resolveUrl(raw, base);
  if (!url) return null;
  return /^data:image\//i.test(url) ? url : url;
}

/**
 * Lightweight, dependency-free placeholder shown whenever a product has no
 * usable image, so the UI never renders a broken/empty image slot.
 */
export const DEFAULT_PRODUCT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0%200%20600%20800'%3E%3Crect width='600' height='800' fill='%23f1effb'/%3E%3Cpath fill='%23c1356c' d='M160%20520%20L280%20360%20L400%20520%20Z'/%3E%3Ccircle cx='300' cy='280' r='40' fill='%236c4cf1'/%3E%3C/svg%3E";

/**
 * Wrap ANY retailer product URL into a platform tracking link that carries the
 * creator's tracking id, so every click is attributed and every commission can
 * be paid out — for AliExpress, SHEIN, ASOS, Zara, Amazon, local stores, etc.
 *
 * Result:  <origin>/r?u=<encoded destination>&ref=<trackingId>
 *  - Universal: works for every retailer (no longer AliExpress-only).
 *  - Idempotent: a URL that is already a platform /r link is not re-wrapped —
 *    its `ref` is simply refreshed with the supplied tracking id.
 *  - Safe: only absolute http(s) destinations are wrapped; anything else passes
 *    through unchanged so it can never become an open-redirect.
 */
export function buildAffiliateUrl(destinationUrl, trackingId) {
  const dest = String(destinationUrl || "").trim();
  if (!isSafeHttpUrl(dest)) return dest || "";
  try {
    const u = new URL(dest);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (u.origin === origin && u.pathname.replace(/\/$/, "") === "/r") {
      if (trackingId) u.searchParams.set("ref", trackingId);
      return u.toString();
    }
    const link = new URL("/r", origin);
    link.searchParams.set("u", u.toString());
    if (trackingId) link.searchParams.set("ref", trackingId);
    return link.toString();
  } catch {
    return dest;
  }
}

export function clampNumber(n, min = 0, max = 1e9) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(min, num));
}

/**
 * Inject a creator's tracking id into an affiliate URL.
 *
 * Previously this only handled AliExpress (`aff_trace_key`). It now wraps ANY
 * retailer link (AliExpress, SHEIN, ASOS, Zara, Amazon, local stores, etc.)
 * into a platform tracking link that carries the creator's id, so every click
 * is attributed regardless of the destination store — see `buildAffiliateUrl`.
 * The function name is kept for backwards compatibility with existing callers.
 */
export function injectAliExpressTracking(url, trackingId) {
  return buildAffiliateUrl(url, trackingId);
}

/**
 * Alias for injectAliExpressTracking — works for ANY retailer (not just
 * AliExpress). Kept for a one-word rename so callers read naturally.
 */
export const injectAffiliateTracking = injectAliExpressTracking;

/**
 * Extract the *real destination URL* from an affiliate link.
 *
 * If the link is already a platform `/r?u=<dest>&ref=<id>` tracking link, the
 * destination is pulled from the `u` query-param. If it's a raw retailer URL
 * (AliExpress, SHEIN, Amazon, local store, etc.) it is returned as-is.
 *
 * This is critical for the Capacitor / installed-PWA case where there is no
 * server-side `/r` redirect handler — we resolve to the retailer's real product
 * page and open it directly in the external browser, so clicks always land
 * correctly regardless of the store.
 *
 * @param {string} affiliateUrl  — the stored affiliateUrl (raw or `/r` wrapped)
 * @returns {string} the destination URL (safe to pass to window.open)
 */
export function resolveDestinationUrl(affiliateUrl) {
  const raw = String(affiliateUrl || "").trim();
  if (!raw) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  try {
    const u = new URL(raw, origin);
    // Platform /r tracking link → extract the destination from `u`.
    if (u.origin === origin && u.pathname.replace(/\/$/, "") === "/r") {
      const dest = u.searchParams.get("u");
      if (dest && isSafeHttpUrl(dest)) return dest;
      // No destination param — return empty so caller knows nothing to open.
      return "";
    }
    // Raw retailer URL → open directly.
    return raw;
  } catch {
    // Not a parseable URL (data:, relative, etc.) — pass through.
    return raw;
  }
}

/**
 * Audit helper: list saved products whose affiliate URL is missing, a
 * placeholder, or not yet a platform tracking link — i.e. clicks won't be
 * attributed to the creator through the `/r` forwarder.
 *
 * `handleGetDeal` rebuilds the tracking link on every click as a safety-net, so
 * these products are still tracked at click time; this list just tells the
 * creator which products to re-save so the stored link is clean.
 */
export function findProductsNeedingTracking(products, marketers) {
  const byId = Object.fromEntries((marketers || []).map((m) => [m.id, m]));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (products || [])
    .filter((p) => {
      const url = String(p.affiliateUrl || "").trim();
      if (!url || /^https?:\/\/example\.com\/aff\//i.test(url)) return true;
      if (!byId[p.marketerId]) return true;
      try {
        const u = new URL(url);
        if (u.origin === origin && u.pathname.replace(/\/$/, "") === "/r") return false;
        return true; // raw retailer URL — wrapped at click time, flagged for cleanliness
      } catch {
        return true;
      }
    })
    .map((p) => ({ id: p.id, title: p.title, url: p.affiliateUrl, marketerId: p.marketerId }));
}

/**
 * Best-effort: fetch an Open Graph preview image from a product link.
 * Follows redirects and parses `og:image` (plus `og:image:url`,
 * `og:image:secure_url` and `twitter:image`). Relative / protocol-relative
 * image URLs are resolved against the final (post-redirect) page URL so they
 * are always usable by an <img>. Returns null on any failure/timeout
 * (cross-origin sites often block browser fetches — callers must treat the
 * result as optional and fall back to the manual Image URL field / placeholder).
 */
export async function fetchOgImage(url, { timeoutMs = 8000 } = {}) {
  const v = String(url || "").trim();
  if (!isSafeHttpUrl(v)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(v, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    const base = res.url || v;
    const m =
      text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      text.match(/<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const img = resolveUrl(m ? m[1] : null, base);
    return img && isSafeImageUrl(img) ? img : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Next biweekly payout date (LTK-style). */
export function nextPayoutDate(now = Date.now()) {
  const ANCHOR = new Date("2026-01-01T12:00:00Z").getTime();
  const INTERVAL = PAYOUT_INTERVAL_DAYS * 86400000;
  const cycles = Math.floor((now - ANCHOR) / INTERVAL);
  return new Date(ANCHOR + (cycles + 1) * INTERVAL);
}

/** Format a timestamp as dd/mm/yyyy. */
export function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return day + "/" + month + "/" + d.getFullYear();
}
