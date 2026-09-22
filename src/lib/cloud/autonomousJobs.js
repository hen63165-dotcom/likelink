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
import { runGrowthCycle, runDailyTrendScan } from "./lunaGrowth.js";
import { publishBrandPulse, ensureBrandPulseFresh } from "../api/autopilot.mjs";
import { discoverOpportunities } from "./selfGrowth.js";
import { runSiteCampaignCycle } from "../api/autopilot.mjs";

const ORIGIN = "https://likelink2.vercel.app";

function getKVStore() {
  return {
    async kvGet(key) {
      try {
        const res = await fetch(`/api/store?mode=get&key=${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.value;
      } catch {
        return null;
      }
    },
    async kvSet(key, value) {
      try {
        await fetch(`/api/store?mode=set`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      } catch { /* non-blocking */ }
    },
  };
}

async function getMarketplaceData() {
  const store = getKVStore();
  const [products, sales, clicks, marketers, campaigns] = await Promise.all([
    store.kvGet("marketplace:products"),
    store.kvGet("marketplace:sales"),
    store.kvGet("marketplace:clicks"),
    store.kvGet("marketplace:marketers"),
    store.kvGet("marketplace:site_campaigns"),
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
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours
  maxDurationMs: 120000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData();
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
  intervalMs: 24 * 60 * 60 * 1000, // daily
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData();
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
  intervalMs: 24 * 60 * 60 * 1000, // daily at 9 AM via cron
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const result = await runSiteCampaignCycle(ORIGIN);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("brand-pulse-publish", {
  description: "Publish Luna brand pulse to site feed (self-promotion)",
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours for site feed
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const result = await publishBrandPulse(ORIGIN, { webOnly: true });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("brand-pulse-external", {
  description: "Publish Luna brand pulse to external channels (optional)",
  intervalMs: 24 * 60 * 60 * 1000, // daily for external
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
      const result = await publishBrandPulse(ORIGIN, { webOnly: false });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
});

registerJob("opportunity-discovery", {
  description: "Discover growth opportunities for all studios",
  intervalMs: 60 * 60 * 1000, // every hour
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const data = await getMarketplaceData();
    const opportunities = discoverOpportunities({
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
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours
  maxDurationMs: 30000,
  async fn({ kvGet, kvSet, now }) {
    try {
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

export async function runAllDueAutonomousJobs() {
  const { kvGet, kvSet } = getKVStore();
  return runDueJobs({ kvGet, kvSet });
}

export async function getAutonomousJobStatus() {
  const { kvGet } = getKVStore();
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
      });
    } catch {
      statuses.push({ id, state: "unknown" });
    }
  }
  return statuses;
}