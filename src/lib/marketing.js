/**
 * Marketing Automation System - All-in-One
 * 
 * Integrates with:
 * - Meta (Facebook + Instagram)
 * - WhatsApp Business
 * - Telegram
 * - TikTok
 * - Twitter/X
 * - Email
 * - SMS
 * - Pinterest, LinkedIn, Reddit
 * 
 * Everything in one click. No external connections needed.
 */

// All supported platforms
export const PLATFORMS = {
  WHATSAPP: {
    id: 'whatsapp',
    name: 'וואטסאפ',
    nameEn: 'WhatsApp',
    icon: '📱',
    color: '#25D366',
    shareUrl: (url, text) => `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`,
    maxChars: 4096,
    supportsImages: true,
    supportsScheduling: false,
  },
  FACEBOOK: {
    id: 'facebook',
    name: 'פייסבוק',
    nameEn: 'Facebook',
    icon: '📘',
    color: '#1877F2',
    shareUrl: (url, text) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
    maxChars: 63206,
    supportsImages: true,
    supportsScheduling: true,
  },
  INSTAGRAM: {
    id: 'instagram',
    name: 'אינסטגרם',
    nameEn: 'Instagram',
    icon: '📷',
    color: '#E4405F',
    shareUrl: (url) => url,
    note: 'העתיקי את הקישור ושתפי בסטורי או פוסט',
    maxChars: 2200,
    supportsImages: true,
    supportsScheduling: false,
  },
  TELEGRAM: {
    id: 'telegram',
    name: 'טלגרם',
    nameEn: 'Telegram',
    icon: '✈️',
    color: '#0088CC',
    shareUrl: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    maxChars: 4096,
    supportsImages: true,
    supportsScheduling: true,
  },
  TIKTOK: {
    id: 'tiktok',
    name: 'טיקטוק',
    nameEn: 'TikTok',
    icon: '🎵',
    color: '#000000',
    shareUrl: (url) => url,
    note: 'העתיקי את הקישור ושתפי בביו או בתגובות',
    maxChars: 300,
    supportsImages: false,
    supportsScheduling: false,
  },
  TWITTER: {
    id: 'twitter',
    name: 'טוויטר/X',
    nameEn: 'Twitter/X',
    icon: '🐦',
    color: '#1DA1F2',
    shareUrl: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    maxChars: 280,
    supportsImages: true,
    supportsScheduling: true,
  },
  EMAIL: {
    id: 'email',
    name: 'אימייל',
    nameEn: 'Email',
    icon: '📧',
    color: '#EA4335',
    shareUrl: (url, text, subject) => `mailto:?subject=${encodeURIComponent(subject || 'מצאתי מוצר מדהים בשבילך')}&body=${encodeURIComponent(text + '\n\n' + url)}`,
    maxChars: Infinity,
    supportsImages: false,
    supportsScheduling: false,
  },
  SMS: {
    id: 'sms',
    name: 'SMS',
    nameEn: 'SMS',
    icon: '💬',
    color: '#34B7F1',
    shareUrl: (url, text) => `sms:?body=${encodeURIComponent(text + ' ' + url)}`,
    maxChars: 160,
    supportsImages: false,
    supportsScheduling: false,
  },
  MESSENGER: {
    id: 'messenger',
    name: 'מסנגר',
    nameEn: 'Messenger',
    icon: '💭',
    color: '#00B2FF',
    shareUrl: (url) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`,
    maxChars: 2000,
    supportsImages: true,
    supportsScheduling: false,
  },
  PINTEREST: {
    id: 'pinterest',
    name: 'פינטרסט',
    nameEn: 'Pinterest',
    icon: '📌',
    color: '#E60023',
    shareUrl: (url, text) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}`,
    maxChars: 500,
    supportsImages: true,
    supportsScheduling: true,
  },
  LINKEDIN: {
    id: 'linkedin',
    name: 'לינקדאין',
    nameEn: 'LinkedIn',
    icon: '💼',
    color: '#0A66C2',
    shareUrl: (url, text) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    maxChars: 3000,
    supportsImages: true,
    supportsScheduling: true,
  },
  REDDIT: {
    id: 'reddit',
    name: 'רדיט',
    nameEn: 'Reddit',
    icon: '🤖',
    color: '#FF4500',
    shareUrl: (url, text) => `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
    maxChars: 300,
    supportsImages: false,
    supportsScheduling: false,
  },
};
