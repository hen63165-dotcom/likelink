/**
 * Advanced Creator Monetization
 * Multiple revenue streams for creators to maximize earnings
 */

export const REVENUE_STREAMS = {
  AFFILIATE: 'affiliate',        // Product commissions
  SPONSORED: 'sponsored',        // Brand partnerships
  SUBSCRIPTION: 'subscription',  // Creator subscriptions
  TIPS: 'tips',                 // Fan tips/donations
  COLLECTIONS: 'collections',   // Curated collection sales
  LIVE_SHOPPING: 'live_shopping', // Live stream commissions
};

export const MONETIZATION_FEATURES = {
  affiliate: {
    name: 'Affiliate Commission',
    description: 'Earn commission on every product sold',
    minThreshold: 100,
    earlyAccess: false,
    requirements: { minProducts: 3, minDays: 7 },
  },
  sponsored: {
    name: 'Sponsored Collections',
    description: 'Brand partnerships and sponsored deals',
    minThreshold: 500,
    earlyAccess: true,
    requirements: { minFollowers: 1000, minEngagement: 2 },
  },
  subscription: {
    name: 'Creator Subscriptions',
    description: 'Exclusive content for paying subscribers',
    minThreshold: 0,
    earlyAccess: true,
    requirements: { minFollowers: 500 },
  },
  tips: {
    name: 'Fan Tips',
    description: 'Accept direct tips from fans',
    minThreshold: 50,
    earlyAccess: false,
    requirements: { minFollowers: 100 },
  },
  collections: {
    name: 'Collection Sales',
    description: 'Create and sell curated collections',
    minThreshold: 200,
    earlyAccess: false,
    requirements: { minProducts: 5, minDays: 14 },
  },
  live_shopping: {
    name: 'Live Shopping Events',
    description: 'Host live streams with shoppable products',
    minThreshold: 1000,
    earlyAccess: true,
    requirements: { minFollowers: 5000 },
  },
};

export function checkMonetizationEligibility(marketer, products, sales, followers = 0) {
  const eligible = {};
  const daysActive = Math.floor((Date.now() - (marketer.createdAt || 0)) / (1000 * 60 * 60 * 24));
  const productCount = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved')?.length || 0;
  const salesCount = sales?.filter(s => s.marketerId === marketer.id)?.length || 0;
  const avgEngagement = productCount > 0 ? (products?.filter(p => p.marketerId === marketer.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) / productCount) : 0;
  
  Object.entries(MONETIZATION_FEATURES).forEach(([stream, config]) => {
    const reqs = config.requirements;
    const earningsThreshold = sales?.filter(s => s.marketerId === marketer.id)?.reduce((sum, s) => sum + (s.marketerNet || 0), 0) || 0;
    
    eligible[stream] = {
      enabled: false,
      reason: null,
      progress: {},
    };
    
    // Check all requirements
    if (reqs.minProducts && productCount < reqs.minProducts) {
      eligible[stream].reason = `Need ${reqs.minProducts} products (have ${productCount})`;
      eligible[stream].progress.products = `${productCount}/${reqs.minProducts}`;
      return;
    }
    
    if (reqs.minDays && daysActive < reqs.minDays) {
      eligible[stream].reason = `Need ${reqs.minDays} days active (${daysActive}/${reqs.minDays})`;
      eligible[stream].progress.days = `${daysActive}/${reqs.minDays}`;
      return;
    }
    
    if (reqs.minFollowers && followers < reqs.minFollowers) {
      eligible[stream].reason = `Need ${reqs.minFollowers} followers (have ${followers})`;
      eligible[stream].progress.followers = `${followers}/${reqs.minFollowers}`;
      return;
    }
    
    if (reqs.minEngagement && avgEngagement < reqs.minEngagement) {
      eligible[stream].reason = `Need ${reqs.minEngagement} avg clicks per product`;
      eligible[stream].progress.engagement = `${avgEngagement.toFixed(1)}/${reqs.minEngagement}`;
      return;
    }
    
    // All requirements met!
    eligible[stream].enabled = true;
    eligible[stream].reason = 'Ready to earn!';
  });
  
  return eligible;
}

export function calculateMonetizationPotential(marketer, products, sales, followers = 0) {
  // Estimate potential monthly earnings from all streams
  const productCount = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved')?.length || 0;
  const monthlyClicks = products?.filter(p => p.marketerId === marketer.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
  const conversionRate = 0.02; // Estimate 2% clicks → sales
  const avgCommission = 50; // ₪50 average commission per sale
  
  const potential = {};
  
  // Affiliate earnings
  const estimatedMonthlySales = monthlyClicks * conversionRate;
  potential.affiliate = estimatedMonthlySales * avgCommission;
  
  // Subscription earnings (estimate: 5% of followers, ₪10/month)
  potential.subscription = followers * 0.05 * 10;
  
  // Tips (estimate: 1% of followers tip ₪2 per month)
  potential.tips = followers * 0.01 * 2;
  
  // Sponsored (estimate: 1-3 deals/month at ₪500-2000 each)
  potential.sponsored = followers >= 1000 ? 1000 : 0;
  
  // Collections sales (20% of affiliate)
  potential.collections = potential.affiliate * 0.2;
  
  // Live shopping (50% higher commission)
  potential.live_shopping = potential.affiliate * 1.5;
  
  const total = Object.values(potential).reduce((sum, v) => sum + v, 0);
  
  return { ...potential, total, monthlyClicks, estimatedMonthlySales };
}

export function createSponsoredDeal(marketer, products, brand, commission, duration) {
  // Create a sponsored collection for brand partnerships
  return {
    id: `sponsored_${Date.now()}`,
    marketerId: marketer.id,
    brand,
    commission, // ₪ or %
    startDate: Date.now(),
    endDate: Date.now() + duration * 24 * 60 * 60 * 1000,
    productIds: [],
    views: 0,
    clicks: 0,
    revenue: 0,
    status: 'active',
  };
}

export function createSubscriptionTier(creator, name, price, description, perks = []) {
  // Creator subscription tiers for exclusive content
  return {
    id: `sub_${Date.now()}`,
    creatorId: creator.id,
    name,
    price, // Monthly price in ₪
    description,
    perks, // Array of benefit strings
    members: 0,
    revenue: 0,
    createdAt: Date.now(),
  };
}

export function calculateCreatorScore(marketer, products, sales, followers = 0) {
  // Likelink Creator Score: composite metric for ranking/featured visibility
  let score = 0;
  
  // Engagement (40%)
  const productCount = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved')?.length || 1;
  const totalClicks = products?.filter(p => p.marketerId === marketer.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
  const avgClicksPerProduct = totalClicks / productCount;
  score += Math.min(avgClicksPerProduct * 4, 40);
  
  // Sales & Revenue (35%)
  const totalRevenue = sales?.filter(s => s.marketerId === marketer.id)?.reduce((sum, s) => sum + (s.marketerNet || 0), 0) || 0;
  const normalizedRevenue = Math.log10(Math.max(1, totalRevenue)) / 4; // Log scale
  score += Math.min(normalizedRevenue * 35, 35);
  
  // Activity & Growth (15%)
  const daysActive = Math.floor((Date.now() - (marketer.createdAt || 0)) / (1000 * 60 * 60 * 24));
  const growthRate = daysActive > 0 ? productCount / Math.max(1, daysActive / 30) : 0;
  score += Math.min(growthRate * 5, 15);
  
  // Community (10%)
  const followerScore = Math.min(followers / 100, 10);
  score += followerScore;
  
  // Consistency bonus: active in last 7 days
  const recentProducts = products?.filter(p => 
    p.marketerId === marketer.id && 
    (Date.now() - p.createdAt) < 7 * 24 * 60 * 60 * 1000
  )?.length || 0;
  if (recentProducts > 0) score += 5; // Bonus for recent activity
  
  return Math.min(score, 100);
}

export function getCreatorGrowthInsights(marketer, products, sales) {
  // Provide actionable growth recommendations
  const insights = [];
  const productCount = products?.filter(p => p.marketerId === marketer.id && p.status === 'approved')?.length || 0;
  const totalClicks = products?.filter(p => p.marketerId === marketer.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
  const avgClicksPerProduct = productCount > 0 ? totalClicks / productCount : 0;
  
  // Low engagement warning
  if (avgClicksPerProduct < 5) {
    insights.push({
      type: 'warning',
      title: 'Low Engagement',
      message: 'Your products average less than 5 clicks. Try using better product descriptions and images.',
      action: 'Optimize product content',
    });
  }
  
  // Few products
  if (productCount < 5) {
    insights.push({
      type: 'info',
      title: 'More Products = More Revenue',
      message: `You have ${productCount} products. Creators with 10+ products earn 3x more.`,
      action: 'Add more products',
    });
  }
  
  // No recent activity
  const daysSinceLastProduct = products?.filter(p => p.marketerId === marketer.id)
    .reduce((minDays, p) => Math.min(minDays, (Date.now() - p.createdAt) / (1000 * 60 * 60 * 24)), Infinity) || 0;
  if (daysSinceLastProduct > 7) {
    insights.push({
      type: 'alert',
      title: 'Boost Your Visibility',
      message: 'You haven\'t posted in a week. Fresh content gets 2x more clicks!',
      action: 'Publish new products',
    });
  }
  
  // High performers
  const topProducts = [...(products?.filter(p => p.marketerId === marketer.id) || [])]
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 3);
  if (topProducts.length > 0 && topProducts[0].clicks > 50) {
    const avgCategory = topProducts[0].category;
    insights.push({
      type: 'success',
      title: 'Your Strength: ' + avgCategory,
      message: `Your best products are in ${avgCategory}. Focus here for quick wins!`,
      action: 'Add more ' + avgCategory,
    });
  }
  
  return insights;
}
