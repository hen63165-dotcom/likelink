/**
 * Likelink — Pricing Tiers & Profit Engine 💰
 *
 * Three tiers for sellers. Each defines:
 *   - Monthly price (what the seller pays Likelink)
 *   - platformFee (% Likelink takes from each sale)
 *   - sellerNet (% the seller keeps)
 *   - Feature limits and capabilities
 *
 * Profit for Likelink = subscription + platformFee% of gross sales
 * Profit for seller = sellerNet% of each sale
 */

export const PRICING_TIERS = {
  starter: {
    id: "starter",
    name: { he: "מתחיל", en: "Starter" },
    tagline: { he: "התחל למכור היום", en: "Start selling today" },
    price: 29,           // ₪/month
    priceYearly: 290,    // ₪/year (2 months free)
    platformFee: 15,     // Likelink takes 15% of each sale
    sellerNet: 85,       // Seller keeps 85%
    color: "#10b981",
    icon: "rocket",
    features: {
      maxProducts: 50,
      maxCollections: 3,
      autoPilot: false,
      brandPulse: false,
      growthEngine: true,
      analytics: "basic",
      payoutMethods: ["paypal"],
      support: "community",
      customDomain: false,
      apiAccess: false,
      gamification: true,
      storyKit: true,
    },
    limits: { salesPerMonth: 100, productsPerMonth: 50 },
  },
  professional: {
    id: "professional",
    name: { he: "מקצועי", en: "Professional" },
    tagline: { he: "העסק גדל — אנחנו עוזרים", en: "Grow your business" },
    price: 99,
    priceYearly: 990,
    platformFee: 10,
    sellerNet: 90,
    color: "#6C4CF1",
    icon: "zap",
    highlighted: true,
    features: {
      maxProducts: 500,
      maxCollections: 20,
      autoPilot: true,
      brandPulse: true,
      growthEngine: true,
      analytics: "advanced",
      payoutMethods: ["paypal", "bank"],
      support: "priority",
      customDomain: true,
      apiAccess: false,
      gamification: true,
      storyKit: true,
    },
    limits: { salesPerMonth: 1000, productsPerMonth: 500 },
  },
  enterprise: {
    id: "enterprise",
    name: { he: "עסקי", en: "Enterprise" },
    tagline: { he: "הכל כלול — ללא מגבלות", en: "Everything included" },
    price: 299,
    priceYearly: 2990,
    platformFee: 5,
    sellerNet: 95,
    color: "#f59e0b",
    icon: "building",
    features: {
      maxProducts: Infinity,
      maxCollections: Infinity,
      autoPilot: true,
      brandPulse: true,
      growthEngine: true,
      analytics: "premium",
      payoutMethods: ["paypal", "bank", "wire"],
      support: "dedicated",
      customDomain: true,
      apiAccess: true,
      gamification: true,
      storyKit: true,
    },
    limits: { salesPerMonth: Infinity, productsPerMonth: Infinity },
  },
};

export function getTier(tierId) {
  return PRICING_TIERS[tierId] || PRICING_TIERS.starter;
}

export function calculateSaleSplit({ saleAmount, tierId }) {
  const tier = getTier(tierId);
  const platformCut = Math.round((saleAmount * tier.platformFee / 100) * 100) / 100;
  const sellerEarnings = Math.round((saleAmount - platformCut) * 100) / 100;
  return { saleAmount, platformFee: platformCut, sellerEarnings, feePercent: tier.platformFee };
}

export function calculateMonthlyProfit({ monthlySales, tierId }) {
  const tier = getTier(tierId);
  const totalRevenue = Array.isArray(monthlySales) ? monthlySales.reduce((s, x) => s + (x || 0), 0) : Number(monthlySales || 0);
  const totalPlatformFees = Math.round((totalRevenue * tier.platformFee / 100) * 100) / 100;
  return {
    subscription: tier.price,
    platformFees: totalPlatformFees,
    totalLikelinkProfit: Math.round((tier.price + totalPlatformFees) * 100) / 100,
    sellerEarnings: Math.round((totalRevenue - totalPlatformFees) * 100) / 100,
    grossRevenue: totalRevenue,
  };
}

export function getAllTiers() {
  return Object.values(PRICING_TIERS);
}

export function isFeatureAvailable(tierId, feature) {
  const tier = getTier(tierId);
  const val = tier.features[feature];
  return val === true || val === Infinity;
}
