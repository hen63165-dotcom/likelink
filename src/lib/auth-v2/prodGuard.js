// src/lib/auth-v2/prodGuard.js
//
// Fail-loud guard against the insecure "demo auth" fallback running in
// production. This is a NEW, isolated module — it does not modify or
// replace src/lib/auth.js or src/context/MarketplaceContext.jsx.
//
// Background: when Supabase Auth env vars (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY) are missing, `authConfigured` becomes false and
// the app's demo mode allows login by email match ONLY, with no password
// check at all. That is a reasonable convenience for local development,
// but it must NEVER be reachable on a real production domain.
//
// This module does not change that demo behavior for local/dev use. It
// only refuses to allow it on a known production host, loudly, with a
// clear error — instead of the app silently "working" in an insecure mode.

// TODO (human decision, not the agent's to invent): confirm the exact
// production hostname(s) actually serving live traffic today. index.html
// hardcodes https://likelink.com as canonical; the Vercel project is
// "likelink2" with several *.vercel.app domains. List every domain real
// users can reach the live app on.
const KNOWN_PRODUCTION_HOSTS = [
  "likelink.com",
  "www.likelink.com",
  // Add every production Vercel domain here, e.g.:
  // "likelink2.vercel.app",
  // "likelink2-hen63165-8727s-projects.vercel.app",
];

/**
 * True if the app is currently running on a known production host.
 * Returns false for localhost, 127.0.0.1, preview/*.vercel.app deploy
 * URLs not explicitly listed, and any non-browser (SSR/build) context.
 */
export function isKnownProductionHost() {
  if (typeof window === "undefined" || !window.location) return false;
  const host = window.location.hostname;
  return KNOWN_PRODUCTION_HOSTS.some(
    (known) => host === known || host.endsWith(`.${known}`)
  );
}

/**
 * Throws a clear, loud error if the insecure demo-auth fallback
 * (authConfigured === false) would otherwise run on a production host.
 * Call this at the very top of onLogin/onSignup, before any existing
 * logic. Does not change behavior anywhere else — local/dev demo mode
 * is untouched.
 */
export function assertAuthSafeForEnvironment(authConfigured) {
  if (authConfigured) return; // real Supabase Auth is configured — fine.
  if (!isKnownProductionHost()) return; // local/dev — demo mode is fine here.

  // We are on a real production host AND Supabase Auth env vars are
  // missing. Refuse the insecure fallback instead of allowing
  // no-password login.
  throw new Error(
    "AUTH_NOT_CONFIGURED_IN_PRODUCTION: Supabase Auth environment " +
      "variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are missing " +
      "on a production domain. Refusing the no-password demo login " +
      "fallback for safety. Fix: set these variables in Vercel → " +
      "Settings → Environment Variables → Production, then redeploy."
  );
}
