/**
 * Auto-Setup System
 * Everything works automatically — just enter your email and go!
 */

// PayPal Auto-Link Generator
export function generatePayPalLink(email, amount = null, description = '') {
  if (!email || !email.includes('@')) return null;
  
  const base = `https://www.paypal.com/paypalme/${encodeURIComponent(email)}`;
  const params = [];
  
  if (amount) params.push(`amount=${amount}`);
  if (description) params.push(`desc=${encodeURIComponent(description)}`);
  
  return params.length > 0 ? `${base}?${params.join('&')}` : base;
}

// Auto-configure seller profile
export function autoConfigureSeller(profile) {
  return {
    ...profile,
    paypalEmail: profile.paypalEmail || '',
    autoShare: profile.autoShare !== false,
    bestPostingTimes: calculateBestTimes(),
    webhookUrl: generateWebhookUrl(profile.id),
    referralCode: generateReferralCode(profile.id),
    setupComplete: true,
  };
}

// Calculate best posting times (Israel timezone)
export function calculateBestTimes() {
  return [
    { day: 'ראשון', time: '20:30', network: 'WhatsApp' },
    { day: 'שני', time: '21:00', network: 'Instagram' },
    { day: 'שלישי', time: '20:00', network: 'TikTok' },
    { day: 'רביעי', time: '21:30', network: 'Facebook' },
    { day: 'חמישי', time: '19:00', network: 'Telegram' },
    { day: 'שישי', time: '12:00', network: 'WhatsApp' },
    { day: 'שבת', time: '22:00', network: 'Instagram' },
  ];
}

// Generate unique webhook URL for Make/Zapier
export function generateWebhookUrl(sellerId) {
  const hash = btoa(sellerId || 'default').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `https://hook.eu1.make.com/likelink-${hash}`;
}

// Generate referral code
export function generateReferralCode(sellerId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Auto-share to all networks (Web Share API)
export async function autoShare(product, sellerName) {
  const shareData = {
    title: `${product.name} — מחיר מגניב!`,
    text: `מצאתי "${product.name}" ב-₪${product.price} אצל ${sellerName}!\nקני עכשיו: `,
    url: product.affiliateUrl || window.location.href,
  };

  // Try native share (mobile)
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return { success: true, method: 'native' };
    } catch (e) {
      // User cancelled or error
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(`${shareData.text}${shareData.url}`);
    return { success: true, method: 'clipboard' };
  } catch (e) {
    // Final fallback: show text to copy
    return { success: false, text: `${shareData.text}${shareData.url}` };
  }
}

// Auto-schedule posts
export function autoSchedulePosts(products, sellerId) {
  const times = calculateBestTimes();
  const scheduled = [];
  
  products.forEach((product, index) => {
    const slot = times[index % times.length];
    scheduled.push({
      productId: product.id,
      network: slot.network,
      day: slot.day,
      time: slot.time,
      status: 'scheduled',
    });
  });
  
  return scheduled;
}

// Check if setup is complete
export function isSetupComplete(profile) {
  return profile && profile.paypalEmail && profile.paypalEmail.includes('@');
}

// Get setup progress (0-100%)
export function getSetupProgress(profile) {
  if (!profile) return 0;
  
  let progress = 0;
  if (profile.name) progress += 20;
  if (profile.email) progress += 20;
  if (profile.paypalEmail) progress += 30;
  if (profile.products && profile.products.length > 0) progress += 20;
  if (profile.autoShare) progress += 10;
  
  return progress;
}
