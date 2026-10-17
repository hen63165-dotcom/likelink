// Store prices → the cloud copy the live site reads.
//
// The daily catalog sync (scripts/catalog/sync-aliexpress.mjs, GitHub Actions)
// reads AliExpress's official affiliate API and writes the shipped catalog copy
// (public/snapshot/kv.json). The live pages read marketplace:products from the
// cloud, so the same store fields must reach it too, or a newer store check
// never shows. The server accepts ONLY:
//   • products that already exist in the cloud (never a new one);
//   • the store-price fields + the store gallery, from priceSource aliexpress_api;
//   • a check newer than the stored one (an older run never overwrites a newer);
//   • gallery images on the store's own CDN.
// The previous values are kept (pricePrevious), the write is read back before
// it is reported VERIFIED. Never a title, a link, an owner, a status or a video.
import { assertKvWritable, noteKvReadFailed, readKvResponse } from "./kvReadGuard.js";

const PRODUCTS_KEY = "marketplace:products";
const LOG_KEY = "catalog:prices:log";
const STORE_IMAGE = /^https:\/\/([a-z0-9-]+\.)*(aliexpress-media\.com|alicdn\.com)\/[^\s"'<>]+$/i;
const MAX_UPDATES = 200;
const arr = (v) => (Array.isArray(v) ? v : []);
const time = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : NaN; };

/** One update against the stored product (pure). → { ok, fields } | { ok: false, error } */
export function validatePriceUpdate(u = {}, stored = null, now = Date.now()) {
  const fail = (error) => ({ ok: false, error });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(u.id || ""))) return fail("bad_id");
  if (!stored) return fail("unknown_product");
  if (u.priceSource !== "aliexpress_api") return fail("price_source_not_store_api");
  const price = Number(u.price);
  if (!(Number.isFinite(price) && price > 0 && price < 100000)) return fail("bad_price");
  if (u.currency !== "ILS") return fail("bad_currency");
  const hasOriginal = u.originalPrice != null && u.originalPrice !== "";
  const originalPrice = Number(u.originalPrice);
  if (hasOriginal && !(Number.isFinite(originalPrice) && originalPrice > price && originalPrice < 100000)) return fail("bad_original_price");
  const checked = time(u.priceCheckedAt);
  if (!Number.isFinite(checked) || checked > now + 10 * 60_000) return fail("bad_checked_at");
  if (Number.isFinite(time(stored.priceCheckedAt)) && checked <= time(stored.priceCheckedAt)) return fail("not_newer");
  if (u.images != null && (!Array.isArray(u.images) || u.images.length > 12 || !u.images.every((x) => STORE_IMAGE.test(String(x))))) return fail("bad_image_url");
  return {
    ok: true,
    fields: {
      price,
      ...(hasOriginal ? { originalPrice } : {}),
      currency: "ILS",
      priceFrom: u.priceFrom === true,
      priceSource: "aliexpress_api",
      priceCheckedAt: new Date(checked).toISOString(),
      ...(Array.isArray(u.images) ? { images: u.images.map(String) } : {}),
    },
  };
}

/** Apply the accepted updates (pure). → { products, applied: [{id, from, to}], refused: [{id, error}] } */
export function applyStorePrices(products = [], updates = [], { now = Date.now() } = {}) {
  const byId = new Map(arr(products).map((p) => [String(p?.id || ""), p]));
  const accepted = new Map();
  const refused = [];
  for (const u of arr(updates).slice(0, MAX_UPDATES)) {
    const v = validatePriceUpdate(u, byId.get(String(u?.id || "")) || null, now);
    if (v.ok) accepted.set(String(u.id), v.fields);
    else refused.push({ id: String(u?.id || "").slice(0, 80), error: v.error });
  }
  const applied = [];
  const next = arr(products).map((p) => {
    const f = accepted.get(String(p?.id || ""));
    if (!f) return p;
    applied.push({ id: p.id, from: { price: p.price ?? null, priceCheckedAt: p.priceCheckedAt ?? null }, to: { price: f.price, priceCheckedAt: f.priceCheckedAt } });
    const { originalPrice: _drop, ...rest } = p;
    return { ...rest, ...f, pricePrevious: { price: p.price ?? null, originalPrice: p.originalPrice ?? null, priceCheckedAt: p.priceCheckedAt ?? null }, updatedAt: now };
  });
  return { products: next, applied, refused };
}

function client({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  async function kvRead(k) {
    let res;
    try { res = await fetchImpl(`${url}/rest/v1/kv?key=eq.${encodeURIComponent(k)}&select=value`, { headers: h, signal: AbortSignal.timeout(10000) }); }
    catch { noteKvReadFailed(k); return { ok: false }; }
    const row = await readKvResponse(k, res);
    return row.failed ? { ok: false } : { ok: true, value: row.found ? row.value : null };
  }
  async function kvWrite(k, value) {
    assertKvWritable(k);
    const res = await fetchImpl(`${url}/rest/v1/kv?on_conflict=key`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: k, value: JSON.stringify(value) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
  }
  return { kvRead, kvWrite };
}

/** POST op=catalog-prices (machine auth): validate → write → read back → log. */
export async function syncStorePrices(body = {}, { env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const p = await c.kvRead(PRODUCTS_KEY);
  if (!p.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  const r = applyStorePrices(arr(p.value), arr(body.products), { now });
  if (!r.applied.length) return { ok: true, status: 200, applied: [], refused: r.refused, proof: { status: "NOTHING_NEWER" } };
  await c.kvWrite(PRODUCTS_KEY, r.products);
  const back = await c.kvRead(PRODUCTS_KEY);
  const stored = new Map(arr(back.ok ? back.value : []).map((x) => [String(x?.id || ""), x]));
  const verified = back.ok && r.applied.every((a) => {
    const s = stored.get(String(a.id));
    return Number(s?.price) === a.to.price && s?.priceCheckedAt === a.to.priceCheckedAt;
  });
  const logR = await c.kvRead(LOG_KEY);
  if (logR.ok) await c.kvWrite(LOG_KEY, [...arr(logR.value), { at: new Date(now).toISOString(), applied: r.applied, refused: r.refused, status: verified ? "VERIFIED" : "WRITE_UNVERIFIED" }].slice(-100));
  return { ok: verified, status: verified ? 200 : 500, applied: r.applied, refused: r.refused, proof: { status: verified ? "VERIFIED" : "WRITE_UNVERIFIED", via: `kv_read:${PRODUCTS_KEY}` } };
}
