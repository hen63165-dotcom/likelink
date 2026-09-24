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
import { ingestProducts, normalizeProduct, validateProduct, qualityFilter, findNewProducts, buildHookEngine, isProductStale } from "./affiliatePipeline.js";

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

registerJob("autonomous-ugc-distribution", {
  description: "Cloud-only UGC generation plus verified external distribution through AutoPilot",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 120000,
  async fn({ kvGet, kvSet, now }) {
    if (!process.env.OPENAI_API_KEY) return { ok: false, status: 'BLOCKED', reason: 'ugc_ai_not_configured' };
    const [productsRow, marketersRow, autopilotRow] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:marketers", []),
      kvGet("marketplace:autopilot", {}),
    ]);
    const products = Array.isArray(productsRow) ? productsRow : [];
    const marketers = Array.isArray(marketersRow) ? marketersRow : [];
    const autopilot = autopilotRow && typeof autopilotRow === "object" ? autopilotRow : {};
    const results = [];
    const { generateCloudUgcAsset } = await import("./ugcEngine.js");
    const { runOne } = await import("../../../api/autopilot.mjs");
    for (const marketer of marketers.filter((m) => m?.id).slice(0, 3)) {
      const cfg = autopilot[marketer.id];
      if (!cfg?.enabled || !Array.isArray(cfg.channels) || !cfg.channels.length) {
        results.push({ marketerId: marketer.id, status: "NO_EXTERNAL_CHANNEL_CONFIG" });
        continue;
      }
      const pool = products.filter((p) => p?.status === "approved" && String(p.marketerId) === String(marketer.id));
      if (!pool.length) { results.push({ marketerId: marketer.id, status: "NO_APPROVED_PRODUCTS" }); continue; }
      let selected = pool[0];
      let oldest = Number.MAX_SAFE_INTEGER;
      for (const p of pool) {
        const assets = await kvGet("ugc:assets:" + p.id, []);
        const latest = Array.isArray(assets) ? Number(assets[0]?.createdAt || 0) : 0;
        if (latest < oldest) { oldest = latest; selected = p; }
      }
      const ugc = await generateCloudUgcAsset({ product: selected, characterType: cfg.ugcCharacterType || "ai_female_model" });
      if (!ugc.ok && ugc.skipped !== "fresh_asset") {
        results.push({ marketerId: marketer.id, productId: selected.id, status: "UGC_FAILED", error: ugc.error });
        continue;
      }

      // Queue cloud video when a current video provider is configured.
      // Image-only UGC remains valid; video is never faked when the provider is absent.
      let ugcVideo = null;
      try {
        const asset = ugc.asset || null;
        if (asset?.imageUrl) {
          const { queueCloudUgcVideo } = await import("./ugcEngine.js");
          ugcVideo = await queueCloudUgcVideo({ product: selected, asset });
        }
      } catch (e) {
        ugcVideo = { ok: false, error: String(e?.message || e).slice(0, 180) };
      }

      const store = { ...autopilot, __marketers: marketers, __products: products };
      const run = await runOne(store, marketer.id, cfg, ORIGIN);
      const entry = { marketerId: marketer.id, productId: selected.id, ugc: ugc.skipped || "generated", ugcVideo: ugcVideo ? (ugcVideo.ok ? (ugcVideo.status || "QUEUED") : ugcVideo.error) : "NOT_REQUESTED", status: run.ok ? "PUBLISHED" : "NOT_PUBLISHED", channels: run.results || [], ts: now };
      results.push(entry);
      await kvSet("growth:ugc-distribution:" + marketer.id, entry);
    }
    return { ok: true, cycle: "autonomous-ugc-distribution", timestamp: now, results, rule: "No external success is recorded without a real channel response." };
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

registerJob("affiliate-product-import", {
  description: "Import new affiliate products from live catalog into marketplace KV (idempotent)",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const SINGLE_OWNER_ID = process.env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";

    const ingestResult = ingestProducts({ marketerId: SINGLE_OWNER_ID });
    if (!ingestResult.ok) return { ok: false, error: ingestResult.error };

    const { candidates, owner } = ingestResult;

    const existingProducts = await kvGet("marketplace:products", []);
    const existingList = Array.isArray(existingProducts) ? existingProducts : [];
    const existingClicks = await kvGet("marketplace:clicks", []);
    const existingSales = await kvGet("marketplace:sales", []);
    const existingMarketers = await kvGet("marketplace:marketers", []);
    const marketerList = Array.isArray(existingMarketers) ? existingMarketers : [];
    const hasOwnerMarketer = marketerList.some((m) => m && String(m.id) === owner);

    const normalized = candidates.map((c) => normalizeProduct(c));
    const { newProducts, duplicates } = findNewProducts(normalized, existingList);

    const validated = [];
    const rejected = [];

    for (const p of newProducts) {
      const v = validateProduct(p, { marketerExists: hasOwnerMarketer, marketers: marketerList });
      const q = qualityFilter(p, {
        clicks: existingClicks,
        sales: existingSales,
        marketers: marketerList,
      });

      if (v.valid && q.eligible) {
        validated.push(p);

        const contentPack = buildHookEngine(p, {
          clicks: existingClicks,
          sales: existingSales,
          lang: "he",
        });

        await kvSet(`affiliate:content:${p.id}`, contentPack);
      } else {
        rejected.push({ id: p.id, title: p.title, reason: v.reason || q.reasons[0] });
      }
    }

    if (validated.length > 0) {
      const merged = [...existingList, ...validated];
      await kvSet("marketplace:products", merged);
    }

    await kvSet("affiliate:import:last-run", {
      timestamp: now,
      ingested: normalized.length,
      new: validated.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      owner,
    });

     return {
      ok: true,
      ingested: normalized.length,
      imported: validated.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      newIds: validated.map((p) => p.id),
      rejectedDetails: rejected,
      duplicateDetails: duplicates,
    };
  },
});

registerJob("affiliate-product-rotation", {
  description: "Evaluate and rotate stale/unavailable affiliate products; preserve analytics",
  intervalMs: 24 * 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const [productsRow, clicksRow, salesRow] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:clicks", []),
      kvGet("marketplace:sales", []),
    ]);

    const products = Array.isArray(productsRow) ? productsRow : [];
    const clicks = Array.isArray(clicksRow) ? clicksRow : [];
    const sales = Array.isArray(salesRow) ? salesRow : [];

    const staleResults = [];
    const archived = [];
    const kept = [];

    for (const p of products) {
      const staleness = isProductStale(p, { clicks, sales, now });

      if (staleness.stale && staleness.ageDays > 14) {
        archived.push({ id: p.id, reasons: staleness.reasons, ageDays: staleness.ageDays });
        staleResults.push({ id: p.id, stale: true, reasons: staleness.reasons });
      } else {
        kept.push(p);
        if (staleness.stale) staleResults.push({ id: p.id, stale: true, reasons: staleness.reasons });
      }
    }

    if (archived.length > 0) {
      const archivedKey = `affiliate:archived:${new Date(now).toISOString().slice(0, 10)}`;
      const existingArchive = await kvGet(archivedKey, []);
      await kvSet(archivedKey, [
        ...(Array.isArray(existingArchive) ? existingArchive : []),
        ...archived.map((a) => ({ ...a, archivedAt: now })),
      ]);
    }

    if (archived.length > 0) {
      await kvSet("marketplace:products", kept);
    }

    return {
      ok: true,
      totalProducts: products.length,
      archived: archived.length,
      kept: kept.length,
      staleDetected: staleResults.length,
      details: staleResults,
    };
  },
});

export const AUTONOMOUS_JOBS = [
  "autonomous-growth-cycle",
  "daily-trend-scan",
  "site-campaign-cycle",
  "affiliate-product-import",
  "affiliate-product-rotation",
  "brand-pulse-publish",
  "brand-pulse-external",
  "opportunity-discovery",
  "brand-pulse-freshness",
  "autonomous-ugc-distribution",
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
