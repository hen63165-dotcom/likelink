/**
 * Luna Reels — shared configuration for the autonomous premium video engine.
 * Every visual/audio constant lives here so the workflow and renderer agree.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PATHS = {
  tmp: path.join(ROOT, "tmp", "luna-reels"),
  out: path.join(ROOT, "out", "luna-reels"),
};

/** Voice layer: free, fluent Hebrew neural voice via Edge-TTS. */
export const VOICE = {
  name: process.env.LUNA_VOICE || "he-IL-AvriNeural",
  rate: "+0%",
  pitch: "+0Hz",
  volume: "+0%",
};

export const VIDEO = { w: 720, h: 1280, fps: 30, crf: 20, preset: "veryfast" };

/**
 * Caption styling — explicitly LOWER-MIDDLE, 2–3 words per frame,
 * yellow/white text with a bold black outline and NO background boxes.
 */
export const CAPTION = {
  position: "lower-middle",
  maxWords: 3,
  minWords: 2,
  fontSize: 74,
  primaryColor: "#FBBF24",
  alternateColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 7,
  backgroundBox: false,
  // ASS: alignment 2 = bottom-centre, MarginV lifts it into the lower-middle band.
  alignment: 2,
  marginV: 330,
  marginL: 60,
  marginR: 60,
  fontFamily: "DejaVu Sans",
  fontFile: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
};

/** Tiny corner tags burned over every frame (not part of the caption box). */
export const CORNER_TAGS = {
  left: "#פרסומת",
  right: "AI",
  fontSize: 26,
  margin: 34,
  color: "#FFFFFF",
  alpha: 0.72,
};

/** Pure aesthetic lifestyle keywords for the Pexels background fetcher. */
export const AESTHETIC_KEYWORDS = [
  "morning light coffee aesthetic",
  "slow motion linen fabric",
  "minimal beige interior",
  "golden hour ocean waves",
  "cozy candle warm ambience",
  "soft pastel flowers blooming",
  "city night bokeh lights",
  "green leaves sunlight nature",
  "spa wellness still life",
  "marble table flat lay",
  "silk fabric flowing",
  "sunset sky timelapse calm",
];

export const PEXELS = {
  endpoint: "https://api.pexels.com/videos/search",
  orientation: "portrait",
  perPage: 12,
  minHeight: 1080,
};

/**
 * Canonical storefront origin — the premium custom domain.
 * Product photos for the reels are pulled live from this origin's catalog
 * snapshot; if the origin ever 404s, the fetch transparently falls back to
 * the always-on production origin so the daily reel cron never breaks.
 */
export const CANONICAL = {
  origin: (process.env.LIKELINK_CANONICAL_URL || "https://likelink.to").replace(/\/+$/, ""),
  fallbackOrigin: (process.env.LIKELINK_FALLBACK_ORIGIN || "https://likelink2.vercel.app").replace(/\/+$/, ""),
  snapshotPath: "/snapshot/kv.json",
};

/** 6 viral reels a day = 2 autonomous cron runs (08:00 / 17:00 UTC) × 3 reels. */
export const REELS = {
  perDay: Math.max(1, Number(process.env.LUNA_REELS_PER_DAY || 6)),
  runsPerDay: 2,
  get perRun() { return Math.max(1, Math.ceil(this.perDay / this.runsPerDay)); },
  productClips: 3,
  aestheticClips: 3,
};

/** Brand / closing-screen styling (clean text logo + animated button). */
export const BRAND = {
  name: "LikeLink",
  domain: "likelink.to",
  tagline: "החנות שלך. לגמרי אוטומטית.",
  outro: "גלו מה שווה לקנות דרך אנשים - בקליק אחד, אמין ומאובטח ב-LikeLink",
  cta: "לרכישה עכשיו",
  accent: "#B78F4F",
  bg: "#0A0A0A",
  text: "#FFF8EC",
  closingSec: 2.8,
};

/** Hebrew ad scripts — one is picked per run so daily outputs stay fresh. */
export const SCRIPTS = [
  "מה אם החנות שלך הייתה מוכרת גם כשאת ישנה? עם לייקלינק את בונה חנות, מפרסמת ב automátia, ומקבלת תשלומים ישר לנייד. הצטרפי היום ותתחילי למכור",
  "די לקמפיינים מסובכים. פוסט אחד, לינק אחד, ולקוחות חדשים מגיעים לבד. לייקלינק מפעילה את החנות שלך מסביב לשעון. בואי נתחיל",
  "הבוקר את קמה, הערב את רואה מכירות. לייקלינק מנהלת את המוצרים, את הפרסומים ואת הלקוחות בשבילך. לחצי על הלינק והתחילי היום",
];

/** Autonomous schedule mirrored in .github/workflows/luna-reels.yml (UTC). */
export const SCHEDULE = ["0 8 * * *", "0 17 * * *"];

export function pickScript(seed = Date.now()) {
  const i = Math.abs(Math.floor(seed)) % SCRIPTS.length;
  return SCRIPTS[i];
}
