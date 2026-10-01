// /api/store?mode=gpt — the API behind the "Likelink Content Studio" Custom GPT.
//
// Pretty URLs (vercel.json):  /api/gpt/openapi.json · /api/gpt/products ·
// /api/gpt/products/{id}/tracking-link · /api/gpt/drafts · /api/gpt/drafts/{id}
//
// GPT actions (API key, "Authorization: Bearer llk_…"):
//   list_products        GET  op=products
//   get_tracking_link    GET  op=tracking-link&productId=&channel=
//   create_content_draft POST op=drafts   → DRAFT only (quota: gptDrafts)
//   list_drafts          GET  op=drafts
//   get_draft_status     GET  op=draft&draftId=
// There is NO publish operation: a draft is published only by the creator,
// in the studio, per post (and "published" needs the network's own post id).
//
// Studio (Supabase session): op=keys (list) · op=keys-create · op=keys-revoke ·
// op=my-drafts · op=draft-approve · op=status.
//
// Keys: shown once, stored as SHA-256 only (gpt:keys), revocable, per-key
// rate-limited, Professional plan only (apiAccess). Read-mostly: the only
// write is a draft in distribution:drafts:<marketerId>.
import crypto from "node:crypto";
import { readBody } from "./readBody.mjs";
import { canonicalProduct, trackingLink, productPageUrl } from "../../src/lib/discovery/surfaces.js";
import { DISTRIBUTION_CHANNELS, FORBIDDEN_CLAIMS, disclosureFor } from "../../src/lib/discovery/distribution.js";
import { resolveEntitlement, pickSubscription } from "../../src/lib/discovery/entitlements.js";
import { checkQuota, quotaStoreKey, QUOTA_ERROR } from "../../src/lib/discovery/quotas.js";
import { createRateLimiter } from "./botGuard.mjs";
import { buildOpenApiSpec } from "../../src/lib/gpt/openapi.js";
import { catalogIssues, sharedAffiliateLinks } from "../../src/lib/discovery/catalogIntegrity.js";

export const KEYS_KEY = "gpt:keys";
export const draftsKey = (marketerId) => `distribution:drafts:${marketerId}`;
const MAX_KEYS_PER_CREATOR = 3;
const MAX_DRAFTS = 200;
const LIMITS = { hook: 200, script: 4000, caption: 2200, hashtags: 10, hashtag: 40 };
const CHANNEL_IDS = new Set(DISTRIBUTION_CHANNELS.map((c) => c.id));
const norm = (v) => String(v || "").trim().toLowerCase();

export const hashKey = (raw) => crypto.createHash("sha256").update(String(raw)).digest("hex");
export function newApiKey() { return `llk_${crypto.randomBytes(32).toString("base64url")}`; }

function header(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || h?.[name.toLowerCase()] || "";
}

export function createGptHandler({ kvGet, kvSet, verifyToken, env = process.env, now = () => Date.now(), keyLimiter = createRateLimiter({ max: 30 }) }) {
  function send(res, obj, status = 200) {
    res.status(status);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.end(JSON.stringify(obj));
  }
  const bearer = (req) => String(header(req, "authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const keysMap = async () => { const v = await kvGet(KEYS_KEY); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };

  async function entitlementOf(userId, email) {
    if (norm(env.OWNER_EMAIL) && norm(env.OWNER_EMAIL) === norm(email)) return resolveEntitlement({ isPlatformOwner: true, now: now() });
    const subs = (await kvGet("marketplace:subscriptions")) || [];
    return resolveEntitlement({ subscription: pickSubscription(Array.isArray(subs) ? subs : [], userId), now: now() });
  }
  async function marketerIdsFor(email) {
    const marketers = (await kvGet("marketplace:marketers")) || [];
    return (Array.isArray(marketers) ? marketers : []).filter((m) => m && norm(m.email) === norm(email)).map((m) => String(m.id));
  }
  async function productsOf(marketerId) {
    const [products, marketers] = await Promise.all([kvGet("marketplace:products"), kvGet("marketplace:marketers")]);
    const m = (Array.isArray(marketers) ? marketers : []).find((x) => x && String(x.id) === marketerId) || null;
    const all = Array.isArray(products) ? products : [];
    const shared = sharedAffiliateLinks(all);
    return all
      .filter((p) => p && String(p.marketerId) === marketerId && ["approved", "active", "published"].includes(String(p.status)))
      // Products that cannot be promoted honestly (e.g. an affiliate link shared
      // by several products → the store's home page) are not offered to the GPT.
      .filter((p) => !catalogIssues(p, all, shared).some((i) => i.blocking))
      .map((p) => ({ ...canonicalProduct(p, m ? { id: m.id, name: m.name, slug: m.slug } : null), stockImage: catalogIssues(p, all, shared).some((i) => i.code === "stock_image") }));
  }

  /** API-key identity (GPT calls). Revoked or unknown → 401; plan without apiAccess → 402. */
  async function keyIdentity(req) {
    const raw = bearer(req);
    if (!/^llk_[A-Za-z0-9_-]{30,}$/.test(raw)) return { error: "invalid_api_key", status: 401 };
    const map = await keysMap();
    const rec = map[hashKey(raw)];
    if (!rec || rec.revokedAt) return { error: "invalid_api_key", status: 401 };
    const ent = await entitlementOf(rec.userId, rec.email);
    if (!ent.capabilities.apiAccess) return { error: QUOTA_ERROR.PLAN_REQUIRED, status: 402 };
    const verdict = keyLimiter(rec.id);
    if (!verdict.allowed) return { error: "rate_limited", status: 429, retryAfter: verdict.retryAfter };
    return { rec, ent, marketerId: rec.marketerId };
  }

  /** Session identity (studio). */
  async function sessionIdentity(req) {
    const user = await verifyToken(bearer(req)).catch(() => null);
    if (!user?.id || !user.email) return { error: "authentication_required", status: 401 };
    const ids = await marketerIdsFor(user.email);
    if (!ids.length) return { error: "marketer_not_found", status: 403 };
    return { userId: String(user.id), email: norm(user.email), marketerId: ids[0], ent: await entitlementOf(String(user.id), user.email) };
  }

  const draftView = (d) => ({ id: d.id, productId: d.productId, channel: d.channel, status: d.status, hook: d.hook, caption: d.caption, hashtags: d.hashtags, trackingLink: d.trackingLink, createdAt: d.createdAt, approvedAt: d.approvedAt || null, source: d.source, aiLabel: d.aiLabel, note: "טיוטה בלבד. הפרסום נעשה על ידי היוצרת בסטודיו." });

  return async function gptHandler(req, res) {
    const url = new URL(req.url, "https://x");
    const op = url.searchParams.get("op") || "";
    try {
      if (op === "openapi") { send(res, buildOpenApiSpec({ origin: env.PUBLIC_ORIGIN })); return; }

      // ── studio (session) ──
      if (["keys", "keys-create", "keys-revoke", "my-drafts", "draft-approve", "status"].includes(op)) {
        const who = await sessionIdentity(req);
        if (who.error) { send(res, { ok: false, error: who.error }, who.status); return; }
        if (op === "status") {
          send(res, { ok: true, apiAccess: Boolean(who.ent.capabilities.apiAccess), plan: who.ent.plan, contentEngine: "native", aiAdapter: { provider: "openai", configured: Boolean(env.OPENAI_API_KEY), required: false } });
          return;
        }
        if (op === "keys") {
          const list = Object.values(await keysMap()).filter((k) => k.userId === who.userId).map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null, revokedAt: k.revokedAt || null }));
          send(res, { ok: true, keys: list });
          return;
        }
        if (op === "my-drafts") {
          const drafts = (await kvGet(draftsKey(who.marketerId))) || [];
          send(res, { ok: true, drafts: [...drafts].reverse().slice(0, 50).map(draftView) });
          return;
        }
        if (req.method !== "POST") { send(res, { ok: false, error: "method_not_allowed" }, 405); return; }
        const body = (await readBody(req).catch(() => null)) || {};
        if (op === "keys-create") {
          if (!who.ent.capabilities.apiAccess) { send(res, { ok: false, error: QUOTA_ERROR.PLAN_REQUIRED, upgrade: { id: "professional" } }, 402); return; }
          const map = await keysMap();
          if (Object.values(map).filter((k) => k.userId === who.userId && !k.revokedAt).length >= MAX_KEYS_PER_CREATOR) { send(res, { ok: false, error: "too_many_keys" }, 409); return; }
          const raw = newApiKey();
          const id = `key_${crypto.randomBytes(6).toString("hex")}`;
          map[hashKey(raw)] = { id, name: String(body.name || "ChatGPT").slice(0, 40), prefix: raw.slice(0, 8), userId: who.userId, email: who.email, marketerId: who.marketerId, scopes: ["products:read", "drafts:write"], createdAt: new Date(now()).toISOString() };
          await kvSet(KEYS_KEY, map);
          // The raw key is returned ONCE and never stored.
          send(res, { ok: true, id, key: raw, note: "שמרי את המפתח עכשיו — הוא לא יוצג שוב." });
          return;
        }
        if (op === "keys-revoke") {
          const map = await keysMap();
          const entry = Object.entries(map).find(([, k]) => k.id === String(body.id || "") && k.userId === who.userId);
          if (!entry) { send(res, { ok: false, error: "not_found" }, 404); return; }
          map[entry[0]] = { ...entry[1], revokedAt: new Date(now()).toISOString() };
          await kvSet(KEYS_KEY, map);
          send(res, { ok: true, revoked: entry[1].id });
          return;
        }
        if (op === "draft-approve") {
          // The creator's own approval in the studio — never reachable with an API key.
          const drafts = (await kvGet(draftsKey(who.marketerId))) || [];
          const d = drafts.find((x) => x.id === String(body.draftId || ""));
          if (!d) { send(res, { ok: false, error: "not_found" }, 404); return; }
          const next = drafts.map((x) => (x.id === d.id ? { ...x, status: "APPROVED_FOR_MANUAL_POST", approvedAt: new Date(now()).toISOString() } : x));
          await kvSet(draftsKey(who.marketerId), next);
          send(res, { ok: true, draft: draftView(next.find((x) => x.id === d.id)) });
          return;
        }
      }

      // ── GPT actions (API key) ──
      const known = ["products", "tracking-link", "drafts", "draft"];
      if (!known.includes(op)) { send(res, { ok: false, error: "not_found" }, 404); return; }
      const id = await keyIdentity(req);
      if (id.error) { if (id.retryAfter) res.setHeader("retry-after", String(id.retryAfter)); send(res, { ok: false, error: id.error }, id.status); return; }
      // Last use is recorded at most once per hour (read-mostly).
      if (!id.rec.lastUsedAt || now() - Date.parse(id.rec.lastUsedAt) > 3600000) {
        const map = await keysMap();
        const k = Object.keys(map).find((h) => map[h].id === id.rec.id);
        if (k) { map[k] = { ...map[k], lastUsedAt: new Date(now()).toISOString() }; await kvSet(KEYS_KEY, map); }
      }

      if (op === "products" && req.method === "GET") {
        const list = await productsOf(id.marketerId);
        send(res, { ok: true, products: list.map((c) => ({ id: c.id, title: c.title, description: c.description.slice(0, 500), price: c.price, currency: c.currency, category: c.category, image: c.stockImage ? null : c.image || null, productUrl: productPageUrl(c), saleModel: c.saleModel })) });
        return;
      }
      if (op === "tracking-link" && req.method === "GET") {
        const c = (await productsOf(id.marketerId)).find((x) => x.id === String(url.searchParams.get("productId") || ""));
        if (!c) { send(res, { ok: false, error: "product_not_found" }, 404); return; }
        const channel = CHANNEL_IDS.has(url.searchParams.get("channel")) ? url.searchParams.get("channel") : "chatgpt";
        const src = `gpt.${channel}`;
        const link = c.saleModel === "affiliate" ? trackingLink(c, src) : `${productPageUrl(c)}?src=${encodeURIComponent(src)}`;
        send(res, { ok: true, productId: c.id, trackingLink: link, disclosure: disclosureFor(c).short || null });
        return;
      }
      if (op === "drafts" && req.method === "GET") {
        const drafts = (await kvGet(draftsKey(id.marketerId))) || [];
        send(res, { ok: true, drafts: [...drafts].reverse().slice(0, 20).map(draftView) });
        return;
      }
      if (op === "draft" && req.method === "GET") {
        const d = ((await kvGet(draftsKey(id.marketerId))) || []).find((x) => x.id === String(url.searchParams.get("draftId") || ""));
        if (!d) { send(res, { ok: false, error: "not_found" }, 404); return; }
        send(res, { ok: true, draft: draftView(d) });
        return;
      }
      if (op === "drafts" && req.method === "POST") {
        const body = (await readBody(req).catch(() => null)) || {};
        const c = (await productsOf(id.marketerId)).find((x) => x.id === String(body.productId || ""));
        if (!c) { send(res, { ok: false, error: "product_not_found" }, 404); return; }
        const channel = String(body.channel || "");
        if (!CHANNEL_IDS.has(channel)) { send(res, { ok: false, error: "invalid_channel", channels: [...CHANNEL_IDS] }, 400); return; }
        const hook = String(body.hook || "").trim();
        const script = String(body.script || "").trim();
        let caption = String(body.caption || "").trim();
        const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).map((h) => String(h).trim()).filter(Boolean);
        if (!hook || !caption) { send(res, { ok: false, error: "missing_fields", required: ["productId", "channel", "hook", "caption"] }, 400); return; }
        if (hook.length > LIMITS.hook || script.length > LIMITS.script || caption.length > LIMITS.caption || hashtags.length > LIMITS.hashtags || hashtags.some((h) => h.length > LIMITS.hashtag)) {
          send(res, { ok: false, error: "value_too_large", limits: LIMITS }, 400); return;
        }
        // No invented testimonials, rankings or guarantees — explained, not silently edited.
        if (FORBIDDEN_CLAIMS.test([hook, script, caption, ...hashtags].join("\n"))) {
          send(res, { ok: false, error: "claims_not_allowed", explanation: "אסור לכלול המלצות לקוחות, ביקורות, דירוגים, 'הכי נמכר' או הבטחות. אפשר לכתוב רק עובדות מתוך פרטי המוצר." }, 422); return;
        }
        const quotaKey = quotaStoreKey(id.marketerId, now());
        const used = Number(((await kvGet(quotaKey)) || {}).gptDrafts) || 0;
        const gate = checkQuota(id.ent, "gptDrafts", used);
        if (!gate.allowed) { send(res, { ok: false, error: gate.error, limit: gate.limit }, gate.error === QUOTA_ERROR.EXCEEDED ? 429 : 402); return; }
        const draftId = `gd_${crypto.randomBytes(6).toString("hex")}`;
        const src = `gpt.${channel}.${draftId}`;
        const link = c.saleModel === "affiliate" ? trackingLink(c, src) : `${productPageUrl(c)}?src=${encodeURIComponent(src)}`;
        const d = disclosureFor(c);
        // The disclosure always opens the caption and the tracking link is always in it.
        if (d.required && !caption.includes(d.tag)) caption = `${d.short}\n${caption}`;
        if (!caption.includes(link)) caption = `${caption}\n${link}`;
        const channelDef = DISTRIBUTION_CHANNELS.find((x) => x.id === channel);
        const draft = {
          id: draftId, productId: c.id, channel, hook, script, caption, hashtags, trackingLink: link, trackingSource: src,
          status: "DRAFT", source: "chatgpt", aiGenerated: true, aiLabel: channelDef.aiLabel, disclosure: d.short || null,
          createdAt: new Date(now()).toISOString(), keyId: id.rec.id,
        };
        const list = (await kvGet(draftsKey(id.marketerId))) || [];
        await kvSet(draftsKey(id.marketerId), [...list, draft].slice(-MAX_DRAFTS));
        const back = ((await kvGet(draftsKey(id.marketerId))) || []).find((x) => x.id === draftId);
        if (!back) { send(res, { ok: false, error: "storage_failed" }, 500); return; }
        await kvSet(quotaKey, { ...((await kvGet(quotaKey)) || {}), gptDrafts: used + 1 });
        send(res, { ok: true, draft: draftView(back) }, 201);
        return;
      }
      send(res, { ok: false, error: "method_not_allowed" }, 405);
    } catch {
      send(res, { ok: false, error: "internal_server_error" }, 500);
    }
  };
}

let defaultHandler = null;
export default async function gptHandler(req, res) {
  if (!defaultHandler) {
    const [{ kvGet, kvSet }, { verifyToken }] = await Promise.all([import("../store.mjs"), import("./authVerify.js")]);
    defaultHandler = createGptHandler({ kvGet, kvSet, verifyToken });
  }
  return defaultHandler(req, res);
}
