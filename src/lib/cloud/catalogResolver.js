// Catalog truth resolver — the product's REAL photo, from its own store page.
//
// A product can be promoted with an image only when the image shows THE
// product (catalogIntegrity.js). Many rows carry a stock photo. The resolver
// runs on the GitHub Actions runner (a real browser follows the affiliate
// link to the store's product page and reads the page's own og:image); the
// server here only ACCEPTS a result that passes every check:
//   • the product is public and its affiliate link is its own (not shared);
//   • the resolved page is a store PRODUCT page (AliExpress /item/<id>.html);
//   • the image is on the store's own CDN (merchant photo, never stock);
//   • the server itself downloads the image: image/*, a real size;
//   • the write is read back before it is reported VERIFIED.
// The previous image is kept (imageSource.previous) — nothing is lost.
// Never invents an image, a title or a price.
import { isPublicCatalogProduct } from "./catalog.js";
import { IMAGE_PROVENANCE, imageProvenance, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { assertKvWritable, noteKvReadFailed, readKvResponse } from "./kvReadGuard.js";

const PRODUCTS_KEY = "marketplace:products";
const MARKETERS_KEY = "marketplace:marketers";
const LOG_KEY = "catalog:resolve:log";
const STATE_KEY = "catalog:resolve:state";
const BACKOFF_BASE_MS = 12 * 3_600_000; // 12h, 24h, 48h … — never hammer a store that blocks automation
const OUTCOMES = new Set(["SOURCE_BLOCKED", "NOT_PRODUCT_PAGE", "UNAVAILABLE"]);

const arr = (v) => (Array.isArray(v) ? v : []);
const ITEM_PAGE = /^https:\/\/([a-z]{2,3}\.)?(www\.|m\.)?aliexpress\.(com|us)\/item\/(\d{6,20})\.html/i;
const MIN_IMAGE_BYTES = 4_000;

/** Products that need their real photo: public, own link, image not the store's/own. */
export function resolveCandidates(products = [], marketers = []) {
  const all = arr(products);
  const shared = sharedAffiliateLinks(all);
  return all
    .filter((p) => isPublicCatalogProduct(p, marketers))
    .filter((p) => /^https:\/\//i.test(String(p.affiliateUrl || "")) && !shared.has(String(p.affiliateUrl).trim()))
    .filter((p) => ![IMAGE_PROVENANCE.MERCHANT, IMAGE_PROVENANCE.OWN].includes(imageProvenance(p.image)))
    .map((p) => ({ id: p.id, title: String(p.title || ""), affiliateUrl: p.affiliateUrl, image: p.image || "" }));
}

/** Pure validation of a runner result (no I/O). */
export function validateResolution(body = {}, products = [], marketers = []) {
  const fail = (error) => ({ ok: false, error });
  const all = arr(products);
  const product = all.find((p) => p?.id === body.productId);
  if (!product || !isPublicCatalogProduct(product, marketers)) return fail("product_not_public");
  if (sharedAffiliateLinks(all).has(String(product.affiliateUrl || "").trim())) return fail("shared_affiliate_link");
  const m = ITEM_PAGE.exec(String(body.itemUrl || ""));
  if (!m) return fail("not_a_product_page");
  let img;
  try { img = new URL(String(body.image || "")); } catch { return fail("bad_image_url"); }
  if (img.protocol !== "https:") return fail("bad_image_url");
  if (imageProvenance(img.href) !== IMAGE_PROVENANCE.MERCHANT) return fail("image_not_merchant_photo");
  // Keep the store's own regional host (aliexpress.us ids differ from .com ids).
  const host = String(body.itemUrl).match(/^https:\/\/([^/]+)/)[1].toLowerCase();
  return { ok: true, product, itemId: m[4], itemUrl: `https://${host}/item/${m[4]}.html`, image: img.href };
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
  return { kvRead, kvWrite, fetchImpl, configured: Boolean(url && key) };
}

export async function catalogCandidates({ env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const [p, m, st] = await Promise.all([c.kvRead(PRODUCTS_KEY), c.kvRead(MARKETERS_KEY), c.kvRead(STATE_KEY)]);
  if (!p.ok || !m.ok || !st.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  const all = arr(p.value);
  const shared = sharedAffiliateLinks(all);
  const state = st.value && typeof st.value === "object" ? st.value : {};
  const due = resolveCandidates(all, arr(m.value)).filter((x) => !(Number(state[x.id]?.nextAttemptAt) > now));
  return {
    ok: true,
    status: 200,
    candidates: due,
    backoff: Object.entries(state).filter(([, v]) => Number(v?.nextAttemptAt) > now).map(([id, v]) => ({ id, status: v.status, nextAttemptAt: new Date(v.nextAttemptAt).toISOString() })),
    // Reported, never "fixed": a shared link has no product page to read.
    needsOwnerLink: [...shared.values()].flat(),
  };
}

/** Accept one runner result: validate → download the image → write → read back. */
export async function applyResolution(body = {}, { env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const [p, m] = await Promise.all([c.kvRead(PRODUCTS_KEY), c.kvRead(MARKETERS_KEY)]);
  if (!p.ok || !m.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  const v = validateResolution(body, arr(p.value), arr(m.value));
  if (!v.ok) return { ok: false, status: 422, error: v.error };

  // The server checks the photo itself — the runner's word is not proof.
  let probe;
  try {
    const res = await c.fetchImpl(v.image, { headers: { accept: "image/*", "user-agent": "Mozilla/5.0 (LikeLink catalog check)" }, signal: AbortSignal.timeout(15000) });
    const type = String(res.headers.get("content-type") || "").split(";")[0];
    const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
    probe = { status: res.status, type, bytes };
  } catch (e) {
    return { ok: false, status: 502, error: "image_unreachable", detail: String(e?.message || e).slice(0, 120) };
  }
  if (probe.status !== 200 || !probe.type.startsWith("image/") || probe.bytes < MIN_IMAGE_BYTES) {
    return { ok: false, status: 422, error: "image_not_valid", probe };
  }

  const iso = new Date(now).toISOString();
  const source = { provenance: IMAGE_PROVENANCE.MERCHANT, itemUrl: v.itemUrl, itemId: v.itemId, resolvedAt: iso, via: "store_product_page_og_image", previous: v.product.image || null, probe,
    // Where the runner saw it: the store page title and the workflow run (audit trail).
    ...(body.storeTitle ? { storeTitle: String(body.storeTitle).slice(0, 140) } : {}),
    ...(/^\d{6,14}$/.test(String(body.observedInRun || "")) ? { observedInRun: String(body.observedInRun) } : {}) };
  const next = arr(p.value).map((x) => (x?.id === v.product.id ? { ...x, image: v.image, imageSource: source, updatedAt: now } : x));
  await c.kvWrite(PRODUCTS_KEY, next);
  const back = await c.kvRead(PRODUCTS_KEY);
  const stored = back.ok ? arr(back.value).find((x) => x?.id === v.product.id) : null;
  const verified = stored?.image === v.image;

  const stR = await c.kvRead(STATE_KEY);
  if (stR.ok && verified) await c.kvWrite(STATE_KEY, { ...(stR.value || {}), [v.product.id]: { status: "RESOLVED", lastAt: now, attempts: 0 } });
  const logR = await c.kvRead(LOG_KEY);
  if (logR.ok) await c.kvWrite(LOG_KEY, [...arr(logR.value), { productId: v.product.id, itemId: v.itemId, image: v.image, previous: source.previous, at: iso, status: verified ? "VERIFIED" : "WRITE_UNVERIFIED" }].slice(-200));
  return { ok: verified, status: verified ? 200 : 500, productId: v.product.id, image: v.image, itemUrl: v.itemUrl, proof: { status: verified ? "VERIFIED" : "WRITE_UNVERIFIED", via: "kv_read:marketplace:products", probe } };
}

/**
 * The runner could not read the product page (CAPTCHA / not a product page /
 * unavailable). Recorded with exponential backoff; nothing about the product
 * changes. The resolver never tries to get around a CAPTCHA.
 */
export async function recordResolveOutcome(body = {}, { env, fetchImpl, now = Date.now() } = {}) {
  if (!OUTCOMES.has(body.status) || !/^[A-Za-z0-9_-]{1,80}$/.test(String(body.productId || ""))) return { ok: false, status: 400, error: "bad_outcome" };
  const c = client({ env, fetchImpl });
  const r = await c.kvRead(STATE_KEY);
  if (!r.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  const state = r.value && typeof r.value === "object" ? r.value : {};
  const attempts = (Number(state[body.productId]?.attempts) || 0) + 1;
  const nextAttemptAt = now + BACKOFF_BASE_MS * 2 ** Math.min(attempts - 1, 4);
  state[body.productId] = { status: body.status, attempts, lastAt: now, nextAttemptAt, detail: String(body.detail || "").slice(0, 120) };
  await c.kvWrite(STATE_KEY, state);
  return { ok: true, status: 200, productId: body.productId, outcome: body.status, attempts, nextAttemptAt: new Date(nextAttemptAt).toISOString() };
}

/* ───────────────────────── owner links → new products (Link Generator) ───── */

const OWNER_LINK = /^https:\/\/s\.click\.aliexpress\.com\/e\/_[A-Za-z0-9]{4,24}$/;
const CATEGORY_WORDS = [
  [/ring|necklace|bracelet|earring|pendant|jewel|anklet|chain|brooch|טבעת|שרשרת|צמיד|עגיל/i, "Accessories"],
  [/bag|wallet|sunglass|watch|hat|scarf|belt|תיק|ארנק|משקפי|שעון/i, "Accessories"],
  [/dress|shirt|skirt|pants|jeans|coat|jacket|sweater|blouse|hoodie|שמלה|חולצה|חצאית|מכנס|מעיל/i, "Fashion"],
  [/shoe|sneaker|boot|sandal|heel|נעל/i, "Fashion"],
  [/makeup|lipstick|serum|skin|cream|nail|hair|brush|lash|beauty|cosmetic|איפור|שפתון|סרום|קרם/i, "Beauty"],
  [/kitchen|home|lamp|decor|pillow|storage|towel|cup|mug|bottle|בית|מטבח|מנורה/i, "Home"],
  [/phone|earbud|headphone|charger|cable|speaker|keyboard|mouse|usb|bluetooth|led|light|camera|tripod|photograph|selfie|טלפון|אוזניות|מטען/i, "Tech"],
  [/yoga|fitness|gym|sport|running|כושר|ספורט/i, "Fitness"],
  [/baby|kid|toy|children|תינוק|ילד|צעצוע/i, "Kids"],
  [/pet|dog|cat|כלב|חתול/i, "Pets"],
];
export const categoryFromTitle = (t) => (CATEGORY_WORDS.find(([re]) => re.test(String(t || ""))) || [null, "Other"])[1];

/** Store title → product title: drop the store suffix, keep the store's own words. */
export function cleanStoreTitle(t) {
  return String(t || "").replace(/\s*[-|–]\s*AliExpress.*$/i, "").replace(/^\s*AliExpress\b\s*[-|–:]?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

/** Pure validation of one owner link observed on the store's own page. */
export function validateOwnerLink(body = {}, products = [], marketers = [], ownerId = "") {
  const fail = (error) => ({ ok: false, error });
  const affiliateUrl = String(body.affiliateUrl || "").trim();
  if (!OWNER_LINK.test(affiliateUrl)) return fail("not_an_owner_affiliate_link");
  if (!arr(marketers).some((m) => String(m?.id) === String(ownerId))) return fail("owner_studio_not_found");
  const m = ITEM_PAGE.exec(String(body.itemUrl || ""));
  if (!m) return fail("not_a_product_page");
  let img;
  try { img = new URL(String(body.image || "")); } catch { return fail("bad_image_url"); }
  if (img.protocol !== "https:" || imageProvenance(img.href) !== IMAGE_PROVENANCE.MERCHANT) return fail("image_not_merchant_photo");
  const title = cleanStoreTitle(body.storeTitle);
  if (title.length < 5) return fail("title_missing");
  const price = Number(body.price);
  const currency = String(body.currency || "").toUpperCase();
  if (!(price > 0 && price < 100000) || !["ILS", "USD"].includes(currency)) return fail("price_missing");
  const itemId = m[4];
  const existing = arr(products).find((p) => String(p?.affiliateUrl || "").trim() === affiliateUrl || (p?.imageSource?.itemId && String(p.imageSource.itemId) === itemId) || p?.id === `ae-${itemId}`);
  const host = String(body.itemUrl).match(/^https:\/\/([^/]+)/)[1].toLowerCase();
  return { ok: true, existing: existing || null, itemId, itemUrl: `https://${host}/item/${itemId}.html`, image: img.href, title, price: Math.round(price * 100) / 100, currency, affiliateUrl };
}

/**
 * Add one product from the owner's own Link Generator link: validate → the
 * server downloads the photo itself → write → read back. Idempotent: a link
 * or store item that already exists is reported, never duplicated.
 */
export async function addOwnerLink(body = {}, { env = process.env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const ownerId = env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
  const [p, m] = await Promise.all([c.kvRead(PRODUCTS_KEY), c.kvRead(MARKETERS_KEY)]);
  if (!p.ok || !m.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  const v = validateOwnerLink(body, arr(p.value), arr(m.value), ownerId);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  if (v.existing) return { ok: true, status: 200, duplicate: true, productId: v.existing.id };
  let probe;
  try {
    const res = await c.fetchImpl(v.image, { headers: { accept: "image/*", "user-agent": "Mozilla/5.0 (LikeLink catalog check)" }, signal: AbortSignal.timeout(15000) });
    probe = { status: res.status, type: String(res.headers.get("content-type") || "").split(";")[0], bytes: res.ok ? (await res.arrayBuffer()).byteLength : 0 };
  } catch (e) {
    return { ok: false, status: 502, error: "image_unreachable", detail: String(e?.message || e).slice(0, 120) };
  }
  if (probe.status !== 200 || !probe.type.startsWith("image/") || probe.bytes < MIN_IMAGE_BYTES) return { ok: false, status: 422, error: "image_not_valid", probe };
  const iso = new Date(now).toISOString();
  const product = {
    id: `ae-${v.itemId}`, marketerId: ownerId, status: "approved", title: v.title, price: v.price, currency: v.currency,
    category: categoryFromTitle(v.title), image: v.image, affiliateUrl: v.affiliateUrl, clicks: 0, createdAt: now, updatedAt: now,
    importSource: "owner_link_generator",
    imageSource: { provenance: IMAGE_PROVENANCE.MERCHANT, itemUrl: v.itemUrl, itemId: v.itemId, resolvedAt: iso, via: "store_product_page_og_image", probe,
      storeTitle: String(body.storeTitle || "").slice(0, 140), ...(/^\d{6,14}$/.test(String(body.observedInRun || "")) ? { observedInRun: String(body.observedInRun) } : {}) },
    priceSource: { via: "store_product_page", observedAt: iso, label: "catalog_price_unverified" },
  };
  await c.kvWrite(PRODUCTS_KEY, [...arr(p.value), product]);
  const back = await c.kvRead(PRODUCTS_KEY);
  const verified = back.ok && arr(back.value).some((x) => x?.id === product.id && x.affiliateUrl === product.affiliateUrl);
  return { ok: verified, status: verified ? 200 : 500, productId: product.id, title: product.title, price: product.price, currency: product.currency, category: product.category, proof: verified ? "VERIFIED" : "WRITE_UNVERIFIED" };
}
