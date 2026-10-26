#!/usr/bin/env node
// The owner's trend-board picks → the cloud catalog the live site reads
// (.github/workflows/trend-add.yml, after the catalog copy step).
//
//   POST /api/store?mode=growth-engine&op=affiliate-choose   (Bearer AUTOPILOT_SECRET)
//
// Sends only item numbers (and her own s.click link when she pasted one). The
// server re-reads every item from her affiliate account, applies the deals
// rules (src/lib/growth/deals.js: price and brand), adds it to her studio and
// reads the write back (api/_utils/aliexpressAffiliate.mjs importChosenItems).
// --dry-run prints the payload and sends nothing.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseItems } from "../../src/lib/growth/trendBoard.js";
import { aliItemId, resolveFromLink } from "./sync-aliexpress.mjs";

const API = String(process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.AUTOPILOT_SECRET || "";
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${l}\n`); };

/** parseItems' entries → [{ id, category?, link? }] (a link is resolved to its store item with one request). */
export async function pickItems(input, fetchImpl = globalThis.fetch) {
  const out = [];
  for (const it of parseItems(input)) {
    const raw = it.id || (it.link ? await resolveFromLink(it.link, fetchImpl) : "");
    const id = raw ? aliItemId({ aliexpressId: raw }) || raw : "";
    if (id) out.push({ id, ...(it.category ? { category: it.category } : {}), ...(it.link ? { link: it.link } : {}) });
    else summary(`- ${it.link || it.id}: LINK_NOT_RESOLVED`);
  }
  return out;
}

async function main() {
  const items = await pickItems(process.env.TREND_IDS ?? process.argv[2] ?? "");
  summary(`## Picks → cloud (${items.length})`);
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ items }, null, 1)); return; }
  if (!items.length) return;
  if (!SECRET) { summary("REQUIRES_CONNECTION: the AUTOPILOT_SECRET secret is missing. Nothing was sent."); process.exitCode = 1; return; }
  const res = await fetch(`${API}/api/store?mode=growth-engine&op=affiliate-choose`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, Origin: API, "content-type": "application/json" },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(60_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  for (const r of json?.report || []) summary(`- ${r.id}: ${r.status}${r.title ? ` · ${r.title} · ₪${r.price}` : ""}`);
  summary(`HTTP ${res.status} · ${json?.ok ? `added ${json.added}` : json?.error || "no answer"}`);
  if (!res.ok || !json?.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
