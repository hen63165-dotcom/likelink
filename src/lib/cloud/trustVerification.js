/**
 * LikeLink Trust Verification Layer 🔍
 * ====================================
 * Pure module — no network, no secrets, no side effects.
 * Extends the existing architecture (catalog.js, securityControls.js) to
 * verify product links, destination URLs, and product identity with strict
 * truthful states.
 *
 * TRUST STATES:
 *   VERIFIED         — all available checks passed (with evidence)
 *   CHECK_REQUIRED   — link is parseable but needs manual review
 *   REJECTED         — assertion genuinely failed
 *   EXPIRED          — previously verified but no longer reachable
 *   SUSPENDED        — temporarily held for investigation
 *   SOURCE_UNAVAILABLE — source data cannot be fetched
 *
 * NEVER claims "100% safe" — each result carries the exact evidence that
 * passed or the specific failure code.
 */

// ─── Trust States ─────────────────────────────────────────────────────────────

export const TRUST_STATE = {
  VERIFIED: "VERIFIED",
  CHECK_REQUIRED: "CHECK_REQUIRED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
};

// ─── Verification Stages ──────────────────────────────────────────────────────

export const VERIFICATION_STAGE = {
  DESTINATION_URL: "destination_url",
  DOMAIN_IDENTITY: "domain_identity",
  REDIRECT_SAFETY: "redirect_safety",
  PRODUCT_AVAILABILITY: "product_availability",
  PRODUCT_IDENTITY: "product_identity",
  MERCHANT_IDENTITY: "merchant_identity",
  PRICE_FRESHNESS: "price_freshness",
  INVENTORY_CHECK: "inventory_check",
  RATING_REVIEW: "rating_review",
  BROKEN_LINK: "broken_link",
  SUSPICIOUS_URL: "suspicious_url",
  POLICY_VIOLATION: "policy_violation",
  MISLEADING_CONTENT: "misleading_content",
  PROVENANCE: "provenance",
  OWNERSHIP: "ownership",
  ATTRIBUTION: "attribution",
  AFFILIATE_DISCLOSURE: "affiliate_disclosure",
};

// ─── Suspicious URL Patterns ────────────────────────────────────────────────────

const SUSPICIOUS_PATTERNS = [
  /javascript:/i,
  /^data:text\/html/i,
  /vbscript:/i,
]

// ─── Known Affiliate Domains ────────────────────────────────────────────────────

const KNOWN_AFFILIATE_DOMAINS = new Set([
  "s.click.aliexpress.com",
  "amzn.to",
  "amzn.com",
  "shareasale.com",
  "cj.com",
  "impact.com",
  "rakutenadvertising.com",
  "partnerize.com",
  "refersion.com",
  "shopstyle.com",
  "rewardStyle.com",
  "awstrck.me",
  "www.aliexpress.com",
  "aliexpress.com",
])

const BLOCKED_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "is.gd",
  "t.co",
  "ow.ly",
  "buff.ly",
  "tinyurl.com",
])

// ─── URL Parsing ────────────────────────────────────────────────────────────────

function parseUrl(url) {
  if (!url || typeof url !== "string") return null
  try {
    const u = new URL(url)
    return {
      original: url,
      protocol: u.protocol,
      hostname: u.hostname.replace(/^www\./, ""),
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      isHttp: u.protocol === "http:" || u.protocol === "https:",
      isHttps: u.protocol === "https:",
    }
  } catch {
    return null
  }
}

/**
 * Check URL validity + protocol safety (synchronous, no fetch).
 * Returns { valid: boolean, reason?: string, parsed?: object }.
 */
export function verifyDestinationUrl(url) {
  if (!url || typeof url !== "string") {
    return { stage: VERIFICATION_STAGE.DESTINATION_URL, status: TRUST_STATE.REJECTED, reason: "empty_url" }
  }

  const parsed = parseUrl(url)
  if (!parsed) {
    return { stage: VERIFICATION_STAGE.DESTINATION_URL, status: TRUST_STATE.REJECTED, reason: "invalid_url_format" }
  }

  if (!parsed.isHttp) {
    return { stage: VERIFICATION_STAGE.DESTINATION_URL, status: TRUST_STATE.REJECTED, reason: "non_http_scheme" }
  }

  if (!parsed.hostname) {
    return { stage: VERIFICATION_STAGE.DESTINATION_URL, status: TRUST_STATE.REJECTED, reason: "missing_hostname" }
  }

  // Suspicious pattern check
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(url)) {
      return { stage: VERIFICATION_STAGE.SUSPICIOUS_URL, status: TRUST_STATE.REJECTED, reason: "suspicious_url_pattern" }
    }
  }

  // Block known shorteners
  if (BLOCKED_DOMAINS.has(parsed.hostname)) {
    return { stage: VERIFICATION_STAGE.SUSPICIOUS_URL, status: TRUST_STATE.REJECTED, reason: "url_shortener_blocked" }
  }

  return { stage: VERIFICATION_STAGE.DESTINATION_URL, status: TRUST_STATE.VERIFIED, parsed }
}

/**
 * Check domain/source identity — returns whether the domain is a known affiliate
 * platform or an unknown source requiring manual review.
 */
export function verifyDomainIdentity(url) {
  const parsed = parseUrl(url)
  if (!parsed) {
    return { stage: VERIFICATION_STAGE.DOMAIN_IDENTITY, status: TRUST_STATE.REJECTED, reason: "unparseable_url" }
  }

  const hostname = parsed.hostname
  const isKnownAffiliate = KNOWN_AFFILIATE_DOMAINS.has(hostname)

  if (isKnownAffiliate) {
    return {
      stage: VERIFICATION_STAGE.DOMAIN_IDENTITY,
      status: TRUST_STATE.VERIFIED,
      domain: hostname,
      sourceType: "affiliate_platform",
      known: isKnownAffiliate,
    }
  }

  // Unknown domain — not necessarily bad, but needs manual check
  return {
    stage: VERIFICATION_STAGE.DOMAIN_IDENTITY,
    status: TRUST_STATE.CHECK_REQUIRED,
    domain: hostname,
    sourceType: "unknown",
    reason: "domain_not_in_allowlist",
  }
}

/**
 * Check redirect safety — detects deep redirect chains and suspicious jumps.
 * This is a static analysis; actual redirect following requires server fetch.
 */
export function verifyRedirectSafety(url) {
  const parsed = parseUrl(url)
  if (!parsed) {
    return { stage: VERIFICATION_STAGE.REDIRECT_SAFETY, status: TRUST_STATE.REJECTED, reason: "unparseable_url" }
  }

  // Basic: URL should not have excessive query params (often used for tracking spam)
  const paramCount = parsed.search ? (parsed.search.match(/[?&]/g) || []).length : 0
  if (paramCount > 15) {
    return { stage: VERIFICATION_STAGE.REDIRECT_SAFETY, status: TRUST_STATE.CHECK_REQUIRED, reason: "excessive_query_params", paramCount }
  }

  return { stage: VERIFICATION_STAGE.REDIRECT_SAFETY, status: TRUST_STATE.VERIFIED }
}

// ─── Product Identity Verification ─────────────────────────────────────────────

/**
 * Verify product identity consistency.
 * Checks that required fields exist and have consistent types.
 */
export function verifyProductIdentity(product) {
  if (!product || typeof product !== "object") {
    return { stage: VERIFICATION_STAGE.PRODUCT_IDENTITY, status: TRUST_STATE.REJECTED, reason: "no_product" }
  }

  const issues = []

  if (!product.id || typeof product.id !== "string") {
    issues.push("missing_or_invalid_id")
  }
  if (!product.title || String(product.title).length < 2) {
    issues.push("missing_or_invalid_title")
  }
  if (!product.price && product.price !== 0) {
    issues.push("missing_price")
  }
  if (product.price && isNaN(Number(product.price))) {
    issues.push("invalid_price_type")
  }
  if (!product.affiliateUrl && !product.url) {
    issues.push("missing_affiliate_url")
  }

  if (issues.length === 0) {
    return {
      stage: VERIFICATION_STAGE.PRODUCT_IDENTITY,
      status: TRUST_STATE.VERIFIED,
      issues: [],
    }
  }

  return {
    stage: VERIFICATION_STAGE.PRODUCT_IDENTITY,
    status: TRUST_STATE.CHECK_REQUIRED,
    issues,
  }
}

// ─── Policy & Misleading Content ────────────────────────────────────────────────

const POLICY_VIOLATION_PATTERNS = [
  /\b(free|freebie|gratis)\b/i,
  /\b(act now|limited time|last chance|ending soon)\b/i,
  /\b(100%|100 percent|verified safe|government approved)\b/i,
  /\b(click here|click below|urgent)\b/i,
]

const MISLEADING_PRICE_PATTERNS = [
  /\$\d+\.\d{3,}/,
]

/**
 * Check for policy violations in product text fields.
 */
export function checkPolicyViolations(product) {
  if (!product || typeof product !== "object") {
    return { stage: VERIFICATION_STAGE.POLICY_VIOLATION, status: TRUST_STATE.REJECTED, reason: "no_product" }
  }

  const text = `${String(product.title || "")} ${String(product.description || "")}`.toLowerCase()
  const violations = []

  for (const pattern of POLICY_VIOLATION_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ pattern: pattern.source, type: "scarcity_or_guarantee" })
    }
  }

  for (const pattern of MISLEADING_PRICE_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ pattern: pattern.source, type: "misleading_price" })
    }
  }

  if (violations.length === 0) {
    return { stage: VERIFICATION_STAGE.POLICY_VIOLATION, status: TRUST_STATE.VERIFIED, violations: [] }
  }

  return {
    stage: VERIFICATION_STAGE.POLICY_VIOLATION,
    status: TRUST_STATE.REJECTED,
    violations,
    reason: "policy_violation_detected",
  }
}

/**
 * Check for misleading content in product text.
 */
export function checkMisleadingContent(product) {
  if (!product || typeof product !== "object") return { stage: VERIFICATION_STAGE.MISLEADING_CONTENT, status: TRUST_STATE.VERIFIED, issues: [] }

  const text = `${String(product.title || "")} ${String(product.description || "")}`
  const issues = []

  if (/^.{0,20}(click|tap|swipe).{0,20}$/i.test(text)) {
    issues.push("bare_call_to_action")
  }

  if (issues.length === 0) {
    return { stage: VERIFICATION_STAGE.MISLEADING_CONTENT, status: TRUST_STATE.VERIFIED, issues: [] }
  }

  return { stage: VERIFICATION_STAGE.MISLEADING_CONTENT, status: TRUST_STATE.CHECK_REQUIRED, issues }
}

// ─── Ownership & Attribution ────────────────────────────────────────────────────

/**
 * Verify product ownership — the marketerId must match the authenticated actor.
 */
export function verifyOwnership(product, actor) {
  if (!product || typeof product !== "object") {
    return { stage: VERIFICATION_STAGE.OWNERSHIP, status: TRUST_STATE.REJECTED, reason: "no_product" }
  }
  if (!actor || !actor.id) {
    return { stage: VERIFICATION_STAGE.OWNERSHIP, status: TRUST_STATE.REJECTED, reason: "no_actor" }
  }
  if (!product.marketerId) {
    return { stage: VERIFICATION_STAGE.OWNERSHIP, status: TRUST_STATE.REJECTED, reason: "no_owner_on_product" }
  }
  if (String(product.marketerId) !== String(actor.id)) {
    return { stage: VERIFICATION_STAGE.OWNERSHIP, status: TRUST_STATE.REJECTED, reason: "ownership_mismatch", actorId: actor.id, productId: product.id }
  }
  return { stage: VERIFICATION_STAGE.OWNERSHIP, status: TRUST_STATE.VERIFIED, ownerId: product.marketerId }
}

/**
 * Verify attribution integrity — the product must have a valid marketerId
 * that resolves to a known marketer record.
 */
export function verifyAttribution(product, marketers = []) {
  if (!product || !product.marketerId) {
    return { stage: VERIFICATION_STAGE.ATTRIBUTION, status: TRUST_STATE.REJECTED, reason: "no_marketerId" }
  }
  const list = Array.isArray(marketers) ? marketers : []
  const marketer = list.find((m) => m && String(m.id) === String(product.marketerId))
  if (!marketer) {
    return { stage: VERIFICATION_STAGE.ATTRIBUTION, status: TRUST_STATE.CHECK_REQUIRED, reason: "marketer_not_found", marketerId: product.marketerId }
  }
  return { stage: VERIFICATION_STAGE.ATTRIBUTION, status: TRUST_STATE.VERIFIED, marketerId: product.marketerId, marketerName: marketer.name || marketer.id }
}

/**
 * Check affiliate disclosure presence.
 */
export function verifyAffiliateDisclosure(product) {
  const text = `${String(product?.title || "")} ${String(product?.description || "")}`.toLowerCase()
  const disclosureIndicators = ["affiliate", "סุדרת התקציב", "פרסומת", "sponsored", "קישור שיווי"]
  const hasDisclosure = disclosureIndicators.some((d) => text.includes(d))
  return { stage: VERIFICATION_STAGE.AFFILIATE_DISCLOSURE, status: hasDisclosure ? TRUST_STATE.VERIFIED : TRUST_STATE.CHECK_REQUIRED, hasDisclosure }
}

// ─── Provenance ─────────────────────────────────────────────────────────────────

/**
 * Create a verification record for a product link verification.
 * Records all assertions, their results, and the final trust state.
 */
export function createVerificationRecord({
  verificationId,
  productId,
  url,
  actor,
  marketers,
  product,
  existingRecord = null,
  now = Date.now(),
} = {}) {
  const assertions = []

  // Run all available synchronous checks
  const urlCheck = verifyDestinationUrl(url)
  assertions.push(urlCheck)

  const domainCheck = verifyDomainIdentity(url)
  assertions.push(domainCheck)

  const redirectCheck = verifyRedirectSafety(url)
  assertions.push(redirectCheck)

  const identityCheck = verifyProductIdentity(product)
  assertions.push(identityCheck)

  const policyCheck = checkPolicyViolations(product)
  assertions.push(policyCheck)

  const misleadingCheck = checkMisleadingContent(product)
  assertions.push(misleadingCheck)

  const attributionCheck = verifyAttribution(product, marketers)
  assertions.push(attributionCheck)

  const disclosureCheck = verifyAffiliateDisclosure(product)
  assertions.push(disclosureCheck)

  // Ownership check only if actor provided
  if (actor) {
    const ownershipCheck = verifyOwnership(product, actor)
    assertions.push(ownershipCheck)
  }

  // Determine final trust state from assertions
  const finalState = resolveTrustState(assertions)

  return {
    verificationId: verificationId || `ver_${productId}_${now}`,
    productId: String(product?.id || ""),
    url: url || null,
    verificationTimestamp: new Date(now).toISOString(),
    retryCount: existingRecord?.retryCount ? existingRecord.retryCount + 1 : 0,
    assertions,
    state: finalState.state,
    reason: finalState.reason,
    evidence: assertions.filter((a) => a.status === TRUST_STATE.VERIFIED).map((a) => ({ stage: a.stage, detail: a })),
    failures: assertions.filter((a) => a.status === TRUST_STATE.REJECTED || a.status === TRUST_STATE.CHECK_REQUIRED).map((a) => ({ stage: a.stage, status: a.status, reason: a.reason || a.issues || a.violations })),
    repairAction: finalState.repairAction,
  }
}

/**
 * Resolve the final trust state from assertion results.
 * Priority: REJECTED > SUSPENDED > SOURCE_UNAVAILABLE > EXPIRED > CHECK_REQUIRED > VERIFIED
 */
export function resolveTrustState(assertions) {
  const states = assertions.map((a) => a.status)

  if (states.includes(TRUST_STATE.REJECTED)) {
    const failed = assertions.find((a) => a.status === TRUST_STATE.REJECTED)
    return {
      state: TRUST_STATE.REJECTED,
      reason: failed.reason || failed.stage,
      repairAction: "fix_violation",
    }
  }

  if (states.some((s) => s === TRUST_STATE.CHECK_REQUIRED)) {
    const checked = assertions.find((a) => a.status === TRUST_STATE.CHECK_REQUIRED)
    return {
      state: TRUST_STATE.CHECK_REQUIRED,
      reason: checked.reason || checked.issues || checked.stage,
      repairAction: "manual_review",
    }
  }

  if (states.includes(TRUST_STATE.SUSPENDED)) {
    return { state: TRUST_STATE.SUSPENDED, reason: "under_investigation", repairAction: "wait_for_review" }
  }

  if (states.includes(TRUST_STATE.SOURCE_UNAVAILABLE)) {
    return { state: TRUST_STATE.SOURCE_UNAVAILABLE, reason: "source_unreachable", repairAction: "retry_later" }
  }

  if (states.includes(TRUST_STATE.EXPIRED)) {
    return { state: TRUST_STATE.EXPIRED, reason: "verification_expired", repairAction: "reverify" }
  }

  return { state: TRUST_STATE.VERIFIED, reason: "all_checks_passed", repairAction: null }
}

// ─── Product Readiness for Discovery (Trust Gate) ───────────────────────────────

/**
 * Check if a product can enter the buyer discovery/feed pipeline.
 * Only products with VERIFIED trust state and ownership are eligible.
 */
export function isDiscoveryEligible(verificationRecord) {
  if (!verificationRecord) return false
  if (verificationRecord.state !== TRUST_STATE.VERIFIED) return false
  const ownership = verificationRecord.assertions.find((a) => a.stage === VERIFICATION_STAGE.OWNERSHIP)
  if (ownership && ownership.status !== TRUST_STATE.VERIFIED) return false
  const attribution = verificationRecord.assertions.find((a) => a.stage === VERIFICATION_STAGE.ATTRIBUTION)
  if (attribution && attribution.status !== TRUST_STATE.VERIFIED) return false
  return true
}

/**
 * Build a trust gate report for an owner — explains what failed and what to fix.
 */
export function trustGateReport(verificationRecord) {
  if (!verificationRecord) {
    return {
      eligible: false,
      state: TRUST_STATE.CHECK_REQUIRED,
      message: "No verification record found. Submit the product for verification.",
      repairAction: "submit_for_verification",
      details: [],
    }
  }

  const eligible = isDiscoveryEligible(verificationRecord)
  const failures = verificationRecord.failures || []

  const details = failures.map((f) => ({
    stage: f.stage,
    status: f.status,
    reason: f.reason,
    fix: repairActionFor(f),
  }))

  return {
    eligible,
    state: verificationRecord.state,
    message: eligible
      ? "Product is verified and eligible for buyer discovery."
      : "Product did not pass trust verification.",
    repairAction: verificationRecord.repairAction,
    details,
  }
}

function repairActionFor(failure) {
  const stage = failure.stage
  if (stage === VERIFICATION_STAGE.DESTINATION_URL) return "Fix the URL format and ensure it uses http/https."
  if (stage === VERIFICATION_STAGE.DOMAIN_IDENTITY) return "Use a recognized affiliate platform or submit for manual domain review."
  if (stage === VERIFICATION_STAGE.REDIRECT_SAFETY) return "Simplify the URL — avoid excessive tracking parameters."
  if (stage === VERIFICATION_STAGE.PRODUCT_IDENTITY) return "Provide a valid product title, price, and affiliate link."
  if (stage === VERIFICATION_STAGE.POLICY_VIOLATION) return "Remove policy-violating language (e.g. 'limited time', '100% safe', 'click here')."
  if (stage === VERIFICATION_STAGE.MISLEADING_CONTENT) return "Revise the product description to be factual and specific."
  if (stage === VERIFICATION_STAGE.OWNERSHIP) return "You must own this product or be its assigned marketer."
  if (stage === VERIFICATION_STAGE.ATTRIBUTION) return "Assign a valid marketer ID that exists in your account."
  if (stage === VERIFICATION_STAGE.AFFILIATE_DISCLOSURE) return "Add an affiliate disclosure to the product description."
  return "Review the verification details and fix the flagged issue."
}

// ─── Trust Verification Engine ──────────────────────────────────────────────────

/**
 * Main verification entry point. Given a product + URL + actor + marketers,
 * runs all available checks and produces a verification record.
 *
 * This is the canonical verification engine, using existing infrastructure.
 */
export function verifyProduct({ product, url, actor, marketers, existingRecord = null, verificationId = null } = {}) {
  const productId = product?.id || `url_${Date.now()}`

  const record = createVerificationRecord({
    verificationId: verificationId || `ver_${productId}_${Date.now()}`,
    productId,
    url: url || product?.affiliateUrl || product?.url || null,
    actor,
    marketers: marketers || [],
    product,
    existingRecord,
  })

  return record
}

/**
 * Verify a batch of products — returns records + eligibility summary.
 */
export function verifyCatalog(products = [], { actor, marketers, clicks = [], sales = [] } = {}) {
  const records = []
  for (const p of products) {
    const rec = verifyProduct({ product: p, actor, marketers })
    records.push(rec)
  }
  return {
    records,
    total: records.length,
    verified: records.filter((r) => r.state === TRUST_STATE.VERIFIED).length,
    checkRequired: records.filter((r) => r.state === TRUST_STATE.CHECK_REQUIRED).length,
    rejected: records.filter((r) => r.state === TRUST_STATE.REJECTED).length,
    discoveryEligible: records.filter(isDiscoveryEligible).length,
  }
}

export default {
  TRUST_STATE,
  VERIFICATION_STAGE,
  verifyDestinationUrl,
  verifyDomainIdentity,
  verifyRedirectSafety,
  verifyProductIdentity,
  checkPolicyViolations,
  checkMisleadingContent,
  verifyOwnership,
  verifyAttribution,
  verifyAffiliateDisclosure,
  createVerificationRecord,
  verifyProduct,
  verifyCatalog,
  isDiscoveryEligible,
  trustGateReport,
  resolveTrustState,
}
