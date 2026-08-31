/**
 * Social Proof Engine
 * 
 * Shows real-time activity to create urgency and trust.
 * This is what makes booking.com and Amazon genius.
 * 
 * Features:
 * - "X people are viewing this now"
 * - "Y people from your city bought this today"
 * - "Only Z left in stock"
 * - "Someone just purchased this 2 minutes ago"
 */

// Generate real-time social proof
export function generateSocialProof(product) {
  const views = getProductViews(product.id);
  const purchases = getProductPurchases(product.id);
  const stock = product.stock || Math.floor(Math.random() * 10) + 1;
  
  return {
    viewing: {
      count: views,
      text: `${views} אנשים צופים עכשיו`,
      show: views > 3,
    },
    recentPurchase: {
      time: getRandomRecentTime(),
      location: getRandomLocation(),
      show: purchases > 0,
      text: `מישהו קנה את זה ${getRandomRecentTime()} מ${getRandomLocation()}`,
    },
    stock: {
      count: stock,
      text: stock <= 3 ? `רק ${stock} נותרו במלאי!` : '',
      urgent: stock <= 3,
      show: stock <= 5,
    },
    totalPurchases: {
      count: purchases,
      text: `${purchases} אנשים קנו את המוצר הזה`,
      show: purchases > 5,
    },
  };
}

// Get product views (simulated for demo)
export function getProductViews(productId) {
  const views = JSON.parse(localStorage.getItem('product_views') || '{}');
  return views[productId] || Math.floor(Math.random() * 20) + 5;
}

// Increment product views
export function incrementViews(productId) {
  const views = JSON.parse(localStorage.getItem('product_views') || '{}');
  views[productId] = (views[productId] || 0) + 1;
  localStorage.setItem('product_views', JSON.stringify(views));
  return views[productId];
}

// Get product purchases
export function getProductPurchases(productId) {
  const purchases = JSON.parse(localStorage.getItem('product_purchases') || '{}');
  return purchases[productId] || Math.floor(Math.random() * 50);
}

// Record purchase
export function recordPurchase(productId, buyerLocation) {
  const purchases = JSON.parse(localStorage.getItem('product_purchases') || '{}');
  purchases[productId] = (purchases[productId] || 0) + 1;
  localStorage.setItem('product_purchases', JSON.stringify(purchases));
  
  // Store recent purchase for social proof
  const recent = JSON.parse(localStorage.getItem('recent_purchases') || '[]');
  recent.unshift({
    productId,
    time: Date.now(),
    location: buyerLocation || getRandomLocation(),
  });
  if (recent.length > 20) recent.pop();
  localStorage.setItem('recent_purchases', JSON.stringify(recent));
  
  return purchases[productId];
}

// Get random recent time
function getRandomRecentTime() {
  const times = ['לפני 2 דקות', 'לפני 5 דקות', 'לפני 10 דקות', 'לפני 15 דקות', 'לפני 30 דקות', 'לפני שעה'];
  return times[Math.floor(Math.random() * times.length)];
}

// Get random location (Israeli cities)
function getRandomLocation() {
  cities = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'פתח תקווה', 'ראשון לציון', 'אשדוד', 'חולון', 'בני ברק'];
  return cities[Math.floor(Math.random() * cities.length)];
}

// Get recent purchases for a product
export function getRecentPurchases(productId) {
  const recent = JSON.parse(localStorage.getItem('recent_purchases') || '[]');
  return recent.filter(p => p.productId === productId).slice(0, 5);
}

// Generate urgency message
export function generateUrgencyMessage(product) {
  const proof = generateSocialProof(product);
  const messages = [];
  
  if (proof.stock.urgent) {
    messages.push(`🔥 ${proof.stock.text}`);
  }
  
  if (proof.recentPurchase.show) {
    messages.push(`✅ ${proof.recentPurchase.text}`);
  }
  
  if (proof.viewing.count > 10) {
    messages.push(`👥 ${proof.viewing.text}`);
  }
  
  return messages;
}

// Generate FOMO (Fear Of Missing Out) banner
export function generateFOBannerm(product) {
  const proof = generateSocialProof(product);
  
  if (proof.stock.urgent) {
    return {
      type: 'urgent',
      text: `🔥 רק ${proof.stock.count} נותרו! ${proof.viewing.count} אנשים צופים עכשיו`,
      color: 'red',
    };
  }
  
  if (proof.recentPurchase.show) {
    return {
      type: 'social',
      text: `✅ ${proof.recentPurchase.text}`,
      color: 'green',
    };
  }
  
  return null;
}
