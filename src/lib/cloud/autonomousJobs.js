/**
 * LikeLink2 Autonomous Cloud Jobs Registration
 * ============================================
 * Registers all autonomous growth jobs with the provider-neutral growthScheduler.
 * These jobs are executed by Vercel Cron (via /api/autopilot) or manual triggers.
 *
 * Each job is:
 * - Idempotent (safe to re-run)
 * - Retry-safe with exponential backoff
 * - State-tracked in KV (lastRun, nextRun, failure state)
 * - Auditable (Decision Memory via Veritas)
 */

import { registerJob, executeJob, runDueJobs, JOB_STATE } from "./growthScheduler.js";
import { runGrowthCycle, runDailyTrendScan, detectOpportunities } from "./lunaGrowth.js";
import { discoverOpportunities as discoverOpportunitiesLegacy } from "./selfGrowth.js";

const ORIGIN = "https://likelink2.vercel.app";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "content-type": "application/json",
  Prefer: "resolution=merge-duplicates",
};

async function svKvGet(key, fallback) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: SB_HEADERS, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    if (!rows?.[0]?.value) return fallback;
    let parsed = JSON.parse(rows[0].value);
    while (typeof parsed === "string" && parsed.length > 0) {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    return parsed;
  } catch {
    return fallback;
  }
}

async function svKvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

function createServerKV() {
  return { kvGet: svKvGet, kvSet: svKvSet };
}

async function getMarketplaceData(kvGet) {
  const [products, sales, clicks, marketers, campaigns] = await Promise.all([
    kvGet("marketplace:products", []),
    kvGet("marketplace:sales", []),
    kvGet("marketplace:clicks", []),
    kvGet("marketplace:marketers", []),
    kvGet("marketplace:site_campaigns", []),
  ]);
  return {
    products: Array.isArray(products) ? products : [],
    sales: Array.isArray(sales) ? sales : [],
    clicks: Array.isArray(clicks) ? clicks : [],
    marketers: Array.isArray(marketers) ? marketers : [],
    campaigns: Array.isArray(campaigns) ? campaigns : [],
  };
}

registerJob("autonomous-growth-cycle", {
  description: "Run Luna autonomous growth cycle for all approved products",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 120000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData(kvGet);
    const results = [];

    for (const product of data.products.filter(p => p.status === "approved")) {
      try {
        const result = await runGrowthCycle({
          product,
          products: data.products,
          sales: data.sales,
          clicks: data.clicks,
          campaigns: data.campaigns || [],
          marketers: data.marketers,
          origin: ORIGIN,
          now,
          allowExternalPublish: false,
        });
        results.push({ productId: product.id, ok: result.ok });
      } catch (e) {
        results.push({ productId: product.id, ok: false, error: String(e) });
      }
    }

    return { ok: true, cycle: "autonomous-growth-cycle", results, timestamp: now };
  },
});

registerJob("daily-trend-scan", {
  description: "Scan trends and detect emerging opportunities across all products",
  intervalMs: 24 * 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData(kvGet);
    const result = runDailyTrendScan({
      products: data.products,
      sales: data.sales,
      clicks: data.clicks,
      views: [],
      now,
    });
    return { ok: true, ...result };
  },
});

registerJob("site-campaign-cycle", {
  description: "Run official site campaign cycle (official-site scope)",
  intervalMs: 24 * 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const { runSiteCampaignCycle } = await import("../../../api/autopilot.mjs");
      const result = await runSiteCampaignCycle(ORIGIN);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("brand-pulse-publish", {
  description: "Publish Luna brand pulse to site feed (self-promotion)",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const { publishBrandPulse } = await import("../../../api/autopilot.mjs");
      const result = await publishBrandPulse(ORIGIN, { webOnly: true });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("brand-pulse-external", {
  description: "Publish Luna brand pulse to external channels (optional)",
  intervalMs: 24 * 60 * 60 * 1000,
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const { publishBrandPulse } = await import("../../../api/autopilot.mjs");
      const result = await publishBrandPulse(ORIGIN, { webOnly: false });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("opportunity-discovery", {
  description: "Discover growth opportunities for all studios",
  intervalMs: 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData(kvGet);
    const opportunities = detectOpportunities({
      products: data.products,
      sales: data.sales,
      clicks: data.clicks,
      views: [],
      now,
    });

    await kvSet("growth:opportunities:latest", {
      timestamp: now,
      opportunities: opportunities.opportunities,
      emerging: opportunities.emerging,
      declining: opportunities.declining,
      summary: opportunities.summary,
    });

    return { ok: true, opportunityCount: opportunities.opportunities.length };
  },
});

registerJob("brand-pulse-freshness", {
  description: "Ensure brand pulse feed stays fresh (visitor-triggered backup)",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const { ensureBrandPulseFresh } = await import("../../../api/autopilot.mjs");
      const result = await ensureBrandPulseFresh(ORIGIN);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

export const AUTONOMOUS_JOBS = [
  "autonomous-growth-cycle",
  "daily-trend-scan",
  "site-campaign-cycle",
  "brand-pulse-publish",
  "brand-pulse-external",
  "opportunity-discovery",
  "brand-pulse-freshness",
];

export async function runAllDueAutonomousJobs(opts = {}) {
  const { kvGet = svKvGet, kvSet = svKvSet, force = false } = opts;
  return runDueJobs({ kvGet, kvSet, force });
}

export async function getAutonomousJobStatus(opts = {}) {
  const { kvGet = svKvGet } = opts;
  const statuses = [];
  for (const id of AUTONOMOUS_JOBS) {
    try {
      const stateKey = `growth:job:${id}`;
      const state = (await kvGet(stateKey)) || {};
      statuses.push({
        id,
        state: state.state || "PENDING",
        lastRunAt: state.lastRunAt || null,
        nextRunAt: state.nextRunAt || null,
        durationMs: state.durationMs || null,
        result: state.result || null,
      });
    } catch {
      statuses.push({ id, state: "unknown" });
    }
  }
  return statuses;
}
