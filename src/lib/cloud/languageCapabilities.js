/**
 * LikeLink2 Language Capability Matrix 🌐
 * =======================================
 * Truthful language support matrix based ONLY on actual implementation.
 *
 * Supported:
 *   he — Hebrew (full UI, RTL, captions, scripts, CTAs)
 *   en — English (full UI, captions, scripts, CTAs)
 *
 * Declared but NOT fully supported in current implementation:
 *   es, fr, de, pt, ar, ru — declared in CHARACTER_LANGUAGES only
 *
 * This module prevents false language claims.
 */

export const LANGUAGE_CAPABILITIES = Object.freeze({
  he: {
    code: "he",
    label: { he: "עברית", en: "Hebrew" },
    ui: true,
    rtl: true,
    captions: true,
    subtitles: true,
    script: true,
    voiceover: false,
    hashtags: true,
    direction: "rtl",
    supportLevel: "FULL",
  },
  en: {
    code: "en",
    label: { he: "אנגלית", en: "English" },
    ui: true,
    rtl: false,
    captions: true,
    subtitles: true,
    script: true,
    voiceover: false,
    hashtags: true,
    direction: "ltr",
    supportLevel: "FULL",
  },
  es: {
    code: "es",
    label: { he: "ספרדית", en: "Spanish" },
    ui: false,
    rtl: false,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "ltr",
    supportLevel: "UNAVAILABLE",
  },
  fr: {
    code: "fr",
    label: { he: "צרפתית", en: "French" },
    ui: false,
    rtl: false,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "ltr",
    supportLevel: "UNAVAILABLE",
  },
  de: {
    code: "de",
    label: { he: "גרמנית", en: "German" },
    ui: false,
    rtl: false,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "ltr",
    supportLevel: "UNAVAILABLE",
  },
  pt: {
    code: "pt",
    label: { he: "פורטוגזית", en: "Portuguese" },
    ui: false,
    rtl: false,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "ltr",
    supportLevel: "UNAVAILABLE",
  },
  ar: {
    code: "ar",
    label: { he: "ערבית", en: "Arabic" },
    ui: false,
    rtl: true,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "rtl",
    supportLevel: "UNAVAILABLE",
  },
  ru: {
    code: "ru",
    label: { he: "רוסית", en: "Russian" },
    ui: false,
    rtl: false,
    captions: false,
    subtitles: false,
    script: false,
    voiceover: false,
    hashtags: false,
    direction: "ltr",
    supportLevel: "UNAVAILABLE",
  },
});

export function getLanguageCapability(lang) {
  return LANGUAGE_CAPABILITIES[lang] || LANGUAGE_CAPABILITIES.en;
}

export function isLanguageSupported(lang) {
  const cap = getLanguageCapability(lang);
  return cap.supportLevel === "FULL";
}

export function getSupportedLanguages() {
  return Object.entries(LANGUAGE_CAPABILITIES)
    .filter(([, cap]) => cap.supportLevel === "FULL")
    .map(([code]) => code);
}

export function getUnsupportedLanguages() {
  return Object.entries(LANGUAGE_CAPABILITIES)
    .filter(([, cap]) => cap.supportLevel === "UNAVAILABLE")
    .map(([code]) => code);
}
