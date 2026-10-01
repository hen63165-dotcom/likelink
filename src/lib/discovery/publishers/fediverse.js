// Bluesky + Mastodon publishers — free, official APIs, no app review.
//
// Same contract as publishers/telegram.js: PUBLISHED only with the network's
// own post id; PUBLIC_VERIFIED only when the post is readable through the
// network's PUBLIC API. Credentials come from the creator's autopilot channel
// settings (Bluesky: handle + app password; Mastodon: instance + token) and are
// never logged, returned or stored by this module.

const enc = new TextEncoder();
const byteLen = (s) => enc.encode(s).length;

/** Bluesky needs explicit link facets (UTF-8 byte offsets) for clickable links. */
export function linkFacets(text) {
  const facets = [];
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text))) {
    const byteStart = byteLen(text.slice(0, m.index));
    facets.push({ index: { byteStart, byteEnd: byteStart + byteLen(m[0]) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  return facets;
}

/** Fit a post into `max` characters: keep the first line (disclosure) and the link. */
export function fitPost(text, max) {
  const t = String(text || "").trim();
  if ([...t].length <= max) return t;
  const lines = t.split("\n");
  const link = lines.find((l) => /^https?:\/\//.test(l)) || "";
  const first = lines[0] || "";
  const rest = lines.slice(1).filter((l) => l !== link && !l.startsWith("#") && !l.startsWith("•"));
  let body = [first, ...rest].join("\n");
  const room = max - [...link].length - 2;
  if ([...body].length > room) body = `${[...body].slice(0, Math.max(0, room - 1)).join("")}…`;
  return [body, link].filter(Boolean).join("\n");
}

export async function publishToBluesky({ handle, token, instance = "https://bsky.social", text, fetchImpl = fetch }) {
  if (!handle || !token) return { ok: false, error: "bluesky_not_configured" };
  const base = String(instance || "https://bsky.social").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return { ok: false, error: "bluesky_not_configured" };
  const postText = fitPost(text, 300);
  try {
    const login = await fetchImpl(`${base}/xrpc/com.atproto.server.createSession`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: token }), signal: AbortSignal.timeout(15000),
    });
    const session = await login.json().catch(() => null);
    if (!login.ok || !session?.accessJwt || !session?.did) return { ok: false, error: login.status === 401 ? "bluesky_bad_credentials" : `bluesky_login_failed_${login.status}` };
    const res = await fetchImpl(`${base}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({
        repo: session.did, collection: "app.bsky.feed.post",
        record: { $type: "app.bsky.feed.post", text: postText, createdAt: new Date().toISOString(), langs: ["he"], facets: linkFacets(postText) },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.uri) return { ok: false, error: res.status === 429 ? "bluesky_rate_limited" : `bluesky_failed_${res.status}` };
    const rkey = String(data.uri).split("/").pop();
    const profile = session.handle || handle;
    return { ok: true, providerPostId: data.uri, publicUrl: `https://bsky.app/profile/${profile}/post/${rkey}` };
  } catch {
    return { ok: false, error: "bluesky_unreachable" };
  }
}

export async function verifyBlueskyPublic(atUri, { fetchImpl = fetch } = {}) {
  if (!/^at:\/\/did:[a-z0-9:._-]+\/app\.bsky\.feed\.post\/[A-Za-z0-9]+$/i.test(String(atUri || ""))) return { ok: false, reason: "not_a_bluesky_post" };
  try {
    const res = await fetchImpl(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(atUri)}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    return res.ok && Array.isArray(data?.posts) && data.posts.some((p) => p.uri === atUri) ? { ok: true, checkedAt: Date.now() } : { ok: false, reason: "not_visible_publicly" };
  } catch {
    return { ok: false, reason: "verification_unreachable" };
  }
}

export async function publishToMastodon({ token, instance = "https://mastodon.social", text, fetchImpl = fetch }) {
  const base = String(instance || "https://mastodon.social").replace(/\/+$/, "");
  if (!token || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) return { ok: false, error: "mastodon_not_configured" };
  try {
    const res = await fetchImpl(`${base}/api/v1/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: fitPost(text, 500), visibility: "public", language: "he" }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) return { ok: false, error: res.status === 401 ? "mastodon_bad_token" : res.status === 429 ? "mastodon_rate_limited" : `mastodon_failed_${res.status}` };
    return { ok: true, providerPostId: String(data.id), publicUrl: data.url || null, instance: base };
  } catch {
    return { ok: false, error: "mastodon_unreachable" };
  }
}

export async function verifyMastodonPublic(instance, id, { fetchImpl = fetch } = {}) {
  const base = String(instance || "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base) || !/^\d+$/.test(String(id || ""))) return { ok: false, reason: "not_a_mastodon_post" };
  try {
    const res = await fetchImpl(`${base}/api/v1/statuses/${id}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    return res.ok && String(data?.id) === String(id) && data?.visibility === "public" ? { ok: true, checkedAt: Date.now() } : { ok: false, reason: "not_visible_publicly" };
  } catch {
    return { ok: false, reason: "verification_unreachable" };
  }
}
