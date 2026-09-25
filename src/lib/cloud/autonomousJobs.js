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
import { isGeminiConfigured } from "./geminiGateway.js";

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

registerJob("autonomous-ugc-video-production", {
  description: "Continuously create persisted Veo videos for approved products, independent of social publishing",
  intervalMs: 60 * 60 * 1000,
  maxDurationMs: 110000,
  async fn({ kvGet, kvSet, now }) {
    if (!process.env.GEMINI_API_KEY) {
      return { ok: false, status: "BLOCKED", reason: "ugc_video_not_configured", provider: "google_veo_3_1" };
    }

    const productsRow = await kvGet("marketplace:products", []);
    const products = Array.isArray(productsRow)
      ? productsRow.filter((p) => p?.status === "approved" && p?.id && p?.image)
      : [];

    const styles = ["ugc", "cinematic3d", "product_story"];
    const angles = [
      { id: "curiosity", hook: "רגע — למה כולם שמים לב לזה?" },
      { id: "problem-solution", hook: "אם גם את נתקלת בזה, תראי את זה." },
      { id: "reality-tea", hook: "בלי הייפ — הנה מה שבאמת רואים." },
      { id: "emotional-roi", hook: "לפני שקונים, הנה הדבר שבאמת שווה לבדוק." },
    ];

    const results = [];
    let queued = 0;

    for (const product of products.slice(0, 6)) {
      if (queued >= 3) break;

      try {
        const assetsRow = await kvGet("ugc:assets:" + product.id, []);
        const assets = Array.isArray(assetsRow) ? assetsRow : [];
        const completed = assets.find((a) => a?.videoStatus === "completed" && a?.videoUrl);
        const active = assets.find((a) => a?.videoJobId && ["queued", "running"].includes(String(a.videoStatus || "")));

        if (completed || active) {
          results.push({
            productId: product.id,
            status: completed ? "ALREADY_COMPLETED" : "ALREADY_RUNNING",
            videoUrl: completed?.videoUrl || null,
          });
          continue;
        }

        let asset = assets.find((a) => a?.imageUrl && a?.synthetic === true);
        if (!asset) {
          asset = {
            id: "catalog_video_" + product.id + "_" + now,
            productId: product.id,
            marketerId: product.marketerId || null,
            characterType: null,
            creativeAngle: angles[(queued + Math.floor(now / 21600000)) % angles.length].id,
            imageUrl: String(product.image),
            source: "verified_catalog_image",
            synthetic: false,
            disclosed: false,
            videoProvider: null,
            videoJobId: null,
            videoStatus: null,
            videoUrl: null,
            createdAt: now,
          };
          await kvSet("ugc:assets:" + product.id, [asset, ...assets].slice(0, 20));
        }

        const angle = angles[(queued + Math.floor(now / 21600000)) % angles.length];
        const style = styles[(queued + Math.floor(now / 21600000)) % styles.length];
        const { queueCloudUgcVideo } = await import("./ugcEngine.js");
        const result = await queueCloudUgcVideo({
          product,
          asset,
          creativeAngle: angle.id,
          hookText: angle.hook,
          style,
        });

        results.push({
          productId: product.id,
          status: result.ok ? (result.status || "QUEUED") : "FAILED",
          error: result.ok ? null : result.error,
          provider: result.provider || "google_veo_3_1",
          style,
        });

        if (result.ok && !result.skipped) queued++;
      } catch (e) {
        results.push({
          productId: product.id,
          status: "FAILED",
          error: String(e?.message || e).slice(0, 180),
        });
      }
    }

    await kvSet("growth:video-production:last", {
      ts: now,
      queued,
      inspected: results.length,
      results: results.slice(-20),
    });

    return {
      ok: true,
      cycle: "autonomous-ugc-video-production",
      timestamp: now,
      queued,
      inspected: results.length,
      results,
    };
  },
});

registerJob("autonomous-ugc-distribution", {
  description: "Cloud-only UGC generation plus verified external distribution for the oldest approved products",
  intervalMs: 60 * 60 * 1000,
  maxDurationMs: 120000,
  async fn({ kvGet, kvSet, now }) {
    
    const [productsRow, marketersRow, autopilotRow] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:marketers", []),
      kvGet("marketplace:autopilot", {}),
    ]);
    const products = Array.isArray(productsRow) ? productsRow : [];
    const marketers = Array.isArray(marketersRow) ? marketersRow : [];
    const autopilot = autopilotRow && typeof autopilotRow === "object" ? autopilotRow : {};
    const results = [];
    const creativeAngles = [
      { id: "curiosity", hook: "רגע — למה כולם שמים לב לזה?" },
      { id: "problem-solution", hook: "אם גם את נתקלת בזה, תראי את זה." },
      { id: "emotional-roi", hook: "לפני שקונים, הנה הדבר שבאמת שווה לבדוק." },
      { id: "reality-tea", hook: "בלי הייפ — הנה מה שבאמת רואים." },
    ];

    for (const marketer of marketers.filter((m) => m?.id).slice(0, 3)) {
      const cfg = autopilot[marketer.id];
      if (!cfg?.enabled || !Array.isArray(cfg.channels) || !cfg.channels.length) {
        results.push({ marketerId: marketer.id, status: "NO_EXTERNAL_CHANNEL_CONFIG" });
        continue;
      }

      const pool = products.filter((p) => p?.status === "approved" && String(p.marketerId) === String(marketer.id));
      if (!pool.length) {
        results.push({ marketerId: marketer.id, status: "NO_APPROVED_PRODUCTS" });
        continue;
      }

      // Process up to 3 products per cycle. The selection is oldest-first,
      // so every approved affiliate product gets its turn without flooding.
      const ranked = [];
      for (const p of pool) {
        const assets = await kvGet("ugc:assets:" + p.id, []);
        const latest = Array.isArray(assets) ? Number(assets[0]?.createdAt || 0) : 0;
        ranked.push({ product: p, latest });
      }
      ranked.sort((a, b) => a.latest - b.latest);

      const batch = ranked.slice(0, 3);
      for (let index = 0; index < batch.length; index++) {
        const selected = batch[index].product;
        const angle = creativeAngles[(Math.floor(Number(now) / 21600000) + index) % creativeAngles.length];
          const creativeStyle = ["ugc", "cinematic3d", "product_story"][
            (Math.floor(Number(now) / 21600000) + index) % 3
          ];

        try {
          const { generateCloudUgcAsset, queueCloudUgcVideo } = await import("./ugcEngine.js");
          const ugc = await generateCloudUgcAsset({
            product: selected,
            characterType: cfg.ugcCharacterType || "ai_female_model",
            creativeAngle: angle.id,
            style: creativeStyle,
          });

          if (!ugc.ok && ugc.skipped !== "fresh_asset") {
            results.push({ marketerId: marketer.id, productId: selected.id, status: "UGC_FAILED", error: ugc.error });
            continue;
          }

          const asset = ugc.asset || null;
          let ugcVideo = null;
          if (asset?.imageUrl) {
            try {
              ugcVideo = await queueCloudUgcVideo({
                product: selected,
                asset,
                creativeAngle: angle.id,
                hookText: angle.hook,
                style: creativeStyle,
              });
            } catch (e) {
              ugcVideo = { ok: false, error: String(e?.message || e).slice(0, 180) };
            }
          }

          // External publication happens only after a completed real video exists.
          // This prevents a queued Veo job from being mislabeled as a published video.
          const completedAssets = await kvGet("ugc:assets:" + selected.id, []);
          const completedVideo = Array.isArray(completedAssets)
            ? completedAssets.find((a) => a?.videoStatus === "completed" && a?.videoUrl)
            : null;

          if (!completedVideo) {
            const entry = {
              marketerId: marketer.id,
              productId: selected.id,
              creativeAngle: angle.id,
              creativeStyle,
              ugc: ugc.skipped || "generated",
              ugcVideo: ugcVideo ? (ugcVideo.ok ? (ugcVideo.status || "QUEUED") : ugcVideo.error) : "NOT_REQUESTED",
              status: "WAITING_FOR_VIDEO",
              channels: [],
              ts: now,
            };
            results.push(entry);
            await kvSet("growth:ugc-distribution:" + marketer.id, entry);
            continue;
          }

          // Keep the publishing runner server-side and pin this run to the exact
          // selected product so rotation and creative state cannot drift.
          const { runOne } = await import("../../../api/autopilot.mjs");
          const store = { ...autopilot, __marketers: marketers, __products: products };
          const publishCfg = { ...cfg, productIds: [selected.id] };
          const run = await runOne(store, marketer.id, publishCfg, ORIGIN);
          const published = Boolean(run.ok && (run.results || []).some((item) => item?.ok));
          const entry = {
            marketerId: marketer.id,
            productId: selected.id,
            creativeAngle: angle.id,
            creativeStyle,
            ugc: ugc.skipped || "generated",
            ugcVideo: "COMPLETED",
            status: published ? "PUBLISHED" : "NOT_PUBLISHED",
            channels: run.results || [],
            ts: now,
          };
          results.push(entry);
          await kvSet("growth:ugc-distribution:" + marketer.id, entry);
        } catch (e) {
          results.push({ marketerId: marketer.id, productId: selected.id, status: "FAILED", error: String(e?.message || e).slice(0, 180) });
        }
      }
    }

    return {
      ok: true,
      cycle: "autonomous-ugc-distribution",
      timestamp: now,
      results,
      rule: "No external success is recorded without a real channel response.",
    };
  },
});
registerJob("autonomous-creative-refresh", {
  description: "Continuously rotate product creative using freshness, trend, novelty and performance signals",
  intervalMs: 6 * 60 * 60 * 1000,
  maxDurationMs: 60000,
  async fn({ kvGet, kvSet, now }) {
    const productsRow = await kvGet("marketplace:products", []);
    const products = Array.isArray(productsRow) ? productsRow.filter((p) => p?.status === "approved") : [];
    const trendRow = await kvGet("trend:radar", []);
    const trends = Array.isArray(trendRow) ? trendRow : [];
    const results = [];
    const styles = ["ugc", "cinematic3d", "product_story"];
    for (const product of products.slice(0, 100)) {
      const history = await kvGet("creative:history:" + product.id, []);
      const used = Array.isArray(history) ? history : [];
      const trend = trends.find((t) => String(t?.category || "").toLowerCase() === String(product.category || "").toLowerCase())
        || trends[0] || null;
      const recentKeys = new Set(used.filter(x => Number(x.ts || 0) > now - 7 * 86400000).map(x => x.key));
      const candidates = CREATIVE_MATRIX(product, trend);
      const fresh = candidates.filter(x => !recentKeys.has(x.key));
      const ranked = (fresh.length ? fresh : candidates)
        .sort((a,b) => (Number(b.trendScore||0)+Number(b.novelty||0)) - (Number(a.trendScore||0)+Number(a.novelty||0)));
      const selected = ranked[0];
      if (!selected) continue;
      used.unshift({...selected, ts: now});
      await kvSet("creative:history:" + product.id, used.slice(0, 60));
      results.push({ productId: product.id, selected, historySize: used.length });
    }
    await kvSet("growth:creative-refresh:last", { ts: now, products: results.length, results: results.slice(0, 100) });
    return { ok: true, cycle: "autonomous-creative-refresh", timestamp: now, products: results.length, results };
  },
});

function CREATIVE_MATRIX(product, trend) {
  const trendName = String(trend?.name || trend?.topic || "").slice(0, 120);
  const trendScore = Math.min(100, Number(trend?.score || trend?.trendScore || 0));
  const base = [
    ["curiosity","ugc","רגע — למה כולם שמים לב לזה?"],
    ["problem-solution","ugc","אם גם את נתקלת בזה, תראי את זה."],
    ["reality-tea","ugc","בלי הייפ — הנה מה שבאמת רואים."],
    ["emotional-roi","ugc","לפני שקונים, הנה הדבר שבאמת שווה לבדוק."],
    ["curiosity","cinematic3d","חכי לראות מה קורה כשזה מתחיל."],
    ["problem-solution","cinematic3d","הבעיה נראית אחרת אחרי זה."],
    ["curiosity","product_story","יש סיבה שהמוצר הזה תופס את העין."],
    ["reality-tea","product_story","בואי נבדוק את הדבר שאף אחד לא מראה."],
    ["problem-solution","product_story","זה הרגע שבו מבינים בשביל מה זה נוצר."]
  ];
  return base.map(([angle, style, hook], i) => ({
    productId: product?.id,
    angle,
    style,
    hook: trendName ? hook + " " + trendName : hook,
    trend: trendName || null,
    trendScore,
    novelty: 100 - (i * 7),
    key: [product?.id, angle, style, trendName].join(":"),
  }));
}

registerJob("autonomous-ugc-video-poll", {
  description: "Poll persisted LikeLink first-party motion jobs and store completed creative assets",
  intervalMs: 15 * 60 * 1000,
  maxDurationMs: 110000,
  async fn({ kvGet, kvSet, now }) {
    
    const productsRow = await kvGet("marketplace:products", []);
    const products = Array.isArray(productsRow) ? productsRow : [];
    const { pollCloudUgcVideo } = await import("./ugcEngine.js");
    const results = [];
    let polled = 0;
    for (const product of products.filter((p) => p?.status === "approved").slice(0, 30)) {
      const assets = await kvGet("ugc:assets:" + product.id, []);
      const list = Array.isArray(assets) ? assets : [];
      for (const asset of list.slice(0, 6)) {
        const status = String(asset?.videoStatus || "");
        const jobId = String(asset?.videoJobId || "");
        if (!jobId || !["queued", "running"].includes(status)) continue;
        if (polled >= 12) break;
        polled++;
        try {
          const result = await pollCloudUgcVideo({ productId: product.id, videoJobId: jobId });
          results.push({
            productId: product.id,
            assetId: asset.id,
            status: result.status || (result.ok ? "completed" : "failed"),
            error: result.ok ? null : (result.error || null),
          });
        } catch (e) {
          results.push({ productId: product.id, assetId: asset.id, status: "failed", error: String(e?.message || e).slice(0, 180) });
        }
      }
      if (polled >= 12) break;
    }
    await kvSet("growth:job:autonomous-ugc-video-poll:last", { ts: now, polled, results: results.slice(-20) });
    return { ok: true, cycle: "autonomous-ugc-video-poll", timestamp: now, polled, results };
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
  "autonomous-ugc-video-production",
  "autonomous-ugc-distribution",
  "autonomous-ugc-video-poll",
];

export async function runAllDueAutonomousJobs(opts = {}) {
  const { kvGet = svKvGet, kvSet = svKvSet, force = false, maxJobs = Infinity } = opts;
  return runDueJobs({ kvGet, kvSet, force, maxJobs });
}

export async function getAutonomousJobStatus(opts = {}) {
  const { kvGet = svKvGet } = opts;

  // Status is an observability endpoint and must never serialize KV reads.
  // svKvGet has a 10s upstream timeout; reading 11 jobs sequentially could
  // consume the entire Vercel invocation when Supabase is slow/unreachable.
  // Read all job states concurrently and isolate failures per job instead.
  const statuses = await Promise.all(
    AUTONOMOUS_JOBS.map(async (id) => {
      try {
        const stateKey = `growth:job:${id}`;
        const state = (await kvGet(stateKey)) || {};
        return {
          id,
          state: state.state || "PENDING",
          lastRunAt: state.lastRunAt || null,
          nextRunAt: state.nextRunAt || null,
          durationMs: state.durationMs || null,
          result: state.result || null,
        };
      } catch {
        return { id, state: "unknown" };
      }
    })
  );
  return statuses;
}
