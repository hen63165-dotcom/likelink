// A one-off reachability probe for the trend radar's free Israel signals, run on a GitHub runner
// (this session's container cannot reach these hosts). It reads each host's robots.txt and makes
// ONE sample request per source, printing status, size and the first bytes. No key, nothing stored.
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const get = async (url) => {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { status: r.status, len: t.length, text: t };
  } catch (e) { return { status: "ERR", len: 0, text: String(e?.message || e) }; }
};
const robots = ["https://suggestqueries.google.com/robots.txt", "https://www.google.com/robots.txt", "https://trends.google.com/robots.txt", "https://duckduckgo.com/robots.txt", "https://www.bing.com/robots.txt", "https://wikimedia.org/robots.txt"];
for (const u of robots) {
  const r = await get(u);
  const lines = r.text.split("\n").filter((l) => /complete|suggest|trending|rss|osjson|\/ac|api\/rest|^user-agent: \*/i.test(l)).slice(0, 25);
  console.log(`== ${u} → ${r.status} (${r.len} bytes)\n${lines.join("\n")}`);
}
const samples = [
  "https://suggestqueries.google.com/complete/search?client=firefox&hl=he&gl=il&q=" + encodeURIComponent("סקווישי"),
  "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=" + encodeURIComponent("butter stick squishy"),
  "https://trends.google.com/trending/rss?geo=IL",
  "https://duckduckgo.com/ac/?kl=il-he&q=" + encodeURIComponent("סקווישי"),
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Squishy_(toy)/daily/20261101/20261110",
];
for (const u of samples) {
  const r = await get(u);
  console.log(`== SAMPLE ${u} → ${r.status} (${r.len} bytes)\n${r.text.slice(0, 400)}`);
}
