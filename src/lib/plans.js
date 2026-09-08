/**
 * LikeLink Unified Plans & Entitlements
 * ======================================
 * Single source of truth for all plan definitions.
 *
 * Consolidates subscriptions.js (4 tiers) + pricing.js (3 tiers) into one system.
 *
 * Three paid tiers + FREE:
 *   FREE:       ₪0/mo   — Basic entry
 *   STARTER:    ₪29/mo   — Growing creators
 *   PROFESSIONAL: ₪79/mo — Active businesses
 *   ENTERPRISE: ₪199/mo  — Full power
 */

export const PLANS = {
  FREE: {
    id: 'free',
    name: { he: 'חינמי', en: 'Free' },
    tagline: { he: 'התחילו בחינם', en: 'Get started free' },
    price: 0,
    priceYearly: 0,
    period: 'month',
    platformFee: 15,
    color: '#6b7280',
    icon: 'gift',
    features: {
      maxProducts: 5,
      maxCollections: 1,
      autoPilot: false,
      growthEngine: false,
      analytics: 'basic',
      customDomain: false,
      apiAccess: false,
      prioritySupport: false,
      decisionMemory: false,
      opportunityEngine: false,
      distribution: false,
    },
    limits: { salesPerMonth: 50, productsPerMonth: 5 },
    cta: { he: 'התחילו בחינם', en: 'Start free' },
  },
  STARTER: {
    id: 'starter',
    name: { he: 'מתחיל', en: 'Starter' },
    tagline: { he: 'ליוצרת שרוצה לצמוח', en: 'For growing creators' },
    price: 29,
    priceYearly: 290,
    period: 'month',
    platformFee: 12,
    color: '#10b981',
    icon: 'rocket',
    features: {
      maxProducts: 50,
      maxCollections: 5,
      autoPilot: false,
      growthEngine: true,
      analytics: 'basic',
      customDomain: false,
      apiAccess: false,
      prioritySupport: false,
      decisionMemory: false,
      opportunityEngine: false,
      distribution: false,
    },
    limits: { salesPerMonth: 200, productsPerMonth: 50 },
    cta: { he: 'התחילו עכשיו', en: 'Start now' },
  },
  PROFESSIONAL: {
    id: 'professional',
    name: { he: 'מקצועי', en: 'Professional' },
    tagline: { he: 'לעסק הפעיל', en: 'For active businesses' },
    price: 79,
    priceYearly: 790,
    period: 'month',
    platformFee: 10,
    color: '#6C4CF1',
    icon: 'zap',
    highlighted: true,
    features: {
      maxProducts: 500,
      maxCollections: 20,
      autoPilot: true,
      growthEngine: true,
      analytics: 'advanced',
      customDomain: true,
      apiAccess: false,
      prioritySupport: true,
      decisionMemory: true,
      opportunityEngine: true,
      distribution: false,
    },
    limits: { salesPerMonth: 1000, productsPerMonth: 500 },
    cta: { he: 'התחילו עכשיו', en: 'Start now' },
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: { he: 'עסקי', en: 'Enterprise' },
    tagline: { he: 'הכל כלול — ללא מגבלות', en: 'Everything included' },
    price: 199,
    priceYearly: 1990,
    period: 'month',
    platformFee: 8,
    color: '#f59e0b',
    icon: 'building',
    features: {
      maxProducts: Infinity,
      maxCollections: Infinity,
      autoPilot: true,
      growthEngine: true,
      analytics: 'premium',
      customDomain: true,
      apiAccess: true,
      prioritySupport: true,
      decisionMemory: true,
      opportunityEngine: true,
      distribution: true,
    },
    limits: { salesPerMonth: Infinity, productsPerMonth: Infinity },
    cta: { he: 'צרו קשר', en: 'Contact us' },
  },
};

// Entitlement keys for feature gating
export const ENTITLEMENTS = {
  AUTO_PILOT: 'autoPilot',
  GROWTH_ENGINE: 'growthEngine',
  ANALYTICS: 'analytics',
  CUSTOM_DOMAIN: 'customDomain',
  API_ACCESS: 'apiAccess',
  PRIORITY_SUPPORT: 'prioritySupport',
  DECISION_MEMORY: 'decisionMemory',
  OPPORTUNITY_ENGINE: 'opportunityEngine',
  DISTRIBUTION: 'distribution',
};

// Map plan features to entitlement checks
export const PLAN_ENTITLEMENTS = {
  [PLANS.FREE.id]: {
    canAddProduct: (count) => count < PLANS.FREE.features.maxProducts,
    canAutoPilot: false,
    canUseGrowthEngine: false,
    canUseDecisionMemory: false,
    canUseOpportunityEngine: false,
    canDistribute: false,
    maxProducts: PLANS.FREE.features.maxProducts,
    platformFee: PLANS.FREE.platformFee,
  },
  [PLANS.STARTER.id]: {
    canAddProduct: (count) => count < PLANS.STARTER.features.maxProducts,
    canAutoPilot: false,
    canUseGrowthEngine: true,
    canUseDecisionMemory: false,
    canUseOpportunityEngine: false,
    canDistribute: false,
    maxProducts: PLANS.STARTER.features.maxProducts,
    platformFee: PLANS.STARTER.platformFee,
  },
  [PLANS.PROFESSIONAL.id]: {
    canAddProduct: (count) => count < PLANS.PROFESSIONAL.features.maxProducts,
    canAutoPilot: true,
    canUseGrowthEngine: true,
    canUseDecisionMemory: true,
    canUseOpportunityEngine: true,
    canDistribute: false,
    maxProducts: PLANS.PROFESSIONAL.features.maxProducts,
    platformFee: PLANS.PROFESSIONAL.platformFee,
  },
  [PLANS.ENTERPRISE.id]: {
    canAddProduct: () => true,
    canAutoPilot: true,
    canUseGrowthEngine: true,
    canUseDecisionMemory: true,
    canUseOpportunityEngine: true,
    canDistribute: true,
    maxProducts: Infinity,
    platformFee: PLANS.ENTERPRISE.platformFee,
  },
};

export function getPlanById(planId) {
  const id = String(planId || 'free').toLowerCase();
  return Object.values(PLANS).find(p => p.id === id) || PLANS.FREE;
}

export function getPlanEntitlements(planId) {
  const id = String(planId || 'free').toLowerCase();
  return PLAN_ENTITLEMENTS[id] || PLAN_ENTITLEMENTS[PLANS.FREE.id];
}

export function getAllPlans() {
  return Object.values(PLANS);
}
