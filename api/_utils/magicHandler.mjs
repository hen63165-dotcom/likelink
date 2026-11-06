// /api/store?mode=magic&u=<pasted link or shared text> — "כפתור הקסם" (/magic).
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
import { aeCall, aeEnv, aeStatus } from "./aliexpressAffiliate.mjs";
import { classifyAgent, clientIp, createRateLimiter } from "./botGuard.mjs";
import { firstLink, isCreatorLink, isStoreLink, itemIdIn, magicReport, storePage } from "../../src/lib/growth/magic.js";
import { guessCategory, hasBrandName, isNotListedKind } from "../../src/lib/growth/deals.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const header = (req, name) => {
  const h = req?.headers || {};
  return (typeof h.get === "function" ? h.get(name) : h[name] || h[name.toLowerCase()]) || "";
};
const OWN_LINK = /^https:\/\/s\.click\.aliexpress\.com\/\S+$/;
const CACHE_MS = 30 * 60_000;
const CACHE_MAX = 400;

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
async function ownLinkFor(itemId, { env, fetchImpl, now }) {
  try {
    const json = await aeCall("aliexpress.affiliate.link.generate", {
      tracking_id: env.ALIEXPRESS_TRACKING_ID, promotion_link_type: "0", source_values: storePage(itemId),
    }, { env, fetchImpl, now });
    const links = arr(json?.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links?.promotion_link);
    const link = String(links[0]?.promotion_link || "");
    return OWN_LINK.test(link) ? link : "";
  } catch {
    return "";
  }
}

export function createMagicHandler({ env: rawEnv, fetchImpl = globalThis.fetch, now = () => Date.now(), limiter = createRateLimiter({ windowMs: 60_000, max: 10 }), cache = new Map() } = {}) {
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

  return async function magicHandler(req, res) {
    const json = (obj, status = 200) => jsonCors(res, obj, status, req);
    if (req.method === "OPTIONS") return json({ ok: true });
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403);
    if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (classifyAgent(header(req, "user-agent")) === "scraper") return json({ ok: false, error: "automated_client" }, 403);

    const url = new URL(req.url, "https://x");
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
        const answer = await aeCall("aliexpress.affiliate.productdetail.get", {
          product_ids: resolved.itemId, target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
        }, { env, fetchImpl, now: now() });
        const result = answer?.aliexpress_affiliate_productdetail_get_response?.resp_result;
        const x = Number(result?.resp_code) === 200 ? arr(result?.result?.products?.product).find((p) => String(p?.product_id) === resolved.itemId) : null;
        if (!x) return json({ ok: false, reason: "store_not_returned" });
        store = { x, ownLink: OWN_LINK.test(String(x.promotion_link || "")) ? String(x.promotion_link) : "" };
        remember(itemKey, store);
      }
      const title = String(store.x.product_title || "");
      const brand = hasBrandName(title);
      const notListed = isNotListedKind(title);
      // LikeLink2's own link only when it will be offered (a plain link, nothing to warn about).
      if (!resolved.creator && !brand && !notListed && !store.ownLink) {
        store = { ...store, ownLink: await ownLinkFor(resolved.itemId, { env, fetchImpl, now: now() }) };
        if (store.ownLink) remember(itemKey, store);
      }
      const report = magicReport({ x: store.x, category: guessCategory(store.x), pasted, creator: resolved.creator, ownLink: store.ownLink, brand, notListed, now: now() });
      return json({ ok: true, report });
    } catch {
      return json({ ok: false, reason: "store_not_returned" });
    }
  };
}

export default createMagicHandler();
