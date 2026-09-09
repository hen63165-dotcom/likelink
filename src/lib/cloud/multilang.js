/**
 * LikeLink Multi-Language Support
 * Hebrew-first, expandable to all languages.
 */

export const LANGUAGES = {
  he: { name: 'עברית', dir: 'rtl', flag: '🇮🇱', default: true },
  en: { name: 'English', dir: 'ltr', flag: '🇺🇸' },
  ar: { name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  ru: { name: 'Русский', dir: 'ltr', flag: '🇷🇺' },
  fr: { name: 'Français', dir: 'ltr', flag: '🇫🇷' },
  es: { name: 'Español', dir: 'ltr', flag: '🇪🇸' },
};

export const DEFAULT_LANG = 'he';

export function t(key, lang = DEFAULT_LANG, translations = {}) {
  const langData = translations[lang] || {};
  const defaultData = translations[DEFAULT_LANG] || {};
  return langData[key] || defaultData[key] || key;
}

export function getDir(lang = DEFAULT_LANG) {
  return LANGUAGES[lang]?.dir || 'rtl';
}

export function getLangName(lang = DEFAULT_LANG) {
  return LANGUAGES[lang]?.name || lang;
}

export function getAvailableLanguages() {
  return Object.entries(LANGUAGES).map(([code, data]) => ({ code, ...data }));
}

export function translateProduct(product, lang = DEFAULT_LANG) {
  if (!product) return null;
  if (lang === DEFAULT_LANG) return product;
  return { ...product, _lang: lang, _originalLang: DEFAULT_LANG, _translated: false };
}

export function getHooks(lang = DEFAULT_LANG) {
  const hooks = {
    he: [
      { style: 'curiosity', text: 'רגע, למה כולם מתחילים לעשות את זה?' },
      { style: 'problem', text: 'אם גם אתם נתקעים בזה — תראו את זה לפני שאתם ממשיכים' },
      { style: 'benefit', text: 'מצאתי משהו שפותר את הבעיה הזאת הרבה יותר פשוט' },
      { style: 'social_proof', text: 'יש סיבה שהמוצר הזה מקבל תשומת לב' },
      { style: 'urgency', text: 'זה עולה מהר — תראו לפני שייגמר' },
    ],
    en: [
      { style: 'curiosity', text: 'Wait, why is everyone starting to do this?' },
      { style: 'problem', text: 'If you are also stuck — watch this before you continue' },
      { style: 'benefit', text: 'I found something that solves this much more simply' },
      { style: 'social_proof', text: 'There is a reason this product is getting attention' },
      { style: 'urgency', text: 'This is going up fast — watch before it ends' },
    ],
    ar: [
      { style: 'curiosity', text: 'لحظة، لماذا بدأ الجميع يفعلون هذا؟' },
      { style: 'problem', text: 'إذا كنت عالقًا أيضًا — شاهد هذا قبل أن تتابع' },
      { style: 'benefit', text: 'وجدت شيئًا يحل هذه المشكلة بشكل أبسط بكثير' },
      { style: 'social_proof', text: 'هناك سبب يجعل هذا المنتج يحظى باهتمام' },
      { style: 'urgency', text: 'هذا يرتفع بسرعة — شاهد قبل أن ينتهي' },
    ],
    ru: [
      { style: 'curiosity', text: 'Погодите, почему все начали это делать?' },
      { style: 'problem', text: 'Если вы тоже застряли — посмотрите это, прежде чем продолжить' },
      { style: 'benefit', text: 'Я нашел кое-что, что решает эту проблему гораздо проще' },
      { style: 'social_proof', text: 'Есть причина, по которой этот продукт привлекает внимание' },
      { style: 'urgency', text: 'Это быстро растет — смотрите, пока не закончилось' },
    ],
    fr: [
      { style: 'curiosity', text: 'Attendez, pourquoi tout le monde commence à faire ça?' },
      { style: 'problem', text: 'Si vous aussi êtes bloqués — regardez ça avant de continuer' },
      { style: 'benefit', text: "J'ai trouvé quelque chose qui résout ce problème beaucoup plus simplement" },
      { style: 'social_proof', text: "Il y a une raison pour laquelle ce produit attire l'attention" },
      { style: 'urgency', text: 'Ça monte vite — regardez avant que ce ne soit trop tard' },
    ],
    es: [
      { style: 'curiosity', text: 'Espera, ¿por qué todo el mundo está empezando a hacer esto?' },
      { style: 'problem', text: 'Si tú también estás atascado — mira esto antes de continuar' },
      { style: 'benefit', text: 'Encontré algo que resuelve este problema de manera mucho más simple' },
      { style: 'social_proof', text: 'Hay una razón por la que este producto está llamando la atención' },
      { style: 'urgency', text: 'Esto sube rápido — mira antes de que termine' },
    ],
  };
  return hooks[lang] || hooks[DEFAULT_LANG];
}

export function getPlatformContent(platform, lang = DEFAULT_LANG) {
  const content = {
    he: {
      whatsapp: 'היי! ראיתי את זה וחשבתי עליך — {link}',
      telegram: '🔥 {title}\n\n{hook}\n\n💰 ₪{price}\n🔗 {link}',
      instagram: '{hook}\n\n{title}\n💰 ₪{price}\n\nקני עכשיו — לינק בביו 🔗',
      facebook: '{hook}\n\n{title}\n\nמחיר: ₪{price}\nמשלוח חינם\n\nקני עכשיו: {link}',
      tiktok: '{hook} 🔥\n\n{title} — ₪{price}\n\n#קניות #אונליין #מומלץ',
      email: 'שלום!\n\nהיום אני ממליץ על:\n\n{title}\n\n{hook}\n\n💰 ₪{price}\n\nקני עכשיו: {link}\n\nבברכה,\n{ambassador}',
    },
    en: {
      whatsapp: 'Hey! I saw this and thought of you — {link}',
      telegram: '🔥 {title}\n\n{hook}\n\n💰 ₪{price}\n🔗 {link}',
      instagram: '{hook}\n\n{title}\n💰 ₪{price}\n\nShop now — link in bio 🔗',
      facebook: '{hook}\n\n{title}\n\nPrice: ₪{price}\nFree shipping\n\nShop now: {link}',
      tiktok: '{hook} 🔥\n\n{title} — ₪{price}\n\n#shopping #online #recommended',
      email: 'Hi!\n\nToday I recommend:\n\n{title}\n\n{hook}\n\n💰 ₪{price}\n\nShop now: {link}\n\nBest,\n{ambassador}',
    },
  };
  return content[lang]?.[platform] || content[DEFAULT_LANG]?.[platform] || '';
}