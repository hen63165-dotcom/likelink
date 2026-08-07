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

/** Empty is allowed (no image); otherwise only http(s) or inline data: images. */
export function isSafeImageUrl(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (v.startsWith("data:image/")) return true;
  return isSafeHttpUrl(v);
}

export function clampNumber(n, min = 0, max = 1e9) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(min, num));
}

/**
 * Inject a creator's AliExpress tracking ID into an affiliate URL.
 * - Only touches aliexpress.com / *.aliexpress.com product URLs.
 * - Leaves click-through track links (s.click.aliexpress.com, ali.pub) untouched.
 * - Never overwrites a URL that already has tracking params (aff_trace_key / aff_platform / aff_short_key).
 */
export function injectAliExpressTracking(url, trackingId) {
  const v = String(url || "").trim();
  if (!v || !trackingId) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase();
    if (host === "s.click.aliexpress.com" || host === "ali.pub") return v;
    if (host !== "aliexpress.com" && !host.endsWith(".aliexpress.com")) return v;
    if (
      u.searchParams.has("aff_trace_key") ||
      u.searchParams.has("aff_platform") ||
      u.searchParams.has("aff_short_key")
    ) {
      return v; // already tracked — don't overwrite
    }
    u.searchParams.set("aff_trace_key", trackingId);
    return u.toString();
  } catch {
    return v;
  }
}

/**
 * Audit helper: list saved products that need a manual tracking-ID fix —
 * those using the placeholder link, belonging to a creator with no tracking ID,
 * or an AliExpress product URL lacking tracking params.
 */
export function findProductsNeedingTracking(products, marketers) {
  const byId = Object.fromEntries((marketers || []).map((m) => [m.id, m]));
  return (products || [])
    .filter((p) => {
      if (!p.affiliateUrl) return true;
      if (/^https:\/\/example\.com\/aff\//.test(p.affiliateUrl)) return true;
      const m = byId[p.marketerId];
      if (!m || !m.trackingId) return true;
      try {
        const u = new URL(p.affiliateUrl);
        const host = u.hostname.toLowerCase();
        if (
          (host === "aliexpress.com" || host.endsWith(".aliexpress.com")) &&
          !u.searchParams.has("aff_trace_key") &&
          !u.searchParams.has("aff_platform")
        ) {
          return true;
        }
      } catch { /* leave URL untouched in audit */ }
      return false;
    })
    .map((p) => ({ id: p.id, title: p.title, url: p.affiliateUrl, marketerId: p.marketerId }));
}

/**
 * Best-effort: fetch an Open Graph preview image from a product link.
 * Follows redirects and parses `og:image`. Returns null on any failure/timeout
 * (cross-origin sites often block browser fetches — callers must treat the
 * result as optional and fall back to the manual Image URL field).
 */
export async function fetchOgImage(url, { timeoutMs = 4000 } = {}) {
  const v = String(url || "").trim();
  if (!isSafeHttpUrl(v)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(v, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    const m =
      text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const img = m ? m[1].trim() : "";
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
