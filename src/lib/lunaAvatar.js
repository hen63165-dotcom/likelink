/**
 * Luna Avatar 🤍 — "הפנים של לייקלינק, וכל סטודיו יכול לבנות לעצמו דמות כמוה".
 * -----------------------------------------------------------------------------
 * קוד נקי, מאפס, ללא תלות — בונה "פרסונה" (שם + אמוג'י + עולם מותג) לכל יוצרת,
 * ומייצר גם את ה"קול" שלה (הוק / פיץ' שיווקי) בעברית ובאנגלית, לפי סגנון.
 *
 * משמשת את:
 *   - LunaAssistant (הדמות המרחפת שמשווקת את האתר)
 *   - AvatarStudio (מסך "בני הדמות שלי" בכל סטודיו)
 *   - AutoVideoStudio / CampaignBuilder (העולם נכנס אוטומטית ליצירה)
 */
import { BRAND_WORLDS, getBrandWorld } from "./brandWorlds";

/** אמוג'י "פרסונות" לבחירה — כל אחד יכול להיראות כמו שהוא רוצה */
export const AVATAR_EMOJIS = [
  "🧚", "🎬", "⭐", "🌙", "🦋", "🦄", "🌸", "😎", "🤖", "🎉", "💎", "🐼", "🦁", "🍀", "🪄", "👑", "🌈", "🕊️",
];

/** גרדיאנט רקע של העולם כסטרינג CSS */
export function worldGradient(worldId) {
  const seeds = {
    lux: ["#F7F3EA", "#EDE3CE"],
    pixar: ["#4C2E8C", "#E86A9E"],
    neon: ["#0F0C29", "#302B63"],
    minimal: ["#FAF7F2", "#F1EAE0"],
    party: ["#3B0A57", "#FF4D9E"],
  };
  const g = seeds[worldId] || seeds.lux;
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

/** בונה את כל הפרסונה של הסטודיו (world + alterEgo + emoji + colors) */
export function lunaPersona(marketer = {}) {
  const world = getBrandWorld(marketer);
  const cfg = (marketer?.brandWorld && typeof marketer.brandWorld === "object" ? marketer.brandWorld : {}) || {};
  return {
    worldId: world.worldId || "lux",
    worldLabel: world.label || "לוקס",
    emoji: cfg.emoji || world.emoji || "🧚",
    name: cfg.alterEgo || world.alterEgo || "לונה",
    gradient: worldGradient(world.worldId),
    accent: world.palette?.accent || "#B78F4F",
    text: world.palette?.text || "#211C16",
  };
}

/** המסר (pitch) של לונה — משמש לשיווק האתר עצמו, וכבסיס לעולמות של הסטודיו */
export function lunaPitch({ persona = {}, productTitle = "", lang = "he", studio = false } = {}) {
  const name = persona.name || "לונה";
  if (lang === "en") {
    return studio
      ? `✨ Meet ${name} — my little marketing fairy on Likelink. One click, and my store gets a post, a video script and a ready story — everywhere.\n\nTry it free → `
      : `✨ ${name} is Likelink's digital ambassador — a friendly AI that helps creators publish everywhere in one click, and helps shoppers find only the best-rated products.\n\nOpen a free studio → `;
  }
  return studio
    ? `✨ ${name} — המשתמשת הדיגיטלית שלי בסטודיו של Likelink. בקליק אחד היא בונה לי סטורי, סרטון וטקסט — ומפרסמת לכל מקום.\n\nפותחים סטודיו חינם → `
    : `✨ ${name} — הדוברת הדיגיטלית של Likelink. עוזרת למוכרות לפרסם לכל מקום בקליק, ולקונות למצוא רק את המוצרים הכי מומלצים.\n\nפותחים סטודיו חינם → `;
}

/** פיץ' קצר לדמות הסטודיו (בקול של הדמות) */
export function personaPitch({ persona = {}, productTitle = "", lang = "he" }) {
  const name = persona.name || "לונה";
  if (lang === "en") {
    return `${persona.emoji || "✨"} ${name} here! Found something special on Likelink${productTitle ? ` — ${productTitle}` : ""}. Everything in one click. Check it out → `;
  }
  return `${persona.emoji || "✨"} ${name} — מצאתי משהו מיוחד במיוחד${productTitle ? ` — ${productTitle}` : ""}, והכול מחכה לכם בקליק אחד. כנסו לראות → `;
}

/** ערכת אמוג'ים רנדומלית לדמות — סגנון, שמח, מקורי */
export function personaEmojiSeed(worldId) {
  const map = {
    pixar: ["🧚", "🎬", "⭐", "🌈"],
    neon: ["🤖", "🌃", "⚡", "🌙"],
    minimal: ["🕊️", "🤍", "🌸", "🌿"],
    party: ["🎉", "🪩", "🎊", "💃"],
    lux: ["🦋", "💎", "👑", "🕊️"],
  };
  const list = map[worldId] || ["🧚", "⭐", "✨"];
  return list[Math.floor(Math.random() * list.length)];
}