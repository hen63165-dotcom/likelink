// 🚪 The radar's open doors, checked from a runner (this session's container cannot reach some of
// them). For each official open door the radar reads: its robots.txt status and one small request, and
// what came back (status, content type, the first bytes). Read-only; no key is sent or printed.
//   node scripts/ops/radar-doors.mjs
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const month = (back) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
const DOORS = [
  ...[1, 2, 3, 4].map((b) => ({ id: `census-probe-${month(b)}`, url: `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=GEN_VAL_MO&COMM_LVL=HS2&I_COMMODITY=95&CTY_CODE=5700&time=${month(b)}` })),
  ...[1, 2, 3, 4].map((b) => ({ id: `census-chapters-${month(b)}`, url: `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=I_COMMODITY,GEN_VAL_MO&COMM_LVL=HS2&CTY_CODE=5700&time=${month(b)}` })),
  { id: "abs-robots", url: "https://data.api.abs.gov.au/robots.txt", max: 300 },
  { id: "abs-dataflows", url: "https://data.api.abs.gov.au/rest/dataflow/ABS?detail=allstubs", headers: { "user-agent": UA, accept: "application/vnd.sdmx.structure+json" }, max: 0, grep: /MERCH|TRADE|IMP/i },
  { id: "statcan-robots", url: "https://www150.statcan.gc.ca/robots.txt", max: 500 },
  { id: "gnews-robots", url: "https://news.google.com/robots.txt", max: 700 },
  { id: "gdelt-robots", url: "https://api.gdeltproject.org/robots.txt", max: 200 },
  { id: "gdelt", url: "https://api.gdeltproject.org/api/v2/doc/doc?query=%22butter%20squishy%22&mode=timelinevolraw&format=json&timespan=1m" },
];
for (const d of DOORS) {
  const t0 = Date.now();
  try {
    const res = await fetch(d.url, { headers: d.headers || { "user-agent": UA, accept: "application/json, text/plain" }, signal: AbortSignal.timeout(60_000) });
    const body = await res.text();
    if (d.grep) { const hits = [...new Set(body.match(new RegExp(`"id":"[A-Z_0-9]*(?:${d.grep.source})[A-Z_0-9]*"[^}]{0,160}`, "gi")) || [])].slice(0, 25); console.log(`${d.id}: ${res.status} ${body.length}B · ${hits.join(" || ").slice(0, 3000)}`); continue; }
    console.log(`${d.id}: ${res.status} ${res.headers.get("content-type") || "-"} ${body.length}B ${Date.now() - t0}ms · ${JSON.stringify(body.slice(0, d.max ?? 160))}${d.tail ? ` … ${JSON.stringify(body.slice(-d.tail))}` : ""}`);
  } catch (err) {
    console.log(`${d.id}: error ${String(err?.cause?.code || err?.message || err).slice(0, 80)} ${Date.now() - t0}ms`);
  }
  await new Promise((ok) => setTimeout(ok, 1500));
}
