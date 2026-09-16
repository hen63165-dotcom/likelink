// Client consumer of the Cloud Intelligence Core (api/store?mode=intelligence).
// The server-side orchestrator owns providers, models and keys — the client
// never knows which engine executed a task. Honest statuses: every failure
// surfaces its real server code, never a fake result.
import { getSessionToken } from "../auth.js";

const MESSAGES = {
  UNAUTHENTICATED: "נדרשת התחברות כדי שלונה תפעל מטעמך.",
  RATE_LIMITED: "הגעת למכסת הפעולות של היום — אפשר לנסות שוב מאוחר יותר.",
  BLOCKED_BY_CREDENTIAL: "מנוע ה-AI עדיין לא מחובר בענן — הפעולה לא בוצעה.",
  NOT_AUTHORIZED: "מנוע ה-AI דחה את הגישה — הפעולה לא בוצעה.",
  PROVIDER_FAILED: "המנוע לא השלים את הפעולה. המשימה נשמרה אם ניתן לחדש אותה.",
  TEMPORARILY_UNAVAILABLE: "המנוע אינו זמין זמנית. שאר הסטודיו ממשיך לעבוד.",
  INVALID_OUTPUT: "התוצאה לא עברה אימות ולא הוחלה על התוכן.",
  JOB_NOT_RESUMABLE: "לא ניתן לחדש משימה זו כעת — ייתכן שהושלמה או שפג תוקפה.",
  CAPABILITY_UNAVAILABLE: "היכולת הזאת עדיין לא מחוברת בענן.",
  BLOCKED_BY_STORAGE: "שכבת הענן עדיין לא הופעלה — נדרשת הרצת migration.",
  CLOUD_UNAVAILABLE: "הענן לא זמין כרגע — נסי שוב בעוד רגע.",
};

async function call(body, { timeout = 30000 } = {}) {
  const headers = { "content-type": "application/json" };
  try {
    const token = await getSessionToken();
    if (token) headers.authorization = `Bearer ${token}`;
  } catch { /* session unavailable — the server will answer 401 honestly */ }
  try {
  const res = await fetch("/api/store?mode=intelligence", {
    method: "POST", headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  return { ...data, httpStatus: res.status, ok: res.ok && data?.ok === true };
  } catch {
    return { ok: false, error: "CLOUD_UNAVAILABLE" };
  }
}

export function runIntelligenceTask(task) { return call({ action: "run", task }); }
export function inspectIntelligence() { return call({ action: "inspect" }); }
export function intelligenceStatus() { return call({ action: "status" }); }
export function resumeIntelligenceJob(jobId) { return call({ action: "resume", jobId }); }
export function saveCreatorMemory(memory, version) { return call({ action: "memory", version, memory }); }
export function intelligenceMessage(errorCode) { return MESSAGES[errorCode] || MESSAGES.CLOUD_UNAVAILABLE; }
