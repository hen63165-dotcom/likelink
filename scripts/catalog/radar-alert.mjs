#!/usr/bin/env node
// Sends the radar's morning alert to the brand Telegram channel (src/lib/growth/radarAlert.js).
// Usage: node scripts/catalog/radar-alert.mjs <state dir>. Sends only when RADAR_ALERT_SEND=1 (main)
// and BRAND_TELEGRAM_BOT + BRAND_TELEGRAM_CHAT exist; otherwise prints what it would send.
// SENT only with Telegram's message_id; the log (alerts.json) keeps one entry per day.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { alertOf, alreadySent } from "../../src/lib/growth/radarAlert.js";

const read = (p, fb) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb; } catch { return fb; } };

export async function sendAlert(dir, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const board = read(join(dir, "board.json"), null);
  const log = read(join(dir, "alerts.json"), []);
  const alert = board ? alertOf(board) : null;
  if (!alert) return { state: "NO_CALL_TODAY" };
  if (alreadySent(log, alert.day)) return { state: "ALREADY_SENT", day: alert.day };
  if (env.RADAR_ALERT_SEND !== "1") return { state: "DRY_RUN", text: alert.text };
  if (!env.BRAND_TELEGRAM_BOT || !env.BRAND_TELEGRAM_CHAT) return { state: "REQUIRES_CONNECTION", missing: ["BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT"].filter((k) => !env[k]), text: alert.text };
  const res = await fetchImpl(`https://api.telegram.org/bot${env.BRAND_TELEGRAM_BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.BRAND_TELEGRAM_CHAT, text: alert.text, disable_web_page_preview: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  const messageId = body?.ok ? body.result?.message_id : null;
  if (!messageId) return { state: "FAILED", status: res.status, error: String(body?.description || "no message_id").slice(0, 120) };
  log.push({ day: alert.day, concepts: alert.concepts, messageId, sentAt: new Date().toISOString() });
  writeFileSync(join(dir, "alerts.json"), JSON.stringify(log.slice(-120), null, 1));
  return { state: "SENT", day: alert.day, messageId };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await sendAlert(process.argv[2] || "radar-state");
  console.log(`radar alert: ${out.state}${out.messageId ? ` (message ${out.messageId})` : ""}${out.missing ? ` missing ${out.missing.join(", ")}` : ""}${out.error ? ` ${out.error}` : ""}`);
  if (out.text) console.log(out.text);
}
