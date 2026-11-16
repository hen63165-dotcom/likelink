// "שאלי את הרדאר" on WhatsApp (the owner, 2026-11-16: "everyone needs it on their phone right now";
// "תבנה"). One contact: send it an AliExpress link, or the product's name in Hebrew, and it answers
// in seconds with the same check as the magic button (/magic): the store's own title and ILS price,
// מד ההייפ (hypeMeter.js), what to check before buying, and the buy link with its disclosure, plus
// a line to forward to a friend. Through WhatsApp's official Cloud API only: it answers people who
// wrote first and never starts a conversation. Phone numbers are never stored or logged.
// Pure: the server (api/_utils/whatsappHandler.mjs) does the reading and the sending.

import { firstLink, isStoreLink, shekel, MAGIC_PATH } from "./magic.js";

export const WA = Object.freeze({
  graph: "https://graph.facebook.com/v21.0",
  maxPerHook: 3, // messages answered per webhook delivery
  maxText: 1500, // characters read from one message
  perSenderPerMinute: 6,
});

/** The text messages in one webhook delivery (pure): [{ from, id, text, phoneId }]. Anything else is skipped. */
export function incomingMessages(body) {
  const out = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value;
      const phoneId = String(v?.metadata?.phone_number_id || "");
      for (const m of Array.isArray(v?.messages) ? v.messages : []) {
        const text = m?.type === "text" ? m.text?.body : m?.type === "image" ? m.image?.caption : null;
        if (!/^\d{6,20}$/.test(String(m?.from || "")) || !m?.id || typeof text !== "string" || !text.trim()) continue;
        out.push({ from: String(m.from), id: String(m.id), text: text.slice(0, WA.maxText), phoneId });
      }
    }
  }
  return out.slice(0, WA.maxPerHook);
}

/** What one message asks for (pure): a store link, Hebrew words to find, or help. */
export function intentOf(text = "") {
  const link = firstLink(text);
  if (link && isStoreLink(link)) return { kind: "check", link };
  if (link) return { kind: "other_link" };
  const words = String(text).replace(/[^֐-׿a-zA-Z0-9\s"״'׳₪]/g, " ").replace(/\s+/g, " ").trim();
  if (words.length >= 2 && /[֐-׿a-zA-Z]/.test(words)) return { kind: "find", words: words.slice(0, 80) };
  return { kind: "help" };
}

const AD = "#פרסומת · קישור שותפים";

export const WA_HELP = [
  "היי! כאן הרדאר של LikeLink2 🔎",
  "שלחי לי קישור של מוצר מאליאקספרס, או כתבי מה את מחפשת (למשל: ״סקווישי עד 20 ש״ח״).",
  "אחזיר לך תוך שניות: המחיר בחנות עכשיו, 🔥 מד ההייפ (כמה מדברים עליו ברשתות וכמה מוכרים יש), ומה לבדוק לפני שקונים.",
].join("\n");

export const WA_OTHER_LINK = "הרדאר בודק קישורים של אליאקספרס. שלחי קישור משם, או כתבי את שם המוצר בעברית 🙂";

/** The reply to a checked link (pure; ≤ 4096 characters, WhatsApp's limit). */
export function checkReply({ report = null, hype = null, link = "", origin = "" } = {}) {
  if (!report?.item) return "החנות עמוסה רגע. שלחי את הקישור שוב בעוד דקה, והרדאר יבדוק אותו.";
  const r = report;
  const lines = [];
  lines.push(`🔎 *${String(r.item.title || "המוצר מהקישור").slice(0, 120)}*`);
  if (r.item.price) lines.push(`💰 מ־₪${shekel(r.item.price)} (נבדק עכשיו בחנות)`);
  if (hype && hype.level && hype.level !== "MEASURING") {
    lines.push("", `*מד ההייפ: ${hype.he}*`, hype.hint);
    for (const l of (hype.lines || []).slice(0, 2)) lines.push(`• ${l}`);
  }
  if (r.verdict === "STOP") lines.push("", "⛔ את סוג המוצר הזה הרדאר משאיר מחוץ להמלצות (נשק, עישון, מוצרים למבוגרים או הבטחה בריאותית).");
  const notes = (r.notes || []).filter((n) => n.id !== "price" && n.id !== "not-listed").slice(0, 3);
  if (notes.length) {
    lines.push("", "✅ *מה לבדוק לפני שקונים:*");
    for (const n of notes) lines.push(`• ${String(n.title?.he || n.text?.he || "").slice(0, 160)}`);
  }
  if (r.buy?.url) {
    lines.push("", `🛒 ${r.buy.url}`);
    if (r.buy.disclosure?.he) lines.push(r.buy.disclosure.he);
  }
  if (origin && link) lines.push("", `📤 לשלוח לחברה שעומדת לקנות את זה: ${origin}${MAGIC_PATH}?u=${encodeURIComponent(link)}&utm_source=whatsapp&utm_medium=bot`);
  return lines.join("\n").slice(0, 4000);
}

/** The reply to Hebrew words (pure): up to three items that passed the site's rules, the disclosure first. */
export function findReply(found = null, { origin = "" } = {}) {
  const items = Array.isArray(found?.items) ? found.items.slice(0, 3) : [];
  if (!found?.ok || !items.length) return "למה שכתבת עוד מחכה מוצר שעובר את כל הבדיקות של הרדאר. נסי מילים אחרות, או שלחי קישור מאליאקספרס ואבדוק אותו.";
  const lines = [AD, `🔎 מה שמצאתי באליאקספרס (המחיר נבדק עכשיו בחנות):`];
  items.forEach((it, i) => {
    lines.push("", `${i + 1}. *${String(it.title || "").slice(0, 80)}*`);
    if (it.price) lines.push(`💰 מ־₪${shekel(it.price)}`);
    if (it.buy) lines.push(`🛒 ${it.buy}`);
  });
  lines.push("", "אם קונים דרך הקישורים, LikeLink2 מקבלת עמלה קטנה, והמחיר שלך נשאר אותו מחיר.");
  lines.push("רוצה לבדוק אחד מהם? שלחי לי את הקישור שלו ואחזיר את מד ההייפ ומה לבדוק.");
  if (origin) lines.push(`🌐 ${origin}${MAGIC_PATH}?utm_source=whatsapp&utm_medium=bot`);
  return lines.join("\n").slice(0, 4000);
}

/** The Cloud API request body for one text reply (pure). */
export function textMessage(to, body) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: String(to), type: "text", text: { preview_url: true, body: String(body).slice(0, 4096) } };
}
