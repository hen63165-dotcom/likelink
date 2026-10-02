// AliExpress Affiliate API adapter (Open Platform, api-sg.aliexpress.com/sync).
// The owner's own affiliate account is the external authority: only it can
// mint a tracked promotion link (s.click.aliexpress.com) and report its
// products. LikeLink never invents a link, a price or an image. Everything here
// comes from the API response, and is written only after a read-back.
//
//   hotproduct.query  → trending products (ship to IL, prices in ILS) with the
//                       owner's own promotion_link → imported into the owner's studio
//   link.generate     → an own tracked link for a product whose current link is
//                       shared by several products (opens the store home page)
//
// Credentials: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID
// (server env only; status reports booleans).
import crypto from "node:crypto";

export const AE_GATEWAY = "https://api-sg.aliexpress.com/sync";
export const AE_ENV = Object.freeze(["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"]);
const arr = (v) => (Array.isArray(v) ? v : []);

export function aeStatus(env = {}) {
  const missing = AE_ENV.filter((k) => !env[k]);
  return { configured: missing.length === 0, missing };
}

/** IOP signature: HMAC-SHA256(secret, sorted key+value pairs), upper hex. */
export function signParams(params, secret) {
  const base = Object.keys(params).filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort().map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", String(secret)).update(base, "utf8").digest("hex").toUpperCase();
}

export async function aeCall(method, biz, { env = {}, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const params = { app_key: env.ALIEXPRESS_APP_KEY, method, sign_method: "sha256", timestamp: String(now), format: "json", v: "2.0", ...biz };
  params.sign = signParams(params, env.ALIEXPRESS_APP_SECRET);
  const res = await fetchImpl(AE_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`aliexpress_provider_http_${res.status}`);
  if (json.error_response) throw new Error(`aliexpress_provider_${json.error_response.code || "error"}:${String(json.error_response.msg || "").slice(0, 80)}`);
  return json;
}

const CATEGORY = [
  [/jewel|accessor|watch|bag|wallet|sunglass/i, "Accessories"],
  [/cloth|apparel|shoe|dress|fashion|underwear/i, "Fashion"],
  [/beauty|health|hair|makeup|cosmetic/i, "Beauty"],
  [/home|garden|kitchen|furniture|light|tool/i, "Home"],
  [/electronic|phone|computer|office|gadget/i, "Tech"],
  [/sport|fitness|outdoor/i, "Fitness"],
  [/mother|kid|baby|toy/i, "Kids"],
  [/pet/i, "Pets"],
];
const categoryOf = (name) => (CATEGORY.find(([re]) => re.test(String(name || ""))) || [null, "Other"])[1];

/** API product → LikeLink product (the owner's studio). Returns null if any real field is missing. */
export function toProduct(x, { marketerId, now = Date.now() } = {}) {
  const link = String(x?.promotion_link || "");
  const image = String(x?.product_main_image_url || "");
  const price = Number(x?.target_sale_price || x?.sale_price);
  const id = String(x?.product_id || "");
  if (!/^https:\/\/s\.click\.aliexpress\.com\//.test(link) || !/^https?:\/\//.test(image) || !(price > 0) || !id) return null;
  return {
    id: `ae-${id}`, marketerId, status: "approved", title: String(x.product_title || "").slice(0, 140), price,
    currency: String(x.target_sale_price_currency || "ILS"), category: categoryOf(x.first_level_category_name),
    image: image.replace(/^http:/, "https:"), affiliateUrl: link, commission: Number(x.commission_rate ? parseFloat(x.commission_rate) : 0) || undefined,
    createdAt: now, updatedAt: now, clicks: 0,
    imageSource: { via: "aliexpress_affiliate_api", itemId: id, itemUrl: x.product_detail_url || null, provenance: "merchant_photo", resolvedAt: new Date(now).toISOString() },
    importSource: "aliexpress-affiliate-api",
  };
}

/**
 * Import trending products from the owner's affiliate account into the owner's
 * studio. It is idempotent (by AliExpress product id and by link), capped per
 * run, and verified by read-back.
 */
export async function importHotProducts({ kvGet, kvSet, env = {}, fetchImpl, now = Date.now(), limit = 6, keywords = "" }) {
  const st = aeStatus(env);
  if (!st.configured) return { ok: false, status: 409, error: "requires_connection", missing: st.missing };
  const marketerId = env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
  const json = await aeCall("aliexpress.affiliate.hotproduct.query", {
    tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE", ship_to_country: "IL",
    page_size: "30", sort: "LAST_VOLUME_DESC", ...(keywords ? { keywords: String(keywords).slice(0, 60) } : {}),
  }, { env, fetchImpl, now });
  const result = json?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
  if (result && Number(result.resp_code) !== 200) return { ok: false, status: 502, error: `aliexpress_resp_${result.resp_code}`, message: String(result.resp_msg || "").slice(0, 120) };
  const raw = arr(result?.result?.products?.product);
  const products = arr(await kvGet("marketplace:products", null));
  if (!products.length) return { ok: false, status: 503, error: "kv_read_failed" };
  const haveIds = new Set(products.map((p) => p?.id));
  const haveLinks = new Set(products.map((p) => p?.affiliateUrl).filter(Boolean));
  const fresh = [];
  for (const x of raw) {
    const p = toProduct(x, { marketerId, now });
    if (!p || haveIds.has(p.id) || haveLinks.has(p.affiliateUrl)) continue;
    fresh.push(p);
    if (fresh.length >= limit) break;
  }
  if (fresh.length) await kvSet("marketplace:products", [...products, ...fresh]);
  const back = arr(await kvGet("marketplace:products", []));
  const verified = fresh.filter((p) => back.some((b) => b?.id === p.id && b.affiliateUrl === p.affiliateUrl));
  const summary = { at: new Date(now).toISOString(), source: "aliexpress.affiliate.hotproduct.query", received: raw.length, imported: verified.length, ids: verified.map((p) => p.id) };
  await kvSet("affiliate:aliexpress:last", summary);
  return { ok: verified.length === fresh.length, status: 200, ...summary };
}

/**
 * Repair shared links: for a product whose link is shared with other products
 * and whose real store page is known (imageSource.itemUrl), ask the owner's
 * account for its own tracked link. The previous link is kept.
 */
export async function repairSharedLinks({ kvGet, kvSet, env = {}, fetchImpl, now = Date.now(), sharedAffiliateLinks, limit = 10 }) {
  const st = aeStatus(env);
  if (!st.configured) return { ok: false, status: 409, error: "requires_connection", missing: st.missing };
  const products = arr(await kvGet("marketplace:products", null));
  if (!products.length) return { ok: false, status: 503, error: "kv_read_failed" };
  const shared = sharedAffiliateLinks(products);
  const targets = products.filter((p) => shared.has(String(p?.affiliateUrl || "").trim()) && /\/item\/\d+\.html/.test(String(p?.imageSource?.itemUrl || ""))).slice(0, limit);
  const needsOwner = products.filter((p) => shared.has(String(p?.affiliateUrl || "").trim()) && !targets.includes(p)).map((p) => p.id);
  if (!targets.length) return { ok: true, status: 200, repaired: 0, needsOwnerLink: needsOwner };
  const json = await aeCall("aliexpress.affiliate.link.generate", {
    tracking_id: env.ALIEXPRESS_TRACKING_ID, promotion_link_type: "0", source_values: targets.map((p) => p.imageSource.itemUrl).join(","),
  }, { env, fetchImpl, now });
  const links = arr(json?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links?.promotion_link);
  const bySource = new Map(links.map((l) => [String(l.source_value), String(l.promotion_link || "")]));
  const changed = new Map();
  for (const p of targets) {
    const link = bySource.get(p.imageSource.itemUrl);
    if (/^https:\/\/s\.click\.aliexpress\.com\//.test(link || "")) changed.set(p.id, link);
  }
  if (changed.size) {
    await kvSet("marketplace:products", products.map((p) => (changed.has(p.id) ? { ...p, affiliateUrl: changed.get(p.id), affiliateSource: { via: "aliexpress.affiliate.link.generate", previous: p.affiliateUrl, at: new Date(now).toISOString() }, updatedAt: now } : p)));
  }
  const back = arr(await kvGet("marketplace:products", []));
  const verified = [...changed].filter(([id, link]) => back.some((b) => b?.id === id && b.affiliateUrl === link)).map(([id]) => id);
  return { ok: verified.length === changed.size, status: 200, repaired: verified.length, ids: verified, needsOwnerLink: needsOwner };
}

/** Once a day at most (affiliate:aliexpress:last), and only with the owner's credentials. */
export async function dailyAffiliateImport({ kvGet, kvSet, env = {}, fetchImpl, now = Date.now() }) {
  if (!aeStatus(env).configured) return { ok: true, outcome: "REQUIRES_CONNECTION" };
  const last = await kvGet("affiliate:aliexpress:last", null);
  if (last?.at && now - Date.parse(last.at) < 20 * 3_600_000) return { ok: true, outcome: "NOT_DUE", last: last.at };
  try {
    const r = await importHotProducts({ kvGet, kvSet, env, fetchImpl, now, limit: 4 });
    return { ok: r.ok, outcome: r.ok ? "IMPORTED" : r.error, imported: r.imported || 0 };
  } catch (e) {
    return { ok: false, outcome: "FAILED", error: String(e?.message || e).slice(0, 160) };
  }
}
