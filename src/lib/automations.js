/**
 * Likelink Automations Hub — רכזת האוטומציות והחיבורים.
 * כל שיתוף/פרסום/פיד בקליק אחד, ממשק אחיד לכל הערוצים.
 * מוכן לחיבור Webhooks עתידי (Zapier/Make) ללא שינוי בקריאות.
 */

export const AUTOMATIONS_VERSION = "1.0.0";

export const CHANNELS = {
  WHATSAPP: "whatsapp",
  TELEGRAM: "telegram",
  INSTAGRAM: "instagram",
  TIKTOK: "tiktok",
  FACEBOOK: "facebook",
  EMAIL: "email",
};

/** פתיחת שיתוף WhatsApp עם טקסט מוכן */
export function shareToWhatsApp({ text, url = "" }) {
  const msg = `${text}${url ? `\n${url}` : ""}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

/** טקסט מוכן-הדבקה לאינסטגרם (ביו/קפשן) + העתקה ללוח */
export async function copyForInstagram({ caption, url = "" }) {
  const full = `${caption}${url ? `\n🔗 ${url}` : ""}`;
  try {
    await navigator.clipboard.writeText(full);
    return true;
  } catch {
    return false;
  }
}

/** פתיחת TikTok / Instagram / Facebook — עמוד יצירת פוסט */
export function openComposer(channel) {
  const targets = {
    [CHANNELS.TIKTOK]: "https://www.tiktok.com/upload",
    [CHANNELS.INSTAGRAM]: "https://www.instagram.com/",
    [CHANNELS.FACEBOOK]: "https://www.facebook.com/sharer/sharer.php?u=",
    [CHANNELS.TELEGRAM]: "https://t.me/share/url?url=",
  };
  return targets[channel] || null;
}

/** שיתוף native (מובייל): Web Share API עם fallback לוואטסאפ */
export async function smartShare({ title = "", text = "", url = "" }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: "native" };
    } catch {
      /* user cancelled */
    }
  }
  shareToWhatsApp({ text: `${title} ${text}`, url });
  return { ok: true, method: "whatsapp-fallback" };
}

/**
 * Webhook dispatcher — לחיבור Zapier / Make / CRM.
 * מאובטח: POST בלבד, timeout, לעולם לא זורק שגיאה ל-UI.
 */
export async function dispatchWebhook(endpointUrl, payload, { timeoutMs = 8000 } = {}) {
  if (!/^https:\/\//i.test(endpointUrl || "")) return { ok: false, error: "invalid-url" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "likelink", ts: Date.now(), ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** אירועי אוטומציה מובנים — כל מכירה/הרשמה יכולה לדבר עם כל מערכת */
export const EVENTS = {
  SALE_COMPLETED: "sale.completed",
  PRODUCT_ADDED: "product.added",
  STORE_FOLLOWED: "store.followed",
  CART_CHECKOUT_STARTED: "cart.checkout_started",
};

/** רישום מנויים לאירועים (webhook/email/log) — תור מקומי ואמין */
const subscribers = new Map();
export function on(eventKey, handler) {
  if (!subscribers.has(eventKey)) subscribers.set(eventKey, new Set());
  subscribers.get(eventKey).add(handler);
  return () => subscribers.get(eventKey).delete(handler);
}
export function emit(eventKey, data = {}) {
  const subs = subscribers.get(eventKey) || [];
  subs.forEach((fn) => {
    try { fn(data); } catch { /* isolate failures */ }
  });
}
