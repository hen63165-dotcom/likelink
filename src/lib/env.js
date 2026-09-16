/**
 * LikeLink — Environment bridge 🔌 (zero-dependency, runtime-agnostic)
 * ====================================================================
 * ONE place that resolves environment variables, so every module works in
 * BOTH runtimes the platform actually ships to:
 *
 *   • Browser bundle (Vite)  → `import.meta.env` is STATICALLY REPLACED by
 *                              Vite at build time with the resolved env object.
 *   • Node / Vercel functions → `import.meta.env` is `undefined`; values come
 *                              from `process.env` instead.
 *
 * Why this file exists (real bugs it fixes):
 *   • `import.meta.env[KEY]` (dynamic access) THROWS in Node
 *     ("Cannot read properties of undefined") — it made `flags.js`
 *     un-importable from any serverless function or CLI script.
 *   • `import.meta.env?.KEY` silently returned `undefined` in Node, so a
 *     server-side caller would get a different (wrong) answer than the browser.
 *
 * Design rules (dependency-free + safe):
 *   • No imports, no side effects, never throws — always returns a value.
 *   • Vite keeps working: `import.meta.env` is written LITERALLY below so the
 *     bundler can statically replace it (no dynamic `import.meta[key]`).
 *   • Only `VITE_`-prefixed names are public by design. Non-prefixed secrets
 *     are read from `process.env` and are therefore available ONLY in Node
 *     (server) — never leaked into the browser bundle.
 */

/** Static-scannable Vite env bag. Literal `import.meta.env` → build-time inlined. */
function viteEnv() {
  try {
    // Vite replaces the literal token below with the resolved env object.
    // In Node, `import.meta.env` is `undefined` → `{}` (no throw).
    return import.meta.env || {};
  } catch {
    return {};
  }
}

/** Node env bag (empty object in the browser — `process` is not defined there). */
function nodeEnv() {
  try {
    return typeof process !== "undefined" && process && process.env ? process.env : {};
  } catch {
    return {};
  }
}

/**
 * Read an environment value by name, working in every runtime.
 * Browser: Vite's inlined `import.meta.env`. Node: also `process.env`.
 *
 * @param {string} key — e.g. "VITE_SUPABASE_URL" or "ADMIN_CODE"
 * @param {string} [fallback=""] — returned when the key is missing/empty
 * @returns {string} the trimmed value, or `fallback`
 */
export function getEnv(key, fallback = "") {
  if (!key) return fallback;
  const fromVite = viteEnv()[key];
  if (fromVite !== undefined && fromVite !== null && String(fromVite) !== "") {
    return String(fromVite);
  }
  const fromNode = nodeEnv()[key];
  if (fromNode !== undefined && fromNode !== null && String(fromNode) !== "") {
    return String(fromNode);
  }
  return fallback;
}

/** True when the key resolves to a non-empty value in this runtime. */
export function hasEnv(key) {
  return getEnv(key, "") !== "";
}

/** Read a comma-separated list (e.g. VITE_ALLOWED_HOSTS) → clean lowercase array. */
export function getEnvList(key, fallback = []) {
  const raw = getEnv(key, "");
  if (!raw) return Array.isArray(fallback) ? fallback : [];
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Read a boolean flag. Accepts "true"/"1" (on) and "false"/"0" (off);
 * anything else (including a missing key) yields `defaultValue`.
 */
export function getEnvBool(key, defaultValue = false) {
  const raw = String(getEnv(key, "")).trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return Boolean(defaultValue);
}

/** True when running inside a browser window (safe in Node). */
export function isBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

/** True when running in a Node-like runtime (serverless function, CLI, test). */
export function isNode() {
  return !isBrowser() && typeof process !== "undefined" && Boolean(process.versions?.node);
}