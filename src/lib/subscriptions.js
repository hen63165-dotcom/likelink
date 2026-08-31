/**
 * Subscription Plans & Billing System
 * 
 * Plans for sellers:
 * - FREE: 3 products, basic analytics, 15% platform fee
 * - STARTER (₪29/mo): 20 products, advanced analytics, 12% fee, referral bonus
 * - PRO (₪79/mo): Unlimited products, priority support, 10% fee, auto-posting
 * - BUSINESS (₪199/mo): White-label, API access, 8% fee, dedicated manager
 */

export const PLANS = {
  FREE: {
    id: 'free',
    name: 'חינמי',
    nameEn: 'Free',
    price: 0,
    period: 'month',
    features: {
      products: 3,
      analytics: 'basic',
      platformFee: 15,
      referralBonus: false,
      autoPosting: false,
      prioritySupport: false,
      apiAccess: false,
      customDomain: false,
    },
    cta: 'התחילו בחינם',
    color: 'gray',
  },
  STARTER: {
    id: 'starter',
    name: 'מתחיל',
    nameEn: 'Starter',
    price: 29,
    period: 'month',
    features: {
      products: 20,
      analytics: 'advanced',
      platformFee: 12,
      referralBonus: true,
      autoPosting: false,
      prioritySupport: false,
      apiAccess: false,
      customDomain: false,
    },
    cta: 'התחילו עכשיו',
    popular: true,
    color: 'blue',
  },
  PRO: {
    id: 'pro',
    name: 'מקצועי',
    nameEn: 'Pro',
    price: 79,
    period: 'month',
    features: {
      products: Infinity,
      analytics: 'advanced',
      platformFee: 10,
      referralBonus: true,
      autoPosting: true,
      prioritySupport: true,
      apiAccess: false,
      customDomain: false,
    },
    cta: 'התחילו עכשיו',
    color: 'purple',
  },
  BUSINESS: {
    id: 'business',
    name: 'עסקי',
    nameEn: 'Business',
    price: 199,
    period: 'month',
    features: {
      products: Infinity,
      analytics: 'premium',
      platformFee: 8,
      referralBonus: true,
      autoPosting: true,
      prioritySupport: true,
      apiAccess: true,
      customDomain: true,
    },
    cta: 'צרו קשר',
    color: 'gold',
  },
};

export function getPlanById(planId) {
  return PLANS[planId.toUpperCase()] || PLANS.FREE;
}

export function canAddProduct(planId, currentProductCount) {
  const plan = getPlanById(planId);
  return currentProductCount < plan.features.products;
}

export function getPlatformFee(planId) {
  const plan = getPlanById(planId);
  return plan.features.platformFee;
}

export function calculateEarnings(saleAmount, planId) {
  const fee = getPlatformFee(planId);
  const platformCut = (saleAmount * fee) / 100;
  const sellerEarnings = saleAmount - platformCut;
  return { sellerEarnings, platformCut, fee };
}

export function isFeatureAvailable(planId, feature) {
  const plan = getPlanById(planId);
  return plan.features[feature] === true || plan.features[feature] === Infinity;
}

export function getUpgradeMessage(currentPlan, requiredFeature) {
  const plans = Object.values(PLANS);
  const eligible = plans.find(p => 
    p.id !== currentPlan && 
    (p.features[requiredFeature] === true || p.features[requiredFeature] === Infinity)
  );
  
  if (eligible) {
    return `שדרגו ל-${eligible.name} (${eligible.price}₪/חודש) כדי לקבל ${getFeatureName(requiredFeature)}`;
  }
  return '';
}

function getFeatureName(feature) {
  const names = {
    autoPosting: 'פרסום אוטומטי',
    referralBonus: 'בונוס הפניות',
    prioritySupport: 'תמיכה עדיפה',
    apiAccess: 'גישה ל-API',
    customDomain: 'דומיין מותאם',
  };
  return names[feature] || feature;
}
