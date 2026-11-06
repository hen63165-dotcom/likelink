// /api/store?mode=magic&u=<pasted link or shared text> — "כפתור הקסם" (/magic).
// /api/store?mode=magic&q=<Hebrew words>                 — "מצאי לי באלי" (src/lib/growth/findOnAli.js):
//   product.query on the owner's account (ILS, ship to IL, her tracking id), at
//   most two keyword attempts, only items that pass FIND_RULES, never a number
//   that chose them.
// Dispatched from api/store.mjs (12-function limit). Public, GET only, read-only:
// nothing is written anywhere. The rules live in src/lib/growth/magic.js.
//
//   1. the first address in what was pasted; only AliExpress addresses are read;
//   2. the store item it opens: named in the address, or in at most 3 redirect
//      answers that are read but never followed outside AliExpress;
//   3. the store's own facts from the owner's affiliate account
//      (productdetail.get, ILS, shipping to Israel) — never the store's page,
//      which answers servers with a slider check;
//   4. the buy link: a creator's link is kept; otherwise LikeLink2's own tracked
//      link (the same answer's promotion_link, else link.generate).
//
// A burst brake per IP (in memory, per instance) and a short cache per item keep
// the owner's API quota for people, not scripts. Credential names never reach the
// answer.
import { jsonCors, isApprovedOrigin } from "./cors.js";
import { aeBanSeconds, aeCall, aeEnv, aeErrorCode, aeStatus } from "./aliexpressAffiliate.mjs";
import { classifyAgent, clientIp, createRateLimiter } from "./botGuard.mjs";
import { brandTitle, firstLink, isCreatorLink, isStoreLink, itemIdIn, magicReport, storePage } from "../../src/lib/growth/magic.js";
import { guessCategory, hasBrandName, isNotListedKind } from "../../src/lib/growth/deals.js";
import { findAttempts, findResults, parseFind } from "../../src/lib/growth/findOnAli.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const header = (req, name) => {
  const h = req?.headers || {};
  return (typeof h.get === "function" ? h.get(name) : h[name] || h[name.toLowerCase()]) || "";
};
const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;
const CACHE_MS = 30 * 60_000;
const CACHE_MAX = 400;

/**
 * Why the store gave nothing, in words the page can say: a frequency ban is
 * "busy, try in a minute", never "this product does not exist". `code` is the
 * store's own short code (aeErrorCode: never a key or a signature).
 */
function storeFailure(err) {
  const busy = aeBanSeconds(err) !== null;
  return { ok: false, reason: busy ? "store_busy" : "store_not_returned", code: aeErrorCode(err) };
}

/**
 * The store item a pasted link opens, and whether the link is already someone's
 * affiliate link. Redirects are read one hop at a time (redirect: "manual"),
 * only while they stay on AliExpress.
 */
export async function resolveMagicLink(link, { fetchImpl = globalThis.fetch, hops = 3 } = {}) {
  let current;
  try { current = new URL(String(link || "").trim()); } catch { return { itemId: "", creator: false }; }
  if (current.protocol === "http:") current.protocol = "https:";
  let creator = isCreatorLink(current.href);
  let itemId = itemIdIn(current.href);
  for (let i = 0; !itemId && i < hops && isStoreLink(current.href); i += 1) {
    let res;
    try {
      res = await fetchImpl(current.href, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36", accept: "text/html,*/*;q=0.8" } });
    } catch {
      break;
    }
    const where = res.headers?.get?.("location") || "";
    if (!where) {
      const body = await res.text().catch(() => "");
      itemId = itemIdIn(String(body).slice(0, 20_000));
      break;
    }
    let next;
    try { next = new URL(where, current); } catch { break; }
    if (isCreatorLink(next.href)) creator = true;
    itemId = itemIdIn(next.href);
    current = next;
  }
  return { itemId, creator };
}

/** The owner's own tracked link for a store item (link.generate), "" when the store gives none. */
async function ownLinkFor(itemId, { env, fetchImpl, now, sleep }) {
  try {
    const json = await aeCall("aliexpress.affiliate.link.generate", {
      tracking_id: env.ALIEXPRESS_TRACKING_ID, promotion_link_type: "0", source_values: storePage(itemId),
    }, { env, fetchImpl, now, sleep });
    const links = arr(json?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links?.promotion_link);
    const link = String(links[0]?.promotion_link || "");
    return OWN_LINK.test(link) ? link : "";
  } catch {
    return "";
  }
}

export function createMagicHandler({ env: rawEnv, fetchImpl = globalThis.fetch, now = () => Date.now(), limiter = createRateLimiter({ windowMs: 60_000, max: 10 }), cache = new Map(), sleep } = {}) {
  const readEnv = () => aeEnv(rawEnv || process.env);
  const cached = (key) => {
    const hit = cache.get(key);
    if (!hit || now() - hit.at > CACHE_MS) { cache.delete(key); return null; }
    return hit.value;
  };
  const remember = (key, value) => {
    cache.set(key, { at: now(), value });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };

  // "מצאי לי באלי": Hebrew words → the store's items that pass the site's rules.
  async function find(req, res, url, json) {
    const parsed = parseFind(url.searchParams.get("q") || "");
    const attempts = findAttempts(parsed);
    if (!attempts.length) return json({ ok: false, reason: "no_words" });
    const env = readEnv();
    if (!aeStatus(env).configured) return json({ ok: false, reason: "store_connection_required" });
    const verdict = limiter(`find|${clientIp(req)}`);
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfter || 60));
      return json({ ok: false, reason: "rate_limited", retryAfter: verdict.retryAfter }, 429);
    }
    const key = `find|${attempts.map((a) => a.keywords).join("|")}|${parsed.maxPrice}|${parsed.kind}`;
    const hit = cached(key);
    if (hit) return json({ ok: true, ...hit });
    let last = { items: [], left: {} };
    let used = null;
    let failed = 0;
    let failure = null;
    for (const attempt of attempts) {
      try {
        const answer = await aeCall("aliexpress.affiliate.product.query", {
          keywords: attempt.keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
          ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC",
          // In the store's smallest unit; every item is checked against the budget again below.
          ...(parsed.maxPrice > 0 ? { max_sale_price: String(parsed.maxPrice * 100) } : {}),
        }, { env, fetchImpl, now: now(), sleep });
        const result = answer?.aliexpress_affiliate_product_query_response?.resp_result;
        if (Number(result?.resp_code) !== 200) { failed += 1; failure = { ok: false, reason: "store_not_returned", code: `resp_${Number(result?.resp_code) || "none"}` }; continue; }
        last = findResults(arr(result?.result?.products?.product), { maxPrice: parsed.maxPrice, kind: parsed.kind, now: now() });
        used = attempt;
        if (last.items.length) break;
      } catch (err) {
        failed += 1;
        failure = storeFailure(err);
      }
    }
    if (!used && failed) return json(failure || { ok: false, reason: "store_not_returned" });
    const body = { query: { text: parsed.text, maxPrice: parsed.maxPrice || null, asked: used?.lang || null, unknown: parsed.unknown }, items: last.items };
    remember(key, body);
    return json({ ok: true, ...body });
  }

  return async function magicHandler(req, res) {
    const json = (obj, status = 200) => jsonCors(res, obj, status, req);
    if (req.method === "OPTIONS") return json({ ok: true });
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403);
    if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (classifyAgent(header(req, "user-agent")) === "scraper") return json({ ok: false, error: "automated_client" }, 403);

    const url = new URL(req.url, "https://x");
    if (url.searchParams.has("q")) return find(req, res, url, json);
    const pasted = firstLink(url.searchParams.get("u") || "");
    if (!pasted) return json({ ok: false, reason: "no_link" });
    if (!isStoreLink(pasted)) return json({ ok: false, reason: "not_aliexpress" });

    const env = readEnv();
    if (!aeStatus(env).configured) return json({ ok: false, reason: "store_connection_required" });

    const verdict = limiter(`magic|${clientIp(req)}`);
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfter || 60));
      return json({ ok: false, reason: "rate_limited", retryAfter: verdict.retryAfter }, 429);
    }

    try {
      const linkKey = `link|${pasted}`;
      const resolved = cached(linkKey) || await resolveMagicLink(pasted, { fetchImpl });
      if (!resolved.itemId) return json({ ok: false, reason: "no_item" });
      remember(linkKey, resolved);

      const itemKey = `item|${resolved.itemId}`;
      let store = cached(itemKey);
      if (!store) {
        let answer;
        try {
          answer = await aeCall("aliexpress.affiliate.productdetail.get", {
            product_ids: resolved.itemId, target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
          }, { env, fetchImpl, now: now(), sleep });
        } catch (err) {
          return json(storeFailure(err));
        }
        const result = answer?.aliexpress_affiliate_productdetail_get_response?.resp_result;
        if (Number(result?.resp_code) !== 200) return json({ ok: false, reason: "store_not_returned", code: `resp_${Number(result?.resp_code) || "none"}` });
        const x = arr(result?.result?.products?.product).find((p) => String(p?.product_id) === resolved.itemId);
        if (!x) return json({ ok: false, reason: "store_not_returned", code: "not_in_answer" });
        store = { x, ownLink: OWN_LINK.test(String(x.promotion_link || "")) ? String(x.promotion_link) : "" };
        remember(itemKey, store);
      }
      const title = String(store.x.product_title || "");
      const brand = hasBrandName(brandTitle(title));
      const notListed = isNotListedKind(title);
      // LikeLink2's own link only when it will be offered (a plain link, nothing to warn about).
      if (!resolved.creator && !brand && !notListed && !store.ownLink) {
        store = { ...store, ownLink: await ownLinkFor(resolved.itemId, { env, fetchImpl, now: now(), sleep }) };
        if (store.ownLink) remember(itemKey, store);
      }
      const report = magicReport({ x: store.x, category: guessCategory(store.x), pasted, creator: resolved.creator, ownLink: store.ownLink, brand, notListed, now: now() });
      return json({ ok: true, report });
    } catch (err) {
      return json(storeFailure(err));
    }
  };
}

export default createMagicHandler();
