/**
 * LikeLink AI Content Studio 🎬
 * ==============================
 * Auto-generates trending content: stories, reels, video scripts,
 * and social posts — all optimized for what's HOT right now.
 *
 * Pure module: no network, no secrets, no side effects.
 */

import { lunaHook, lunaStoryText, AMBASSADOR } from '../lib/ambassador.js';

// Content formats — what's trending on each platform
const FORMATS = {
  story: { name: 'Story', duration: '15s', style: 'vertical', cta: 'Swipe up' },
  reel: { name: 'Reel', duration: '30-60s', style: 'vertical', cta: 'Watch till end' },
  tiktok: { name: 'TikTok', duration: '15-30s', style: 'vertical', cta: 'Follow for more' },
  post: { name: 'Post', duration: 'static', style: 'square', cta: 'Link in bio' },
  video: { name: 'Video', duration: '2-5min', style: 'horizontal', cta: 'Subscribe' },
};

/**
 * Generate a complete content pack for a product.
 */
export function generateContentPack(product, { format = 'all' } = {}) {
  if (!product) return null;

  const hook = lunaHook(product.id);
  const story = lunaStoryText(product, hook);

  const pack = {
    productId: product.id,
    title: product.title || 'מוצר מומלץ',
    price: product.price ? `₪${product.price}` : '',
    image: product.image || '',
    hook,
    story,
    createdAt: Date.now(),
  };

  if (format === 'all') {
    pack.formats = {
      story: generateStory(product, hook, story),
      reel: generateReel(product, hook, story),
      tiktok: generateTikTok(product, hook, story),
      post: generatePost(product, hook, story),
      video: generateVideo(product, hook, story),
    };
  } else {
    pack.formats = { [format]: generateFormat(product, hook, story, format) };
  }

  return pack;
}

function generateStory(product, hook, story) {
  return {
    format: 'story',
    frames: [
      { type: 'hook', text: hook, visual: 'product_closeup', duration: 3 },
      { type: 'problem', text: extractFirstLine(story), visual: 'lifestyle', duration: 4 },
      { type: 'solution', text: product.title, visual: 'product_showcase', duration: 4 },
      { type: 'cta', text: `קני עכשיו ₪${product.price}`, visual: 'text_overlay', duration: 4 },
    ],
    totalDuration: '15s',
    music: 'trending',
    cta: 'Swipe up to shop',
  };
}

function generateReel(product, hook, story) {
  return {
    format: 'reel',
    hook,
    script: [
      { time: '0-3s', text: hook, visual: 'text_on_black' },
      { time: '3-8s', text: extractFirstLine(story), visual: 'product_unboxing' },
      { time: '8-20s', text: 'למה זה עובד:', visual: 'demo', bullets: extractBenefits(story) },
      { time: '20-30s', text: `₪${product.price} — לינק בפרופיל`, visual: 'product_closeup' },
    ],
    music: 'trending_audio',
    captions: true,
    hashtags: generateHashtags(product),
    cta: 'Link in bio',
  };
}

function generateTikTok(product, hook, story) {
  return {
    format: 'tiktok',
    hook,
    script: [
      { time: '0-2s', text: hook, visual: 'text_hook' },
      { time: '2-10s', text: extractFirstLine(story), visual: 'get_ready_with_me' },
      { time: '10-25s', text: `המחיר? רק ₪${product.price}`, visual: 'price_reveal' },
    ],
    music: 'viral_sound',
    effects: ['zoom', 'text_animation'],
    hashtags: generateHashtags(product),
    cta: 'Follow + link in bio',
  };
}

function generatePost(product, hook, story) {
  return {
    format: 'post',
    headline: hook,
    body: `${story}\n\n💰 ₪${product.price}\n🔗 לינק בפרופיל`,
    carousel: [
      { slide: 1, text: hook, visual: 'product_hero' },
      { slide: 2, text: extractFirstLine(story), visual: 'benefits' },
      { slide: 3, text: `₪${product.price} — משלוח חינם`, visual: 'cta' },
    ],
    hashtags: generateHashtags(product),
    cta: 'Link in bio to shop',
  };
}

function generateVideo(product, hook, story) {
  return {
    format: 'video',
    title: `${hook} — ${product.title}`,
    script: [
      { time: '0-30s', text: hook, visual: 'intro_hook' },
      { time: '30s-2m', text: extractFirstLine(story), visual: 'unboxing' },
      { time: '2-4m', text: 'מה כולל ואיך זה עובד:', visual: 'demo' },
      { time: '4-5m', text: `סיכום — ₪${product.price}`, visual: 'final_thoughts' },
    ],
    thumbnail: `${product.title} — ${product.price}₪`,
    hashtags: generateHashtags(product),
    cta: 'Subscribe + link in description',
  };
}

function generateFormat(product, hook, story, format) {
  const generators = { story: generateStory, reel: generateReel, tiktok: generateTikTok, post: generatePost, video: generateVideo };
  return generators[format]?.(product, hook, story) || null;
}

function generateHashtags(product) {
  const base = ['לינק', 'קניות', 'אונליין', 'ישראל', 'מומלץ'];
  const tags = (product.tags || []).slice(0, 5);
  return [...tags.map((t) => `#${t}`), ...base].filter(Boolean).slice(0, 15);
}

function extractFirstLine(text) {
  if (!text) return '';
  return text.split('\n').filter((l) => l.trim())[0] || '';
}

function extractBenefits(text) {
  if (!text) return [];
  return text.split('\n').filter((l) => l.trim().length > 10).slice(0, 3).map((l) => l.trim());
}

export function generatePixarStory(product) {
  if (!product) return null;
  const hook = lunaHook(product.id);
  return {
    style: 'pixar_3d',
    mood: 'warm_adventure',
    character: AMBASSADOR.name,
    scenes: [
      { scene: 1, description: `${AMBASSADOR.name} מגלה את ${product.title} במסע קסום`, mood: 'curiosity', camera: 'wide_shot', duration: 5 },
      { scene: 2, description: `הפרט של המוצר מואר באור זהבי — ${product.title}`, mood: 'wonder', camera: 'close_up', duration: 4 },
      { scene: 3, description: `${AMBASSADOR.name} מחייכת — "זה בדיוק מה שחיפשת"`, mood: 'joy', camera: 'medium_shot', duration: 4 },
      { scene: 4, description: `מחיר: ₪${product.price} — "נגיש לכל אחד"`, mood: 'trust', camera: 'text_overlay', duration: 4 },
      { scene: 5, description: `${AMBASSADOR.name} מצביעה על כפתור "קנה עכשיו"`, mood: 'cta', camera: 'hero_shot', duration: 3 },
    ],
    totalDuration: '20s',
    music: 'upbeat_whimsical',
    voiceover: hook,
    cta: 'קנה עכשיו — לינק בתיאור',
  };
}