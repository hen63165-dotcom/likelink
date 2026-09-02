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
