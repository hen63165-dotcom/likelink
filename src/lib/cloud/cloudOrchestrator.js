import { trendSummary, getHottest } from "./trends.js";
import { buildCampaign } from "./campaign.js";
import { appendVeritas, verifyVeritas } from "./veritas.js";
import { generateDailyTrendReport } from "./trendScanner.js";
import { generateProductStory } from "./storyEngine.js";
import { generateHookVariations } from "./hooks.js";
import { generateContentPack, generatePixarStory } from "./contentStudio.js";
import { generateDailyPost } from "./autoPublisher.js";
import { getActiveDrops } from "./liveDrop.js";
import { discoverOpportunities, generateSEO, generateSitemapEntries } from "./selfGrowth.js";
import { notifyOwner, notifyTrending, notifyDailySummary } from "./notify.js";
import { launchProduct } from "./launch.js";
import { sendOwnerDailyReport } from "../../api/_utils/analytics.js";
import { evaluateCapability, executeIntent, INTENT } from "./capabilityBroker.js";
import { listConnectionStates, updateConnectionState, CONNECTION_STATE, CONNECTION_KEY } from "./connectionManager.js";

// ── helpers ────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function today() { return nowIso().slice(0, 10); }

function buildCtx(ctx) {
  if (typeof ctx === "object" && ctx !== null && typeof ctx.kvGet === "function") {
    return ctx;
  }
  // called from handler shape { kvGet, kvSet, origin, env }
  return {
    kvGet: ctx.kvGet,
    kvSet: ctx.kvSet,
    origin: ctx.origin,
    env: ctx.env || {},
  };
}

// ── module version ──────────────────────────────────────────────────────────

export const ORCHESTRATOR_VERSION = "1.0.0";

/**
 * Run the complete unified daily cycle.
 * Wires ALL cloud modules together in one verified pipeline.
 * Pure orchestration: reuses existing kvGet/kvSet + origin + env.
 *
 * @param {object} ctx  - { kvGet, kvSet, origin, env? }
 * @param {object} opts - { force?, now? }
 * @returns {Promise<object>} full cycle result with steps, veritas, published
 */
export async function runUnifiedCycle(ctx, opts = {}) {
  const context = typeof ctx === "object" && ctx !== null && typeof ctx.kvGet === "function"
    ? ctx
    : { kvGet: ctx.kvGet, kvSet: ctx.kvSet, origin: ctx.origin, env: ctx.env || {} };

  const force = Boolean(opts?.force);
  const now = opts?.now || Date.now();
  const ts = nowIso();

  const results = {
    ts,
    version: ORCHESTRATOR_VERSION,
    steps: [],
    errors: [],
    veritas: null,
    published: [],
    drops: [],
    notifications: [],
  };

  const { kvGet, kvSet, origin, env = {} } = context;

  // ── 1. LOAD DATA ──────────────────────────────────────────────────────────
  let products, sales, clicks, campaigns, marketers, veritasLedger;
  try {
    const [pr, sr, cr, ca, mr, vr] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:sales", []),
      kvGet("marketplace:clicks", []),
      kvGet("marketplace:site_campaigns", []),
      kvGet("marketplace:marketers", []),
      kvGet("marketplace:veritas", []),
    ]);
    products = Array.isArray(pr) ? pr : Object.values(pr || {});
    sales = Array.isArray(sr) ? sr : [];
    clicks = Array.isArray(cr) ? cr : [];
    campaigns = Array.isArray(ca) ? ca : [];
    marketers = Array.isArray(mr) ? mr.filter((m) => m && m.id) : [];
    veritasLedger = Array.isArray(vr) ? vr : [];
    results.steps.push({ step: "data", products: products.length, marketers: marketers.length, ok: true });
  } catch (e) {
    results.errors.push({ step: "data", error: String(e.message || e) });
    results.steps.push({ step: "data", ok: false });
    results.ok = false;
    results.doneAt = nowIso();
    return results;
  }

  // ── 2. DISCOVER OPPORTUNITIES ─────────────────────────────────────────────
  let opportunities = [];
  try {
    opportunities = discoverOpportunities({ products, marketers, sales, clicks, now });
    results.steps.push({ step: "discover", count: opportunities.length, ok: true });
  } catch (e) {
    results.errors.push({ step: "discover", error: String(e.message || e) });
    results.steps.push({ step: "discover", ok: false });
  }

  // ── 3. TREND INTELLIGENCE ─────────────────────────────────────────────────
  let trends = null;
  let hottest = null;
  try {
    trends = trendSummary(products, { sales, clicks, now });
    const trendReport = generateDailyTrendReport(products, new Date(now));
    hottest = getHottest(products, { sales, clicks, now });
    results.steps.push({
      step: "trends",
      hottest: trends.hottest?.length || 0,
      emerging: trends.emerging?.length || 0,
      ok: true,
    });
  } catch (e) {
    results.errors.push({ step: "trends", error: String(e.message || e) });
    results.steps.push({ step: "trends", ok: false });
  }

  // ── 4. SELECT OPPORTUNITY ─────────────────────────────────────────────────
  const approved = products.filter(
    (p) =>
      p?.status === "approved" &&
      p?.marketerId &&
      marketers.some((m) => m && m.id === p.marketerId)
  );

  // Capability broker: preflight before any action.
  const storeForBroker = { [CONNECTION_KEY]: listConnectionStates({ [CONNECTION_KEY]: channels || [] }) };
  const launchEval = evaluateCapability(
    { store: storeForBroker, origin, env },
    INTENT.LAUNCH_PRODUCT,
    { product: approved[0] || null }
  );
  results.steps.push({ step: "preflight", capability: launchEval.capability, detail: launchEval.detail, ok: launchEval.capability === "READY" });

  const decision = selectOpportunity({
    approved,
    sales,
    clicks,
    campaigns,
    marketers,
    channelStates: [],
    now,
  });

  if (!decision.selected) {
    results.steps.push({ step: "select", status: "no_opportunity", ok: false });
    results.ok = false;
    results.doneAt = ts;
    return results;
  }

  results.steps.push({
    step: "select",
    productId: decision.selected.id,
    mode: decision.mode,
    score: decision.score,
    ok: true,
  });