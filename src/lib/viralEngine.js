/**
 * Viral Loop Engine
 * 
 * Makes every buyer become a seller automatically.
 * This is what makes Meta's system genius — but we do it better.
 * 
 * How it works:
 * 1. Buyer purchases → immediately sees "Earn 15% by sharing"
 * 2. One click → becomes a seller with their own link
 * 3. Their friends buy → they earn → they share more
 * 4. The loop continues exponentially
 */

// Track the viral coefficient
export function trackViralCoefficient(sellerId) {
  const data = JSON.parse(localStorage.getItem('viral_data') || '{}');
  const seller = data[sellerId] || { referrals: 0, conversions: 0 };
  
  return {
    referrals: seller.referrals,
    conversions: seller.conversions,
    coefficient: seller.referrals > 0 ? (seller.conversions / seller.referrals).toFixed(2) : 0,
    tier: getTier(seller.conversions),
  };
}

// Get seller tier based on performance
export function getTier(conversions) {
  if (conversions >= 100) return { name: '💎 יהלום', bonus: 0.25, perks: ['תשלום מהיר', 'תמיכה עדיפות', 'באנר אישי'] };
  if (conversions >= 50) return { name: '🥇 זהב', bonus: 0.20, perks: ['תשלום מהיר', 'תמיכה עדיפות'] };
  if (conversions >= 20) return { name: '🥈 כסף', bonus: 0.15, perks: ['תשלום מהיר'] };
  if (conversions >= 5) return { name: '🥉 ארד', bonus: 0.10, perks: [] };
  return { name: '⭐ חדש', bonus: 0.05, perks: [] };
}



// Track referral chain
export function trackReferralChain(referrerId, buyerId, productId) {
  const chain = JSON.parse(localStorage.getItem('referral_chains') || '{}');
  
  if (!chain[referrerId]) {
    chain[referrerId] = { referrals: [], earnings: 0, conversions: 0 };
  }
  
  chain[referrerId].referrals.push({
    buyerId,
    productId,
    timestamp: Date.now(),
    converted: false,
  });
  
  localStorage.setItem('referral_chains', JSON.stringify(chain));
  return chain[referrerId];
}

// Mark referral as converted (buyer purchased)
export function markReferralConverted(referrerId, buyerId) {
  const chain = JSON.parse(localStorage.getItem('referral_chains') || '{}');
  
  if (chain[referrerId]) {
    const referral = chain[referrerId].referrals.find(r => r.buyerId === buyerId);
    if (referral && !referral.converted) {
      referral.converted = true;
      referral.convertedAt = Date.now();
      chain[referrerId].conversions++;
      localStorage.setItem('referral_chains', JSON.stringify(chain));
    }
  }
  
  return chain[referrerId];
}

// Calculate earnings with bonuses
export function calculateEarnings(sellerId, baseAmount) {
  const viral = trackViralCoefficient(sellerId);
  const tier = getTier(viral.conversions);
  const bonus = baseAmount * tier.bonus;
  const total = baseAmount + bonus;
  
  return {
    base: baseAmount,
    bonus,
    total,
    tier: tier.name,
    perks: tier.perks,
  };
}

// Get leaderboard
export function getLeaderboard() {
  const chains = JSON.parse(localStorage.getItem('referral_chains') || '{}');
  
  return Object.entries(chains)
    .map(([id, data]) => ({
      id,
      conversions: data.conversions,
      referrals: data.referrals.length,
      earnings: data.earnings || 0,
      tier: getTier(data.conversions).name,
    }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);
}

// Auto-convert buyer to seller after purchase
export function autoConvertBuyer(buyerData) {
  const offer = generateViralOffer(buyerData);
  
  const offers = JSON.parse(localStorage.getItem('viral_offers') || '[]');
  offers.push({
    id: `offer_${Date.now()}`,
    buyerId: buyerData.id,
    buyerEmail: buyerData.email,
    offer,
    status: 'pending',
    createdAt: Date.now(),
  });
  localStorage.setItem('viral_offers', JSON.stringify(offers));
  
  return offer;
}

// Generate viral offer for new buyers
export function generateViralOffer(buyerData) {
  const referralCode = generateReferralCode(buyerData?.id || 'new');
  
  return {
    title: '🎉 מזל טוב! קנית בהצלחה!',
    subtitle: 'רוצה להרוויח כסף בעצמך?',
    description: 'פתחי סטודיו משלך בחינם ותתחילי להרוויח 15% מכל מכירה!',
    benefits: [
      '✅ ללא עלות — פתיחה חינמית לחלוטין',
      '✅ כלים מקצועיים לשיווק בקליק',
      '✅ מערכת אוטומטית שעובדת בשבילך',
      '✅ תשלומים מהירים ישירות ל-PayPal',
    ],
    cta: 'פתחי סטודיו עכשיו',
    referralCode,
    bonus: '15%',
  };
}

// Generate unique referral code
function generateReferralCode(sellerId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
