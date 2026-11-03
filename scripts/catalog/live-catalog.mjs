// The catalog a build publishes (product pages, the sitemap, the Pinterest
// feed): the shipped copy (public/snapshot/kv.json) plus every product the
// live cloud lists that the copy does not have yet.
//
// Why (2026-11-03): the copy holds 5 products while the cloud lists ~70, so
// Google, WhatsApp/Facebook previews and Pinterest saw only 5 product pages;
// every other /p/<id> answered the home page's head (canonical "/"), a copy of
// the home page to a search engine.
//
// The read is the browser's own: the public anon key and the allowlisted kv
// rows (RLS), nothing private. The copy's records win for the ids it has (they
// are the checked ones); the cloud only adds. Whatever is published still goes
// through buildPublicGraph (approved, attributed, promotable) in the caller.
// A failed read never fails the build: it answers the copy alone, with why.
import { CLOUD } from "../../src/constants/cloud.js";

export const LIVE_KEYS = Object.freeze(["marketplace:products", "marketplace:marketers"]);

function cloudOf(env = process.env) {
  const url = String(CLOUD?.url || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = String(CLOUD?.anonKey || env.VITE_SUPABASE_ANON_KEY || "");
  return url && anonKey ? { url, anonKey } : null;
}

/** The live rows of LIVE_KEYS: { ok, keys } or { ok: false, reason }. Never throws. */
export async function loadLiveKeys({ fetchImpl = globalThis.fetch, cloud = cloudOf(), timeoutMs = 15000 } = {}) {
  if (!cloud || typeof fetchImpl !== "function") return { ok: false, reason: "no_cloud" };
  const list = LIVE_KEYS.map((k) => `"${k}"`).join(",");
  const url = `${cloud.url}/rest/v1/kv?select=key,value&key=in.(${encodeURIComponent(list)})`;
  try {
    const res = await fetchImpl(url, {
      headers: { apikey: cloud.anonKey, Authorization: `Bearer ${cloud.anonKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const rows = await res.json();
    const keys = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!LIVE_KEYS.includes(row?.key)) continue;
      try {
        const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        if (Array.isArray(value)) keys[row.key] = value;
      } catch { /* a broken row is skipped, never guessed */ }
    }
    if (!Array.isArray(keys["marketplace:products"])) return { ok: false, reason: "no_products" };
    return { ok: true, keys };
  } catch (e) {
    return { ok: false, reason: e?.name === "TimeoutError" ? "timeout" : "network" };
  }
}

/** The copy, with the live rows it does not have added (the copy wins for its own ids). */
export function mergeCatalog(snapshotDoc, live) {
  const keys = { ...(snapshotDoc?.keys || {}) };
  let added = 0;
  for (const k of LIVE_KEYS) {
    const fresh = live?.ok ? live.keys?.[k] : null;
    if (!Array.isArray(fresh)) continue;
    const base = Array.isArray(keys[k]) ? keys[k] : [];
    const have = new Set(base.map((x) => x?.id).filter(Boolean));
    const extra = fresh.filter((x) => x && x.id && !have.has(x.id));
    if (k === "marketplace:products") added = extra.length;
    keys[k] = [...base, ...extra];
  }
  return { doc: { ...(snapshotDoc || {}), keys }, added };
}

/** The catalog a build publishes: the copy merged with the live cloud. Never throws. */
export async function buildCatalog(snapshotDoc, opts = {}) {
  const live = await loadLiveKeys(opts);
  const { doc, added } = mergeCatalog(snapshotDoc, live);
  return { doc, added, live: live.ok ? "ok" : live.reason };
}
