// Static host → API proxy (Cloudflare Pages Functions; any Fetch host).
//
// The site stays first-party: /api/*, /r and the XML feeds are served on the
// site's own domain and forwarded unchanged to the one API (the Supabase Edge
// Function "api", which runs the unchanged api/*.mjs handlers). Same origin
// means the existing CORS rules apply as they are.

/** Base of the API host, e.g. https://<ref>.supabase.co/functions/v1 */
export function apiBase(env = {}) {
  const explicit = String(env.LIKELINK_API_BASE || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const sb = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  return sb ? `${sb}/functions/v1` : "";
}

/** The upstream URL for a site path (the API applies the rewrites itself). */
export function upstreamUrl(base, requestUrl) {
  const u = new URL(requestUrl);
  const path = u.pathname.startsWith("/api/") ? u.pathname : `/api${u.pathname}`;
  return `${base}${path}${u.search}`;
}

export async function proxyToApi(context) {
  const { request, env } = context;
  const base = apiBase(env);
  if (!base) {
    return new Response(JSON.stringify({ ok: false, error: "api_not_configured" }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const inUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", inUrl.host);
  headers.set("x-forwarded-proto", inUrl.protocol.replace(":", ""));
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const hasBody = !["GET", "HEAD"].includes(request.method);
  return fetch(upstreamUrl(base, request.url), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  });
}
