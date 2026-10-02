// The public view of the marketing engine's site-feed posts (pure). A post is
// shown only when its product is in the public graph (approved, attributed),
// or when it promotes a LikeLink page. Links stay on our own origin, with
// their cid, so a visit is measured.
const arr = (v) => (Array.isArray(v) ? v : []);

export function enginePicksFrom(posts = [], graph = { products: [] }, { limit = 3 } = {}) {
  const byId = new Map(arr(graph?.products).map((p) => [String(p.id), p]));
  const out = [];
  const seen = new Set();
  for (const post of arr(posts)) {
    if (post?.source !== "marketing_engine" || !post.link) continue;
    let to;
    try {
      const u = new URL(post.link);
      if (!/^\/(p\/[^/?#]+|sell|reels|discover)$/.test(u.pathname)) continue;
      to = `${u.pathname}${u.search}`;
    } catch { continue; }
    const sid = post.spotlight?.id ? String(post.spotlight.id) : null;
    const p = sid ? byId.get(sid) : null;
    if (sid && !p) continue; // not in the public graph → never shown
    const key = sid || to.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const lines = String(post.text || "").split("\n").map((s) => s.trim()).filter(Boolean);
    out.push({
      id: post.id, to, hook: lines[0] || "", title: p ? p.displayTitle || p.title : lines[1] || "LikeLink",
      image: p?.media?.image || null, price: p ? p.price : null,
      animated: Boolean(post.video?.videoUrl), affiliate: Boolean(p),
    });
    if (out.length >= limit) break;
  }
  return out;
}
