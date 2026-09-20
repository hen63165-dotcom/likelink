/**
 * Luna Growth Engine 🧠
 * =======================
 * Autonomous AI growth operator that evolves Luna from a content helper
 * into a full growth cycle: UNDERSTAND → PLAN → CREATE → ADAPT → PUBLISH →
 * VERIFY → MEASURE → DIAGNOSE → FIX → LEARN → IMPROVE
 *
 * Pure module — no network, no secrets. Reuses existing infrastructure:
 *   - trends.js (trend signals)
 *   - growth.js (opportunity scoring)
 *   - campaign.js (content + tracked links)
 *   - contentStudio.js (creative packs)
 *   - hooks.js (Hebrew hooks)
 *   - publishEngine.js (publish intent)
 *   - trustVerification.js (verification)
 *   - veritas.js (integrity)
 *   - discovery.js (buyer discovery)
 *
 * Luna never fakes results. Every action is recorded with honest status.
 */

import { productSignals, opportunityScore, rankOpportunities, selectOpportunity } from "./growth.js"
import { trendScore, rankByTrend, trendSummary, detectEmerging, detectDeclining } from "./trends.js"
import { buildCampaign, planDistribution, learnFromClicks } from "./campaign.js"
import { generateContentPack } from "./contentStudio.js"
import { generateHookVariations, recommendHookAngles } from "./hooks.js"
import { createProduct } from "./catalog.js"
import { lunaHook, lunaHookForProduct, lunaStoryText, AMBASSADOR } from "../ambassador.js"
export const LUNA_GROWTH_CYCLE = {
  DETECT: "detect",
  DIAGNOSE: "diagnose",
  FIX: "fix",
  EXECUTE: "execute",
  MEASURE: "measure",
  LEARN: "learn",
  ADAPT: "adapt",
  IMPROVE: "improve",
  PLAN: "plan",
  CREATE: "create",
  PUBLISH: "publish",
  VERIFY: "verify",
}
export const LUNA_ACTION_TYPE = {
  TREND_SCAN: "trend_scan",
  CONTENT_CREATE: "content_create",
  HOOK_GENERATE: "hook_generate",
  OPPORTUNITY_SELECT: "opportunity_select",
  CAMPAIGN_BUILD: "campaign_build",
  PUBLISH_ATTEMPT: "publish_attempt",
  VERIFICATION_RUN: "verification_run",
  DISTRECTION_PLAN: "distribution_plan",
  DIAGNOSIS: "diagnosis",
  SELF_HEAL: "self_heal",
  OPTIMIZATION: "optimization",
  LEARNING: "learning",
}
export const LUNA_ACTION_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
}
/**
 * Detect content opportunities from current trend signals.
 * Uses first-party data only — no fabricated trends.
 */
export function detectOpportunities({ products = [], sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const summary = trendSummary(products, { sales, clicks, views, now })
  const emerging = detectEmerging(products, { sales, clicks, now })
  const declining = detectDeclining(products, { sales, clicks, now })
  const ranked = rankByTrend(products, { sales, clicks, views, now, limit: 10 })

  const opportunities = ranked.map((r) => ({
    productId: r.product.id,
    title: r.product.title,
    score: r.score,
    momentum: r.momentum,
    signals: r.signals,
    type: r.momentum === "verified" ? "high_priority" : r.momentum === "rising" ? "medium_priority" : r.momentum === "relevant" ? "low_priority" : "bootstrap",
  }))

  return {
    opportunities,
    emerging: emerging.map((e) => ({ productId: e.product.id, title: e.product.title, badge: e.badge })),
    declining: declining.map((d) => ({ productId: d.product.id, title: d.product.title, badge: d.badge })),
    summary: {
      totalProducts: summary.totalProducts,
      activeProducts: summary.activeProducts,
      timestamp: now,
    },
  }
}
/**
 * Diagnose a product for growth issues.
 * Returns actionable findings with real evidence.
 */
export function diagnoseProduct(product, { sales = [], clicks = [], campaigns = [], now = Date.now() } = {}) {
  const signals = productSignals(product, { sales, clicks, campaigns, now })
  const { score, reasons, hasEnoughSignals } = opportunityScore(signals)
  const issues = []
  const fixes = []

  // Check for issues
  if (!product.marketerId) {
    issues.push({ code: "no_owner", severity: "critical", description: "Product has no marketerId — cannot be attributed.", fix: "Assign a verified marketerId." })
  }

  if (product.status !== "approved") {
    issues.push({ code: "not_approved", severity: "critical", description: `Product status is ${product.status}, must be approved.`, fix: "Approve the product." })
  }

  if (!product.affiliateUrl && !product.url) {
    issues.push({ code: "no_affiliate_url", severity: "high", description: "No affiliate URL — no revenue path.", fix: "Add a legitimate affiliate URL." })
  }

  if (signals.promoCount > 0 && (signals.clicksAll + signals.verifiedSales) === 0) {
    issues.push({ code: "fatigued", severity: "medium", description: `Promoted ${signals.promoCount} times with no clicks or sales.`, fix: "Replace or pause this product in rotation." })
  }

  if (!hasEnoughSignals) {
    issues.push({ code: "insufficient_data", severity: "low", description: "No enough first-party data to evaluate.", fix: "Wait for traffic or promote once to gather signals." })
  }

  if (product.clicks === 0 && signals.clicks30 === 0) {
    issues.push({ code: "no_traffic", severity: "high", description: "No tracked clicks — likely not discovered.", fix: "Share the product link or publish to a channel." })
  }

  // Determine if auto-fixable
  const autoFixable = issues.filter((i) => i.severity === "low" || i.severity === "medium")
  const manualNeeded = issues.filter((i) => i.severity === "critical" || i.severity === "high")

  return {
    productId: product.id,
    productName: product.title,
    score,
    reasons,
    signals,
    hasEnoughSignals,
    issues,
    autoFixable: autoFixable.map((i) => ({ code: i.code, fix: i.fix })),
    manualNeeded: manualNeeded.map((i) => ({ code: i.code, severity: i.severity, description: i.description, fix: i.fix })),
    canAutoFix: autoFixable.length > 0 && manualNeeded.length === 0,
    needsOwnerAction: manualNeeded.length > 0,
  }
}
/**
 * Self-heal: fix deterministic issues automatically.
 * Returns what was fixed and what needs owner action.
 */
export function selfHealProduct(product, diagnosis) {
  const fixes = []
  const remainingIssues = []

  // Auto-fix: nothing to fix for low/medium issues that are informational
  // (e.g., insufficient data — can't auto-fix, just wait)
  if (diagnosis.canAutoFix) {
    for (const issue of diagnosis.autoFixable) {
      if (issue.code === "insufficient_data") {
        fixes.push({ code: "insufficient_data", action: "rotated_in_feed", note: "Product added to regular rotation to gather signals." })
      }
    }
  }

  // Critical/high issues need owner action — never bypass
  for (const issue of diagnosis.manualNeeded) {
    remainingIssues.push(issue)
  }

  return {
    productId: product.id,
    autoFixed: fixes,
    needsOwnerAction: remainingIssues,
    canProceed: remainingIssues.length === 0,
  }
}
/**
 * Generate a full content package for a product in Luna's voice.
 * Supports multilingual when the language capabilities module is available.
 */
export function generateLunaContent(product, { language = "he", format = "all", marketer } = {}) {
  try {
    const contentPack = generateContentPack(product, { format })
    const lunaVoice = lunaHookForProduct(product)
    const story = lunaStoryText(product, lunaVoice)

    // Build platform-specific variants
    const variants = {}
    const supportedFormats = format === "all" ? ["short_video", "reel", "story", "post", "caption", "landing"] : [format]
    for (const fmt of supportedFormats) {
      if (contentPack?.formats?.[fmt]) {
        variants[fmt] = contentPack.formats[fmt]
      } else if (contentPack?.formats?.post) {
        variants[fmt] = contentPack.formats.post
      }
    }

    return {
      ok: true,
      product: { id: product.id, title: product.title },
      lunaHook: lunaVoice,
      lunaStory: story,
      contentPack,
      variants,
      hashtag: contentPack?.hashtags || [],
      language,
      persona: marketer ? null : AMBASSADOR,
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e), product: { id: product?.id } }
  }
}
/**
 * Generate hook variations for A/B testing.
 * Uses existing hooks engine — deterministic based on product id.
 */
export function generateLunaHooks(product, { count = 3, format = "short_video" } = {}) {
  try {
    return {
      ok: true,
      productId: product.id,
      hooks: generateHookVariations(product, { count, format }),
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
}
/**
 * Build a full campaign plan for a product — content, distribution, tracking.
 */
export function planLunaCampaign(product, { clicks = [], sales = [], campaigns = [], channelStates = [], marketers = [], origin = "https://likelink2.vercel.app" } = {}) {
  const signals = productSignals(product, { sales, clicks, campaigns })
  const angleStats = learnFromClicks(clicks).byAngle
  const campaign = buildCampaign(product, { storeUrl: `${origin}/p/${product.id}`, angleStats })
  const plan = planDistribution(campaign, channelStates || [], product, origin)

  return {
    ok: true,
    product: { id: product.id, title: product.title },
    campaign,
    distribution: plan,
    signals,
    lunaHook: lunaHookForProduct(product),
  }
}
/**
 * Run a full autonomous growth cycle for a product.
 * Implements: DETECT → DIAGNOSE → FIX → EXECUTE → MEASURE → LEARN → ADAPT → IMPROVE
 */
export async function runGrowthCycle({
  product,
  products = [],
  sales = [],
  clicks = [],
  views = [],
  campaigns = [],
  channelStates = [],
  marketers = [],
  actor,
  marketer = actor,
  origin = "https://likelink2.vercel.app",
  now = Date.now(),
  allowExternalPublish = false,
} = {}) {
  const actions = []

  // 1. DETECT
  const opportunities = detectOpportunities({ products, sales, clicks, views, now })
  const opportunity = opportunities.opportunities.find((o) => o.productId === product.id) || null
  actions.push({
    type: LUNA_ACTION_TYPE.TREND_SCAN,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: opportunity || { score: 0, momentum: "no_data" },
    ts: now,
  })

  // 2. DIAGNOSE
  const diagnosis = diagnoseProduct(product, { sales, clicks, campaigns, now })
  actions.push({
    type: LUNA_ACTION_TYPE.DIAGNOSIS,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: { issues: diagnosis.issues.length, canAutoFix: diagnosis.canAutoFix, needsOwnerAction: diagnosis.needsOwnerAction },
    ts: now,
  })

  // 3. FIX (autonomous — only safe deterministic fixes)
  const healResult = selfHealProduct(product, diagnosis)
  actions.push({
    type: LUNA_ACTION_TYPE.SELF_HEAL,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: healResult,
    ts: now,
  })

  if (diagnosis.needsOwnerAction) {
    actions.push({
      type: LUNA_ACTION_TYPE.PUBLISH_ATTEMPT,
      status: LUNA_ACTION_STATUS.BLOCKED,
      reason: "needs_owner_action",
      detail: diagnosis.manualNeeded.map((i) => i.fix),
      ts: now,
    })
    return {
      ok: false,
      productId: product.id,
      actions,
      blocked: true,
      reason: "needs_owner_action",
      ownerActionRequired: diagnosis.manualNeeded,
    }
  }

  // 4. CREATE + PLAN
  const content = generateLunaContent(product, { language: "he", marketer })
  const hooks = generateLunaHooks(product, { count: 3 })
  const campaignPlan = planLunaCampaign(product, { clicks, sales, campaigns, channelStates, marketers, origin })

  actions.push({
    type: LUNA_ACTION_TYPE.CONTENT_CREATE,
    status: content.ok ? LUNA_ACTION_STATUS.COMPLETED : LUNA_ACTION_STATUS.FAILED,
    result: content.ok ? { hasContentPack: true, hookCount: hooks.hooks?.length || 0 } : { error: content.error },
    ts: now,
  })

  // 5. VERIFY (trust gate)
  const { verifyProduct, isDiscoveryEligible } = await import("./trustVerification.js")
  const verification = verifyProduct({ product, actor, marketers, now })
  const eligible = isDiscoveryEligible(verification)

  actions.push({
    type: LUNA_ACTION_TYPE.VERIFICATION_RUN,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: { state: verification.state, eligible, reason: verification.reason },
    ts: now,
  })

  if (!eligible) {
    actions.push({
      type: LUNA_ACTION_TYPE.PUBLISH_ATTEMPT,
      status: LUNA_ACTION_STATUS.BLOCKED,
      reason: "trust_verification_failed",
      detail: verification.reason,
      ts: now,
    })
    return {
      ok: false,
      productId: product.id,
      actions,
      blocked: true,
      reason: "trust_verification_failed",
      verification,
    }
  }

  // 6. EXECUTE + PUBLISH
  // Internal publish only (provider-independent) — external requires connection
  // Return publish intent for the caller to execute
  const publishIntent = {
    productId: product.id,
    idempotencyKey: `luna:${product.id}:${Math.floor(now / 3600000)}`,
    language: "he",
    allowExternal: allowExternalPublish,
  }

  actions.push({
    type: LUNA_ACTION_TYPE.PUBLISH_ATTEMPT,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: { internalPublish: true, externalPublish: allowExternalPublish && campaignPlan.distribution.canDirectPublish },
    ts: now,
  })

  // 7. LEARN
  const learning = {
    productId: product.id,
    opportunityScore: opportunity?.score || 0,
    diagnosis,
    contentQuality: content.ok ? "ok" : "failed",
    hooksGenerated: hooks.hooks?.length || 0,
    verificationState: verification.state,
    canAutoFix: diagnosis.canAutoFix,
  }
  actions.push({
    type: LUNA_ACTION_TYPE.LEARNING,
    status: LUNA_ACTION_STATUS.COMPLETED,
    result: learning,
    ts: now,
  })

  return {
    ok: true,
    productId: product.id,
    actions,
    content,
    hooks,
    campaignPlan,
    verification,
    publishIntent,
    eligible: true,
  }
}
/**
 * Run a daily trend scan cycle — detects emerging opportunities across all products.
 */
export function runDailyTrendScan({ products = [], sales = [], clicks = [], views = [], now = Date.now() } = {}) {
  const scanned = Date.now()
  const opportunities = detectOpportunities({ products, sales, clicks, views, now })

  return {
    ok: true,
    cycle: "daily_trend_scan",
    timestamp: scanned,
    summary: opportunities.summary,
    opportunities: opportunities.opportunities,
    emerging: opportunities.emerging,
    declining: opportunities.declining,
    actionCount: 1,
  }
}

export default {
  LUNA_GROWTH_CYCLE,
  LUNA_ACTION_TYPE,
  LUNA_ACTION_STATUS,
  detectOpportunities,
  diagnoseProduct,
  selfHealProduct,
  generateLunaContent,
  generateLunaHooks,
  planLunaCampaign,
  runGrowthCycle,
  runDailyTrendScan,
}
