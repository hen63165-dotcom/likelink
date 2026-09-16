// Client consumer of the Cloud Intelligence Core (api/store?mode=intelligence).
// The server-side orchestrator owns providers, models and keys — the client
// never knows which engine executed a task. Honest statuses: every failure
// surfaces its real server code, never a fake result.
import { getSessionToken } from "../auth.js";

const MESSAGES = {
  UNAUTHENTICATED: "נדרשת התחברות כדי שלונה תפעל מטעמך.",
  RATE_LIMITED: "הגעת למכסת הפעולות של היום — אפשר לנסות שוב מאוחר יותר.",
  BLOCKED_BY_CREDENTIAL: "מנוע ה-AI עדיין לא מחובר בענן — הפעולה לא בוצעה.",
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
  const res = await fetch("/api/store?mode=intelligence", {
    method: "POST", headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && data?.ok === true, ...data };
}

export function runIntelligenceTask(task) { return call({ action: "run", task }); }
export function inspectIntelligence() { return call({ action: "inspect" }); }
export function saveCreatorMemory(memory, version) { return call({ action: "memory", version, memory }); }
export function intelligenceMessage(errorCode) { return MESSAGES[errorCode] || MESSAGES.CLOUD_UNAVAILABLE; }
