// One-off probe (log only): robots.txt and ONE sample each for more free Israel signals —
// YouTube autocomplete, DuckDuckGo autocomplete, Israeli store search (Zap, KSP), Google Shopping
// suggestions. No key, nothing stored.
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const get = async (url) => {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*", "accept-language": "he-IL,he;q=0.9" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { status: r.status, len: t.length, text: t, loc: r.headers.get("location") };
  } catch (e) { return { status: "ERR", len: 0, text: String(e?.message || e) }; }
};
for (const u of ["https://duckduckgo.com/robots.txt", "https://www.zap.co.il/robots.txt", "https://ksp.co.il/robots.txt", "https://www.youtube.com/robots.txt"]) {
  const r = await get(u);
  console.log(`== ${u} → ${r.status} (${r.len} bytes)\n${r.text.slice(0, 1500)}`);
}
const q = encodeURIComponent("סקווישי");
for (const u of [
  `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=he&gl=il&q=${q}`,
  `https://suggestqueries.google.com/complete/search?client=firefox&ds=sh&hl=he&gl=il&q=${q}`,
  `https://duckduckgo.com/ac/?kl=il-he&q=${encodeURIComponent("סקווישי קפיברה")}`,
  `https://www.zap.co.il/search.aspx?keyword=${q}`,
  `https://www.zap.co.il/search.aspx?keyword=${encodeURIComponent("סקווישי קפיברה")}`,
]) {
  const r = await get(u);
  const counts = [...r.text.matchAll(/(\d[\d,]*)\s*(?:תוצאות|מוצרים|results)/g)].slice(0, 5).map((m) => m[0]);
  console.log(`== SAMPLE ${u} → ${r.status} (${r.len} bytes) loc=${r.loc || ""} counts=${JSON.stringify(counts)}\n${r.text.replace(/\s+/g, " ").slice(0, 500)}`);
}
