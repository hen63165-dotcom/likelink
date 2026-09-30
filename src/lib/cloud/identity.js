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
import { supabase, supabaseConfigured } from "../supabaseClient.js";

/**
 * Resolve the canonical LikeLink marketer for the current auth user.
 *
 * Strategy (in order):
 *   1. If profiles.marketer_id is set → use it (the cloud-trusted link).
 *   2. If not set (legacy user) → fall back to email match, then auto-link
 *      via the server so future logins use the trusted path.
 *
 * The public creators row no longer carries e-mails (creator privacy), so the
 * e-mail match runs server-side: GET /api/store?mode=me returns the verified
 * caller's own studio id(s) and private fields (never anyone else's).
 *
 * @returns {{ authUser: object, marketerId: string|null, linked: boolean, private: object|null }}
 */
export async function resolveCurrentMarketer(marketers) {
  if (!supabaseConfigured) {
    // Local dev without Supabase: fall back to localStorage (demo mode).
    return { authUser: null, marketerId: null, linked: false };
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { authUser: null, marketerId: null, linked: false, private: null };
  const own = await fetchOwnPrivate();
  const privateFor = (id) => own.find((m) => m.id === id) || null;

  // Path 1: cloud-trusted link via profiles.marketer_id
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("marketer_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profileErr && profile?.marketer_id) {
    const marketer = marketers.find((m) => m.id === profile.marketer_id);
    if (marketer) {
      return { authUser, marketerId: marketer.id, linked: true, private: privateFor(marketer.id) };
    }
    // marketer_id points to a deleted marketer — fall through to recovery
  }

  // Path 2: no marketer_id → the server's verified e-mail match (mode=me),
  // then a legacy local e-mail match, + auto-link.
  const email = authUser.email?.toLowerCase().trim();
  if (email) {
    const marketer =
      marketers.find((m) => own.some((o) => o.id === m.id)) ||
      marketers.find((m) => (m.email || "").toLowerCase().trim() === email);
    if (marketer) {
      // Auto-link: persist the trusted connection for next time (fire-and-forget,
      // server-verified). Failure is non-critical — we still resolve now.
      linkMarketer(authUser.id, marketer.id).catch(() => {});
      return { authUser, marketerId: marketer.id, linked: true, private: privateFor(marketer.id) };
    }
  }

  return { authUser, marketerId: null, linked: false, private: null };
}

/**
 * The verified caller's own private creator fields ([{ id, email, payPalEmail, … }]).
 * An admin token (the unlocked admin panel) returns every creator's fields.
 * Any failure → [] (the studio still opens; private fields just stay empty,
 * and the server never lets an empty value erase a stored one).
 */
export async function fetchOwnPrivate({ adminToken = "" } = {}) {
  if (!supabaseConfigured && !adminToken) return [];
  try {
    let token = adminToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || "";
    }
    if (!token) return [];
    const res = await fetch("/api/store?mode=me", { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok && Array.isArray(data.marketers) ? data.marketers : [];
  } catch {
    return [];
  }
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
