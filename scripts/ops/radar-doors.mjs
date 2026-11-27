// 🚪 The radar's open doors, checked from a runner (this session's container cannot reach some of
// them). For each official open door the radar reads: its robots.txt status and one small request, and
// what came back (status, content type, the first bytes). Read-only; no key is sent or printed.
//   node scripts/ops/radar-doors.mjs
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const month = (back) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
const DOORS = [
  { id: "census-robots", url: "https://api.census.gov/robots.txt" },
  { id: "census-robots-plain", url: "https://api.census.gov/robots.txt", headers: { "user-agent": "curl/8.5.0", accept: "*/*" } },
  { id: "census-robots-text", url: "https://api.census.gov/robots.txt", headers: { "user-agent": UA, accept: "text/plain" } },
  { id: "census-data-root", url: "https://api.census.gov/data.json", headers: { "user-agent": UA, accept: "application/json" }, max: 120 },
  ...[1, 2, 3, 4].map((b) => ({ id: `census-probe-${month(b)}`, url: `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=GEN_VAL_MO&COMM_LVL=HS2&I_COMMODITY=95&CTY_CODE=5700&time=${month(b)}` })),
  ...[1, 2, 3, 4].map((b) => ({ id: `census-chapters-${month(b)}`, url: `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=I_COMMODITY,GEN_VAL_MO&COMM_LVL=HS2&CTY_CODE=5700&time=${month(b)}` })),
  { id: "census-2025-09", url: "https://api.census.gov/data/timeseries/intltrade/imports/hs?get=GEN_VAL_MO&COMM_LVL=HS2&I_COMMODITY=95&CTY_CODE=5700&time=2025-09" },
  { id: "hmrc-apply", url: "https://api.uktradeinfo.com/OTS?$apply=filter(MonthId%20eq%20202609%20and%20CountryId%20eq%20720%20and%20FlowTypeId%20eq%203)/groupby((CommodityId),aggregate(Value%20with%20sum%20as%20Value,NetMass%20with%20sum%20as%20NetMass))&$top=3", max: 600 },
  { id: "hmrc-commodity", url: "https://api.uktradeinfo.com/Commodity?$filter=CommodityId%20eq%2095030075", max: 900 },
  { id: "hmrc-commodity-5", url: "https://api.uktradeinfo.com/Commodity?$filter=CommodityId%20eq%205", max: 900 },
  { id: "hmrc-expand", url: "https://api.uktradeinfo.com/OTS?$filter=MonthId%20eq%20202609%20and%20CountryId%20eq%20720%20and%20FlowTypeId%20eq%203%20and%20CommodityId%20ge%2095000000%20and%20CommodityId%20lt%2096000000&$top=2", max: 900 },
  { id: "hmrc-page", url: "https://api.uktradeinfo.com/OTS?$filter=MonthId%20eq%20202609%20and%20CountryId%20eq%20720%20and%20FlowTypeId%20eq%203", max: 0, tail: 400 },
  { id: "gdelt", url: "https://api.gdeltproject.org/api/v2/doc/doc?query=%22butter%20squishy%22&mode=timelinevolraw&format=json&timespan=1m" },
];
for (const d of DOORS) {
  const t0 = Date.now();
  try {
    const res = await fetch(d.url, { headers: d.headers || { "user-agent": UA, accept: "application/json, text/plain" }, signal: AbortSignal.timeout(60_000) });
    const body = await res.text();
    console.log(`${d.id}: ${res.status} ${res.headers.get("content-type") || "-"} ${body.length}B ${Date.now() - t0}ms · ${JSON.stringify(body.slice(0, d.max ?? 160))}${d.tail ? ` … ${JSON.stringify(body.slice(-d.tail))}` : ""}`);
  } catch (err) {
    console.log(`${d.id}: error ${String(err?.cause?.code || err?.message || err).slice(0, 80)} ${Date.now() - t0}ms`);
  }
  await new Promise((ok) => setTimeout(ok, 1500));
}
