// 📜 Ten years back, today (src/lib/growth/radarHistory.js): the radar's early-alarm rule on Wikimedia's
// public pageview counts since 1 July 2015, for the articles named in that file before the run. One
// request per article to the official Pageviews API (wikimedia.org's rules file is read first; it answers
// 404, no rule), politely spaced, with the radar's own user agent. Writes `history-public.json`:
//   node scripts/catalog/radar-history.mjs <out dir>
// On main the workflow attaches it to the `radar` release; deploy-frontend.yml serves it at
// /radar/history.json. A branch run only prints the totals.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES, historyStudy, pageviewsUrl, weekly } from "../../src/lib/growth/radarHistory.js";

const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const out = process.argv[2] || "radar-history";
mkdirSync(out, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

// The rules file, following redirects within the same site (RFC 9309): wikimedia.org → www.wikimedia.org.
async function robotsOpen() {
  let u = "https://wikimedia.org/robots.txt";
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(u, { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (loc) { const next = new URL(loc, u); if (!/(^|\.)wikimedia\.org$/.test(next.hostname)) return false; u = next.href; continue; }
    if (res.status === 404 || res.status === 410) return true;
    if (res.status !== 200) return false;
    const txt = await res.text();
    // Any group that closes /api/rest_v1 for every reader closes the door.
    return !/user-agent:\s*\*[\s\S]*?disallow:\s*\/api\/rest_v1\b/i.test(txt) && !/user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*$/im.test(txt);
  }
  return false;
}

if (!(await robotsOpen())) {
  console.log("history: wikimedia.org's rules close the Pageviews API to automatic readers; nothing asked");
  process.exit(0);
}
const series = {};
const missing = [];
let failed = 0;
for (const title of ARTICLES) {
  await wait(250);
  try {
    const res = await fetch(pageviewsUrl(title, end), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) { missing.push(title); continue; }
    if (!res.ok) { failed++; continue; }
    const body = await res.json();
    series[title] = weekly(body?.items || []);
  } catch { failed++; }
}
const study = historyStudy(series, today);
writeFileSync(join(out, "history-public.json"), JSON.stringify(study));
console.log(`history: ${Object.keys(series).length} of ${ARTICLES.length} articles read · ${missing.length} with no article (${missing.join(", ") || "none"}) · ${failed} failed · ${study.weeks} weeks`);
console.log(`history: alarms graded ${study.alarms.graded} · became a boom within ${study.rules.horizonWeeks} weeks: ${study.alarms.hits} (${study.alarms.precisionPct}%) · a random week of the same articles: ${study.baseRatePct}% · lift ×${study.lift}`);
console.log(`history: booms ${study.booms.total} · alarmed before the boom was plain: ${study.booms.ahead} · same week: ${study.booms.caught - study.booms.ahead} · median lead: ${study.lead.toBoomWeeks} weeks before the boom, ${study.lead.toPeakWeeks} before its peak`);
for (const b of study.boomsList.slice(0, 40)) console.log(`  boom ${b.title} ${b.boom} (×${b.ratio}, peak ${b.peak}) · ${b.alarmed}`);
for (const a of study.list.slice(0, 40)) console.log(`  alarm ${a.title} ${a.alarm} · ${a.hit ? `boom ${a.boom}, ${a.leadToBoom} weeks earlier, peak ${a.peak} (${a.leadToPeak} weeks)` : "no boom within the horizon"}`);
