/**
 * Campaign Templates & Marketing Functions
 * Pixar-style storytelling in Hebrew
 */

// Campaign templates
export const CAMPAIGN_TEMPLATES = {
  STORY: {
    id: 'story',
    name: 'סטורי',
    icon: '📖',
    templates: [
      {
        id: 'story_discovery',
        name: 'גילוי מוצר',
        text: 'רציתי לשתף אתכם במשהו מדהים שמצאתי... ✨\n\n[שם מוצר]\nמחיר: [מחיר] ₪\n\nמצאתי את זה בלייקלינק 👇\n[קישור]\n\nמה אתם חושבים? 💭',
      },
      {
        id: 'story_love',
        name: 'אהבה ממבט ראשון',
        text: 'אהבה ממבט ראשון! 💕\n\nזה המוצר שאני חייבת לספר לכם עליו:\n[שם מוצר]\n\nבמחיר של [מחיר] ש"ח בלבד!\n\nתקנו דרך הקישור שלי 👇\n[קישור]\n\nמוצר מוגבל — לא נשאר הרבה! 🔥',
      },
      {
        id: 'story_gift',
        name: 'מתנה מושלמת',
        text: 'חשבתי עליכם! 🎁\n\nאם אתם מחפשים מתנה מושלמת:\n[שם מוצר] — [מחיר] ₪\n\nאפשר להזמין דרכי 👇\n[קישור]\n\nיופי של דבר לעצמך או למישהו אהוב 💝',
      },
    ],
  },
  REELS: {
    id: 'reels',
    name: 'רילס/סירטון',
    icon: '🎬',
    templates: [
      {
        id: 'reels_unboxing',
        name: 'אנבוקסינג',
        text: '🎬 אנבוקסינג: [שם מוצר]\n\nמה בקופסה? 🤔\n→ [תיאור קצר]\n\nלמה אני אוהבת?\n→ [סיבה 1]\n→ [סיבה 2]\n\nמחיר: [מחיר] ₪\nלהזמינה: [קישור]\n\n#Likelink #אופנה #קניות',
      },
      {
        id: 'reels_review',
        name: 'ביקורת',
        text: '⭐⭐⭐⭐⭐ ביקורת כנה!\n\n[שם מוצר] — [מחיר] ₪\n\n✅ מה אהבתי:\n→ [דבר 1]\n→ [דבר 2]\n\n❌ מה פחות:\n→ [דבר]\n\nהמלצה? [כן/לא]\n\nתקנו דרכי: [קישור]\n\n#ביקורת #Likelink',
      },
    ],
  },
  SALE: {
    id: 'sale',
    name: 'מבצע',
    icon: '🔥',
    templates: [
      {
        id: 'sale_flash',
        name: 'מבצע פלאש',
        text: '⚡ מבצע פלאש! ⚡\n\n[שם מוצר]\nהמחיר החדש: [מחיר] ₪\n\n▟ לזמן מוגבל בלבד!\n\nתקנו עכשיו 👇\n[קישור]\n\nאל תפספסו! 🚀',
      },
      {
        id: 'sale_limited',
        name: 'מלאי מוגבל',
        text: '🚨 עוד לא נשאר הרבה! 🚨\n\n[שם מוצר] — [מחיר] ₪\n\nהמלאי מתאזל וזה עובד מהר!\n\nתקנו עכשיו בקישור:\n[קישור]\n\n#Likelink #מלאי_מוגבל',
      },
    ],
  },
  TIPS: {
    id: 'tips',
    name: 'טיפים',
    icon: '💡',
    templates: [
      {
        id: 'tips_style',
        name: 'טיפ סטייל',
        text: '💡 טיפ סטייל מהיום:\n\nאיך ללבוש [קטגוריה]?\n\nהמוצר שלי:\n[שם מוצר] — [מחיר] ₪\n\nאיך מחברים?\n→ [רעיון 1]\n→ [רעיון 2]\n\nתקנו דרכי: [קישור]\n\n#טיפים #סטייל #Likelink',
      },
    ],
  },
};

// Generate campaign text with product data
// Share to any platform
export function shareToPlatform(platformId, product, campaignText) {
  const platforms = {
    whatsapp: (url, text) => `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`,
    facebook: (url, text) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
    telegram: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    twitter: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    email: (url, text, subject) => `mailto:?subject=${encodeURIComponent(subject || 'מצאתי מוצר מדהים')}&body=${encodeURIComponent(text + '\n\n' + url)}`,
    sms: (url, text) => `sms:?body=${encodeURIComponent(text + ' ' + url)}`,
    messenger: (url) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`,
    pinterest: (url, text) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}`,
    linkedin: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    reddit: (url, text) => `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  };
  
  const builder = platforms[platformId];
  if (!builder) return { success: false, error: 'פלטפורמה לא נמצאה' };
  
  const text = campaignText || `${product.title} — ${product.price} ₪`;
  const url = product.affiliateUrl || product.url || '';
  
  return { success: true, url: builder(url, text) };
}

// Share using Web Share API (mobile)
export async function shareNative(product, campaignText) {
  const text = campaignText || `${product.title} — ${product.price} ₪`;
  const url = product.affiliateUrl || product.url || '';
  
  if (navigator.share) {
    try {
      await navigator.share({ title: product.title, text, url });
      return { success: true, method: 'native' };
    } catch (err) {
      if (err.name !== 'AbortError') return { success: false, error: err.message };
      return { success: false, cancelled: true };
    }
  }
  return { success: false, error: 'Web Share API לא זמין' };
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: 'הועתק בהצלחה!' };
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return { success: true, message: 'הועתק בהצלחה!' };
  }
}

// Schedule post
export function schedulePost(platformId, product, campaignText, scheduledAt) {
  const scheduled = JSON.parse(localStorage.getItem('scheduled_posts') || '[]');
  const post = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platformId,
    productId: product.id,
    text: campaignText,
    scheduledAt,
    status: 'pending',
    createdAt: Date.now(),
  };
  scheduled.push(post);
  localStorage.setItem('scheduled_posts', JSON.stringify(scheduled));
  return { success: true, post };
}

// Get scheduled posts
export function getScheduledPosts() {
  return JSON.parse(localStorage.getItem('scheduled_posts') || '[]');
}

// Get ready posts
export function getReadyPosts() {
  const now = Date.now();
  return getScheduledPosts().filter(p => p.status === 'pending' && p.scheduledAt <= now);
}

// Mark as published
export function markPostPublished(postId) {
  const posts = getScheduledPosts();
  const post = posts.find(p => p.id === postId);
  if (post) {
    post.status = 'published';
    post.publishedAt = Date.now();
    localStorage.setItem('scheduled_posts', JSON.stringify(posts));
  }
  return post;
}

