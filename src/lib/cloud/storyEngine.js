/**
 * Story Engine 🎬 — Pixar-style animated stories that market products.
 * Self-marketing stories that create desire and curiosity.
 */

const STORY_TEMPLATES = {
  Fashion: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? 👀", action: "zoom_in" },
      { mood: "excitement", luna: "וואו! תראי את זה", action: "show_product" },
      { mood: "demonstration", luna: "זה עובד על כל לוק", action: "demo" },
      { mood: "urgency", luna: "עוד מעט נגמר", action: "countdown" },
      { mood: "cta", luna: "קני עכשיו", action: "cta" },
    ],
  },
  Beauty: {
    scenes: [
      { mood: "curiosity", luna: "מה חדש? ✨", action: "zoom_in" },
      { mood: "excitement", luna: "הסרום שכולן רוצות", action: "show_product" },
      { mood: "demonstration", luna: "תוצאות מידיות", action: "demo" },
      { mood: "urgency", luna: "מלאי מוגבל", action: "countdown" },
      { mood: "cta", luna: "משלוח מהיר", action: "cta" },
    ],
  },
  Tech: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? 📱", action: "zoom_in" },
      { mood: "excitement", luna: "הגאדג'ט הכי חם", action: "show_product" },
      { mood: "demonstration", luna: "תוכיש איך זה עובד", action: "demo" },
      { mood: "urgency", luna: "נמכר מהר", action: "countdown" },
      { mood: "cta", luna: "קני עכשיו", action: "cta" },
    ],
  },
  Home: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? 🏠", action: "zoom_in" },
      { mood: "excitement", luna: "הפרת הקטש שהבית הזה צריך", action: "show_product" },
      { mood: "demonstration", luna: "קל להתקנה", action: "demo" },
      { mood: "urgency", luna: "מחיר מיוחד", action: "countdown" },
      { mood: "cta", luna: "משלוח חינם", action: "cta" },
    ],
  },
  Fitness: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? 💪", action: "zoom_in" },
      { mood: "excitement", luna: "הציוד שיעשה את ההבדל", action: "show_product" },
      { mood: "demonstration", luna: "אימון ביתי מושלם", action: "demo" },
      { mood: "urgency", luna: "עוד מעט נגמר", action: "countdown" },
      { mood: "cta", luna: "קני עכשיו", action: "cta" },
    ],
  },
  Gifts: {
    scenes: [
      { mood: "curiosity", luna: "מתנה? 🎁", action: "zoom_in" },
      { mood: "excitement", luna: "המתנה המושלמת", action: "show_product" },
      { mood: "demonstration", luna: "כולם מתלהבים", action: "demo" },
      { mood: "urgency", luna: "לזמן מוגבל", action: "countdown" },
      { mood: "cta", luna: "אריזה מתנה", action: "cta" },
    ],
  },
  Travel: {
    scenes: [
      { mood: "curiosity", luna: "נסיעה? 🧳", action: "zoom_in" },
      { mood: "excitement", luna: "הציוד שחייב לנסיעה", action: "show_product" },
      { mood: "demonstration", luna: "קל ונוח", action: "demo" },
      { mood: "urgency", luna: "מחיר לפני הנסיעה", action: "countdown" },
      { mood: "cta", luna: "משלוח מהיר", action: "cta" },
    ],
  },
  Kids: {
    scenes: [
      { mood: "curiosity", luna: "לילדים? 🧸", action: "zoom_in" },
      { mood: "excitement", luna: "הפריט שהילדים מרותקים אליו", action: "show_product" },
      { mood: "demonstration", luna: "כיף וגם חינוכי", action: "demo" },
      { mood: "urgency", luna: "נמכר מהר", action: "countdown" },
      { mood: "cta", luna: "משלוח עד הבית", action: "cta" },
    ],
  },
  Accessories: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? 🕶️", action: "zoom_in" },
      { mood: "excitement", luna: "הפרט הקטן שעושה את כל הלוק", action: "show_product" },
      { mood: "demonstration", luna: "משלים כל אאוטפית", action: "demo" },
      { mood: "urgency", luna: "מלאי מוגבל", action: "countdown" },
      { mood: "cta", luna: "קני עכשיו", action: "cta" },
    ],
  },
  Other: {
    scenes: [
      { mood: "curiosity", luna: "מה זה? ✨", action: "zoom_in" },
      { mood: "excitement", luna: "מצאתי משהו מדהים", action: "show_product" },
      { mood: "demonstration", luna: "זה עובד", action: "demo" },
      { mood: "urgency", luna: "עוד מעט נגמר", action: "countdown" },
      { mood: "cta", luna: "קני עכשיו", action: "cta" },
    ],
  },
};

const ANIMATION_EFFECTS = {
  zoom_in: { type: "scale", from: 0.8, to: 1.2, duration: "0.8s" },
  show_product: { type: "fadeIn", duration: "0.5s" },
  demo: { type: "slideUp", duration: "0.6s" },
  countdown: { type: "pulse", duration: "1s" },
  cta: { type: "bounce", duration: "0.8s" },
};

const MOOD_COLORS = {
  curiosity: "#C9A86C",
  excitement: "#E86A9E",
  demonstration: "#6C4CF1",
  urgency: "#FF4D6E",
    cta: "#00C896",
};

/**
 * Generate a complete Pixar-style story for a product.
 * Returns a 5-frame animated story with Luna as the character.
 */
export function generateProductStory(product, options = {}) {
  const template = STORY_TEMPLATES[product.category] || STORY_TEMPLATES.Other;

  const frames = template.scenes.map((scene, index) => {
    const effect = ANIMATION_EFFECTS[scene.action];
    const color = MOOD_COLORS[scene.mood];

    return {
      frame: index + 1,
      lunaText: scene.luna,
      lunaEmoji: getLunaMood(scene.mood),
      mood: scene.mood,
      action: scene.action,
      animation: effect,
      backgroundColor: color,
      product: {
        title: product.title,
        price: product.price,
        image: product.image,
        url: `/p/${product.id}`,
      },
      duration: index === 4 ? 4000 : 3000,
      textStyle: getTextStyle(scene.mood),
    };
  });

  return {
    id: `story_${product.id}_${Date.now()}`,
    productId: product.id,
    title: `${product.title} — סטורי לונה`,
    frames,
    totalDuration: "15s",
    music: "upbeat_whimsical",
    cta: {
      text: "קני עכשיו",
      url: `/p/${product.id}`,
      color: "#00C896",
    },
    shareable: {
      text: `🧚 לונה מצאה את ${product.title} — ₪${product.price}`,
      hashtags: generateHashtags(product),
    },
  };
}

/**
 * Generate a collection story — Luna presents a curated collection.
 */
export function generateCollectionStory(collection, products) {
  const frames = [
    {
      frame: 1,
      lunaText: `הקולקציה של ${collection.name}`,
      lunaEmoji: "🧚",
      mood: "curiosity",
      animation: ANIMATION_EFFECTS.zoom_in,
      backgroundColor: "#C9A86C",
    },
    {
      frame: 2,
      lunaText: `מצאתי את הכי טוב ב${collection.category}`,
      lunaEmoji: "✨",
      mood: "excitement",
      animation: ANIMATION_EFFECTS.show_product,
      backgroundColor: "#E86A9E",
    },
    ...products.slice(0, 3).map((p, i) => ({
      frame: i + 3,
      lunaText: `${p.title} — ₪${p.price}`,
      lunaEmoji: "🛍️",
      mood: "demonstration",
      animation: ANIMATION_EFFECTS.demo,
      backgroundColor: "#6C4CF1",
      product: p,
    })),
    {
      frame: 6,
      lunaText: "קני עכשיו",
      lunaEmoji: "💜",
      mood: "cta",
      animation: ANIMATION_EFFECTS.cta,
      backgroundColor: "#00C896",
    },
  ];

  return {
    id: `collection_${collection.id}_${Date.now()}`,
    title: collection.name,
    frames,
    totalDuration: "18s",
    cta: {
      text: "צפי בקולקציה",
      url: `/collection/${collection.id}`,
    },
  };
}

function getLunaMood(mood) {
  const map = {
    curiosity: "👀",
    excitement: "✨",
    demonstration: "🧚",
    urgency: "🔥",
    cta: "💜",
  };
  return map[mood] || "🧚";
}

function getTextStyle(mood) {
  const map = {
    curiosity: { fontSize: "18px", fontWeight: "600" },
    excitement: { fontSize: "22px", fontWeight: "800" },
    demonstration: { fontSize: "16px", fontWeight: "600" },
    urgency: { fontSize: "20px", fontWeight: "700" },
    cta: { fontSize: "24px", fontWeight: "900" },
  };
  return map[mood] || { fontSize: "16px", fontWeight: "600" };
}

function generateHashtags(product) {
  const base = ["לייקלין", "לונה", "קניות", "מומלץ"];
  const tags = (product.tags || []).slice(0, 3);
  return [...tags, ...base].map((t) => (t.startsWith("#") ? t : `#${t}`)).slice(0, 8);
}