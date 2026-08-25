/**
 * Live Shopping Features
 * Real-time interactive shopping events with creators
 */

export const LIVE_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
};

export function createLiveSession(creator, title, description, startTime, productIds = []) {
  // Create a live shopping session
  return {
    id: `live_${Date.now()}`,
    creatorId: creator.id,
    creatorName: creator.name,
    title,
    description,
    startTime,
    endTime: null,
    status: LIVE_STATUS.SCHEDULED,
    productIds,
    viewers: 0,
    peakViewers: 0,
    totalClicks: 0,
    totalSales: 0,
    revenue: 0,
    messages: [],
    shoppableHighlights: [], // Timestamped product highlights
    createdAt: Date.now(),
  };
}

export function trackLiveViewer(session, viewer) {
  // Track viewer count in real-time
  const updatedSession = { ...session };
  updatedSession.viewers = (updatedSession.viewers || 0) + 1;
  updatedSession.peakViewers = Math.max(updatedSession.peakViewers || 0, updatedSession.viewers);
  
  return updatedSession;
}

export function addShoppableHighlight(session, productId, timestamp, description) {
  // Add a timestamped highlight: "At 12:34, creator featured this product"
  const updatedSession = { ...session };
  updatedSession.shoppableHighlights = updatedSession.shoppableHighlights || [];
  updatedSession.shoppableHighlights.push({
    productId,
    timestamp, // Relative to stream start
    description,
    clicks: 0,
    addedAt: Date.now(),
  });
  
  return updatedSession;
}

export function addLiveChatMessage(session, userId, userName, message, messageType = 'text') {
  // Add message to live chat
  // messageTypes: 'text', 'emoji', 'purchase', 'join', 'tip'
  const updatedSession = { ...session };
  updatedSession.messages = updatedSession.messages || [];
  updatedSession.messages.push({
    id: `msg_${Date.now()}`,
    userId,
    userName,
    message,
    type: messageType,
    timestamp: Date.now(),
    likes: 0,
  });
  
  // Keep last 100 messages
  if (updatedSession.messages.length > 100) {
    updatedSession.messages = updatedSession.messages.slice(-100);
  }
  
  return updatedSession;
}

export function recordLivePurchase(session, productId, quantity, price) {
  // Record purchase during live stream
  const updatedSession = { ...session };
  updatedSession.totalSales = (updatedSession.totalSales || 0) + quantity;
  updatedSession.revenue = (updatedSession.revenue || 0) + (price * quantity);
  
  // Find highlight and increment clicks
  const highlight = updatedSession.shoppableHighlights?.find(h => h.productId === productId);
  if (highlight) {
    highlight.clicks = (highlight.clicks || 0) + 1;
  }
  
  return updatedSession;
}

export function getLiveSessionStats(session) {
  // Calculate performance metrics for live session
  return {
    duration: session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime,
    averageViewers: session.viewers > 0 ? session.viewers : 0,
    peakViewers: session.peakViewers || 0,
    totalClicks: session.totalClicks || 0,
    totalSales: session.totalSales || 0,
    revenue: session.revenue || 0,
    averageOrderValue: session.totalSales > 0 ? session.revenue / session.totalSales : 0,
    conversionRate: session.viewers > 0 ? ((session.totalClicks / session.viewers) * 100).toFixed(2) + '%' : '0%',
    messageCount: session.messages?.length || 0,
    topHighlight: session.shoppableHighlights?.reduce((top, h) => 
      h.clicks > (top?.clicks || 0) ? h : top, null),
  };
}

export function generateLiveReplay(session) {
  // Create a shareable replay with highlights
  return {
    id: `replay_${session.id}`,
    originalSessionId: session.id,
    creatorId: session.creatorId,
    title: session.title + ' (Replay)',
    duration: session.endTime ? session.endTime - session.startTime : 0,
    views: 0,
    revenue: session.revenue,
    highlights: session.shoppableHighlights || [],
    topMoments: (session.shoppableHighlights || [])
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5),
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30-day expiry
  };
}

export function scheduleRecurringLive(creator, title, schedule, productIds = []) {
  // Schedule recurring live streams (daily, weekly, etc.)
  return {
    id: `recurring_${Date.now()}`,
    creatorId: creator.id,
    title,
    schedule, // 'daily', 'weekly', 'every_monday', etc.
    nextLiveTime: calculateNextSchedule(schedule),
    productIds,
    upcomingCount: 0,
    totalRevenue: 0,
    averageViewers: 0,
    createdAt: Date.now(),
  };
}

function calculateNextSchedule(schedule) {
  const now = new Date();
  
  if (schedule === 'daily') {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (schedule === 'weekly') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (schedule.startsWith('every_')) {
    const day = schedule.replace('every_', '');
    const daysMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
    const targetDay = daysMap[day];
    const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
    return new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
  }
  
  return now;
}

export function getLiveStreamingBadge(creator, liveSessions) {
  // Award badge when creator hits milestones
  const completedLives = liveSessions?.filter(s => s.creatorId === creator.id && s.status === LIVE_STATUS.ENDED) || [];
  const totalViewers = completedLives.reduce((sum, s) => sum + (s.peakViewers || 0), 0);
  const totalRevenue = completedLives.reduce((sum, s) => sum + (s.revenue || 0), 0);
  
  if (completedLives.length >= 10 && totalViewers >= 1000 && totalRevenue >= 5000) {
    return { badge: 'Live Shopping Legend 🎬', tier: 'gold' };
  } else if (completedLives.length >= 5 && totalViewers >= 500) {
    return { badge: 'Live Shopping Star ⭐', tier: 'silver' };
  } else if (completedLives.length >= 1) {
    return { badge: 'Live Shopping Creator 📺', tier: 'bronze' };
  }
  
  return null;
}

export function getLiveNotification(session, viewer) {
  // Generate notification to send to followers about live stream
  return {
    type: 'live_stream_started',
    title: `${session.creatorName} is LIVE now!`,
    description: session.title,
    action: 'Watch Now',
    deepLink: `/live/${session.id}`,
    thumbnail: null,
    createdAt: Date.now(),
  };
}
