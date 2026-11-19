#!/usr/bin/env node
// Posts the day's WhatsApp group kit to the brand Telegram channel (src/lib/growth/kitTelegram.js).
//   node scripts/marketing/wa-telegram.mjs <state dir>
// Reads today's kit from GitHub Pages (/likelink/whatsapp/today.json, built by deploy-frontend.yml),
// sends up to KIT_TG.max posts as photo + caption, and keeps sent.json in the state dir. Sends only when
// KIT_TG_SEND=1 (main) and BRAND_TELEGRAM_BOT + BRAND_TELEGRAM_CHAT exist; otherwise prints what it would
// send. A post is SENT only with Telegram's message_id. Nothing on Saturday.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isSaturdayInIsrael, telegramPicks } from "../../src/lib/growth/kitTelegram.js";

const KIT_HOME = "https://hen63165-dotcom.github.io/likelink/whatsapp/";
const read = (p, fb) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb; } catch { return fb; } };

export async function sendKit(dir, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), home = KIT_HOME } = {}) {
  if (isSaturdayInIsrael(now)) return { state: "SATURDAY", sent: [] };
  const sentFile = join(dir, "sent.json");
  const sent = read(sentFile, []);
  const res = await fetchImpl(`${home}today.json?t=${now}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return { state: "NO_KIT", status: res.status, sent: [] };
  const kit = await res.json();
  const picks = telegramPicks(kit.posts, sent, { now });
  if (!picks.length) return { state: "NOTHING_NEW", sent: [] };
  if (env.KIT_TG_SEND !== "1") return { state: "DRY_RUN", picks, sent: [] };
  const missing = ["BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT"].filter((k) => !env[k]);
  if (missing.length) return { state: "REQUIRES_CONNECTION", missing, picks, sent: [] };
  const out = [];
  for (const p of picks) {
    const r = await fetchImpl(`https://api.telegram.org/bot${env.BRAND_TELEGRAM_BOT}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.BRAND_TELEGRAM_CHAT, photo: `${home}${encodeURIComponent(p.file)}`, caption: p.text }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await r.json().catch(() => ({}));
    const messageId = body?.ok ? body.result?.message_id : null;
    if (!messageId) { out.push({ id: p.id, state: "FAILED", error: String(body?.description || r.status).slice(0, 120) }); continue; }
    const entry = { id: p.id, day: kit.day, messageId, sentAt: new Date(now).toISOString() };
    sent.push(entry);
    out.push({ ...entry, state: "SENT" });
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(sentFile, JSON.stringify(sent.slice(-400), null, 1));
  return { state: out.some((x) => x.state === "SENT") ? "SENT" : "FAILED", sent: out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await sendKit(process.argv[2] || "kit-telegram");
  console.log(`wa-telegram: ${r.state}${r.missing ? ` missing ${r.missing.join(", ")}` : ""}${r.status ? ` (${r.status})` : ""}`);
  for (const x of r.sent || []) console.log(`  ${x.state} ${x.id}${x.messageId ? ` message ${x.messageId}` : ""}${x.error ? ` ${x.error}` : ""}`);
  for (const p of r.picks || []) console.log(`  would send ${p.id}: ${p.text.split("\n")[0]}`);
}
