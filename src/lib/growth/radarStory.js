// The radar's morning story (the owner, 2026-11-16: "כן לסטורי"). Instagram opens broadcast
// channels only from 1,000 followers, so until then the radar reaches her followers as one story a
// day: what the radar called today, or plainly that it called nothing, with a link sticker to /radar.
// Pure: built from the public board (src/lib/growth/radarBoard.js shape) and rendered by
// scripts/marketing/radar-story.mjs. Nothing is posted from here; she posts it from her phone.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { verdictOf } from "./worldPulse.js";

export const STORY = Object.freeze({ width: 1080, height: 1920 });

// Same bar as the morning alert and the page: no promise, no "only one", no forecast wording.
export const STORY_FORBIDDEN = /מבטיח|הבטחה|היחיד|יחיד בעולם|100%|בטוח|תחזית|להיט מובטח|יהיה להיט|תרוויח|עוד לא הגיע לארץ|guarantee/i;

export const STORY_DISCLOSURE = "#פרסומת · באתר יש קישורי שותפים";

const dm = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-");
  return d && m ? `${Number(d)}.${Number(m)}` : "";
};

/** The link for the story's link sticker, tagged per day. */
export function storyLink(day, origin = PRODUCTION_ORIGIN) {
  const tag = String(day || "").replace(/-/g, "");
  return `${origin}/radar?utm_source=instagram&utm_medium=story${tag ? `&utm_campaign=radar_${tag}` : ""}`;
}

/**
 * Today's story from the public board, or null when there is nothing true to say.
 * kind: "call" (a call sealed today), "quiet" (no new call), "locked" (the board is the teaser).
 */
export function radarStoryOf(board, { origin = PRODUCTION_ORIGIN } = {}) {
  if (!board || typeof board !== "object") return null;
  const day = String(board.at || "").slice(0, 10);
  if (!day) return null;
  const concepts = Array.isArray(board.concepts) ? board.concepts : [];
  const early = board.early || {};
  const items = [];
  let story;

  if (!concepts.length) {
    // After the trial the public board is the teaser: only counts, never an open call's name.
    const open = Number(early.open) || 0;
    story = {
      kind: "locked",
      kicker: `📡 הרדאר · ${dm(day)}`,
      title: open ? `🔒 ${open === 1 ? "קביעה פתוחה אחת" : `${open} קביעות פתוחות`}` : "⚪ היום אין קביעה פתוחה",
      sub: open ? "מה הרדאר קבע נשאר חתום עד הציון." : "הרדאר קובע רק כשכל 4 הסימנים מסכימים.",
    };
  } else {
    const v = verdictOf({ ledger: early.ledger || [], concepts, day });
    if (v.calls.length) {
      const [first, ...rest] = v.calls;
      story = {
        kind: "call",
        kicker: `📣 הרדאר קבע היום · ${dm(day)}`,
        title: first.concept.he,
        sub: "מתחיל לעלות בעולם, ובעברית עוד שקט.",
      };
      for (const e of rest.slice(0, 2)) items.push({ icon: "🟢", text: `וגם: ${e.concept.he}` });
      items.push({ icon: "🔏", text: "הקביעה חתומה מראש בביטקוין" });
      if (first.due) items.push({ icon: "📅", text: `הציון בפומבי ב־${dm(first.due)}` });
    } else {
      story = {
        kind: "quiet",
        kicker: "📡 הבדיקה של הבוקר",
        title: "🔎 היום הרדאר במעקב צמוד",
        sub: "הקביעה הבאה תיחתם כשכל 4 הסימנים יסכימו.",
      };
      const brink = concepts.filter((c) => c.early?.level === "WATCH" && c.early.count === 3).slice(0, 2);
      for (const c of brink) items.push({ icon: "🔥", text: `על סף קביעה: ${c.he}` });
      const born = concepts
        .filter((c) => c.factory?.born && c.early?.level !== "CALL")
        .sort((a, b) => b.factory.weekPct - a.factory.weekPct)
        .slice(0, 2);
      for (const c of born) items.push({ icon: "🐣", text: `נולד עכשיו: ${c.he} (+${Math.round(c.factory.weekPct)}% מוכרים בשבוע)` });
      const watching = concepts.filter((c) => Number(c.early?.count) >= 2 && c.early?.level !== "CALL").length;
      if (watching) items.push({ icon: "👀", text: `במעקב צמוד: ${watching === 1 ? "סוג אחד" : `${watching} סוגים`} עם 2 סימנים ומעלה` });
      if (v.latestOpen) {
        const n = Number(v.latestOpen.dayN);
        items.push({ icon: "⏳", text: `הקביעה האחרונה: ${v.latestOpen.concept.he}${Number.isFinite(n) && n > 0 ? ` (יום ${n} מתוך 14)` : ""}` });
      }
    }
    items.push({ icon: "🔎", text: concepts.length === 1 ? "נבדק היום סוג מוצר אחד" : `נבדקו היום ${concepts.length} סוגי מוצרים` });
  }

  const out = {
    day,
    ...story,
    items: items.slice(0, 5),
    cta: "👇 כל הפרטים בקישור",
    disclosure: STORY_DISCLOSURE,
    link: storyLink(day, origin),
    sticker: "לרדאר",
  };
  const text = [out.kicker, out.title, out.sub, out.cta, ...out.items.map((i) => i.text)].join("\n");
  return STORY_FORBIDDEN.test(text) ? null : out;
}

/** The steps in the Instagram app (shown on the story page, never on the picture). */
export const STORY_STEPS = Object.freeze([
  "שומרים את התמונה לטלפון (לחיצה ארוכה → שמירה).",
  "באינסטגרם: + → סטורי → בוחרים את התמונה.",
  "סטיקר → קישור → מדביקים את הקישור, ובטקסט כותבים: לרדאר.",
  "מניחים את הסטיקר מתחת ל״כל הפרטים בקישור״ ומפרסמים.",
  "אחרי הפרסום: ⋯ → הוספה להיילייט ״רדאר״.",
]);
