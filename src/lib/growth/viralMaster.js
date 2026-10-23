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
  { id: "one_face", he: "מראה אחד לסדרה: לכל מוצר הדמות שלו עם התג שלה („נועה ממליצה”), וכתוביות צהובות בכל הסרטונים, כדי שעוקבות יזהו את הסדרה.", why: "follows" },
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
// The posting step that switches on Instagram's own AI label (instagramGrid.js STORY_STEPS):
// it names the label and turns it on, and does not tell her to leave it off or turn it off.
const AI_LABEL = /תווית AI/;
const TURN_ON = /(?:מפעילים|מפעילה|הפעילי|להפעיל|הפעלה)/;
const DONT = /(?:^|\s)(?:אל|לא|בלי|אין)\s+(?:\S+\s+)?(?:ת?פעיל|מפעילים|מפעילה|להפעיל|תווית)/;
const TURN_OFF = /(?:כבי|מכבים|מכבה|לכבות|כיבוי|בטלי|מבטלים|לבטל|ביטול|הסירי|מסירים|להסיר)/;
export const enablesAiLabel = (step) => {
  const s = String(step);
  return AI_LABEL.test(s) && TURN_ON.test(s) && !DONT.test(s) && !TURN_OFF.test(s);
};
/** The label's state when she has followed every step: the last step that mentions it decides. */
export const aiLabelOnAtEnd = (steps = []) => {
  const last = (Array.isArray(steps) ? steps : []).map(String).filter((s) => AI_LABEL.test(s)).at(-1);
  return last !== undefined && enablesAiLabel(last);
};
// Our own edits only: an engine render, footage a person filmed for us, or our cut of the seller's own media.
export const ORIGINAL_SOURCES = Object.freeze(["own_render", "own_footage", "seller_edit"]);
const words = (s) => String(s || "").replace(/\*/g, "").trim().split(/\s+/).filter(Boolean);

/**
 * A plan against all twelve rules. Missing evidence fails the rule it was
 * needed for (a plan without timing never passes "short").
 * plan: { format: "reel" | "story", hook, seconds, beats: [{ start, scene }],
 *         caption, captions: bool (words on screen throughout), series: the
 *         character or series the post belongs to, productAt: the line that
 *         shows the product (0 = the hook), product: bool, aiCharacter: bool
 *         (both stated: a missing one fails the rules that depend on it),
 *         onScreenLabels: [], publishSteps: the steps the owner follows to post
 *         (Instagram's own AI label is switched on there, in the app),
 *         source: one of ORIGINAL_SOURCES }
 * Returns { ok, failed: [rule ids], checked: [rule ids] } — readiness, never a forecast.
 */
export function masterCheck(plan = {}) {
  const failed = [];
  const checked = [];
  const check = (id, pass) => {
    checked.push(id);
    if (!pass) failed.push(id);
  };
  const caption = String(plan.caption || "");
  check("hook_1s", words(plan.hook).length > 0 && words(plan.hook).length <= MASTER_LIMITS.hookWords);
  const range = MASTER_LIMITS.seconds[plan.format];
  check("short", Boolean(range) && Number.isFinite(plan.seconds) && plan.seconds >= range[0] && plan.seconds <= range[1]);
  let changes = false;
  if (Array.isArray(plan.beats) && plan.beats.length && Number.isFinite(plan.seconds)) {
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
    changes = Math.max(gap, plan.seconds - last) <= MASTER_LIMITS.maxGap;
  }
  check("change_4s", changes);
  check("captions", plan.captions === true);
  check("one_face", Boolean(String(plan.series || "").trim()));
  const productKnown = typeof plan.product === "boolean";
  check("teach_first", productKnown && (!plan.product || (Number.isFinite(plan.productAt) && plan.productAt >= 2)));
  check("send_line", SEND.test(caption));
  check("keyword", KEYWORD.test(caption));
  check("disclosure", productKnown && (!plan.product || caption.startsWith(DROP_AD)));
  // Three places: on the picture, in the caption, and Instagram's own label (switched on in the app while posting).
  const labelled = (plan.onScreenLabels || []).some((l) => /AI/.test(String(l))) && /בינה מלאכותית|AI/.test(caption)
    && aiLabelOnAtEnd(plan.publishSteps);
  check("ai_label", typeof plan.aiCharacter === "boolean" && (!plan.aiCharacter || labelled));
  check("true_only", safeCopy(caption) && safeCopy(String(plan.hook || "")));
  check("original", ORIGINAL_SOURCES.includes(plan.source));
  return { ok: failed.length === 0, failed, checked };
}
