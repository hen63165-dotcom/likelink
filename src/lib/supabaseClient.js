import { createClient } from "@supabase/supabase-js";
import { getEnv, isBrowser } from "./env.js";

// Runtime-agnostic env resolution (see src/lib/env.js).
//   • Browser → Vite statically inlines `import.meta.env` inside env.js.
//   • Node    → falls back to `process.env` (serverless / CLI / tests).
// This replaced the previous direct `import.meta.env.X` reads, which crashed
// with "Cannot read properties of undefined" the moment a Node caller
// (api/*.mjs, scripts, tests) imported any module in this chain.
const url = getEnv("VITE_SUPABASE_URL");
const key = getEnv("VITE_SUPABASE_ANON_KEY");

// True once both env vars are present (see .env.example + README.md).
export const supabaseConfigured = Boolean(url && key);

/**
 * Idempotent, browser-only `fetch` patch.
 *
 * WHY the guards (real reliability bugs this prevents):
 *   • Every import USED to wrap `globalThis.fetch` again → on Vite HMR (and any
 *     double module instance) the wrapper stacked, and each call re-wrapped
 *     `Headers`, silently slowing every request down.
 *   • Serverless functions / CLI scripts / tests have no reason to mutate the
 *     global fetch — and doing so made the module unsafe to import server-side.
 *
 * The patch is therefore applied AT MOST ONCE, ONLY in a real browser, and
 * always delegates to the original implementation.
 */
const FETCH_PATCHED = Symbol.for("likelink.fetchPatched");

function patchFetchOnce() {
  try {
    if (!isBrowser()) return;                        // server / test / CLI: never touch globals
    if (typeof globalThis.fetch !== "function") return;
    if (globalThis[FETCH_PATCHED]) return;           // already patched → no stacking

    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const headers = new Headers(init.headers);
      // supabase-js already sends X-Client-Info; set it only when a caller
      // forwards raw requests so the trace stays identifiable end-to-end.
      if (!headers.has("X-Client-Info")) {
        headers.set("X-Client-Info", "supabase-js/2.x");
      }
      return originalFetch(input, { ...init, headers });
    };
    globalThis[FETCH_PATCHED] = true;
  } catch {
    /* never let a convenience patch break the app */
  }
}

patchFetchOnce();

export const supabase = supabaseConfigured ? createClient(url, key, {
  auth: {
    // Tolerate up to 10 seconds of clock skew
    clockSkewInSecs: 10,
  },
}) : null;
