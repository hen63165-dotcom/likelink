// The radar's morning alert (the owner, 2026-11-15: "כן להתראות בוקר"). On a day the radar seals a
// new call (sniper mode: all four signals), one message goes to LikeLink2's Telegram channel with
// what was called, that it is sealed in advance, and the day it is graded, hit or miss. No call → no
// message (silence beats a guess). Pure: the text and the once-a-day rule; the runner sends it.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { verdictOf } from "./worldPulse.js";

const dm = (d) => (typeof d === "string" && d.length >= 10 ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}` : "");
// Never in an alert (marketing/radar-pitch.md, the owner's rules): promises, "the only one", certainty.
export const ALERT_FORBIDDEN = /מבטיח|הבטחה|היחיד|יחיד בעולם|100%|בטוח שיהיה|להיט מובטח|תרוויח|guarantee/i;

/** Today's alert text, or null when the board sealed no call today. */
export function alertOf(board, { origin = PRODUCTION_ORIGIN } = {}) {
  const day = String(board?.at || "").slice(0, 10);
  const v = verdictOf({ ledger: board?.early?.ledger || [], concepts: board?.concepts || [], day });
  if (!v.calls.length) return null;
  const lines = v.calls.slice(0, 3).map((e) => `🎯 ${e.concept.he}: ${e.concept.early?.count || 4} מתוך 4 סימנים${e.concept.early?.beforeAll ? " · לפני כולם" : ""} · הציון ב־${dm(e.due)}`);
  const text = [
    `📣 הרדאר של LikeLink2 קבע היום (${dm(day)})`,
    ...lines,
    "",
    "הקביעה חתומה מראש בביטקוין, והציון יתפרסם בדף הרדאר, גם אם לא פגע.",
    `${origin}/radar?utm_source=telegram&utm_medium=radar_alert&utm_campaign=radar_${day.replace(/-/g, "")}`,
  ].join("\n");
  return ALERT_FORBIDDEN.test(text) ? null : { day, text, concepts: v.calls.map((e) => e.concept.id) };
}

/** Whether today's alert was already sent (one per day, never twice). */
export const alreadySent = (log = [], day) => (Array.isArray(log) ? log : []).some((x) => x?.day === day && x?.messageId);
