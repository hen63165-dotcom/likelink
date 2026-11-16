// /api/store?mode=whatsapp — "שאלי את הרדאר" on WhatsApp (src/lib/growth/whatsappBot.js).
// Meta's webhook for the owner's WhatsApp Cloud API number:
//   GET  hub.mode=subscribe & hub.verify_token & hub.challenge → the challenge, only with the
//        owner's own verify token (WHATSAPP_VERIFY_TOKEN);
//   GET  (no hub params) → which parts are connected, as booleans only;
//   POST the messages → each text answered with the magic button's own check (magicHandler.check /
//        .hype / .findWords), sent through the Cloud API with WHATSAPP_TOKEN.
// Every POST must carry Meta's X-Hub-Signature-256 over the raw body with the app secret
// (WHATSAPP_APP_SECRET); without the secret or a valid signature nothing is read or sent. Only people
// who wrote first get an answer; phone numbers are never stored or logged (the limiter keys on a hash).
// Dispatched from api/store.mjs (12-function limit). Point the webhook at the Edge function directly:
// https://<project>.supabase.co/functions/v1/api/store?mode=whatsapp
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./botGuard.mjs";
import { PRODUCTION_ORIGIN } from "../../src/constants/domain.js";
import { WA, WA_HELP, WA_OTHER_LINK, checkReply, findReply, incomingMessages, intentOf, textMessage } from "../../src/lib/growth/whatsappBot.js";

const trim = (v) => String(v || "").trim();
const send = (res, status, body, type = "application/json") => {
  res.statusCode = status;
  res.setHeader?.("content-type", type);
  res.setHeader?.("cache-control", "no-store");
  return res.end(type === "application/json" ? JSON.stringify(body) : String(body));
};

/** The raw body bytes Meta signed: the Edge adapter keeps them as req.rawBody; a string body is used as is. */
function rawOf(req) {
  if (req?.rawBody && (req.rawBody.length || req.rawBody.length === 0)) return Buffer.from(req.rawBody);
  if (typeof req?.body === "string") return Buffer.from(req.body, "utf8");
  return null;
}

/** Meta's signature check (sha256=HMAC(app secret, raw body)), constant time. */
export function signatureOk(raw, header, secret) {
  const got = /^sha256=([0-9a-f]{64})$/i.exec(trim(header));
  if (!got || !raw || !secret) return false;
  const want = createHmac("sha256", secret).update(raw).digest();
  const have = Buffer.from(got[1], "hex");
  return have.length === want.length && timingSafeEqual(have, want);
}

export function createWhatsappHandler({ env: rawEnv, fetchImpl = globalThis.fetch, magic = null, limiter = createRateLimiter({ windowMs: 60_000, max: WA.perSenderPerMinute }), seen = new Set() } = {}) {
  const env = () => rawEnv || process.env;
  const magicCore = async () => magic || (await import("./magicHandler.mjs")).default;

  async function reply(phoneId, to, body) {
    const e = env();
    const res = await fetchImpl(`${WA.graph}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${trim(e.WHATSAPP_TOKEN)}`, "Content-Type": "application/json" },
      body: JSON.stringify(textMessage(to, body)),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  }

  async function answer(m) {
    const who = createHash("sha256").update(`wa|${m.from}`).digest("hex").slice(0, 16);
    if (!limiter(`wa|${who}`).allowed) return null; // a burst from one number gets no answer (no loop)
    const it = intentOf(m.text);
    const core = await magicCore();
    if (it.kind === "check") {
      const out = await core.check(it.link);
      const report = out?.body?.ok ? out.body.report : null;
      const hype = report?.item?.id ? (await core.hype(report.item.id))?.hype || null : null;
      return checkReply({ report, hype, link: it.link, origin: PRODUCTION_ORIGIN });
    }
    if (it.kind === "find") return findReply(await core.findWords(it.words, `wa-${who}`), { origin: PRODUCTION_ORIGIN });
    if (it.kind === "other_link") return WA_OTHER_LINK;
    return WA_HELP;
  }

  return async function whatsappHandler(req, res) {
    const e = env();
    const url = new URL(req.url, "https://x");
    if (req.method === "GET") {
      if (url.searchParams.get("hub.mode") === "subscribe") {
        const token = trim(e.WHATSAPP_VERIFY_TOKEN);
        if (token && url.searchParams.get("hub.verify_token") === token) return send(res, 200, url.searchParams.get("hub.challenge") || "", "text/plain");
        return send(res, 403, { ok: false, error: "verify_token_mismatch" });
      }
      return send(res, 200, { ok: true, connected: { token: Boolean(trim(e.WHATSAPP_TOKEN)), appSecret: Boolean(trim(e.WHATSAPP_APP_SECRET)), verifyToken: Boolean(trim(e.WHATSAPP_VERIFY_TOKEN)) } });
    }
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
    const secret = trim(e.WHATSAPP_APP_SECRET);
    if (!secret || !trim(e.WHATSAPP_TOKEN)) return send(res, 503, { ok: false, reason: "requires_connection" });
    const raw = rawOf(req);
    const sig = req.headers?.["x-hub-signature-256"] || req.headers?.["X-Hub-Signature-256"] || "";
    if (!signatureOk(raw, sig, secret)) return send(res, 401, { ok: false, error: "bad_signature" });
    let body = null;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return send(res, 400, { ok: false, error: "bad_json" }); }
    const ownPhone = trim(e.WHATSAPP_PHONE_NUMBER_ID);
    let answered = 0;
    for (const m of incomingMessages(body)) {
      if (seen.has(m.id)) continue; // Meta redelivers: one answer per message
      seen.add(m.id);
      if (seen.size > 2000) seen.delete(seen.values().next().value);
      if (ownPhone && m.phoneId !== ownPhone) continue;
      try {
        const text = await answer(m);
        if (text && (await reply(m.phoneId, m.from, text))) answered += 1;
      } catch { /* the next message still gets its answer */ }
    }
    // Always 200 once the signature held, so Meta does not redeliver what was handled.
    return send(res, 200, { ok: true, answered });
  };
}

export default createWhatsappHandler();
