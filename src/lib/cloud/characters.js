/**
 * LikeLink2 Character Library 🎭
 * ===============================
 * AI-generated / properly licensed character profiles for UGC content.
 *
 * Rules:
 *   - Never impersonate real people without authorization.
 *   - Never copy existing influencers or celebrities.
 *   - Always disclose synthetic characters when required.
 *   - Characters are AI-generated — not real people.
 */

export const CHARACTER_TYPES = Object.freeze({
  AI_MALE_MODEL: "ai_male_model",
  AI_FEMALE_MODEL: "ai_female_model",
  AI_MALE_CREATOR: "ai_male_creator",
  AI_FEMALE_CREATOR: "ai_female_creator",
  AI_MALE_INFLUENCER: "ai_male_influencer",
  AI_FEMALE_INFLUENCER: "ai_female_influencer",
  UGC_CREATOR: "ugc_creator",
  PRODUCT_EXPERT: "product_expert",
  LIFESTYLE_CREATOR: "lifestyle_creator",
});

export const CHARACTER_LANGUAGES = Object.freeze({
  he: "he",
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  ar: "ar",
  ru: "ru",
});

export const CHARACTER_PRESETS = {
  [CHARACTER_TYPES.AI_MALE_MODEL]: {
    id: CHARACTER_TYPES.AI_MALE_MODEL,
    name: { he: "דני", en: "Danny" },
    persona: { he: "דוגם AI — סגנון יומיומי", en: "AI model — everyday style" },
    style: "clean_bright",
    ageRange: "25-35",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "studio_light",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.AI_FEMALE_MODEL]: {
    id: CHARACTER_TYPES.AI_FEMALE_MODEL,
    name: { he: "עדי", en: "Adi" },
    persona: { he: "דוגמת AI — אופנה ולייפסטייל", en: "AI model — fashion and lifestyle" },
    style: "warm_luxury",
    ageRange: "22-32",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "soft_studio",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.AI_MALE_CREATOR]: {
    id: CHARACTER_TYPES.AI_MALE_CREATOR,
    name: { he: "רועי", en: "Roi" },
    persona: { he: "יוצר AI — טכנולוגיה וחדשנות", en: "AI creator — tech and innovation" },
    style: "tech_minimal",
    ageRange: "28-40",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "desk_setup",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.AI_FEMALE_CREATOR]: {
    id: CHARACTER_TYPES.AI_FEMALE_CREATOR,
    name: { he: "נועה", en: "Noa" },
    persona: { he: "יוצרת AI — קוסמטיקה ו-beauty", en: "AI creator — cosmetics and beauty" },
    style: "beauty_bright",
    ageRange: "24-34",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "vanity_setup",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.AI_MALE_INFLUENCER]: {
    id: CHARACTER_TYPES.AI_MALE_INFLUENCER,
    name: { he: "איתי", en: "Itay" },
    persona: { he: "משפיען AI — ספורט וכושר", en: "AI influencer — sport and fitness" },
    style: "active_outdoor",
    ageRange: "26-36",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "gym_outdoor",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.AI_FEMALE_INFLUENCER]: {
    id: CHARACTER_TYPES.AI_FEMALE_INFLUENCER,
    name: { he: "מיה", en: "Maya" },
    persona: { he: "משפיעת AI — אופנה ו-home", en: "AI influencer — fashion and home" },
    style: "lifestyle_warm",
    ageRange: "23-33",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "home_lifestyle",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.UGC_CREATOR]: {
    id: CHARACTER_TYPES.UGC_CREATOR,
    name: { he: "לונה", en: "Luna" },
    persona: { he: "יוצרת UGC אמיתית — המלצות כנות", en: "Authentic UGC creator — honest recommendations" },
    style: "authentic_phone",
    ageRange: "20-30",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "phone_camera",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.PRODUCT_EXPERT]: {
    id: CHARACTER_TYPES.PRODUCT_EXPERT,
    name: { he: "פרופסור", en: "Professor" },
    persona: { he: "מומחה מוצר — ניתוח מעמיק", en: "Product expert — deep analysis" },
    style: "clean_tech",
    ageRange: "30-50",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "clean_white",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
  [CHARACTER_TYPES.LIFESTYLE_CREATOR]: {
    id: CHARACTER_TYPES.LIFESTYLE_CREATOR,
    name: { he: "שני", en: "Shani" },
    persona: { he: "יוצרת לייפסטייל — טיפים יומיומיים", en: "Lifestyle creator — daily tips" },
    style: "cozy_warm",
    ageRange: "25-35",
    languages: ["he", "en"],
    voiceAvailable: false,
    visualStyle: "cozy_home",
    allowedUse: "ugc_demo",
    syntheticDisclosure: true,
  },
};

export function getCharacterPreset(type) {
  return CHARACTER_PRESETS[type] || null;
}

export function listCharacterPresets() {
  return Object.values(CHARACTER_PRESETS);
}

export function selectCharacterForProduct(product, language = "he") {
  const category = product?.category || "";
  const mapping = {
    Fashion: [CHARACTER_TYPES.AI_FEMALE_MODEL, CHARACTER_TYPES.AI_FEMALE_INFLUENCER, CHARACTER_TYPES.LIFESTYLE_CREATOR],
    Beauty: [CHARACTER_TYPES.AI_FEMALE_CREATOR, CHARACTER_TYPES.AI_FEMALE_MODEL],
    Tech: [CHARACTER_TYPES.AI_MALE_CREATOR, CHARACTER_TYPES.PRODUCT_EXPERT],
    Home: [CHARACTER_TYPES.LIFESTYLE_CREATOR, CHARACTER_TYPES.AI_FEMALE_INFLUENCER],
    Fitness: [CHARACTER_TYPES.AI_MALE_INFLUENCER, CHARACTER_TYPES.UGC_CREATOR],
    Kids: [CHARACTER_TYPES.UGC_CREATOR, CHARACTER_TYPES.LIFESTYLE_CREATOR],
    Gifts: [CHARACTER_TYPES.UGC_CREATOR, CHARACTER_TYPES.LIFESTYLE_CREATOR],
    Travel: [CHARACTER_TYPES.LIFESTYLE_CREATOR, CHARACTER_TYPES.AI_MALE_INFLUENCER],
    Accessories: [CHARACTER_TYPES.AI_FEMALE_MODEL, CHARACTER_TYPES.LIFESTYLE_CREATOR],
  };
  const types = mapping[category] || [CHARACTER_TYPES.UGC_CREATOR, CHARACTER_TYPES.LIFESTYLE_CREATOR];
  const first = types[0];
  const preset = getCharacterPreset(first);
  if (!preset) return null;
  return {
    ...preset,
    name: preset.name[language] || preset.name.en,
    persona: preset.persona[language] || preset.persona.en,
  };
}
