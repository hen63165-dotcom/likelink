// מד ההייפ (the owner, 2026-11-16: "everyone needs it on their phone right now"). For any product a
// shopper checks (the magic button, and the same answer on WhatsApp), how much the world is talking
// about it TODAY, from measurements taken at the moment of the check:
//   buzz     — Google's public suggestions in the US for the product's own two-word phrase (the
//              store's English title, freshPhrase): do people add "tiktok", "viral", "trending" or
//              "amazon" to it (worldPulse ECHO)?
//   listings — how many AliExpress listings the store returns for that phrase (many sellers = known);
//   orders   — the item's own 30-day orders, used only to tell EARLY from QUIET, never shown (the
//              magic button's rule: orders, ratings and commission never leave the server).
// A reading of today's signals, never a forecast or a promise: every level prints what was measured.
// Pure; the magic server does the reading (api/_utils/magicHandler.mjs).

import { ECHO, PRODUCT_NOUNS } from "./worldPulse.js";
import { phrasesOf } from "./radarDiscovery.js";

/**
 * The phrase people would search for the item (pure): the first two-word phrase of its English
 * store title that ENDS in a thing people buy ("soap dispenser", not "automatic liquid"); else the
 * first phrase. 2026-11-16: the first live check read "automatic liquid" for a soap dispenser.
 */
export function hypePhrase(title = "") {
  const all = [...phrasesOf(String(title || ""))];
  return all.find((p) => PRODUCT_NOUNS.has(p.split(" ").at(-1))) || all[0] || null;
}

export const HYPE = Object.freeze({
  manyListings: 2000, // as the radar's fresh check (freshRisers FRESH.maxSimilar): many sellers already
  buyers: 300, // 30-day orders from which an item has real buyers (the radar's pick bar)
});

export const HYPE_LEVELS = Object.freeze({
  EVERYWHERE: Object.freeze({ he: "🔥 כבר בכל מקום", en: "🔥 Everywhere already", hint: "מדברים עליו ברשתות, והרבה מוכרים כבר מוכרים אותו" }),
  BUZZING: Object.freeze({ he: "🚀 הבאז מתחיל", en: "🚀 The buzz is starting", hint: "מדברים עליו ברשתות, ועדיין יחסית מעט מוכרים" }),
  KNOWN: Object.freeze({ he: "🏪 מוצר מוכר ושקט", en: "🏪 Known and calm", hint: "הרבה מוכרים כבר מוכרים אותו, והרשתות שקטות סביבו כרגע" }),
  EARLY: Object.freeze({ he: "🌱 מוקדם", en: "🌱 Early", hint: "יש לו קונים, מעט מוכרים, והרשתות עוד שקטות" }),
  QUIET: Object.freeze({ he: "🤫 עוד שקט", en: "🤫 Still quiet", hint: "מעט מוכרים, והרשתות שקטות סביבו" }),
  MEASURING: Object.freeze({ he: "⏳ נמדד עכשיו", en: "⏳ Being measured", hint: "הבדיקה הבאה תשלים את המדידה" }),
});

const ECHO_HE = Object.freeze({ tiktok: "טיקטוק/ויראלי", amazon: "אמזון" });

/** The networks echoed in the US suggestions for the phrase (pure): ["tiktok", "amazon"]. */
export function buzzOf(suggestions) {
  if (!Array.isArray(suggestions)) return null;
  return ["tiktok", "amazon"].filter((k) => suggestions.some((s) => ECHO[k].test(String(s))));
}

/**
 * The level from today's measurements (pure; tested). `suggestions` null = Google did not answer,
 * `listings` null = the store did not answer: either one missing → MEASURING, never a guess.
 */
export function hypeOf({ phrase = null, suggestions = null, listings = null, orders = null } = {}, { rules = HYPE } = {}) {
  const buzz = buzzOf(suggestions);
  const n = Number.isFinite(listings) ? listings : null;
  if (!phrase || buzz === null || n === null) return { level: "MEASURING", ...HYPE_LEVELS.MEASURING, phrase: phrase || null, buzz: buzz || [], listings: n, lines: [] };
  const many = n >= rules.manyListings;
  const level = buzz.length ? (many ? "EVERYWHERE" : "BUZZING") : many ? "KNOWN" : Number.isFinite(orders) && orders >= rules.buyers ? "EARLY" : "QUIET";
  const lines = [
    buzz.length
      ? `בגוגל בארה״ב משלימים את ״${phrase}״ עם ${buzz.map((k) => ECHO_HE[k]).join(" ו")}.`
      : `בגוגל בארה״ב ההשלמות של ״${phrase}״ שקטות (עוד שקט סביב טיקטוק, ויראלי ואמזון).`,
    `${n.toLocaleString("he-IL")} מודעות של מוכרים באליאקספרס לשם ״${phrase}״.`,
  ];
  return { level, ...HYPE_LEVELS[level], phrase, buzz, listings: n, lines };
}

/** One short line to share with a friend (pure): the level and what was measured, nothing promised. */
export function hypeShareText(hype, title = "") {
  if (!hype || hype.level === "MEASURING") return "";
  const name = String(title || "").slice(0, 60);
  return `מד ההייפ של LikeLink2${name ? ` על ${name}` : ""}: ${hype.he}. ${hype.hint}. נמדד עכשיו בגוגל ובאליאקספרס.`;
}
