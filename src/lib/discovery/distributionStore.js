// Distribution storage + the ONE publish path shared by the studio (a post
// the owner confirms) and the campaign autorun (a campaign the owner approved).
// Idempotent: a PUBLISHED post is never sent twice. PUBLISHED needs the
// provider's own post id; PUBLIC_VERIFIED needs the post readable in public.
import { POST_STATE } from "./distribution.js";
import { publishPost } from "./publishers/index.js";

export const plansKey = (scopeKey) => `distribution:plans:${scopeKey}`;
export const connectionsKey = (scopeKey) => `distribution:connections:${scopeKey}`;
export const autorunKey = (scopeKey) => `distribution:autorun:${scopeKey}`;
export const AUTORUN_INDEX_KEY = "distribution:autorun:index";

const updatePost = (list, planId, postId, patch) =>
  list.map((p) => (p.id !== planId ? p : { ...p, calendar: (p.calendar || []).map((x) => (x.postId === postId ? { ...x, ...patch } : x)) }));

/**
 * @returns {Promise<{ok:true, post, idempotent?:boolean} | {ok:false, error:string, status:number}>}
 */
export async function publishPlanPost({ kvGet, kvSet, scopeKey, planId, postId, creds = {}, fetchImpl = fetch, now = Date.now(), via = "studio" }) {
  const list = (await kvGet(plansKey(scopeKey), [])) || [];
  const plan = list.find((p) => p.id === planId);
  const post = plan?.calendar?.find((x) => x.postId === postId);
  if (!post) return { ok: false, error: "not_found", status: 404 };
  if (post.state === POST_STATE.PUBLISHED) return { ok: true, idempotent: true, post };
  const channelCreds = creds[post.channel];
  if (!channelCreds) return { ok: false, error: "channel_requires_connection", status: 409 };
  const sent = await publishPost({
    channel: post.channel, creds: channelCreds, text: post.caption,
    // Only a REAL product photo is attached (plan.media.productPhoto is empty for stock images).
    photoUrl: post.channel === "telegram" ? plan.media?.productPhoto || "" : "",
    fetchImpl,
  });
  // Re-read right before writing so a concurrent change is not lost.
  const fresh = (await kvGet(plansKey(scopeKey), [])) || list;
  const at = new Date(now).toISOString();
  if (!sent.ok) {
    await kvSet(plansKey(scopeKey), updatePost(fresh, planId, postId, { lastError: { code: sent.error, at, via } }));
    return { ok: false, error: sent.error, status: 502 };
  }
  const published = {
    state: POST_STATE.PUBLISHED, provider: sent.provider, providerPostId: sent.providerPostId, publicUrl: sent.publicUrl,
    publishedAt: at, publishedVia: via, verification: sent.verification, verificationNote: sent.verificationNote, lastError: null,
  };
  await kvSet(plansKey(scopeKey), updatePost(fresh, planId, postId, published));
  const connections = (await kvGet(connectionsKey(scopeKey), {})) || {};
  await kvSet(connectionsKey(scopeKey), { ...connections, [post.channel]: { verifiedAt: at, providerAccountId: sent.publicUrl ? sent.publicUrl.split("/").slice(0, -1).join("/") : "private", source: channelCreds.source || "creator" } });
  return { ok: true, post: { ...post, ...published } };
}

/** Israel-time evening slot of a post date (19:30 IDT ≈ 16:30 UTC). */
export const postDueAt = (post) => Date.parse(`${post.date}T16:30:00Z`);
