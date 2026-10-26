// AliExpress Affiliate API adapter (Open Platform, api-sg.aliexpress.com/sync).
// The owner's own affiliate account is the external authority: only it can
// mint a tracked promotion link (s.click.aliexpress.com) and report its
// products. LikeLink never invents a link, a price or an image. Everything here
// comes from the API response, and is written only after a read-back.
//
//   product.query     → deals by category (src/lib/growth/deals.js: cheap for the
//                       category, 95%+ rated, 300+ orders; ship to IL, ILS) with the
//                       owner's own promotion_link → imported into the owner's studio
//   productdetail.get → the items the owner chose on the trend board
//   link.generate     → an own tracked link for a product whose current link is
//                       shared by several products (opens the store home page)
//
// Credentials: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID
// (server env only; status reports booleans).
import crypto from "node:crypto";

export const AE_GATEWAY = "https://api-sg.aliexpress.com/sync";
export const AE_ENV = Object.freeze(["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"]);
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * The credentials as AliExpress expects them. A value pasted into a secret
 * form often carries a line break or spaces around it; AliExpress then answers
 * "InvalidAppKey" (seen 2026-10-16), so every reader trims them here.
 */
export function aeEnv(env = {}) {
  const out = { ...env };
  for (const k of AE_ENV) if (env[k] !== undefined && env[k] !== null) out[k] = String(env[k]).trim();
  return out;
}

export function aeStatus(env = {}) {
  const e = aeEnv(env);
  const missing = AE_ENV.filter((k) => !e[k]);
  return { configured: missing.length === 0, missing };
}

/** IOP signature: HMAC-SHA256(secret, sorted key+value pairs), upper hex. */
export function signParams(params, secret) {
  const base = Object.keys(params).filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort().map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", String(secret)).update(base, "utf8").digest("hex").toUpperCase();
}

export async function aeCall(method, biz, { env: rawEnv = {}, fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = 15_000 } = {}) {
  const env = aeEnv(rawEnv);
  const params = { app_key: env.ALIEXPRESS_APP_KEY, method, sign_method: "sha256", timestamp: String(now), format: "json", v: "2.0", ...biz };
  params.sign = signParams(params, env.ALIEXPRESS_APP_SECRET);
  const res = await fetchImpl(AE_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, timeoutMs))),
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
  // The API sometimes answers a protocol-relative photo address ("//ae01.alicdn.com/…").
  const image = String(x?.product_main_image_url || "").trim().replace(/^\/\//, "https://");
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

/** The ids and links already in the catalog, so an item is never added twice. */
function catalogKeys(products) {
  const ids = new Set();
  const links = new Set();
  for (const p of products) {
    if (p?.affiliateUrl) links.add(p.affiliateUrl);
    const raw = String(p?.aliexpressId || p?.imageSource?.itemId || String(p?.id || "").replace(/^ae-/, "") || "");
    if (/^\d{6,20}$/.test(raw)) ids.add(raw);
  }
  return { ids, links };
}

/**
 * Deals from the owner's affiliate account into the owner's studio
 * (src/lib/growth/deals.js). Every category is read once per run, searched by
 * AliExpress's recent orders, and each item's order count is recorded
 * (src/lib/growth/momentum.js, server-only `deals:momentum`). New products
 * come first from items whose demand is RISING in any category (fastest
 * first), then from a few categories in rotation; a COOLING item is never
 * added. An item is added only when it is cheap for its category, rated 95%+
 * with 300+ orders by AliExpress, not named after a brand, and not already
 * listed. Idempotent (by item id and by link), capped per run and per
 * category, verified by read-back. The numbers are used to choose and are
 * never stored on a product.
 */
export async function importHotProducts({ kvGet, kvSet, env: rawEnv = {}, fetchImpl, now = Date.now(), limit = 6, perCategory = 2, categoryCount = 3, budgetMs = 45_000 }) {
  const env = aeEnv(rawEnv);
  const st = aeStatus(env);
  if (!st.configured) return { ok: false, status: 409, error: "requires_connection", missing: st.missing };
  const { DEAL_CATEGORIES, nextCategories, rankDeals, toDealProduct } = await import("../../src/lib/growth/deals.js");
  const { byMomentum, momentumIndex, momentumSummary, recordReadings } = await import("../../src/lib/growth/momentum.js");
  const marketerId = env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
  const last = await kvGet("affiliate:aliexpress:last", null);
  const { categories, cursor } = nextCategories(last?.cursor || 0, categoryCount);
  const products = arr(await kvGet("marketplace:products", null));
  if (!products.length) return { ok: false, status: 503, error: "kv_read_failed" };
  const have = catalogKeys(products);
  const started = Date.now();
  // The rotation's categories first, so a slow run still adds from them.
  const order = [...categories, ...DEAL_CATEGORIES.filter((c) => !categories.includes(c))];
  const reads = await mapLimit(order, 4, async (category) => {
    // Each request gets only what is left of the budget, so the run ends on time.
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) return { category, error: "time_budget" };
    const json = await aeCall("aliexpress.affiliate.product.query", {
      keywords: category.keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
      ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC",
    }, { env, fetchImpl, now, timeoutMs: left }).catch((e) => ({ error: String(e?.message || e).slice(0, 80) }));
    const result = json?.aliexpress_affiliate_product_query_response?.resp_result;
    if (!result || Number(result.resp_code) !== 200) return { category, error: json?.error || (result ? `aliexpress_resp_${result.resp_code}` : "aliexpress_no_result") };
    return { category, raw: arr(result.result?.products?.product) };
  });
  let store = await kvGet("deals:momentum", null);
  for (const r of reads) if (r.raw) store = recordReadings(store, r.raw, { category: r.category.key, now });
  let momentumSaved = false;
  try { await kvSet("deals:momentum", store); momentumSaved = true; } catch { /* a failed read is never written over */ }
  const index = momentumIndex(store, { now });
  const ranked = new Map(reads.filter((r) => r.raw).map((r) => [r.category.key, byMomentum(rankDeals(r.raw, r.category, { exclude: have.ids }), index)]));
  const fresh = [];
  const perCat = new Map();
  const take = (category, x, why) => {
    if (fresh.length >= limit || (perCat.get(category.key) || 0) >= perCategory) return;
    if (have.ids.has(String(x.product_id))) return;
    const p = toDealProduct(x, { category, marketerId, now });
    if (!p || have.links.has(p.affiliateUrl)) return;
    fresh.push({ p, why, category: category.key });
    have.ids.add(p.aliexpressId);
    have.links.add(p.affiliateUrl);
    perCat.set(category.key, (perCat.get(category.key) || 0) + 1);
  };
  // 1. Rising demand anywhere, the fastest growth first.
  const rising = reads
    .filter((r) => r.raw)
    .flatMap((r) => (ranked.get(r.category.key) || []).map((x) => ({ category: r.category, x, m: index.get(String(x.product_id)) })))
    .filter(({ m }) => m?.state === "RISING")
    .sort((a, b) => (b.m.growth || 0) - (a.m.growth || 0));
  for (const { category, x } of rising) take(category, x, "rising");
  // 2. The categories in turn (their deals, rising first, never cooling).
  for (const category of categories) for (const x of ranked.get(category.key) || []) take(category, x, "rotation");
  const searched = reads.map((r) => (r.raw ? { category: r.category.key, received: r.raw.length, added: perCat.get(r.category.key) || 0 } : { category: r.category.key, error: r.error }));
  if (fresh.length) await kvSet("marketplace:products", [...products, ...fresh.map((f) => f.p)]);
  const back = fresh.length ? arr(await kvGet("marketplace:products", [])) : [];
  const verified = fresh.filter(({ p }) => back.some((b) => b?.id === p.id && b.affiliateUrl === p.affiliateUrl));
  const summary = {
    at: new Date(now).toISOString(), source: "aliexpress.affiliate.product.query", rules: "deals-v2-momentum", cursor, searched,
    momentum: { ...momentumSummary(index), saved: momentumSaved },
    imported: verified.length, ids: verified.map(({ p }) => p.id), why: Object.fromEntries(verified.map(({ p, why }) => [p.id, why])),
  };
  await kvSet("affiliate:aliexpress:last", summary);
  return { ok: verified.length === fresh.length, status: 200, ...summary };
}

/** Runs fn over items with at most `n` at a time, keeping the input order. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/**
 * Exactly the items the owner chose (the trend board → "Add trend products"),
 * re-read on the server from her affiliate account (productdetail.get: ILS,
 * ship to Israel, her tracked link) and added to her studio in the cloud.
 * `items`: [{ id, category?, link? }] — a board category key, or read from the
 * store's own title and category names (guessCategory);
 * `link` is her own s.click link when she pasted one (kept exactly).
 */
export async function importChosenItems(items = [], { kvGet, kvSet, env: rawEnv = {}, fetchImpl, now = Date.now() } = {}) {
  const env = aeEnv(rawEnv);
  const st = aeStatus(env);
  if (!st.configured) return { ok: false, status: 409, error: "requires_connection", missing: st.missing };
  const { dealCategory, guessCategory, ownerPickCheck, toDealProduct } = await import("../../src/lib/growth/deals.js");
  const wanted = arr(items)
    .map((it) => ({ id: String(it?.id || ""), category: dealCategory(String(it?.category || "")), link: String(it?.link || "").trim() }))
    .filter((it) => /^\d{6,20}$/.test(it.id))
    .slice(0, 20);
  if (!wanted.length) return { ok: false, status: 400, error: "no_items" };
  const marketerId = env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
  const products = arr(await kvGet("marketplace:products", null));
  if (!products.length) return { ok: false, status: 503, error: "kv_read_failed" };
  const json = await aeCall("aliexpress.affiliate.productdetail.get", {
    product_ids: [...new Set(wanted.map((w) => w.id))].join(","), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
  }, { env, fetchImpl, now });
  const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  if (!result) return { ok: false, status: 502, error: "aliexpress_no_result" };
  if (Number(result.resp_code) !== 200) return { ok: false, status: 502, error: `aliexpress_resp_${result.resp_code}` };
  const found = new Map(arr(result.result?.products?.product).map((x) => [String(x.product_id), x]));
  const have = catalogKeys(products);
  const fresh = [];
  const report = [];
  for (const w of wanted) {
    const x = found.get(w.id);
    if (have.ids.has(w.id)) { report.push({ id: w.id, status: "ALREADY_ON_SITE" }); continue; }
    if (!x) { report.push({ id: w.id, status: "NOT_RETURNED" }); continue; }
    w.category = w.category || guessCategory(x);
    if (!w.category) { report.push({ id: w.id, status: "UNKNOWN_CATEGORY" }); continue; }
    // The owner chose it: a shekel price, the brand rule and the unlisted kinds still hold.
    const check = ownerPickCheck(x, w.category);
    if (!check.ok) { report.push({ id: w.id, status: check.reason.toUpperCase() }); continue; }
    const p = toDealProduct(x, { category: w.category, marketerId, now, link: /^https:\/\/s\.click\.aliexpress\.com\//.test(w.link) ? w.link : "" });
    if (!p) { report.push({ id: w.id, status: "MISSING_REAL_FIELDS" }); continue; }
    if (have.links.has(p.affiliateUrl)) { report.push({ id: w.id, status: "LINK_ALREADY_USED" }); continue; }
    fresh.push(p);
    have.ids.add(w.id);
    have.links.add(p.affiliateUrl);
    report.push({ id: w.id, status: "ADDED", product: p.id, title: p.title, price: p.price });
  }
  if (fresh.length) await kvSet("marketplace:products", [...products, ...fresh]);
  const back = fresh.length ? arr(await kvGet("marketplace:products", [])) : [];
  const verified = new Set(fresh.filter((p) => back.some((b) => b?.id === p.id && b.affiliateUrl === p.affiliateUrl)).map((p) => p.id));
  for (const r of report) if (r.status === "ADDED" && !verified.has(r.product)) r.status = "NOT_VERIFIED";
  const log = arr(await kvGet("catalog:import:log", []));
  await kvSet("catalog:import:log", [{ at: new Date(now).toISOString(), report }, ...log].slice(0, 30));
  return { ok: verified.size === fresh.length, status: 200, added: verified.size, report };
}

/**
 * Repair shared links: for a product whose link is shared with other products
 * and whose real store page is known (imageSource.itemUrl), ask the owner's
 * account for its own tracked link. The previous link is kept.
 */
export async function repairSharedLinks({ kvGet, kvSet, env: rawEnv = {}, fetchImpl, now = Date.now(), sharedAffiliateLinks, limit = 10 }) {
  const env = aeEnv(rawEnv);
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

// aliexpress.us item ids are the global id + 2^51 (e.g. 3256804734954745 ↔ 1005004921269497).
const US_OFFSET = 2n ** 51n;
const AE_ITEM = /\/item\/(\d{10,20})\.html/;
// The addresses the Studio may resolve: the owner's tracked links and the store's own pages.
const AE_LINK_HOST = /^((s\.click|a|www|m|[a-z]{2})\.)?aliexpress\.(com|us)$/i;

/** The global AliExpress item id in a store address ("" when there is none). */
export function aliexpressItemId(url) {
  const m = String(url || "").match(AE_ITEM);
  if (!m) return "";
  const n = BigInt(m[1]);
  return String(n >= US_OFFSET + 1000000000000000n ? n - US_OFFSET : n);
}

/**
 * The store item an AliExpress address opens. A product page names it; a
 * tracked link (s.click.aliexpress.com) is asked once, its redirect is NOT
 * followed — only the first answer's Location (or body) is read.
 */
export async function aliexpressItemFromLink(link, fetchImpl = globalThis.fetch) {
  let u;
  try { u = new URL(String(link || "").trim()); } catch { return ""; }
  if (u.protocol !== "https:" || !AE_LINK_HOST.test(u.hostname)) return "";
  const direct = aliexpressItemId(u.href);
  if (direct) return direct;
  try {
    const res = await fetchImpl(u.href, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    const where = res.headers.get("location") || (await res.text()).slice(0, 4000);
    return aliexpressItemId(where);
  } catch {
    return "";
  }
}

/**
 * Title, store photos and price of the product an AliExpress link opens, from
 * the owner's affiliate account (productdetail.get, ILS, shipping to Israel) —
 * the store's page itself answers servers with a slider check, which is never
 * worked around. null when the account is not connected or the store does not
 * return the item. Nothing is invented: every field is the store's own.
 */
export async function aliexpressProductInfo(link, { env: rawEnv = {}, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const env = aeEnv(rawEnv);
  if (!aeStatus(env).configured) return null;
  const itemId = await aliexpressItemFromLink(link, fetchImpl);
  if (!itemId) return null;
  const json = await aeCall("aliexpress.affiliate.productdetail.get", {
    product_ids: itemId, target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
  }, { env, fetchImpl, now });
  const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  if (!result || Number(result.resp_code) !== 200) return null;
  const x = arr(result.result?.products?.product).find((p) => String(p?.product_id) === itemId);
  if (!x) return null;
  const https = (v) => String(v || "").trim().replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  const images = [x.product_main_image_url, ...arr(x.product_small_image_urls?.string)]
    .map(https).filter((v, i, a) => /^https:\/\/\S+$/.test(v) && a.indexOf(v) === i).slice(0, 8);
  const price = Number(x.target_sale_price);
  const ils = price > 0 && String(x.target_sale_price_currency || "") === "ILS";
  return {
    title: String(x.product_title || "").trim().slice(0, 200) || null,
    image: images[0] || null,
    images,
    price: ils ? Math.round(price * 100) / 100 : null,
    currency: ils ? "ILS" : null,
    source: "aliexpress_api",
    itemId,
    checkedAt: new Date(now).toISOString(),
  };
}

/** An AliExpress address (the owner's tracked link or a store page). */
export function isAliExpressLink(link) {
  try {
    const u = new URL(String(link || "").trim());
    return u.protocol === "https:" && AE_LINK_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The Studio's "בדיקת הקישור" for an AliExpress link: the store's own data, or
 * the exact reason there is none. The store's pages answer servers with a
 * slider check, so reading the page is never attempted for these links.
 *   { data }                                   — title / photos / price
 *   { reason: "store_connection_required" }    — the affiliate account is not connected on this server
 *   { reason: "store_not_returned" }           — the store did not return the item the link opens
 *   null                                       — not an AliExpress link
 * Credential names never appear in the answer (it reaches the browser).
 */
export async function aliexpressLinkPreview(link, { env = {}, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (!isAliExpressLink(link)) return null;
  if (!aeStatus(env).configured) return { reason: "store_connection_required", store: "aliexpress" };
  try {
    const data = await aliexpressProductInfo(link, { env, fetchImpl, now });
    if (data && (data.title || data.image)) return { data };
  } catch { /* the store did not answer: reported below */ }
  return { reason: "store_not_returned", store: "aliexpress" };
}

/** Once a day at most (affiliate:aliexpress:last), and only with the owner's credentials. */
export async function dailyAffiliateImport({ kvGet, kvSet, env = {}, fetchImpl, now = Date.now() }) {
  if (!aeStatus(env).configured) return { ok: true, outcome: "REQUIRES_CONNECTION" };
  const last = await kvGet("affiliate:aliexpress:last", null);
  if (last?.at && now - Date.parse(last.at) < 20 * 3_600_000) return { ok: true, outcome: "NOT_DUE", last: last.at };
  try {
    const r = await importHotProducts({ kvGet, kvSet, env, fetchImpl, now, limit: 6 });
    return { ok: r.ok, outcome: r.ok ? "IMPORTED" : r.error, imported: r.imported || 0 };
  } catch (e) {
    return { ok: false, outcome: "FAILED", error: String(e?.message || e).slice(0, 160) };
  }
}
