// Cloud read resilience for the browser (src/lib/storage.js).
//
// When Supabase answers 402 (the project is restricted, e.g. its egress quota
// ran out) or does not answer at all, every further request fails the same
// way. The breaker remembers that for a few minutes (per tab, in
// sessionStorage), so reads go straight to the shipped catalog copy instead of
// sending one doomed request per key, and writes fail fast with an honest
// error instead of a false success. Concurrent reads of one key share one
// request, and every read has a timeout, so a stalled network can never keep
// a page loading forever. Pure: no network, no globals at import time.

export const RESTRICTED_TTL_MS = 5 * 60_000;
export const UNREACHABLE_TTL_MS = 60_000;
export const READ_TIMEOUT_MS = 12_000;
const STORE_KEY = "ll_cloud_down";

/** "restricted" (provider refuses: quota/billing), "unreachable" (network/timeout) or "" (anything else). */
export function cloudFailureKind(error) {
  const text = String(error?.message || error?.error || error?.code || error || "");
  // "402" also inside codes like store_http_402 ("_" is a word character, so \b would miss it).
  if (/exceed_\w*quota|restricted|(^|\D)402(\D|$)/i.test(text)) return "restricted";
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || /timeout|aborted|failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(text)) return "unreachable";
  return "";
}

export function createBreaker({ now = () => Date.now(), store = null } = {}) {
  let state = null;
  try {
    const saved = JSON.parse(store?.getItem(STORE_KEY) || "null");
    if (saved && saved.until > now()) state = saved;
  } catch {
    state = null;
  }
  const isOpen = () => {
    if (state && state.until <= now()) state = null;
    return Boolean(state);
  };
  return {
    isOpen,
    /** Opens (or extends) the breaker. True when it was closed before: log once, not per key. */
    trip(kind, detail = "") {
      const first = !isOpen();
      const ttl = kind === "restricted" ? RESTRICTED_TTL_MS : UNREACHABLE_TTL_MS;
      state = { kind, since: state?.since || now(), until: now() + ttl, detail: String(detail).slice(0, 160) };
      try { store?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage may be blocked */ }
      return first;
    },
    reset() {
      state = null;
      try { store?.removeItem(STORE_KEY); } catch { /* ignore */ }
    },
    status() {
      return isOpen() ? { state: state.kind, since: state.since, until: state.until, detail: state.detail } : { state: "ok" };
    },
  };
}

/** One request per key at a time: concurrent readers share the same promise. */
export function dedupe(inflight, key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Payouts, charges and notifications are read only where the Studio or the
 * admin needs them: on those paths, or on a device with a studio/admin session
 * (MarketplaceContext). A shopper's visit skips three cloud reads it never
 * uses; public pages read products, creators, collections, clicks and sales.
 * A shopper's click notification is still written: the server merges it by id
 * (storeWritePolicy policyNotifications), keeping every stored one.
 */
export function studioDataWanted(pathname = "", hasSession = false, hasAdminToken = false) {
  return Boolean(hasSession || hasAdminToken) || /^\/(studio|sell|admin|dashboard)(\/|$)/.test(String(pathname));
}

/** Rejects with `<label>_timeout` after `ms`; the original promise is left to settle on its own. */
export function withTimeout(promise, ms, label = "cloud") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${label}_timeout`), { name: "TimeoutError" })), ms); }),
  ]).finally(() => clearTimeout(timer));
}
