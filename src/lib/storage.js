/**
 * Storage adapter for Likelink.
 *
 * SHARED data (the public feed: marketers, products, clicks, sales, settings)
 * is stored in a Supabase Postgres table called `kv`.
 *
 * SECURITY UPGRADE 2.0 ("the genius layer"):
 *   • READS  → straight from Supabase with the anon key (public feed — fine).
 *   • WRITES → go through /api/store (server-side), which uses the
 *     SUPABASE_SERVICE_ROLE_KEY and enforces that money/config keys are
 *     admin-only. The browser can no longer forge sales or change fees by
 *     calling Supabase directly with the public key.
 *
 * PERSONAL data (which studio is logged in on *this* device) stays in
 * localStorage. There's no reason to sync that across devices.
 *
 * If Supabase env vars are missing, shared reads/writes fall back to
 * localStorage ONLY in local dev (so nothing crashes). In production a
 * missing config is a deployment error and we refuse silently.
 */

import { supabase, supabaseConfigured } from "./supabaseClient";

const PREFIX = "sch:";
const scoped = (key, shared) => PREFIX + (shared ? "shared:" : "local:") + key;

// Keys that go through the server-side store gate (all SHARED writes).
// Local (non-shared) keys never leave the device.
const SENSITIVE_SHARED_KEYS = new Set([
  "marketplace:settings",
  "marketplace:sales",
  "marketplace:payouts",
  "marketplace:charges",
  "marketplace:notifications",
]);

function isLocalRuntime() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname || "";
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || host === "0.0.0.0";
}

async function localGet(key, shared) {
  try {
    const raw = localStorage.getItem(scoped(key, shared));
    return raw !== null ? { key, value: raw, shared } : null;
  } catch (e) {
    console.error("storage.get (local) failed", key, e);
    return null;
  }
}

async function localSet(key, value, shared) {
  try {
    localStorage.setItem(scoped(key, shared), value);
    return { key, value, shared };
  } catch (e) {
    console.error("storage.set (local) failed", key, e);
    return null;
  }
}

// Keys that a signed-in creator writes from her own studio (non-sensitive):
// products, marketers, clicks, collections. These go through the server gate
// but don't require a signature.
const CLIENT_WRITABLE_KEYS = new Set([
  "marketplace:products",
  "marketplace:marketers",
  "marketplace:clicks",
  "marketplace:collections",
  "marketplace:charges",
  "marketplace:notifications",
]);

function readAdminToken() {
  try {
    return sessionStorage.getItem("ll_admin_token") || "";
  } catch {
    return "";
  }
}

async function serverSet(key, value, opts = {}) {
  // All shared writes go through the secure server gate.
  const payload = { key, value };
  if (opts.sale) payload.sale = opts.sale;
  if (opts.sig) payload.sig = opts.sig;
  if (opts.sigTs) payload.sigTs = opts.sigTs;
  if (opts.action) payload.action = opts.action;

  const token = readAdminToken();
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch("/api/store", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `store_http_${res.status}`);
  return { key, value, shared: true };
}

export const storage = {
  async get(key, shared = false) {
    if (!shared) return localGet(key, shared);

    if (!supabaseConfigured) {
      if (isLocalRuntime()) {
        console.warn(`[storage] Supabase not configured — "${key}" falling back to localStorage only in local dev.`);
        return localGet(key, shared);
      }

      console.warn(`[storage] Production-safe mode: refusing browser localStorage fallback for shared key "${key}" because Supabase is not configured.`);
      return null;
    }

    try {
      const { data, error } = await supabase.from("kv").select("value").eq("key", key).maybeSingle();
      if (error) throw error;
      return data ? { key, value: data.value, shared: true } : null;
    } catch (e) {
      console.error("storage.get (supabase) failed; refusing stale localStorage fallback in production", key, e);
      if (isLocalRuntime()) {
        return localGet(key, shared);
      }
      return null;
    }
  },

  async set(key, value, shared = false) {
    if (!shared) return localSet(key, value, shared);

    if (!supabaseConfigured) {
      if (isLocalRuntime()) {
        console.warn(`[storage] Supabase not configured — "${key}" falling back to localStorage only in local dev.`);
        return localSet(key, value, shared);
      }

      console.warn(`[storage] Production-safe mode: refusing to write shared key "${key}" to browser localStorage because Supabase is not configured.`);
      return { key, value, shared: true };
    }

    // The secure path: writes go through the server gate.
    return serverSet(key, value);
  },

  // Internal/advanced: server-only admin write for sensitive keys.
  async adminSet(key, value, token) {
    if (!token) throw new Error("admin_token_required");
    const res = await fetch("/api/store", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, value }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data?.error || `store_http_${res.status}`);
    return { key, value, shared: true };
  },

  // Signed write for a creator self-reported sale. The server (/api/sign-sale)
  // validates ownership + range + rate-limit and returns { sale, sig, sigTs };
  // /api/store then verifies the signature before persisting.
  async signedSet(key, value, sale, sig, sigTs) {
    if (!sale || !sig || !sigTs) throw new Error("signed_sale_required");
    return serverSet(key, value, { sale, sig, sigTs });
  },

  // Exposed for tooling/sanity checks.
  isSensitiveKey(key) {
    return SENSITIVE_SHARED_KEYS.has(String(key || "").toLowerCase().trim());
  },
};
