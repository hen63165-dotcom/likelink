/**
 * Caption + on-screen text layer for the Luna reel engine.
 *
 * Emits an ASS subtitle file burned in a single libass pass, so Hebrew bidi
 * shaping is correct:
 *   • captions → LOWER-MIDDLE (bottom-centre, lifted by MarginV), 1–2 words
 *     per flashing cue, yellow #FBBF24 / white, heavy black outline (w=7),
 *     NO background boxes — cues flip at ultra-high speed (~0.45–0.7s)
 *   • tiny corner tags `#פרסומת` (top-left) and `AI` (top-right)
 *   • clean text-logo + minimal closing screen copy (CTA label pulses)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, CAPTION, CORNER_TAGS, VIDEO } from "./config.mjs";

const ASS_TIME = (ms) => {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const strip = (text) => String(text || "")
  .replace(/[`*_>#~[\]()]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** #RRGGBB → &HAABBGGRR (ASS/BGR byte order, 2-digit alpha: 00 opaque, FF transparent). */
export function hexToAss(hex, alpha = 0) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const a = (Number(alpha) & 0xff).toString(16).padStart(2, "0");
  if (!m) return `&H${a}FFFFFF`;
  const n = parseInt(m[1], 16);
  const b = (n & 0xff).toString(16).padStart(2, "0");
  const g = ((n >> 8) & 0xff).toString(16).padStart(2, "0");
  const r = ((n >> 16) & 0xff).toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** Split words into ultra-fast 1–2 word cues (max enforced, no dangling single). */
export function chunkWords(text, { min = CAPTION.minWords, max = CAPTION.maxWords } = {}) {
  const words = strip(text).split(" ").filter(Boolean);
  const frames = [];
  let i = 0;
  while (i < words.length) {
    let take = Math.min(max, words.length - i);
    if (take < min && frames.length && frames[frames.length - 1].length > 1) {
      frames[frames.length - 1].pop();
      take = 2;
      i -= 1;
    }
    frames.push(words.slice(i, i + take));
    i += take;
  }
  return frames.map((frame) => frame.join(" "));
}

/** Distribute 1–2 word cues at viral flashing speed, weighted by word length. */
export function buildCues(text, durationMs, opts = {}) {
  const frames = chunkWords(text, opts);
  if (!frames.length) return [];
  const weights = frames.map((f) => Math.max(3, f.replace(/\s/g, "").length));
  const total = weights.reduce((a, b) => a + b, 0);
  const gapMs = 60;
  const usable = Math.max(800, durationMs - gapMs * (frames.length - 1));
  let cursor = 0;
  return frames.map((frame, i) => {
    const dur = Math.round((weights[i] / total) * usable);
    const startMs = cursor;
    const bounded = Math.min(startMs + dur, durationMs - gapMs);
    const endMs = i === frames.length - 1
      ? Math.max(startMs + 400, durationMs)
      : Math.max(startMs + 300, bounded);
    cursor = endMs + gapMs;
    return { index: i, text: frame, startMs, endMs: Math.min(endMs, durationMs) };
  });
}

export { ASS_TIME };

const C = (hex) => hexToAss(hex, 0);
const TRANSPARENT_BACK = hexToAss("#000000", 255); // alpha 255 = invisible → no box

/** [name, font, size, primary, secondary, outline, back, bold, borderStyle, outlineW, shadow, align, marginL, marginR, marginV] */
const STYLE_ROWS = [
  // Caption: LOWER-MIDDLE + bold black outline + NO background box (border 1).
  ["Luna", CAPTION.fontFamily, CAPTION.fontSize, C(CAPTION.primaryColor), C(CAPTION.alternateColor), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, CAPTION.backgroundBox ? 3 : 1, CAPTION.outlineWidth, 0, CAPTION.alignment, CAPTION.marginL, CAPTION.marginR, CAPTION.marginV],
  // Tiny corner tags.
  ["Corner", CAPTION.fontFamily, CORNER_TAGS.fontSize, hexToAss(CORNER_TAGS.color, 0), hexToAss(CORNER_TAGS.color, 0), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, 1, 3, 0, 7, CORNER_TAGS.margin, CORNER_TAGS.margin, CORNER_TAGS.margin],
  // Closing screen: clean text logo, tagline, premium outro, CTA label.
  ["Logo", CAPTION.fontFamily, 92, C(BRAND.text), C(BRAND.text), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, 1, 4, 0, 5, 40, 40, 0],
  ["Tagline", CAPTION.fontFamily, 40, C(BRAND.text), C(BRAND.text), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, 1, 3, 0, 5, 60, 60, 0],
  ["Outro", CAPTION.fontFamily, 48, C(CAPTION.primaryColor), C(CAPTION.alternateColor), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, 1, 5, 0, 5, 70, 70, 0],
  ["Domain", CAPTION.fontFamily, 36, C(BRAND.text), C(BRAND.text), C(CAPTION.outlineColor), TRANSPARENT_BACK, -1, 1, 3, 0, 5, 60, 60, 0],
  ["Button", CAPTION.fontFamily, 46, C("#1A140B"), C("#1A140B"), C("#FFF8EC"), TRANSPARENT_BACK, -1, 1, 2, 0, 5, 60, 60, 0],
];

export function buildAssHeader() {
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${VIDEO.w}`,
    `PlayResY: ${VIDEO.h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ];
  for (const [name, font, size, primary, secondary, outline, back, bold, border, width, shadow, align, ml, mr, mv] of STYLE_ROWS) {
    head.push(`Style: ${name},${font},${size},${primary},${secondary},${outline},${back},${bold},0,0,0,100,100,0,0,${border},${width},${shadow},${align},${ml},${mr},${mv},1`);
  }
  head.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  return head.join("\n");
}

/** Closing screen: text logo, premium outro pointing at the live domain, CTA. */
function closingLines({ startMs, durationMs }) {
  const end = startMs + durationMs;
  const cx = Math.round(VIDEO.w / 2);
  const lines = [
    `Dialogue: 1,${ASS_TIME(startMs)},${ASS_TIME(end)},Logo,,0,0,0,,{\\pos(${cx},470)\\an5\\fad(300,0)}${BRAND.name}`,
    `Dialogue: 1,${ASS_TIME(startMs + 120)},${ASS_TIME(end)},Tagline,,0,0,0,,{\\pos(${cx},585)\\an5\\fad(450,0)}${BRAND.tagline}`,
    `Dialogue: 1,${ASS_TIME(startMs + 240)},${ASS_TIME(end)},Outro,,0,0,0,,{\\pos(${cx},688)\\an5\\fad(600,0)}${BRAND.outro}`,
    `Dialogue: 1,${ASS_TIME(startMs + 360)},${ASS_TIME(end)},Domain,,0,0,0,,{\\pos(${cx},770)\\an5\\fad(600,0)}${BRAND.domain}`,
  ];
  const pulseStart = startMs + Math.round(durationMs * 0.25);
  for (let t = pulseStart; t + 140 < end; t += 500) {
    lines.push(`Dialogue: 1,${ASS_TIME(t)},${ASS_TIME(Math.min(t + 500, end))},Button,,0,0,0,,{\\pos(${cx},932)\\an5\\fad(140,140)}${BRAND.cta}`);
  }
  return lines;
}

/**
 * Full .ass document for the whole reel timeline.
 * @param {string} text Hebrew ad script
 * @param {number} durationMs narration (main segment) duration
 * @param {{closing?: {startMs:number, durationMs:number}}} opts
 */
export function buildAss(text, durationMs, opts = {}) {
  const closing = opts.closing || null;
  const totalMs = durationMs + (closing ? closing.durationMs : 0);
  const cues = buildCues(text, durationMs, opts);

  const captionEvents = cues.map((cue, i) => {
    const color = C(i % 2 === 0 ? CAPTION.primaryColor : CAPTION.alternateColor);
    return `Dialogue: 1,${ASS_TIME(cue.startMs)},${ASS_TIME(cue.endMs)},Luna,,0,0,0,,{\\1c${color}}${cue.text}`;
  });

  const alpha = Math.round((1 - CORNER_TAGS.alpha) * 255).toString(16).padStart(2, "0").toUpperCase();
  const tagEvents = [
    `Dialogue: 1,0,${ASS_TIME(totalMs)},Corner,,0,0,0,,{\\an7\\alpha&H${alpha}&}${CORNER_TAGS.left}`,
    `Dialogue: 1,0,${ASS_TIME(totalMs)},Corner,,0,0,0,,{\\an9\\alpha&H${alpha}&}${CORNER_TAGS.right}`,
  ];

  const events = closing
    ? [...tagEvents, ...captionEvents, ...closingLines(closing)]
    : [...tagEvents, ...captionEvents];
  return { ass: [buildAssHeader(), ...events].join("\n"), cues, totalMs };
}

// CLI: node scripts/luna-reels/captions.mjs "<hebrew text>" <durationMs>
const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const text = process.argv[2] || "מה אם החנות שלך הייתה מוכרת גם כשאת ישנה";
  const duration = Number(process.argv[3] || 9000);
  const { ass, cues } = buildAss(text, duration, {
    closing: { startMs: duration, durationMs: BRAND.closingSec * 1000 },
  });
  process.stdout.write(`${JSON.stringify(cues, null, 2)}\n---\n${ass}\n`);
}

