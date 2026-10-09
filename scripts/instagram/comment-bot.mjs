#!/usr/bin/env node
// Comment → private message: "comment רוצה and I'll send you the link".
// Runs on GitHub Actions every 15 minutes (.github/workflows/instagram-comment-bot.yml).
//
// For the account's recent posts it reads the caption, finds which public
// product the post is about (the caption carries the product's exact title),
// reads the comments, and to each comment that asks for the link (KEYWORDS)
// sends ONE private reply through Instagram's official private-reply API
// (allowed only as an answer to the person's own comment, within 7 days),
// then a short public reply on the comment ("sent you a DM"). That public
// reply is also the record that the comment was handled, so no state is kept.
//
// Only people who commented are messaged. The message carries the ad
// disclosure. Without IG_ACCESS_TOKEN + IG_USER_ID it sends nothing and says
// what is missing. Tokens never reach logs (Authorization header only).
import { appendFileSync, readFileSync } from "node:fs";

export const KEYWORDS = ["רוצה", "לינק", "קישור", "link"];
export const WINDOW_DAYS = 7; // Instagram's private-reply window
export const MAX_PER_RUN = 40;
export const PUBLIC_REPLY = "שלחתי לך בפרטי 📩";

const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };

/** Does this comment ask for the link? (whole word, any punctuation / repeated last letter) */
export function asksForLink(text, keywords = KEYWORDS) {
  const t = String(text || "").toLowerCase().normalize("NFC");
  if (/(^|[^\p{L}])לא\s+(רוצה|צריכה|צריך)/u.test(t)) return false; // "לא רוצה" is not a request
  return keywords.some((k) => new RegExp(`(^|[^\\p{L}])${k}+([^\\p{L}]|$)`, "u").test(t));
}

/** The public product a post is about: the caption contains its exact title. */
export function productForCaption(caption, products) {
  const c = String(caption || "");
  return products.filter((p) => p.title && c.includes(p.title)).sort((a, b) => b.title.length - a.title.length)[0] || null;
}

/** The private message: the link and the disclosure, nothing invented. */
export function privateMessage(product) {
  return [
    `היי! הנה הקישור ל${product.title}:`,
    product.affiliateUrl,
    "",
    "#פרסומת · קישור שותפים: אם תקנו דרכו ייתכן שאקבל עמלה, בלי עלות נוספת לכם. המחיר והמלאי הסופיים נקבעים בחנות.",
  ].join("\n");
}

/** Which comments to answer now (pure: the decision, not the sending). */
export function plan({ media = [], products = [], ownUsername = "", now = Date.now() }) {
  const out = [];
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  for (const m of media) {
    const product = productForCaption(m.caption, products);
    if (!product || !product.affiliateUrl) continue;
    for (const c of m.comments || []) {
      if (out.length >= MAX_PER_RUN) return out;
      if (!c.id || Date.parse(c.timestamp) < cutoff) continue;
      if (String(c.username || "").toLowerCase() === ownUsername.toLowerCase()) continue;
      if (!asksForLink(c.text)) continue;
      if ((c.replies || []).some((r) => String(r.username || "").toLowerCase() === ownUsername.toLowerCase())) continue; // handled
      out.push({ mediaId: m.id, commentId: c.id, productId: product.id, message: privateMessage(product) });
    }
  }
  return out;
}

function graph(token) {
  const host = process.env.GRAPH_HOST || (String(token).startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com");
  const version = process.env.GRAPH_API_VERSION || "v23.0";
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`https://${host}/${version}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(`graph ${res.status} ${json.error?.code || ""} ${String(json.error?.message || "").slice(0, 160)}`);
    return json;
  };
}

async function main() {
  const token = process.env.IG_ACCESS_TOKEN || "";
  const userId = process.env.IG_USER_ID || "";
  const dry = process.argv.includes("--dry-run");
  summary(`## Instagram comment → DM · ${new Date().toISOString()}${dry ? " (dry run)" : ""}`);
  if (!token || !userId) {
    summary("REQUIRES_CONNECTION: add the IG_ACCESS_TOKEN and IG_USER_ID repository secrets. Nothing was sent.");
    return;
  }
  const products = JSON.parse(readFileSync(new URL("../../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"] || [];
  const api = graph(token);
  const me = await api(`${userId}?fields=username`);
  const recent = await api(`${userId}/media?fields=id,caption,timestamp,permalink&limit=12`);
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const media = [];
  for (const m of recent.data || []) {
    if (Date.parse(m.timestamp) < cutoff || !productForCaption(m.caption, products)) continue;
    const comments = (await api(`${m.id}/comments?fields=id,text,timestamp,username&limit=50`)).data || [];
    for (const c of comments) {
      if (asksForLink(c.text)) c.replies = (await api(`${c.id}/replies?fields=id,username`)).data || [];
    }
    media.push({ ...m, comments });
  }
  const todo = plan({ media, products, ownUsername: me.username || "" });
  summary(`Posts about a product (last ${WINDOW_DAYS} days): ${media.length} · comments asking for the link, not yet answered: ${todo.length}`);
  let sent = 0;
  for (const t of todo) {
    if (dry) { summary(`- would answer comment ${t.commentId} (${t.productId})`); continue; }
    try {
      const dm = await api(`${userId}/messages`, { method: "POST", body: { recipient: { comment_id: t.commentId }, message: { text: t.message } } });
      if (!dm.message_id) throw new Error("no message_id");
      await api(`${t.commentId}/replies`, { method: "POST", body: { message: PUBLIC_REPLY } });
      sent += 1;
      summary(`- SENT private reply ${dm.message_id} for comment ${t.commentId} (${t.productId})`);
    } catch (e) {
      summary(`- FAILED comment ${t.commentId}: ${String(e.message || e).slice(0, 200)}`);
    }
  }
  summary(`Done: ${sent} sent`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message || e)); process.exitCode = 1; });
