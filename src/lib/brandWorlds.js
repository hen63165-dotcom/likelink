/**
 * Likelink Brand Worlds 🌍 — "העולם של הסטודיו שלך, בקליק".
 * ---------------------------------------------------------------
 * כל סטודיו בוחר עולם אחד (פיקסאר / לוקס / ניאון / מינימלי / מסיבה),
 * וכל הדברים שהוא יוצר מבפנים — סטורי, וידאו, פוסטים, אווטאר — נולדים
 * בדיוק באותו עולם, בלי שעריכה כל פעם מחדש.
 *
 * העולמות ידברו עם:
 *   - StoryKit   → storyPalette (style id)
 *   - VideoEngine → videoPalette (palette id)
 *   - כיתובי ה-UI → palette (צבעי accents)
 *   - הדמות   → alterEgo (שם + אמוג'י של היוצרת)
 */
export const BRAND_WORLDS = [
  {
    id: "lux",
    label: "לוקס ✨",
    tagline: "מינימליזם יוקרתי — עולם הבית של לייקלינק",
    emoji: "🕊️",
    storyPalette: "lux",        // storyKit PALETTES.lux (חדש — האתר עצמו)
    videoPalette: "cream",      // videoEngine PALETTES.cream
    palette: { bg: "#F7F3EA", accent: "#B78F4F", text: "#211C16" },
    hooks: [
      "הבחירה של לונה השבוע ✨",
      "שקט, איכות, סטייל — הפריט הזה",
      "למי שאוהבת את הטוב ביותר",
      "הפריט שכולן מבקשות בפרטי",
    ],
  },
  {
    id: "pixar",
    label: "פיקסאר 🎬",
    tagline: "עולם אנימציה חם וקסום",
    emoji: "🧚",
    storyPalette: "pixar",      // עולם הברקות הקיים של StoryKit
    videoPalette: "gold",       // videoEngine PALETTES.gold
    palette: { bg: "#4C2E8C", accent: "#E86A9E", text: "#FFE49A" },
    hooks: [
      "פעם הייתה מוצר… והפכה לסטורי ✨",
      "מסע קטן, פריט גדול",
      "היום גיליתי את זה והלב שלי צחק",
      "כל סטורי מתחיל בהרפתקה",
    ],
  },
  {
    id: "neon",
    label: "ניאון 🌃",
    tagline: "זוהר עירוני של לילה",
    emoji: "🤖",
    storyPalette: "neon",
    videoPalette: "dark",       // videoEngine PALETTES.dark
    palette: { bg: "#0F0C29", accent: "#5FFAE0", text: "#FF3CAC" },
    hooks: [
      "כל הלילה סיננתי כדי למצוא את זה",
      "התגלית שתחשמל לך את הפיד",
      "בדיוק מה שרשתות הלילה צריכות",
      "קודי, הולוגרמה, תגלית",
    ],
  },
  {
    id: "minimal",
    label: "מינימלי 🤍",
    tagline: "נקי, קריא, אמיתי",
    emoji: "🤍",
    storyPalette: "minimal",
    videoPalette: "cream",
    palette: { bg: "#FAF7F2", accent: "#B4552D", text: "#1E1A16" },
    hooks: [
      "לפני כל השפע — מה שבאמת צריך",
      "מוצר אחד, בלי בלגן",
      "הנקיות היא המסר",
      "בחרתי בשקט. בחרתי בטוב.",
    ],
  },
  {
    id: "party",
    label: "מסיבה 🎉",
    tagline: "צבע, ניצוצות, חיוך",
    emoji: "🎉",
    storyPalette: "party",      // storyKit PALETTES.party (חדש)
    videoPalette: "gold",
    palette: { bg: "#3B0A57", accent: "#FF4D9E", text: "#FFE45B" },
    hooks: [
      "חגיגה של ממש בפיד 🎉",
      "המתנה שמביאה לבד צבע",
      "הלילה של הפיד — הכל בו",
      "כמה שיוצרים מפרגרים",
    ],
  },
];

export const DEFAULT_WORLD = "lux";

/** חולץ הגדרת עולם שלמה מתוך מפרילת */
export function getBrandWorld(marketer) {
  const cfg = marketer?.brandWorld && typeof marketer.brandWorld === "object" ? marketer.brandWorld : {};
  const found = BRAND_WORLDS.find((w) => w.id === (cfg.worldId || DEFAULT_WORLD));
  if (!found) return { worldId: DEFAULT_WORLD, alterEgo: "", ...BRAND_WORLDS[0] };
  return { ...found, worldId: found.id, alterEgo: cfg.alterEgo || "" };
}

/** שם הדמות של הסטודיו — alterEgo או "לונה" */
export function getFairyName(marketer) {
  const cfg = getBrandWorld(marketer);
  if (cfg.alterEgo && cfg.alterEgo.trim()) return cfg.alterEgo.trim().slice(0, 20);
  return "לונה";
}

/** הוק שיווקי מהעולם (דטרמיניסטי לפי מזהה מוצר) */
export function worldHook(world, productId = "") {
  const hooks = world?.hooks || BRAND_WORLDS[0].hooks;
  let h = 0;
  const s = String(productId || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return hooks[h % hooks.length] || hooks[0];
}

/** סטייל CSS להתאמת UI לעולם */
export function worldUiStyle(world) {
  const pal = world?.palette || BRAND_WORLDS[0].palette;
  return {
    "--world-bg": pal.bg,
    "--world-accent": pal.accent,
    "--world-text": pal.text,
  };
}

/** מפת עולם → style של StoryKit (חובה בתצורה ללא יצירת עולם חדש) */
export function worldStoryStyle(worldId) {
  const w = BRAND_WORLDS.find((x) => x.id === worldId) || BRAND_WORLDS[0];
  return w.storyPalette;
}

/** מפת עולם → palette של VideoEngine */
export function worldVideoPalette(worldId) {
  const w = BRAND_WORLDS.find((x) => x.id === worldId) || BRAND_WORLDS[0];
  return w.videoPalette;
}