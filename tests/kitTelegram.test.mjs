// The kit posted by itself to the brand Telegram channel (src/lib/growth/kitTelegram.js,
// scripts/marketing/wa-telegram.mjs; the owner, 19.11: "שישלח לבד"). At most 4 a morning, never the same
// product twice in 14 days, nothing on Saturday, the disclosure in every post, SENT only with a message_id.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KIT_TG, isSaturdayInIsrael, telegramPicks } from "../src/lib/growth/kitTelegram.js";
import { WA_AD } from "../src/lib/growth/whatsappKit.js";
import { sendKit } from "../scripts/marketing/wa-telegram.mjs";

const NOW = Date.parse("2026-11-19T05:23:00Z"); // a Thursday
const post = (id, extra = {}) => ({ id, file: `${id}.jpg`, text: `שורה\n\n${WA_AD}`, ...extra });

test("picks: the kit's order, at most four, none sent in the last 14 days, the disclosure required", () => {
  const posts = [post("a"), post("b"), post("c", { text: "בלי גילוי" }), post("d"), post("e"), post("f"), post("g", { file: "" })];
  const sent = [{ id: "b", sentAt: new Date(NOW - 3 * 86_400_000).toISOString() }, { id: "d", sentAt: new Date(NOW - 20 * 86_400_000).toISOString() }];
  assert.deepEqual(telegramPicks(posts, sent, { now: NOW }).map((p) => p.id), ["a", "d", "e", "f"]);
  assert.equal(KIT_TG.max, 4);
});

test("Saturday in Israel is quiet", () => {
  assert.equal(isSaturdayInIsrael(NOW), false);
  assert.equal(isSaturdayInIsrael(Date.parse("2026-11-21T08:00:00Z")), true);
});

test("send: a dry run off main; SENT only with Telegram's message_id; the log keeps it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-tg-"));
  const kit = { day: "20261119", posts: [post("a"), post("b")] };
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(String(url));
    if (String(url).includes("today.json")) return { ok: true, status: 200, json: async () => kit };
    const id = JSON.parse(opts.body).photo.includes("/a.jpg") ? 101 : null;
    return { ok: true, status: 200, json: async () => (id ? { ok: true, result: { message_id: id } } : { ok: false, description: "Bad Request" }) };
  };
  const dry = await sendKit(dir, { env: {}, fetchImpl, now: NOW });
  assert.equal(dry.state, "DRY_RUN");
  assert.equal(calls.filter((u) => u.includes("api.telegram.org")).length, 0, "nothing is sent off main");
  const noKey = await sendKit(dir, { env: { KIT_TG_SEND: "1" }, fetchImpl, now: NOW });
  assert.equal(noKey.state, "REQUIRES_CONNECTION");
  const real = await sendKit(dir, { env: { KIT_TG_SEND: "1", BRAND_TELEGRAM_BOT: "x", BRAND_TELEGRAM_CHAT: "y" }, fetchImpl, now: NOW });
  assert.deepEqual(real.sent.map((x) => [x.id, x.state]), [["a", "SENT"], ["b", "FAILED"]]);
  const log = JSON.parse(readFileSync(join(dir, "sent.json"), "utf8"));
  assert.deepEqual(log.map((x) => [x.id, x.messageId]), [["a", 101]], "a failed post is never logged as sent");
  const again = await sendKit(dir, { env: { KIT_TG_SEND: "1", BRAND_TELEGRAM_BOT: "x", BRAND_TELEGRAM_CHAT: "y" }, fetchImpl, now: NOW + 3_600_000 });
  assert.deepEqual(again.sent.map((x) => x.id), ["b"], "a sent product is not sent again");
});

test("wiring: the schedule skips Saturday and sends from main only", () => {
  const wf = readFileSync(".github/workflows/wa-telegram.yml", "utf8");
  assert.match(wf, /cron: "23 5 \* \* 0-5"/);
  assert.match(wf, /KIT_TG_SEND: \$\{\{ github\.ref == 'refs\/heads\/main' && '1' \|\| '0' \}\}/);
});
