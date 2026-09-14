import { readBody } from "./_utils/readBody.mjs";
// Vercel Serverless Function — Growth Job Runner 🧠
//
// Executes LikeLink's growth jobs through the provider-neutral scheduler.
// Triggered by Vercel Cron (daily) or manual invocation.
//
// The business logic lives in src/lib/cloud/growthScheduler.js — this file
// is ONLY the execution adapter. Replace Vercel Cron with any other scheduler
// without touching business logic.

import { jsonCors, isApprovedOrigin } from "./_utils/cors.js";
import { audit } from "./_utils/audit.js";
import { registerJob, executeJob, runDueJobs, getJobStatus, JOB_STATE } from "../src/lib/cloud/growthScheduler.js";
import { discoverOpportunities, createContentAsset, generateSitemapEntries, generateInternalLinks, CONTENT_TYPES } from "../src/lib/cloud/selfGrowth.js";
import { rankByTrend } from "../src/lib/cloud/trends.js";
import { buildTrackedLink } from "../src/lib/cloud/hooks.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROWING_CONTENT_KEY = "growth:content";
const GROWING_PUBLISHED_KEY = "growth:published";

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, { allowMethods: ["POST", "GET", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
}

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    const rows = await res.json();
    if (!rows?.[0]?.value) return null;
    let parsed = JSON.parse(rows[0].value);
    while (typeof parsed === "string" && parsed.length > 0) {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    return parsed;
  } catch { return null; }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, value }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// Register growth jobs
registerJob("discover-content", {
  intervalMs: 86400000,
  description: "Discover content opportunities from real LikeLink data",
  maxDurationMs: 30000,
  fn: async ({ kvGet, kvSet, now }) => {
    const products = (await kvGet("marketplace:products")) || [];
    const marketers = (await kvGet("marketplace:marketers")) || [];
    const sales = (await kvGet("marketplace:sales")) || [];
    const clicks = (await kvGet("marketplace:clicks")) || [];

    const opportunities = discoverOpportunities({ products, marketers, sales, clicks, now });
    await kvSet("growth:opportunities", opportunities.slice(0, 20));

    return { ok: true, opportunitiesFound: opportunities.length };
  },
});

registerJob("create-content", {
  intervalMs: 86400000,
  description: "Create content assets from discovered opportunities",
  maxDurationMs: 30000,
  fn: async ({ kvGet, kvSet, now }) => {
    const opportunities = (await kvGet("growth:opportunities")) || [];
    const products = (await kvGet("marketplace:products")) || [];
    const marketers = (await kvGet("marketplace:marketers")) || [];

    const assets = [];
    for (const opp of opportunities.slice(0, 5)) {
      const asset = createContentAsset(opp, { products, marketers, origin: "https://likelink2.vercel.app" });
      if (asset) {
        asset.status = "published";
        assets.push(asset);
      }
    }

    const existing = (await kvGet(GROWING_CONTENT_KEY)) || [];
    const merged = [...assets, ...existing].slice(0, 100);
    await kvSet(GROWING_CONTENT_KEY, merged);

    return { ok: true, assetsCreated: assets.length };
  },
});

registerJob("update-sitemap", {
  intervalMs: 86400000,
  description: "Update sitemap entries from published content",
  maxDurationMs: 15000,
  fn: async ({ kvGet, kvSet }) => {
    const assets = (await kvGet(GROWING_CONTENT_KEY)) || [];
    const entries = generateSitemapEntries(assets, { origin: "https://likelink2.vercel.app" });
    await kvSet(GROWING_PUBLISHED_KEY, { entries, updatedAt: Date.now() });
    return { ok: true, sitemapEntries: entries.length };
  },
});

registerJob("internal-linking", {
  intervalMs: 86400000,
  description: "Generate internal links between content assets",
  maxDurationMs: 15000,
  fn: async ({ kvGet, kvSet }) => {
    const assets = (await kvGet(GROWING_CONTENT_KEY)) || [];
    const links = generateInternalLinks(assets, { maxLinks: 10 });
    await kvSet("growth:internalLinks", links);
    return { ok: true, linksGenerated: links.length };
  },
});

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500, req); return; }

  // GET: return job status
  if (req.method === "GET") {
    const status = await getJobStatus({ kvGet });
    const content = (await kvGet(GROWING_CONTENT_KEY)) || [];
    const opportunities = (await kvGet("growth:opportunities")) || [];
    json(res, { ok: true, jobs: status, contentCount: content.length, opportunitiesCount: opportunities.length }, 200, req);
    return;
  }

  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  // Run all due jobs
  const results = await runDueJobs({ kvGet, kvSet });
  audit.log("growth.cycle.complete", { type: "system", id: "growth-scheduler" }, { type: "cycle" }, { results: results.length });
  json(res, { ok: true, results }, 200, req);
}
