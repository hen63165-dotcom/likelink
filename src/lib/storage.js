/**
 * Storage adapter for Likelink.
 *
 * SHARED data (the public feed: marketers, products, clicks, sales, settings)
 * is read from / written to a Supabase Postgres table called `kv`, so every
 * visitor — any creator, any shopper — sees the same live marketplace.
 *
 * PERSONAL data (which creator studio is logged in on *this* device) stays in
 * localStorage. There's no reason to sync that across devices.
 *
 * Setup: see README.md for the SQL to create the `kv` table + policies, and
 * add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to a local `.env` file (and
 * to Vercel's Project Settings → Environment Variables before deploying).
 *
 * If those env vars are missing, every call here silently falls back to
 * localStorage so local dev never crashes — but the feed won't be shared
 * across devices until Supabase is actually wired up.
 */

import { supabase, supabaseConfigured } from "./supabaseClient";

const PREFIX = "sch:";
const scoped = (key, shared) => PREFIX + (shared ? "shared:" : "local:") + key;

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

export const storage = {
  async get(key, shared = false) {
    if (!shared) return localGet(key, shared);

    if (!supabaseConfigured) {
      console.warn(`[storage] Supabase not configured — "${key}" falling back to localStorage. See README.md.`);
      return localGet(key, shared);
    }

    try {
      const { data, error } = await supabase.from("kv").select("value").eq("key", key).maybeSingle();
      if (error) throw error;
      return data ? { key, value: data.value, shared: true } : null;
    } catch (e) {
      console.error("storage.get (supabase) failed, falling back to localStorage", key, e);
      return localGet(key, shared);
    }
  },

  async set(key, value, shared = false) {
    if (!shared) return localSet(key, value, shared);

    if (!supabaseConfigured) {
      console.warn(`[storage] Supabase not configured — "${key}" falling back to localStorage. See README.md.`);
      return localSet(key, value, shared);
    }

    try {
      const { error } = await supabase.from("kv").upsert({ key, value, shared: true }, { onConflict: "key" });
      if (error) throw error;
      return { key, value, shared: true };
    } catch (e) {
      console.error("storage.set (supabase) failed, falling back to localStorage", key, e);
      return localSet(key, value, shared);
    }
  },
};
