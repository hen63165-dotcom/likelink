// Client helper for the server-verified admin session (api/admin/auth.mjs).
// The admin code itself is never stored client-side — only the signed token.

export async function adminLogin(code) {
  try {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: String(code || "") }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, token: data.token, expiresIn: data.expiresIn };
    return { ok: false, reason: data.error || `http_${res.status}` };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function verifyAdminToken(token) {
  try {
    const res = await fetch("/api/admin/auth", {
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(res.ok && data.ok);
  } catch {
    return false;
  }
}

export function adminLogout() {
  try {
    sessionStorage.removeItem("ll_admin_token");
  } catch {
    /* noop */
  }
}

/**
 * Owner identity path (anti admin-loop): the platform Owner, signed in with
 * her normal LikeLink account, can open the official-site report WITHOUT a
 * separate admin code. The server (api/store.mjs cloud-report) verifies the
 * session email against OWNER_EMAIL — this client call NEVER decides access,
 * it only presents the verified session token.
 * Returns true when the server authorized the Owner session.
 */
export async function verifyOwnerSession() {
  try {
    const { supabase, supabaseConfigured } = await import("./supabaseClient");
    if (!supabaseConfigured) return false;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return false;
    const res = await fetch("/api/store?mode=cloud-report", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}
