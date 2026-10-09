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
 * Caption styling — explicitly LOWER-MIDDLE, 1–2 words per flashing cue,
 * yellow/white text with a heavy black outline and NO background boxes.
 * Ultra-high-speed pacing: cues flip every ~0.45–0.7s across the 15s reel.
 */
export const CAPTION = {
  position: "lower-middle",
  maxWords: 2,
  minWords: 1,
  cueSeconds: [0.45, 0.7],
  fontSize: 78,
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

/** Macro close-up keywords for viral aesthetic backgrounds (Pexels). */
export const AESTHETIC_KEYWORDS = [
  "minimalist jewelry portrait",
  "luxury silk movement",
  "neutral studio morning aesthetic",
  "macro gold ring closeup",
  "soft textile macro fabric",
  "elegant unboxing hands aesthetic",
  "perfume bottle macro light",
  "satin waves slow motion",
  "jewelry hands soft window light",
  "cream cosmetic texture macro",
  "gift box ribbon unboxing",
  "morning skincare aesthetic",
];

/**
 * Trending feed sourcing — Supabase active items ranked by category.
 * High-ranking viral categories surface first for reel B-roll priority.
 */
export const TRENDING_CATEGORIES = [
  "Aesthetic Accessories",
  "Premium Jewelry",
  "Modern Lifestyle Gadgets",
];

/**
 * Trust filter middleware — Choice-grade gate for every sourced product.
 * Mirrors AliExpress Choice standards: >4.5 stars + fast delivery metrics.
 * Items failing the gate are dropped before any frame renders (trust first).
 */
export const TRUST_FILTER = {
  minRating: 4.5,
  requireFastDelivery: true,
  requireVerifiedReviews: true,
  minReviewCount: 50,
};

export function passesTrustFilter(item = {}) {
  const rating = Number(item.rating ?? item.stars ?? 0);
  if (!(rating > TRUST_FILTER.minRating)) return false;
  if (TRUST_FILTER.requireFastDelivery && item.fastDelivery !== true && item.shipping !== "fast") return false;
  if (TRUST_FILTER.requireVerifiedReviews && Number(item.reviewCount ?? item.reviews ?? 0) < TRUST_FILTER.minReviewCount) return false;
  if (item.inStock === false) return false;
  return true;
}

/** Category rank (lower = hotter): trending categories first, rest after. */
export function categoryRank(category) {
  const i = TRENDING_CATEGORIES.findIndex(
    (c) => String(c).toLowerCase() === String(category || "").toLowerCase(),
  );
  return i === -1 ? TRENDING_CATEGORIES.length : i;
}

/**
 * Scan Supabase active items → trusted, category-ranked sourcing queue.
 * Placeholder middleware shape: { items: [{category, rating, ...}], limit }.
 */
export function rankSourcingQueue({ items = [], limit = 6 } = {}) {
  return items
    .filter((it) => it && it.active !== false)
    .filter(passesTrustFilter)
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category)
      || Number(b.rating ?? b.stars ?? 0) - Number(a.rating ?? a.stars ?? 0))
    .slice(0, Math.max(1, limit));
}

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

/**
 * Hebrew viral scripts — 15-second, fast-paced, curiosity-driven narration
 * for edge-tts (he-IL-AvriNeural). Aggressive viral hooks only.
 * NO descriptive product copy. Every closer lands on the one trusted click.
 */
export const HOOK_TEMPLATES = [
  {
    id: "secret-factory",
    kind: "הסוד הצרכני",
    text: "בנות, אל תהיו פראייריות. המפעל הסודי של המותג הזה מוכר את זה בעשרה שקלים, ובחנות מוכרים לכן בשלוש מאות. אותו מוצר בדיוק. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "viral-unboxing",
    kind: "חבילה ויראלית",
    text: "החבילה הכי מטורפת שהגיעה אליי השבוע שברה את הרשת. פתחתי, צילמתי, וכולן שאלו מאיפה. אז הנה הלינק האחד. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "consumer-secret",
    kind: "הסוד הצרכני",
    text: "אל תהיו פראיירים. המותגים הגדולים קונים את זה בעשרה שקלים, ומוכרים לכם בשלוש מאות. אותו מוצר, אותו מפעל, ואתם משלמים את הפער. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "link-chaos-fix",
    kind: "פתרון כאוס הקישורים",
    text: "תפסיקו לכתוב לינק בתגובות ולחכות יומיים. שום דבר לא מגיע, והמבצע נגמר. הכל מחכה לכם בקליק אחד, מסודר ואמין בלייקלינק. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח.",
  },
  {
    id: "stock-scarcity",
    kind: "מחסור",
    text: "בפעם שעברה המלאי נגמר תוך יומיים, ומי שחיכתה נשארה בלי. עכשיו זה חזר, אבל לא להרבה זמן. אל תפספסו שוב. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "social-proof",
    kind: "הוכחה חברתית",
    text: "אלפי קונות כבר גילו את הסוד הזה, והן לא חוזרות לשלם מחיר מלא. הגיע הזמן שגם את תדעי. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "price-gap",
    kind: "הסוד הצרכני",
    text: "אותו מוצר בדיוק, שליש מהמחיר. החנויות הגדולות סומכות על זה שאתם לא בודקים. עכשיו אתם יודעים. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
  {
    id: "one-click-trust",
    kind: "פתרון כאוס הקישורים",
    text: "די לרדוף אחרי קישורים שבורים ומוכרים מפוקפקים. קישור אחד אמיתי, מחיר אחד אמיתי, בלי הפתעות. גלו מה שווה לקנות דרך אנשים, בקליק אחד, אמין ומאובטח בלייקלינק.",
  },
];

/** Flat string list consumed by the generator (kept in template order). */
export const SCRIPTS = HOOK_TEMPLATES.map((t) => t.text);

/** Autonomous schedule mirrored in .github/workflows/luna-reels.yml (UTC). */
export const SCHEDULE = ["0 8 * * *", "0 17 * * *"];

export function pickScript(seed = Date.now()) {
  const i = Math.abs(Math.floor(seed)) % SCRIPTS.length;
  return SCRIPTS[i];
}
