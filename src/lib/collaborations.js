/**
 * Creator Collaboration System
 * Joint campaigns, splits, and partnerships between creators
 */

export const COLLAB_TYPE = {
  JOINT_CAMPAIGN: 'joint_campaign',
  PRODUCT_SPLIT: 'product_split',
  AFFILIATE_PARTNERSHIP: 'affiliate_partnership',
  BUNDLE_COLLECTION: 'bundle_collection',
  CROSS_PROMOTION: 'cross_promotion',
};

export const COLLAB_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  DECLINED: 'declined',
};

export function createCollaboration(initiator, partners, type, details = {}) {
  // Initiate a collaboration between creators
  return {
    id: `collab_${Date.now()}`,
    initiatorId: initiator.id,
    initiatorName: initiator.name,
    partners: partners.map(p => ({
      creatorId: p.id,
      name: p.name,
      status: 'pending', // 'pending', 'accepted', 'declined'
      joinedAt: null,
      share: details.shares?.[p.id] || (100 / (partners.length + 1)),
    })),
    type,
    title: details.title || `Collab: ${initiator.name} + ${partners.map(p => p.name).join(' + ')}`,
    description: details.description || '',
    startDate: details.startDate || Date.now(),
    endDate: details.endDate || Date.now() + 30 * 24 * 60 * 60 * 1000,
    productIds: details.productIds || [],
    revenueSplit: details.revenueSplit || 'equal', // 'equal', 'weighted', 'custom'
    customShares: details.customShares || {},
    status: COLLAB_STATUS.PENDING,
    createdAt: Date.now(),
  };
}

export function acceptCollaboration(collab, creatorId) {
  // Creator accepts collaboration invitation
  const updatedCollab = { ...collab };
  const partner = updatedCollab.partners.find(p => p.creatorId === creatorId);
  if (partner) {
    partner.status = 'accepted';
    partner.joinedAt = Date.now();
  }
  
  // Check if all accepted
  const allAccepted = updatedCollab.partners.every(p => p.status === 'accepted');
  if (allAccepted) {
    updatedCollab.status = COLLAB_STATUS.ACTIVE;
  }
  
  return updatedCollab;
}

export function calculateCollabRevenueSplit(collab, totalRevenue) {
  // Calculate fair revenue distribution between collaborators
  const split = {};
  const allCreators = [
    { creatorId: collab.initiatorId, share: collab.customShares?.[collab.initiatorId] },
    ...collab.partners.map(p => ({ creatorId: p.creatorId, share: p.share }))
  ];
  
  if (collab.revenueSplit === 'equal') {
    const perCreator = totalRevenue / allCreators.length;
    allCreators.forEach(c => split[c.creatorId] = perCreator);
  } else if (collab.revenueSplit === 'weighted') {
    const totalShares = allCreators.reduce((sum, c) => sum + (c.share || 0), 0);
    allCreators.forEach(c => {
      split[c.creatorId] = totalRevenue * ((c.share || 0) / totalShares);
    });
  } else if (collab.revenueSplit === 'custom') {
    // Custom splits defined in collab.customShares
    allCreators.forEach(c => {
      split[c.creatorId] = totalRevenue * ((collab.customShares?.[c.creatorId] || 0) / 100);
    });
  }
  
  return split;
}

export function createProductBundle(collab, products) {
  // Create a bundle from collab products with cross-creator promotion
  return {
    id: `bundle_${Date.now()}`,
    collabId: collab.id,
    title: collab.title,
    description: `Bundle by ${collab.partners.map(p => p.name).join(' & ')}`,
    productIds: products.map(p => p.id),
    creators: [collab.initiatorId, ...collab.partners.map(p => p.creatorId)],
    bundlePrice: products.reduce((sum, p) => sum + (p.price || 0), 0) * 0.85, // 15% bundle discount
    discount: 15,
    views: 0,
    clicks: 0,
    sales: 0,
    revenue: 0,
    featured: false,
    createdAt: Date.now(),
  };
}

export function trackCollabPerformance(collab, sessions) {
  // Track revenue and engagement for a collaboration
  const collabSessions = sessions?.filter(s => s.collabId === collab.id) || [];
  
  const stats = {
    totalClicks: collabSessions.reduce((sum, s) => sum + s.clicks, 0),
    totalSales: collabSessions.reduce((sum, s) => sum + s.sales, 0),
    totalRevenue: collabSessions.reduce((sum, s) => sum + s.revenue, 0),
    totalEngagement: collabSessions.reduce((sum, s) => sum + s.views, 0),
    averageOrderValue: 0,
    conversionRate: 0,
  };
  
  if (stats.totalSales > 0) {
    stats.averageOrderValue = stats.totalRevenue / stats.totalSales;
  }
  
  if (stats.totalClicks > 0) {
    stats.conversionRate = (stats.totalSales / stats.totalClicks * 100).toFixed(2) + '%';
  }
  
  // Distribute revenue among partners
  const revenueSplit = calculateCollabRevenueSplit(collab, stats.totalRevenue);
  stats.revenueSplit = revenueSplit;
  
  return stats;
}

export function suggestCollabPartners(creator, marketers, products, sales) {
  // AI: Suggest compatible collaboration partners
  const creatorStats = {
    productCount: products?.filter(p => p.marketerId === creator.id && p.status === 'approved')?.length || 0,
    totalClicks: products?.filter(p => p.marketerId === creator.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0,
    categories: [...new Set(products?.filter(p => p.marketerId === creator.id)?.map(p => p.category) || [])],
    revenue: sales?.filter(s => s.marketerId === creator.id)?.reduce((sum, s) => sum + (s.marketerNet || 0), 0) || 0,
  };
  
  const suggestions = marketers
    .filter(m => m.id !== creator.id)
    .map(m => {
      const partnerStats = {
        productCount: products?.filter(p => p.marketerId === m.id && p.status === 'approved')?.length || 0,
        totalClicks: products?.filter(p => p.marketerId === m.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0,
        categories: [...new Set(products?.filter(p => p.marketerId === m.id)?.map(p => p.category) || [])],
        revenue: sales?.filter(s => s.marketerId === m.id)?.reduce((sum, s) => sum + (s.marketerNet || 0), 0) || 0,
      };
      
      let compatibilityScore = 0;
      
      // Category overlap (high value for bundling)
      const categoryOverlap = creatorStats.categories.filter(c => partnerStats.categories.includes(c)).length;
      compatibilityScore += categoryOverlap * 10;
      
      // Similar engagement levels (easier partnerships)
      const engagementDiff = Math.abs(creatorStats.totalClicks - partnerStats.totalClicks);
      compatibilityScore += Math.max(0, 20 - engagementDiff / 10);
      
      // Complementary products (non-competing)
      if (categoryOverlap === 0 && partnerStats.productCount > 0) {
        compatibilityScore += 15; // Good for cross-promotion
      }
      
      // Similar revenue tier
      const revenueDiff = Math.abs(creatorStats.revenue - partnerStats.revenue);
      compatibilityScore += Math.max(0, 15 - revenueDiff / 100);
      
      // Both active
      if (partnerStats.productCount > 0 && partnerStats.totalClicks > 0) {
        compatibilityScore += 10;
      }
      
      return {
        creator: m,
        score: Math.min(compatibilityScore, 100),
        reason: categoryOverlap > 0 ? `${categoryOverlap} shared categories` : 'Complementary products',
        complementary: categoryOverlap === 0,
      };
    })
    .filter(s => s.score > 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  
  return suggestions;
}

export function getCollabBadges(creator, collabs) {
  // Gamification: Badges for successful collaborations
  const activeCollabs = collabs?.filter(c => 
    (c.initiatorId === creator.id || c.partners.some(p => p.creatorId === creator.id)) &&
    c.status === COLLAB_STATUS.ACTIVE
  ) || [];
  
  const completedCollabs = collabs?.filter(c => 
    (c.initiatorId === creator.id || c.partners.some(p => p.creatorId === creator.id)) &&
    c.status === COLLAB_STATUS.COMPLETED
  ) || [];
  
  const badges = [];
  
  if (activeCollabs.length >= 1) badges.push({ id: 'collab_start', name: '🤝 Team Player', description: 'Started a collaboration' });
  if (completedCollabs.length >= 1) badges.push({ id: 'collab_win', name: '✨ Collab Champion', description: 'Completed a successful collaboration' });
  if (completedCollabs.length >= 5) badges.push({ id: 'collab_pro', name: '🏆 Collab Pro', description: '5+ successful collaborations' });
  if (completedCollabs.length >= 10) badges.push({ id: 'collab_legend', name: '👑 Collab Legend', description: '10+ successful collaborations' });
  
  return badges;
}
