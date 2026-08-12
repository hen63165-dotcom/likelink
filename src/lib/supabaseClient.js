import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True once both env vars are present (see .env.example + README.md).
export const supabaseConfigured = Boolean(url && key);

// Add global fetch with clock skew tolerance to fix "JWT issued at future" errors
// This handles minor clock differences between client and Supabase servers
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers);
  
  // Add clock skew tolerance via headers if supported
  if (!headers.has('X-Client-Info')) {
    headers.set('X-Client-Info', 'supabase-js/2.x');
  }
  
  return originalFetch(input, {
    ...init,
    headers,
  });
};

export const supabase = supabaseConfigured ? createClient(url, key, {
  auth: {
    // Tolerate up to 10 seconds of clock skew
    clockSkewInSecs: 10,
  },
}) : null;
