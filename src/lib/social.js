/**
 * Social Features & Community
 * Messaging, comments, interactions, and social signals
 */

export const INTERACTION_TYPE = {
  COMMENT: 'comment',
  MESSAGE: 'message',
  LIKE: 'like',
  SHARE: 'share',
  MENTION: 'mention',
  FOLLOW: 'follow',
};

export function createComment(user, productId, text, parentCommentId = null) {
  // Add a comment to a product
  return {
    id: `comment_${Date.now()}`,
    userId: user.id,
    userName: user.name,
    userAvatar: user.image,
    productId,
    parentCommentId, // For threaded replies
    text,
    likes: 0,
    replies: [],
    createdAt: Date.now(),
    edited: false,
  };
}

export function createDirectMessage(sender, recipient, text) {
  // Send a direct message between creators
  return {
    id: `msg_${Date.now()}`,
    senderId: sender.id,
    senderName: sender.name,
    recipientId: recipient.id,
    text,
    read: false,
    readAt: null,
    createdAt: Date.now(),
    edited: false,
    replyTo: null,
  };
}

export function buildConversation(messages) {
  // Group messages into conversation thread
  return {
    id: `conv_${Date.now()}`,
    participants: [...new Set(messages.map(m => m.senderId).concat(messages.map(m => m.recipientId)))],
    messages: messages.sort((a, b) => a.createdAt - b.createdAt),
    lastMessage: messages[messages.length - 1],
    unreadCount: messages.filter(m => !m.read).length,
    createdAt: messages[0]?.createdAt || Date.now(),
  };
}

export function getCommentThread(comments, parentId) {
  // Get threaded replies to a comment
  return {
    parent: comments.find(c => c.id === parentId),
    replies: comments.filter(c => c.parentCommentId === parentId),
  };
}

export function getMentions(text) {
  // Extract @mentions from text
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const matches = text.match(mentionRegex);
  return matches ? matches.map(m => m.substring(1)) : [];
}

export function createProductShare(user, product, platform) {
  // Track social shares of products
  return {
    id: `share_${Date.now()}`,
    userId: user.id,
    productId: product.id,
    productTitle: product.title,
    platform, // 'whatsapp', 'instagram', 'tiktok', 'facebook', 'twitter'
    url: `${window.location.origin}/product/${product.id}`,
    shareMessage: generateShareMessage(product, user),
    createdAt: Date.now(),
  };
}

function generateShareMessage(product, user) {
  const messages = {
    en: `Check out "${product.title}" by ${user.name} on Likelink! 🛍️`,
    he: `כדאי לראות "${product.title}" של ${user.name} בLikelink! 🛍️`,
  };
  return messages.en; // Use language from context
}

export function generateSocialCardPreview(product, creator) {
  // Generate OG metadata for social media sharing
  return {
    title: `${product.title} via ${creator.name}`,
    description: (product.description || 'Amazing product on Likelink!').substring(0, 155),
    image: product.image || '',
    url: `${window.location.origin}/u/${creator.slug}?product=${product.id}`,
    author: creator.name,
  };
}

export function buildActivityFeed(interactions, limit = 50) {
  // Create personalized activity feed for users
  const feed = interactions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(interaction => {
      let message = '';
      switch (interaction.type) {
        case INTERACTION_TYPE.FOLLOW:
          message = `${interaction.userName} started following ${interaction.targetName}`;
          break;
        case INTERACTION_TYPE.LIKE:
          message = `${interaction.userName} liked "${interaction.productTitle}"`;
          break;
        case INTERACTION_TYPE.COMMENT:
          message = `${interaction.userName} commented: "${interaction.text.substring(0, 50)}..."`;
          break;
        case INTERACTION_TYPE.SHARE:
          message = `${interaction.userName} shared "${interaction.productTitle}"`;
          break;
      }
      return { ...interaction, message };
    });
  
  return feed;
}

export function getCreatorNetwork(creator, followers, following) {
  // Analyze creator's social network
  return {
    creatorId: creator.id,
    followers: followers || [],
    following: following || [],
    followerCount: followers?.length || 0,
    followingCount: following?.length || 0,
    mutualConnections: followers?.filter(f => following?.includes(f))?.length || 0,
    networkSize: (followers?.length || 0) + (following?.length || 0),
  };
}

export function suggestFollows(creator, marketers, followers, products) {
  // Suggest creators to follow based on interests
  const userCategories = new Set(
    products?.filter(p => p.marketerId === creator.id)?.map(p => p.category) || []
  );
  
  const suggestions = marketers
    .filter(m => m.id !== creator.id && !followers?.includes(m.id))
    .map(m => {
      const theirProducts = products?.filter(p => p.marketerId === m.id && p.status === 'approved') || [];
      const categoryMatch = theirProducts.filter(p => userCategories.has(p.category)).length;
      const engagement = theirProducts.reduce((sum, p) => sum + (p.clicks || 0), 0);
      
      return {
        creator: m,
        categoryMatch,
        engagement,
        reason: categoryMatch > 0 ? `Similar to your ${[...userCategories][0]}` : 'Popular creator',
      };
    })
    .filter(s => s.categoryMatch > 0 || s.engagement > 20)
    .sort((a, b) => (b.categoryMatch + b.engagement / 100) - (a.categoryMatch + a.engagement / 100))
    .slice(0, 8);
  
  return suggestions;
}

export function generateUserProfile(user, followers, following, products, sales) {
  // Build public user profile for sharing
  const totalProducts = products?.filter(p => p.marketerId === user.id && p.status === 'approved')?.length || 0;
  const totalSales = sales?.filter(s => s.marketerId === user.id)?.length || 0;
  const totalClicks = products?.filter(p => p.marketerId === user.id)?.reduce((sum, p) => sum + (p.clicks || 0), 0) || 0;
  
  return {
    id: user.id,
    name: user.name,
    bio: user.bio || '',
    image: user.image || '',
    slug: user.slug || user.id,
    followerCount: followers?.length || 0,
    followingCount: following?.length || 0,
    productCount: totalProducts,
    saleCount: totalSales,
    clickCount: totalClicks,
    joinedAt: user.createdAt || Date.now(),
    verified: totalSales > 50, // Auto-verify high performers
  };
}

export function createNotification(type, user, actor, data = {}) {
  // Create system notification for users
  const notifications = {
    follow: { title: `${actor.name} started following you`, icon: '👥' },
    like: { title: `${actor.name} liked your product`, icon: '❤️' },
    comment: { title: `${actor.name} commented on your product`, icon: '💬' },
    mention: { title: `${actor.name} mentioned you`, icon: '@' },
    sale: { title: 'You made a sale!', icon: '🎉' },
    message: { title: `New message from ${actor.name}`, icon: '✉️' },
  };
  
  const template = notifications[type] || { title: 'Likelink Update', icon: '🔔' };
  
  return {
    id: `notif_${Date.now()}`,
    userId: user.id,
    type,
    title: template.title,
    icon: template.icon,
    actor: actor.id,
    actorName: actor.name,
    data,
    read: false,
    readAt: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

export function buildNotificationCenter(notifications) {
  // Organize notifications by type and date
  const grouped = {
    unread: notifications.filter(n => !n.read),
    read: notifications.filter(n => n.read),
  };
  
  const byType = {};
  grouped.unread.forEach(n => {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  });
  
  return {
    unreadCount: grouped.unread.length,
    byType,
    recent: notifications.slice(0, 20),
  };
}
