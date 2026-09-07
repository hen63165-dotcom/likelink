/**
 * LikeLink Cloud — Identity boundary.
 *
 * This is the ONLY module that resolves "who is this user" to a canonical
 * LikeLink studio/marketer. The rest of the app talks to this boundary and
 * never touches auth provider details directly.
 *
 * Current infrastructure provider: Supabase Auth (behind this interface).
 * The provider can be swapped later without touching business logic.
 *
 * IMPORTANT: localStorage session:marketerId is NOT an authorization boundary
 * anymore. It is a UI convenience cache. The real identity comes from the
 * authenticated Auth session + the profiles.marketer_id link (server-verified).
 */
import { supabase, supabaseConfigured } from "../supabaseClient";

/**
 * Resolve the canonical LikeLink marketer for the current auth user.
 *
 * Strategy (in order):
 *   1. If profiles.marketer_id is set → use it (the cloud-trusted link).
 *   2. If not set (legacy user) → fall back to email match, then auto-link
 *      via the server so future logins use the trusted path.
 *
 * @returns {{ authUser: object, marketerId: string|null, linked: boolean }}
 */
export async function resolveCurrentMarketer(marketers) {
  if (!supabaseConfigured) {
    // Local dev without Supabase: fall back to localStorage (demo mode).
    return { authUser: null, marketerId: null, linked: false };
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { authUser: null, marketerId: null, linked: false };

  // Path 1: cloud-trusted link via profiles.marketer_id
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("marketer_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profileErr && profile?.marketer_id) {
    const marketer = marketers.find((m) => m.id === profile.marketer_id);
    if (marketer) {
      return { authUser, marketerId: marketer.id, linked: true };
    }
    // marketer_id points to a deleted marketer — fall through to recovery
  }

  // Path 2: legacy user without marketer_id → email match + auto-link
  const email = authUser.email?.toLowerCase().trim();
  if (email) {
    const marketer = marketers.find(
      (m) => (m.email || "").toLowerCase().trim() === email
    );
    if (marketer) {
      // Auto-link: persist the trusted connection for next time (fire-and-forget,
      // server-verified). Failure is non-critical — we still resolve now.
      linkMarketer(authUser.id, marketer.id).catch(() => {});
      return { authUser, marketerId: marketer.id, linked: true };
    }
  }

  return { authUser, marketerId: null, linked: false };
}

/**
 * Server-verified linking of auth user → LikeLink marketer.
 *
 * The server validates:
 *   - the caller owns the auth session (Bearer token)
 *   - the marketer exists in kv
 *   - the marketer is not already claimed by another auth user
 *
 * @param {string} authUserId — auth.uid
 * @param {string} marketerId — existing LikeLink marketer id
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function linkMarketer(authUserId, marketerId) {
  if (!supabaseConfigured) {
    return { ok: false, error: "supabase_not_configured" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

    // Merged into /api/store?mode=link-identity (Vercel Hobby 12-function limit).
  // The server still verifies the Bearer token server-side and writes
  // profiles.marketer_id using the SERVICE_ROLE key.
  const res = await fetch("/api/store?mode=link-identity", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ authUserId, marketerId }),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    // ignore parse error
  }

  return res.ok && payload.ok
    ? { ok: true }
    : { ok: false, error: payload.error || `http_${res.status}` };
}

/**
 * Get the current auth user (or null). Thin wrapper so business logic
 * never imports supabase directly for identity.
 */
export async function getAuthUser() {
  if (!supabaseConfigured) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export const cloudAuthConfigured = supabaseConfigured;
