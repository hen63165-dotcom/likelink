/**
 * Gamification System
 * Badges, achievements, leaderboards, and challenges
 */

export const ACHIEVEMENT_CATEGORIES = {
  SALES: 'sales',
  ENGAGEMENT: 'engagement',
  CONSISTENCY: 'consistency',
  COMMUNITY: 'community',
  COLLABORATION: 'collaboration',
  MONETIZATION: 'monetization',
};

export const ACHIEVEMENTS = {
  // Sales achievements
  first_sale: {
    id: 'first_sale',
    name: '🎉 First Sale',
    description: 'Completed your first sale',
    points: 100,
    category: ACHIEVEMENT_CATEGORIES.SALES,
    tier: 1,
  },
  sales_100: {
    id: 'sales_100',
    name: '💰 Century Club',
    description: 'Made 100 sales',
    points: 500,
    category: ACHIEVEMENT_CATEGORIES.SALES,
    tier: 2,
  },
  sales_500: {
    id: 'sales_500',
    name: '🚀 Sales Rocket',
    description: 'Made 500 sales',
    points: 2000,
    category: ACHIEVEMENT_CATEGORIES.SALES,
    tier: 3,
  },
  
  // Engagement achievements
  trending: {
    id: 'trending',
    name: '📈 Trending Now',
    description: 'Product reached trending status',
    points: 250,
    category: ACHIEVEMENT_CATEGORIES.ENGAGEMENT,
    tier: 2,
  },
  viral: {
    id: 'viral',
    name: '🔥 Going Viral',
    description: 'Product received 1000+ clicks',
    points: 1000,
    category: ACHIEVEMENT_CATEGORIES.ENGAGEMENT,
    tier: 3,
  },
  
  // Consistency achievements
  week_warrior: {
    id: 'week_warrior',
    name: '⏰ Week Warrior',
    description: 'Posted products 7 days in a row',
    points: 200,
    category: ACHIEVEMENT_CATEGORIES.CONSISTENCY,
    tier: 1,
  },
  month_master: {
    id: 'month_master',
    name: '👑 Month Master',
    description: 'Posted products 30 days in a row',
    points: 1000,
    category: ACHIEVEMENT_CATEGORIES.CONSISTENCY,
    tier: 3,
  },
  
  // Community achievements
  followers_100: {
    id: 'followers_100',
    name: '👥 Century Crowd',
    description: 'Reached 100 followers',
    points: 300,
    category: ACHIEVEMENT_CATEGORIES.COMMUNITY,
    tier: 2,
  },
  followers_1000: {
    id: 'followers_1000',
    name: '🌟 Rising Star',
    description: 'Reached 1000 followers',
    points: 2000,
    category: ACHIEVEMENT_CATEGORIES.COMMUNITY,
    tier: 3,
  },
};

export function checkAchievements(creator, products, sales, followers = 0) {
  // Check which achievements user has unlocked
  const unlocked = [];
  
  const productCount = products?.filter(p => p.marketerId === creator.id && p.status === 'approved')?.length || 0;
  const totalSales = sales?.filter(s => s.marketerId === creator.id)?.length || 0;
  const totalClicks = products?.filter(p => p.marketerId === creator.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
  
  // Sales achievements
  if (totalSales >= 1) unlocked.push(ACHIEVEMENTS.first_sale);
  if (totalSales >= 100) unlocked.push(ACHIEVEMENTS.sales_100);
  if (totalSales >= 500) unlocked.push(ACHIEVEMENTS.sales_500);
  
  // Engagement achievements
  const maxProductClicks = products?.filter(p => p.marketerId === creator.id)?.reduce((max, p) => Math.max(max, p.clicks || 0), 0) || 0;
  if (totalClicks >= 1000) unlocked.push(ACHIEVEMENTS.viral);
  
  // Consistency achievements (simplified for demo)
  if (productCount >= 7) unlocked.push(ACHIEVEMENTS.week_warrior);
  if (productCount >= 30) unlocked.push(ACHIEVEMENTS.month_master);
  
  // Community achievements
  if (followers >= 100) unlocked.push(ACHIEVEMENTS.followers_100);
  if (followers >= 1000) unlocked.push(ACHIEVEMENTS.followers_1000);
  
  return unlocked;
}

export function calculateTotalPoints(achievements) {
  return achievements.reduce((sum, a) => sum + (a.points || 0), 0);
}

export function getLevelFromPoints(points) {
  const levels = [
    { level: 1, minPoints: 0, name: '🌱 Seedling', maxPoints: 499 },
    { level: 2, minPoints: 500, name: '🌿 Sprout', maxPoints: 1499 },
    { level: 3, minPoints: 1500, name: '🌳 Tree', maxPoints: 4999 },
    { level: 4, minPoints: 5000, name: '🌲 Forest', maxPoints: 9999 },
    { level: 5, minPoints: 10000, name: '🏔️ Mountain', maxPoints: Infinity },
  ];
  
  const level = levels.find(l => points >= l.minPoints && points <= l.maxPoints);
  const nextLevel = levels.find(l => l.minPoints > points);
  
  return {
    ...level,
    pointsToNextLevel: nextLevel ? nextLevel.minPoints - points : 0,
    progressToNext: nextLevel ? ((points - level.minPoints) / (nextLevel.minPoints - level.minPoints)) * 100 : 100,
  };
}

export function getDailyChallenge(day) {
  // Daily challenges to keep creators engaged
  const challenges = [
    { id: 'daily_share', name: '📤 Daily Share', description: 'Share your profile 5 times', reward: 50, category: 'sharing' },
    { id: 'daily_favorite', name: '❤️ Love Today', description: 'Get 10 favorites', reward: 50, category: 'engagement' },
    { id: 'daily_click', name: '🖱️ Click Magnet', description: 'Get 20 clicks', reward: 50, category: 'engagement' },
    { id: 'daily_product', name: '📦 Product Drop', description: 'Upload a new product', reward: 75, category: 'content' },
    { id: 'daily_message', name: '💬 Community Chat', description: 'Engage in 3 conversations', reward: 50, category: 'community' },
  ];
  
  // Rotate daily challenges based on day of month
  return challenges[day % challenges.length];
}

export function getWeeklyQuest(week) {
  // Weekly quests for bigger rewards
  const quests = [
    { id: 'quest_viral', name: '🚀 Go Viral', description: 'Get 500 clicks this week', reward: 500, timeFrame: 'week' },
    { id: 'quest_seller', name: '💼 Weekly Seller', description: 'Make 5 sales this week', reward: 500, timeFrame: 'week' },
    { id: 'quest_collector', name: '🎨 Collection Master', description: 'Create a collection with 10+ items', reward: 300, timeFrame: 'week' },
    { id: 'quest_collab', name: '🤝 Collaborate', description: 'Start a collaboration with another creator', reward: 400, timeFrame: 'week' },
  ];
  
  return quests[week % quests.length];
}

export function getMonthlyChallenge(month) {
  // Monthly community challenges for brand-building
  const challenges = [
    {
      id: 'month_trendsetter',
      name: '🎯 Trendsetter',
      description: 'Feature your product on trending page',
      target: 1,
      reward: 2000,
      category: 'trending',
    },
    {
      id: 'month_ambassador',
      name: '🌟 Brand Ambassador',
      description: 'Reach 5000 total clicks',
      target: 5000,
      reward: 1500,
      category: 'engagement',
    },
    {
      id: 'month_curator',
      name: '🎨 Master Curator',
      description: 'Create and complete 5 collections',
      target: 5,
      reward: 1000,
      category: 'curation',
    },
  ];
  
  return challenges[month % challenges.length];
}

export function buildLeaderboard(products, sales, marketers, type = 'earnings') {
  // Build different leaderboards for healthy competition
  if (type === 'earnings') {
    return marketers
      .map(m => ({
        marketerId: m.id,
        name: m.name,
        revenue: sales?.filter(s => s.marketerId === m.id)?.reduce((sum, s) => sum + (s.marketerNet || 0), 0) || 0,
        sales: sales?.filter(s => s.marketerId === m.id)?.length || 0,
        rank: 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((m, i) => ({ ...m, rank: i + 1 }))
      .slice(0, 50);
  } else if (type === 'engagement') {
    return marketers
      .map(m => ({
        marketerId: m.id,
        name: m.name,
        clicks: products?.filter(p => p.marketerId === m.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0,
        products: products?.filter(p => p.marketerId === m.id && p.status === 'approved')?.length || 0,
        rank: 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .map((m, i) => ({ ...m, rank: i + 1 }))
      .slice(0, 50);
  } else if (type === 'growth') {
    // Leaderboard for fastest-growing creators
    return marketers
      .map(m => {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentClicks = products?.filter(p => p.marketerId === m.id && p.createdAt > weekAgo)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
        return {
          marketerId: m.id,
          name: m.name,
          weeklyGrowth: recentClicks,
          rank: 0,
        };
      })
      .sort((a, b) => b.weeklyGrowth - a.weeklyGrowth)
      .map((m, i) => ({ ...m, rank: i + 1 }))
      .slice(0, 50);
  }
  
  return [];
}

export function shouldShowAchievementNotification(creator, previousAchievements, currentAchievements) {
  // Determine which new achievements should be celebrated
  const newAchievements = currentAchievements.filter(a => 
    !previousAchievements.find(pa => pa.id === a.id)
  );
  
  return newAchievements.length > 0 ? newAchievements : null;
}
