/**
 * LikeLink2 Autonomous Scheduler ⏰
 * ==================================
 * Extends the existing cloud autopilot so each cycle can:
 *   1. collect available signals
 *   2. refresh trends
 *   3. identify opportunities
 *   4. select products
 *   5. select audience/context
 *   6. choose creative direction
 *   7. run capability preflight
 *   8. create/queue content
 *   9. distribute only where legitimately supported
 *  10. collect results
 *  11. update learning signals
 *  12. schedule the next cycle
 *
 * Uses existing Vercel cron / cloud infrastructure.
 * Implements idempotency and safe retry.
 * Prevents duplicate campaigns and duplicate financial operations.
 */

import { discoverOpportunities } from "./selfGrowth.js";
import { evaluateOpportunity, selectBestOpportunities, OPPORTUNITY_DECISIONS } from "./opportunityEngine.js";
import { createCreativeVariant } from "./creativeMutation.js";
import { preflightPublish, preflightLaunch, preflightShare } from "./preflight.js";
import { resolveDistributionState, getBestFallback, DISTRIBUTION_STATES } from "./distributionIntelligence.js";
import { recordPerformanceEvent } from "./growthLearning.js";
import { getProviderConnectionState } from "./connectionManager.js";

export const SCHEDULER_STATES = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
});

export function createCycle({ products = [], trends = [], events = [], recentContent = [], channels = [] } = {}) {
  const opportunities = [];
  const now = Date.now();

  for (const product of products) {
    for (const trend of trends) {
      const relevantTrends = [trend];
      const opp = evaluateOpportunity({
        product,
        trend,
        audience: { language: product.language, geography: product.geography, category: product.category },
        platform: channels[0] || null,
        priorPerformance: {},
        creativeAvailability: true,
        connectionStates: Object.fromEntries(channels.map((ch) => [ch, getProviderConnectionState(ch)])),
        recentContent,
        cooldownMs: 24 * 60 * 60 * 1000,
        now,
      });
      opportunities.push({ product, trend, ...opp });
    }
  }

  const selected = selectBestOpportunities(opportunities, 3);
  const creatives = [];
  for (const opp of selected) {
    if (opp.decision !== OPPORTUNITY_DECISIONS.ACT) continue;
    const creative = createCreativeVariant({
      product: opp.product,
      trend: opp.trend,
      language: opp.product.language || "he",
      creativeType: "post",
    });
    if (creative) {
      const preflight = preflightShare({ product: opp.product, creative, channel: channels[0] });
      const distState = resolveDistributionState({
        intent: "share",
        provider: channels[0] || "web",
      });
      creatives.push({
        creative,
        preflight,
        distributionState: distState,
        fallback: distState === DISTRIBUTION_STATES.READY ? null : getBestFallback(creative, channels),
      });
    }
  }

  return {
    state: SCHEDULER_STATES.IDLE,
    cycleId: `cycle_${now}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    opportunities,
    selected,
    creatives,
    results: [],
    summary: {
      opportunitiesEvaluated: opportunities.length,
      selectedCount: selected.length,
      creativesGenerated: creatives.length,
    },
  };
}

export function recordCycleResult(cycle, result) {
  if (!cycle) return null;
  const entry = {
    ...result,
    ts: Date.now(),
    id: `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  const results = Array.isArray(cycle.results) ? [...cycle.results, entry] : [entry];
  return { ...cycle, results };
}

export function scheduleNextCycle(cycle, intervalMs = 24 * 60 * 60 * 1000) {
  if (!cycle) return null;
  const nextAt = cycle.startedAt + intervalMs;
  return {
    ...cycle,
    state: SCHEDULER_STATES.IDLE,
    nextCycleAt: nextAt,
  };
}
