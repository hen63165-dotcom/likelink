// Browser client for /api/store?mode=legal (api/_utils/legalHandler.mjs).
//
// Signup often has no session yet (e-mail confirmation), so the consent given
// on the signup form is kept locally and recorded on the server — with the
// version and time — as soon as a verified session exists. Checkout records
// its own acceptance right before a paid plan (the server refuses otherwise).
import { LEGAL_VERSION } from "./legal/catalog.js";

const ENDPOINT = "/api/store?mode=legal";
const PENDING_KEY = "likelink_pending_legal";

async function legalRequest(action, token, { method = "GET", body } = {}) {
  try {
    const res = await fetch(`${ENDPOINT}&action=${encodeURIComponent(action)}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok && data?.ok !== false, status: res.status };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const fetchLegalStatus = (token) => legalRequest("status", token);
export const acceptLegal = (token, context) => legalRequest("accept", token, { method: "POST", body: { version: LEGAL_VERSION, context, ageConfirmed18: true } });
export const setMarketingConsent = (token, optIn) => legalRequest("marketing", token, { method: "POST", body: { optIn: Boolean(optIn) } });
export const joinWaitlist = (token, planId) => legalRequest("waitlist", token, { method: "POST", body: { planId } });

/** Called when the signup form is submitted with the required consent box ticked. */
export function rememberSignupConsent({ marketing = false } = {}) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ version: LEGAL_VERSION, marketing: Boolean(marketing), at: Date.now() }));
  } catch { /* storage unavailable — the checkout step still records acceptance */ }
}

/** Records a pending signup consent once a session exists. Safe to call often. */
export async function flushSignupConsent(token) {
  if (!token) return false;
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch { pending = null; }
  if (!pending || pending.version !== LEGAL_VERSION) return false;
  const r = await acceptLegal(token, "signup");
  if (!r.ok) return false;
  if (pending.marketing) await setMarketingConsent(token, true);
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  return true;
}
