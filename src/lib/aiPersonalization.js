/**
 * AI Personalization Engine
 * 
 * Generates unique marketing content for each seller based on their audience.
 * This is what makes TikTok's algorithm genius — but we do it for sellers.
 * 
 * Features:
 * - Unique content per seller
 * - Audience-based messaging
 * - Time-optimized posting
 * - Platform-specific formatting
 */

// Analyze seller's audience
export function analyzeAudience(sellerId) {
  const data = JSON.parse(localStorage.getItem(`audience_${sellerId}`) || '{}');
  
  return {
    topCities: data.topCities || ['תל אביב', 'ירושלים', 'חיפה'],
    ageRange: data.ageRange || '25-44',
    interests: data.interests || ['אופנה', 'יופי', 'בית'],
    activeHours: data.activeHours || [19, 20, 21, 22],
    preferredPlatform: data.preferredPlatform || 'instagram',
  };
}

// Generate personalized content for seller
export function generatePersonalizedContent(sellerId, product) {
  const audience = analyzeAudience(sellerId);
  const tone = getToneForAudience(audience);
  const platform = audience.preferredPlatform;
  
  const content = {
    headline: generateHeadline(product, tone),
    body: generateBody(product, tone, audience),
    hashtags: generateHashtags(product, audience),
    cta: generateCTA(product, tone),
    bestTime: getBestPostTime(audience),
    platform,
  };
  
  return content;
}

// Get tone based on audience
function getToneForAudience(audience) {
  const tones = {
    '18-24': 'young',      // slang, emojis, energetic
    '25-34': 'trendy',     // modern, lifestyle
    '35-44': 'professional', // quality, value
    '45+': 'trustworthy',  // reliable, family
  };
  
  const age = audience.ageRange;
  if (age.startsWith('18')) return tones['18-24'];
  if (age.startsWith('25')) return tones['25-34'];
  if (age.startsWith('35')) return tones['35-44'];
  return tones['45+'];
}

// Generate headline based on tone
function generateHeadline(product, tone) {
  const headlines = {
    young: [`וואו ${product.name} 🔥`, `זה משהו אחר ${product.name}`, `לא מאמינים את המחיר של ${product.name}`],
    trendy: [`טרנד החודש: ${product.name}`, `כולן מבקשות את ${product.name}`, `Must-have: ${product.name}`],
    professional: [`איכות ללא פשרה: ${product.name}`, `השקעה חכמה ב-${product.name}`, `${product.name} — מותק לטווח ארוך`],
    trustworthy: [`מוצר מומלץ: ${product.name}`, `למעלה מ-100 לקוחות מרוצים מ-${product.name}`, `${product.name} — איכות שאפשר לסמוך עליה`],
  };
  
  const options = headlines[tone] || headlines['trendy'];
  return options[Math.floor(Math.random() * options.length)];
}

// Generate body text
function generateBody(product, tone, audience) {
  const bodies = {
    young: `אההה ${product.name} זה פשווו מושלם 💖\nמחיר: ${product.price}₪\nלהזמינה: ${product.url}`,
    trendy: `אם אתם עדיין לא גיליתם את ${product.name} — הגיע הזמן ✨\n${product.price}₪ בלבד\n${product.url}`,
    professional: `מתחילים שבוע חדש עם ${product.name}\nאיכות מעולה במחיר של ${product.price}₪\n${product.url}`,
    trustworthy: `חשבנו עליכם — ${product.name} במחיר של ${product.price}₪\nמשלוח מהיר, החזרה מובנתת\n${product.url}`,
  };
  
  return bodies[tone] || bodies['trendy'];
}

// Generate hashtags based on audience
function generateHashtags(product, audience) {
  const base = ['#לייקלינק', '#אופנה', '#קניות'];
  const platform = {
    instagram: ['#אינסטגרם_ישראל', '#סטייל', '#אופנה_ישראלית', '#לבוש_נשים'],
    tiktok: ['#טיקטוק_ישראל', '#טרנד', '#אופנה', '#קניות_אונליין'],
    facebook: ['#קניות_אונליין', '#אופנה', '#מבצעים'],
    whatsapp: [],
  };
  
  return [...base, ...(platform[audience.preferredPlatform] || [])];
}

// Generate call-to-action
function generateCTA(product, tone) {
  const ctas = {
    young: ['תקנו עכשיו! 🔥', 'לא מחכים! 🏃‍♀️', 'זה הזמן! 💯'],
    trendy: ['קנו עכשיו ✨', 'הצטרפו לטרנד 🛒', 'להזמינה 👆'],
    professional: ['להזמינה 👆', 'קנו עכשיו', 'לפרטים נוספים'],
    trustworthy: ['להזמינה בטוחה 🔒', 'קנו עכשיו', 'למידע נוסף'],
  };
  
  const options = ctas[tone] || ctas['trendy'];
  return options[Math.floor(Math.random() * options.length)];
}

// Get best post time for audience
function getBestPostTime(audience) {
  const hours = audience.activeHours;
  return hours[Math.floor(Math.random() * hours.length)];
}

// Generate full campaign for seller
export function generateFullCampaign(sellerId, product) {
  const content = generatePersonalizedContent(sellerId, product);
  
  return {
    ...content,
    fullText: `${content.headline}\n\n${content.body}\n\n${content.hashtags.join(' ')}\n\n${content.cta}`,
    scheduleAt: content.bestTime,
  };
}
