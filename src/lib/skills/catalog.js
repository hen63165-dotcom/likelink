// LikeLink's first-party catalog skills (src/lib/skills/runtime.js) and the
// "catalog-health" workflow that runs them in order:
//
//   product-integrity → link-health → price-freshness → media-matching
//     → discovery-ranking → content-production
//
// All deterministic, no AI model and no paid service. They reuse the rules the
// site already lives by: catalogIntegrity (shared links, stock photos),
// SELLER_SKIP / SELLER_REVIEWED (a person checked the clip), LOOKS (clean
// frames), buildHookSet / buildStoryBeats + HOOK_FORBIDDEN (claim-free Hebrew
// copy). They never invent a price, a rating, a review, a sale or a video:
// what is missing is reported as missing, with the reason.
//
// Where they run: at every build (scripts/skills/run.mjs → /ops/skills.json,
// shown on /status) and in Actions → "Ops doctor". The site uses the same
// pure functions (rankProducts on /products).
import { catalogIssues, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { arr, CLAIM_FIELDS, listed, matchMedia, PRICE_SOURCES, priceState, rankProducts, STORE_LINK } from "./catalogRules.js";
import { buildHookSet, buildStoryBeats, HOOK_FORBIDDEN } from "../growth/likeloop.js";
import { defineSkill, listSkills, STATUS } from "./runtime.js";

export { matchMedia, PRICE_SOURCES, priceState, rankProducts } from "./catalogRules.js";

function catalogInputCheck(input) {
  return Array.isArray(input?.products) ? [] : ["products must be an array"];
}

/** Registers the catalog skills once (idempotent). */
export function ensureCatalogSkills() {
  const have = new Set(listSkills().map((s) => s.name));
  const add = (spec) => { if (!have.has(spec.name)) defineSkill(spec); };

  add({
    name: "product-integrity",
    purpose: "Each listed product has what the site needs and nothing it cannot prove: an owner, a title, its own store link, a real photo; no rating/review/sales field, no price without an approved source.",
    permissions: ["read:catalog"],
    validate: catalogInputCheck,
    run: ({ products, marketers = [] }) => {
      const owners = new Set(arr(marketers).map((m) => m?.id));
      const shared = sharedAffiliateLinks(products);
      const rows = listed(products).map((p) => {
        const issues = catalogIssues(p, products, shared).map((x) => ({ code: x.code, blocking: Boolean(x.blocking), he: x.he }));
        if (!String(p.title || "").trim()) issues.push({ code: "no_title", blocking: true, he: "אין שם מוצר" });
        if (owners.size && !owners.has(p.marketerId)) issues.push({ code: "unknown_owner", blocking: true, he: "המוצר לא שייך לאף יוצר/ת רשום/ה" });
        if (!STORE_LINK.test(String(p.affiliateUrl || ""))) issues.push({ code: "not_a_store_link", blocking: true, he: "הקישור לא מוביל לחנות מוכרת" });
        for (const f of CLAIM_FIELDS) if (Number(p[f]) > 0) issues.push({ code: "unverified_claim", blocking: true, he: `שדה «${f}» בלי מקור מאומת: לא מוצג` });
        if (Number(p.price) > 0 && !PRICE_SOURCES[p.priceSource]) issues.push({ code: "unverified_price", blocking: true, he: "מחיר בלי מקור מאושר: לא מוצג כמחיר" });
        return { id: p.id, ok: !issues.some((x) => x.blocking), issues };
      });
      const bad = rows.filter((r) => !r.ok);
      return {
        status: bad.length ? STATUS.WARN : rows.some((r) => r.issues.length) ? STATUS.WARN : STATUS.OK,
        processed: rows.length,
        errors: bad.map((r) => ({ code: r.issues.find((x) => x.blocking)?.code, id: r.id })),
        output: { products: rows, publishable: rows.filter((r) => r.ok).map((r) => r.id) },
      };
    },
  });

  add({
    name: "link-health",
    purpose: "Every purchase link is a well-formed https store link of its own. Links are not opened: an affiliate link would count a click, and the store may answer with a CAPTCHA, which we never work around.",
    permissions: ["read:catalog"],
    validate: catalogInputCheck,
    run: ({ products }, ctx) => {
      const shared = sharedAffiliateLinks(products);
      const checkedAt = new Date((ctx.now || Date.now)()).toISOString();
      const links = listed(products).map((p) => {
        const url = String(p.affiliateUrl || "");
        let host = "";
        try { host = new URL(url).host; } catch { host = ""; }
        const state = !STORE_LINK.test(url) ? "INVALID" : (shared.get(url) || []).length > 1 ? "SHARED" : "FORMAT_OK";
        return { id: p.id, host, state, live: "NOT_OPENED", checkedAt };
      });
      const bad = links.filter((l) => l.state !== "FORMAT_OK");
      return { status: bad.length ? STATUS.WARN : STATUS.OK, processed: links.length, errors: bad.map((l) => ({ code: l.state.toLowerCase(), id: l.id })), output: { links } };
    },
  });

  add({
    name: "price-freshness",
    purpose: "Each price has an approved source and a recent check, or is shown as 'the current price is at the store'. Never invents a price.",
    permissions: ["read:catalog"],
    validate: catalogInputCheck,
    run: ({ products }, ctx) => {
      const now = (ctx.now || Date.now)();
      const prices = listed(products).map((p) => ({ id: p.id, ...priceState(p, now) }));
      const fresh = prices.filter((x) => x.state === "FRESH").length;
      return {
        status: fresh === prices.length ? STATUS.OK : STATUS.WARN,
        processed: prices.length,
        errors: prices.filter((x) => x.state === "STALE").map((x) => ({ code: "stale_price", id: x.id })),
        blockedBy: fresh || prices.some((x) => x.state === "STALE") ? "" : "aliexpress_api_connection",
        output: { prices, fresh },
      };
    },
  });

  add({
    name: "media-matching",
    purpose: "Every image and video is tied to the product it shows: MATCHED only with evidence (a person's check, an upload for that product), REJECTED when it shows another item, UNCERTAIN otherwise.",
    permissions: ["read:catalog", "read:media"],
    validate: catalogInputCheck,
    run: ({ products, reels = null }) => {
      const items = matchMedia({ products, reels });
      const rejected = items.filter((m) => m.verdict === "REJECTED");
      const uncertain = items.filter((m) => m.verdict === "UNCERTAIN");
      return {
        status: rejected.length || uncertain.length || reels == null ? STATUS.WARN : STATUS.OK,
        processed: items.length,
        errors: [...rejected, ...uncertain].map((m) => ({ code: m.verdict.toLowerCase(), id: m.productId, media: m.media })),
        blockedBy: reels == null ? "reels_feed_unreachable" : "",
        output: { items, feedChecked: reels != null },
      };
    },
  });

  add({
    name: "discovery-ranking",
    purpose: "An explainable product order from data quality (own store link, checked video, clean image, checked price) — never popularity, ratings or sales.",
    permissions: ["read:catalog"],
    validate: catalogInputCheck,
    run: ({ products, reels = [] }, ctx) => {
      const ranked = rankProducts(products, { reels: reels || [], now: (ctx.now || Date.now)() });
      return { status: STATUS.OK, processed: ranked.length, output: { ranked } };
    },
  });

  add({
    name: "content-production",
    purpose: "Claim-free Hebrew hooks, a storyboard and a disclosed caption per publishable product, ready for the existing renderers. It renders nothing itself and never says a video exists.",
    permissions: ["read:catalog"],
    validate: catalogInputCheck,
    run: ({ products, publishable = null, reels = [] }, ctx) => {
      const allowed = publishable ? new Set(publishable) : null;
      const withFootage = new Set(matchMedia({ products, reels }).filter((m) => m.verdict === "MATCHED" && m.kind !== "clean_frame").map((m) => m.productId));
      const packs = listed(products).filter((p) => !allowed || allowed.has(p.id)).map((p) => {
        const hooks = buildHookSet(p, { now: (ctx.now || Date.now)() }).slice(0, 3).map((h) => h.text);
        return {
          id: p.id,
          hooks,
          storyboard: buildStoryBeats(p),
          caption: `#פרסומת · קישור שותפים\n${hooks[0] || ""}`,
          video: withFootage.has(p.id)
            ? { state: "FOOTAGE_AVAILABLE", next: "Actions → Product video reels (עריכת הסרטון הקיים)" }
            : { state: "NOT_RENDERED", next: "Actions → Luna reels (אנימציה מסומנת) — או צילום אמיתי" },
        };
      });
      const unsafe = packs.flatMap((k) => k.hooks.filter((t) => HOOK_FORBIDDEN.test(t)).map(() => ({ code: "forbidden_claim", id: k.id })));
      return { status: unsafe.length ? STATUS.FAILED : STATUS.OK, processed: packs.length, errors: unsafe, output: { packs } };
    },
  });
}

/** The catalog-health workflow: every stage gets the catalog; content uses only publishable products. */
export const CATALOG_HEALTH = Object.freeze([
  { skill: "product-integrity", input: (acc) => acc.input },
  { skill: "link-health", input: (acc) => acc.input },
  { skill: "price-freshness", input: (acc) => acc.input },
  { skill: "media-matching", input: (acc) => acc.input },
  { skill: "discovery-ranking", input: (acc) => acc.input },
  { skill: "content-production", input: (acc) => ({ ...acc.input, publishable: acc["product-integrity"]?.publishable || [] }) },
]);

export const CATALOG_GRANTS = Object.freeze(["read:catalog", "read:media"]);
