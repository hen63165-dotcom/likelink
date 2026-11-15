// The radar's morning alert (src/lib/growth/radarAlert.js, scripts/catalog/radar-alert.mjs): only on a
// day with a new sealed call, once a day, SENT only with Telegram's message_id, never a promise.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const board = (ledger) => ({ at: "2026-11-16T05:37:00Z", concepts: [{ id: "tofu-squishy", he: "סקווישי טופו", early: { level: "CALL", count: 4, beforeAll: true } }], early: { ledger } });
const todayCall = [{ concept: "tofu-squishy", at: "2026-11-16", due: "2026-11-30" }];

test("the alert states what was sealed and when it is graded, and nothing on a quiet day", async () => {
  const { alertOf, ALERT_FORBIDDEN } = await import("../src/lib/growth/radarAlert.js");
  const a = alertOf(board(todayCall));
  assert.match(a.text, /הרדאר של LikeLink2 קבע היום \(16\.11\)/);
  assert.match(a.text, /סקווישי טופו: 4 מתוך 4 סימנים · לפני כולם · הציון ב־30\.11/);
  assert.match(a.text, /גם אם לא פגע/);
  assert.match(a.text, /\/radar\?utm_source=telegram&utm_medium=radar_alert/);
  assert.doesNotMatch(a.text, ALERT_FORBIDDEN, "no promise, no 'the only one'");
  assert.equal(alertOf(board([{ concept: "tofu-squishy", at: "2026-11-10", due: "2026-11-24" }])), null, "an older call is not today's alert");
  assert.equal(alertOf(null), null);
});

test("sent once a day, only from main with the brand bot, and only with a message_id", async () => {
  const { sendAlert } = await import("../scripts/catalog/radar-alert.mjs");
  const dir = mkdtempSync(join(tmpdir(), "alert-"));
  writeFileSync(join(dir, "board.json"), JSON.stringify(board(todayCall)));
  const calls = [];
  const ok = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { status: 200, json: async () => ({ ok: true, result: { message_id: 77 } }) }; };
  assert.equal((await sendAlert(dir, { env: {}, fetchImpl: ok })).state, "DRY_RUN", "a branch run never sends");
  assert.deepEqual((await sendAlert(dir, { env: { RADAR_ALERT_SEND: "1" }, fetchImpl: ok })).missing, ["BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT"]);
  assert.equal(calls.length, 0);
  const env = { RADAR_ALERT_SEND: "1", BRAND_TELEGRAM_BOT: "bot", BRAND_TELEGRAM_CHAT: "@likelink_deals" };
  const bad = async () => ({ status: 400, json: async () => ({ ok: false, description: "chat not found" }) });
  assert.equal((await sendAlert(dir, { env, fetchImpl: bad })).state, "FAILED", "no message_id, not sent");
  const sent = await sendAlert(dir, { env, fetchImpl: ok });
  assert.deepEqual([sent.state, sent.messageId], ["SENT", 77]);
  assert.equal(calls[0].body.chat_id, "@likelink_deals");
  assert.equal(JSON.parse(readFileSync(join(dir, "alerts.json"), "utf8"))[0].messageId, 77);
  assert.equal((await sendAlert(dir, { env, fetchImpl: ok })).state, "ALREADY_SENT", "never twice the same day");
  assert.equal(calls.length, 1);
});
