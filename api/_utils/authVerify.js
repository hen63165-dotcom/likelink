// Vercel Serverless Utility — Supabase Auth token verification.
// Single shared implementation (used by api/store.mjs and api/autopilot.mjs):
// verifies a Bearer access token against the Supabase auth server and returns
// the Auth user record or null. Server-only — never exposes secrets.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function verifyToken(accessToken) {
  if (!accessToken || !SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
