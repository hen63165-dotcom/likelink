// "המאסטר" — LikeLink2's one rulebook for content that travels (the owner,
// 2026-10-23: "everything influencers use that really explodes — gather it
// and make it a master"). One list, read by people and enforced by code:
// the Instagram kit page prints it, and every story/reel plan is checked
// against it before it is offered (tests/viralMaster.test.mjs).
//
// What it rests on (and what it does not claim):
// • Instagram's head, Adam Mosseri (Jan 2025): the strongest Reels signals are
//   watch time, likes per reach and sends per reach. Hence: a hook in the first
//   second, short and complete, and a line that gives a reason to send.
// • Instagram ranks original content above reposts (2024): our own edits only.
// • Most feeds play muted: words on screen carry the story.
// • A comment keyword answered in private (our comment bot) turns attention
//   into a click without a link in the caption.
// Nobody can promise that a given reel goes viral — not Instagram, not an
// influencer, not this file. These rules raise the odds; the owner's own
// numbers (TikTok results, Instagram insights) decide what to repeat.
import { DROP_AD, safeCopy } from "./dailyDrop.js";

export const MASTER_SOURCES = Object.freeze([
  { claim: "watch time, likes per reach and sends per reach lead Reels ranking", source: "Adam Mosseri, Instagram, January 2025" },
  { claim: "original content is ranked above reposts", source: "Instagram, April 2024 originality update" },
]);

/** The rules, in the order a reel is watched. `he` is what the owner reads. */
export const MASTER_RULES = Object.freeze([
  { id: "hook_1s", he: "הוק בשנייה הראשונה: שאלה או מצב מוכר, עד 8 מילים, על המסך מהפריים הראשון.", why: "watch time" },
  { id: "short", he: "קצר ושלם: ריל מוצר 7–15 שניות, סטורי של לונה 20–45. מי שרואה עד הסוף מלמדת את האלגוריתם להפיץ.", why: "watch time" },
  { id: "change_4s", he: "תמונה חדשה לפחות כל 4 שניות: סצנה, זווית או זום.", why: "watch time" },
  { id: "captions", he: "כתוביות על המסך לאורך כל הסרטון: רוב האנשים צופים בלי קול.", why: "watch time" },
  { id: "one_face", he: "דמות אחת ומראה אחד בכל התוכן (לונה, תג „לונה ממליצה”, כתוביות צהובות): עוקבות מזהות את הסדרה.", why: "follows" },
  { id: "teach_first", he: "קודם טיפ שמלמד משהו, ורק אחר כך המוצר: תוכן שאפשר לשמור.", why: "saves" },
  { id: "send_line", he: "שורה שנותנת סיבה לשלוח: „שלחי לחברה ש…”. שליחות הן מהסימנים החזקים ביותר.", why: "sends per reach" },
  { id: "keyword", he: "הנעה לפעולה אחת: „כתבי רוצה” (קישור למוצר בפרטי) או „כתבי מדריך”.", why: "comments → clicks" },
  { id: "disclosure", he: "„#פרסומת · קישור שותפים” בשורה הראשונה של כל פוסט עם מוצר.", why: "law + trust" },
  { id: "ai_label", he: "דמות AI מסומנת על המסך ובתווית ה-AI של אינסטגרם.", why: "rules + trust" },
  { id: "true_only", he: "בלי „נשארו 2”, „הכי נמכר”, מחירים מומצאים או „קניתי”: רק מה שהמוכר כתב.", why: "law + trust" },
  { id: "original", he: "רק תוכן שלנו: לא מעלים סרטון של מישהו אחר, ולא לוגו או שם של מותג אחר.", why: "originality ranking" },
]);

export const MASTER_LIMITS = Object.freeze({
  hookWords: 8,
  maxGap: 4,
  seconds: Object.freeze({ reel: [7, 15], story: [20, 45] }),
});

const SEND = /שלחי (?:את זה )?ל|תייגי/;
const KEYWORD = /כתבי\s*\*?["„”]?(?:רוצה|מדריך)/;
const words = (s) => String(s || "").replace(/\*/g, "").trim().split(/\s+/).filter(Boolean);

/**
 * A plan against the rules it can be checked on.
 * plan: { format: "reel" | "story", hook, seconds, beats: [{ start, scene }],
 *         caption, product: bool, aiCharacter: bool, onScreenLabels: [] }
 * Returns { ok, failed: [rule ids], checked: [rule ids] } — readiness, never a forecast.
 */
export function masterCheck(plan = {}) {
  const failed = [];
  const checked = [];
  const check = (id, pass) => {
    checked.push(id);
    if (!pass) failed.push(id);
  };
  check("hook_1s", words(plan.hook).length > 0 && words(plan.hook).length <= MASTER_LIMITS.hookWords);
  const range = MASTER_LIMITS.seconds[plan.format];
  if (range && Number.isFinite(plan.seconds)) check("short", plan.seconds >= range[0] && plan.seconds <= range[1]);
  if (Array.isArray(plan.beats) && plan.beats.length) {
    let last = 0;
    let prev = null;
    let gap = 0;
    for (const b of plan.beats) {
      if (b.scene !== prev) {
        gap = Math.max(gap, b.start - last);
        last = b.start;
        prev = b.scene;
      }
    }
    if (Number.isFinite(plan.seconds)) gap = Math.max(gap, plan.seconds - last);
    check("change_4s", gap <= MASTER_LIMITS.maxGap);
  }
  const caption = String(plan.caption || "");
  check("send_line", SEND.test(caption));
  check("keyword", KEYWORD.test(caption));
  if (plan.product) check("disclosure", caption.startsWith(DROP_AD));
  if (plan.aiCharacter) check("ai_label", (plan.onScreenLabels || []).some((l) => /AI/.test(String(l))) && /בינה מלאכותית|AI/.test(caption));
  check("true_only", safeCopy(caption) && safeCopy(String(plan.hook || "")));
  return { ok: failed.length === 0, failed, checked };
}
