// LUNA OPERATING LAWS — LikeLink's own system rules, enforced in code.
//
// Each law names the code that enforces it. `auditRun()` checks a finished
// Luna run against the laws that can be checked on its output, so a
// violation is detected at runtime (and in tests), not just documented.
// These are product/system rules, not legal claims.

export const LAWS = Object.freeze([
  { id: "LAW_01", he: "אמת לפני פעולה", rule: "שום פעולה לא נחשבת הצלחה בלי ראיה", enforcedBy: ["truth.js:evidence", "orchestrator.js:executeStep"] },
  { id: "LAW_02", he: "כוונה לפני ביצוע", rule: "מטרה של משתמש הופכת ליעד שניתן לאמת במכונה", enforcedBy: ["intent.js:compileIntent"] },
  { id: "LAW_03", he: "הוכחה לפני סטטוס", rule: "סטטוס בממשק נגזר ממצב אמיתי של המערכת", enforcedBy: ["truth.js:effectiveState", "engine.js:buildPassport (surface.truth)"] },
  { id: "LAW_04", he: "יכולת לפני הבטחה", rule: "בלי ערוץ מחובר ואישור מהספק — אין 'פורסם'", enforcedBy: ["engine.js:verifyPublication", "engine.js:buildChannelRegistry"] },
  { id: "LAW_05", he: "כסף לפני הרשאה", rule: "יכולות בתשלום נפתחות רק ממצב תשלום מאומת", enforcedBy: ["entitlements.js:resolveEntitlement", "store.mjs:subs get"] },
  { id: "LAW_06", he: "הרשאה לפני תופעת לוואי", rule: "כל פעולה חיצונית דורשת את ההרשאה המתאימה", enforcedBy: ["capabilities.js:permission", "intent.js:buildActionGraph"] },
  { id: "LAW_07", he: "מקור אמת אחד", rule: "למוצרים, תוכן, פרסום, תשלום ומעקב יש רשומה קנונית", enforcedBy: ["surfaces.js:canonicalProduct"] },
  { id: "LAW_08", he: "כל פעולה משאירה עקבות", rule: "פעולות חשובות יוצרות אירוע שניתן לבקר", enforcedBy: ["orchestrator.js:appendCapped", "orchestrator.js:memoryAnswer"] },
  { id: "LAW_09", he: "כישלון הופך למידע", rule: "כישלון מחזיר סיבה מובנית ופעולה הבאה", enforcedBy: ["capabilities.js:classifyFailure", "orchestrator.js:deadLetter"] },
  { id: "LAW_10", he: "אין מבוי סתום", rule: "כשמסלול חסום — מוצע מסלול לגיטימי חלופי", enforcedBy: ["intent.js:buildActionGraph (manual_share alternative)"] },
  { id: "LAW_11", he: "אין צמיחה לא חוקית", rule: "בלי ספאם, חשבונות מזויפים, מעורבות מזויפת או פרסום לא מורשה", enforcedBy: ["capabilities.js (no such capability exists)", "surfaces.js:buildContentDrafts (real fields only)"] },
  { id: "LAW_12", he: "גילוי מצטבר", rule: "כל אינטראקציה לגיטימית משפרת את ההבנה של מה עוזר לגילוי", enforcedBy: ["orchestrator.js:learn (score/click deltas)"] },
  { id: "LAW_13", he: "הפיכות", rule: "לפעולה הפיכה יש מסלול חזרה", enforcedBy: ["orchestrator.js:rollbackAssets", "capabilities.js:rollback"] },
  { id: "LAW_14", he: "שליטה אנושית בפעולות בסיכון", rule: "חיבור חשבונות, הוצאת כסף, תשלומים, סודות ואבטחה — רק באישור אדם", enforcedBy: ["capabilities.js:PERMISSION", "intent.js:buildActionGraph"] },
  { id: "LAW_15", he: "אימות מתמשך", rule: "מצב הייצור לא מוסק מהצלחת build", enforcedBy: ["systemCheck.js:evaluateSystem", "truth.js:effectiveState (expiry)"] },
]);

/**
 * Audit one run result. Returns one row per checkable law.
 * @param {object} run  output of orchestrator.runIntent
 */
export function auditRun(run = {}) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const nodes = Array.isArray(run.graph?.nodes) ? run.graph.nodes : [];
  const executed = steps.filter((s) => s.status === "executed" || s.status === "verified");
  const rows = [];
  const add = (id, ok, detail) => rows.push({ id, ok: Boolean(ok), detail });

  add("LAW_01", executed.every((s) => s.proof && s.proof.state === "VERIFIED"),
    `${executed.length} פעולות בוצעו, ${executed.filter((s) => s.proof?.state === "VERIFIED").length} עם הוכחה מאומתת`);
  add("LAW_02", Boolean(run.intent && Array.isArray(run.intent.requiredFacts)), run.intent ? `מטרה: ${run.intent.desiredOutcome}` : "אין כוונה מהודרת");
  add("LAW_04", !nodes.some((n) => n.fact === "published_external" && n.status === "done" && !(run.passports || []).some((p) => p.productId === n.productId && p.signals.verifiedExternalPublications > 0)),
    "אין 'פורסם' חיצוני בלי אישור ספק");
  add("LAW_06", executed.every((s) => s.permission === "session"),
    "רק פעולות פנימיות עם הרשאת סשן בוצעו אוטומטית");
  add("LAW_08", Boolean(run.log && (run.log.written || run.log.duplicate)) && Boolean(run.memory),
    run.log?.duplicate ? "זהה לריצה קודמת היום — תועד פעם אחת" : "הריצה תועדה ביומן ובזיכרון");
  const failed = steps.filter((s) => s.status === "failed");
  add("LAW_09", failed.every((s) => s.failure && s.failure.class && s.next), `${failed.length} כשלים, כולם עם סיווג ופעולה הבאה`);
  const blockedExternal = nodes.filter((n) => ["external_channel_connected", "published_external"].includes(n.fact) && n.status !== "done");
  add("LAW_10", blockedExternal.every((n) => nodes.some((x) => x.alternativeFor === n.id || (x.capability === "manual_share" && x.productId === n.productId))),
    blockedExternal.length ? "לכל ערוץ חסום הוצע שיתוף ידני עם מעקב" : "אין ערוץ חסום");
  add("LAW_13", executed.filter((s) => s.capability === "create_share_asset").every((s) => s.rollback === "restore_previous_assets"),
    "כל כתיבת נכסים ניתנת לשחזור לגרסה הקודמת");
  add("LAW_14", !executed.some((s) => ["owner_explicit", "admin"].includes(s.permission)), "לא בוצעה אף פעולה בסיכון גבוה בלי אדם");
  return { ok: rows.every((r) => r.ok), rows };
}
