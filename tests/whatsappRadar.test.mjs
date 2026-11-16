// "שאלי את הרדאר" on WhatsApp and מד ההייפ (the owner, 2026-11-16: "תבנה"): the meter reads only
// what was measured at the check (no answer → still measuring, never a guess), never prints orders;
// the WhatsApp webhook answers only signed deliveries, only people who wrote first, once per message,
// with the disclosure, and never stores or logs a phone number.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hypeOf, hypePhrase, hypeShareText } from "../src/lib/growth/hypeMeter.js";
import { checkReply, findReply, incomingMessages, intentOf, WA_HELP } from "../src/lib/growth/whatsappBot.js";
import { createWhatsappHandler, signatureOk } from "../api/_utils/whatsappHandler.mjs";

test("hype: levels from measured signals only; a missing answer is MEASURING", () => {
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: ["capybara squishy tiktok"], listings: 9000, orders: 50 }).level, "EVERYWHERE");
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: ["capybara squishy viral"], listings: 300 }).level, "BUZZING");
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: ["capybara squishy toy"], listings: 9000 }).level, "KNOWN");
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: [], listings: 300, orders: 800 }).level, "EARLY");
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: [], listings: 300, orders: 20 }).level, "QUIET");
  assert.equal(hypeOf({ phrase: "capybara squishy", suggestions: null, listings: 300 }).level, "MEASURING");
  assert.equal(hypeOf({ phrase: null, suggestions: [], listings: 300 }).level, "MEASURING");
  const h = hypeOf({ phrase: "capybara squishy", suggestions: [], listings: 300, orders: 812 });
  assert.ok(!h.lines.join(" ").includes("812"), "orders are never printed");
  assert.ok(hypeShareText(h, "סקווישי").includes("נמדד עכשיו"));
  assert.equal(hypeShareText(hypeOf({}), "x"), "");
});

test("hype phrase: the words people search for the thing itself", () => {
  assert.equal(hypePhrase("Automatic Liquid Soap Dispenser Touchless Foam Hand Washer 400ml USB"), "soap dispenser");
  assert.equal(hypePhrase("Kawaii Capybara Squishy Toy Slow Rising Stress Relief"), "capybara squishy");
  assert.equal(hypePhrase(""), null);
});

test("whatsapp: only text (or an image caption) from a number; at most three per delivery", () => {
  const body = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "123" }, messages: [
    { from: "972500000001", id: "a", type: "text", text: { body: "https://he.aliexpress.com/item/1005008742678061.html" } },
    { from: "972500000002", id: "b", type: "image", image: { caption: "סקווישי" } },
    { from: "x", id: "c", type: "text", text: { body: "hi" } },
    { from: "972500000003", id: "d", type: "sticker" },
  ] } }] }] };
  const got = incomingMessages(body);
  assert.deepEqual(got.map((m) => m.id), ["a", "b"]);
  assert.equal(intentOf(got[0].text).kind, "check");
  assert.equal(intentOf("סקווישי עד 20 ש״ח").kind, "find");
  assert.equal(intentOf("https://amazon.com/x").kind, "other_link");
  assert.equal(intentOf("?").kind, "help");
});

const report = { item: { id: "1005008742678061", title: "מתקן סבון", price: 39.9 }, verdict: "OK", notes: [{ id: "price", text: { he: "x" } }, { id: "protection", text: { he: "הגנת הקונה" } }], buy: { url: "https://s.click.aliexpress.com/e/_abc", via: "likelink", disclosure: { he: "#פרסומת · קישור שותפים: עמלה קטנה" } } };

test("whatsapp replies: price, the meter, what to check, the buy link with its disclosure, a link to forward", () => {
  const hype = hypeOf({ phrase: "soap dispenser", suggestions: ["soap dispenser tiktok"], listings: 9000 });
  const t = checkReply({ report, hype, link: "https://he.aliexpress.com/item/1005008742678061.html", origin: "https://likelink2.vercel.app" });
  for (const part of ["מ־₪39.90", "מד ההייפ", "הגנת הקונה", "https://s.click.aliexpress.com/e/_abc", "#פרסומת · קישור שותפים", "https://likelink2.vercel.app/magic?u="]) assert.ok(t.includes(part), part);
  assert.ok(t.length <= 4096);
  const f = findReply({ ok: true, items: [{ title: "סקווישי", price: 12, buy: "https://s.click.aliexpress.com/e/_x" }] }, { origin: "https://likelink2.vercel.app" });
  assert.ok(f.startsWith("#פרסומת · קישור שותפים"), "the disclosure opens a list of affiliate links");
});

const SECRET = "app-secret-test";
const sign = (raw) => `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
const ENV = { WHATSAPP_TOKEN: "t", WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_PHONE_NUMBER_ID: "123" };
const fakeRes = () => { const r = { statusCode: 0, headers: {}, body: "", setHeader(k, v) { r.headers[k] = v; }, end(b) { r.body = b; return r; } }; return r; };
const fakeMagic = { check: async () => ({ body: { ok: true, report } }), hype: async () => ({ ok: true, hype: hypeOf({ phrase: "soap dispenser", suggestions: [], listings: 300, orders: 900 }) }), findWords: async () => ({ ok: true, items: [] }) };

test("whatsapp webhook: verify token, signature required, one answer per message, numbers never kept", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const h = createWhatsappHandler({ env: ENV, fetchImpl, magic: fakeMagic });
  let res = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=whatsapp&hub.mode=subscribe&hub.verify_token=v&hub.challenge=42", headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body, "42");
  res = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=whatsapp&hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42", headers: {} }, res);
  assert.equal(res.statusCode, 403);

  const raw = Buffer.from(JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "123" }, messages: [{ from: "972500000001", id: "wamid.1", type: "text", text: { body: "https://he.aliexpress.com/item/1005008742678061.html" } }] } }] }] }));
  res = fakeRes();
  await h({ method: "POST", url: "/api/store?mode=whatsapp", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, rawBody: raw }, res);
  assert.equal(res.statusCode, 401, "a forged delivery is refused");
  assert.equal(sent.length, 0);
  res = fakeRes();
  await h({ method: "POST", url: "/api/store?mode=whatsapp", headers: { "x-hub-signature-256": sign(raw) }, rawBody: raw }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /graph\.facebook\.com\/v\d+\.\d+\/123\/messages$/);
  assert.equal(sent[0].body.to, "972500000001");
  assert.ok(sent[0].body.text.body.includes("מד ההייפ: 🌱 מוקדם"));
  await h({ method: "POST", url: "/api/store?mode=whatsapp", headers: { "x-hub-signature-256": sign(raw) }, rawBody: raw }, fakeRes());
  assert.equal(sent.length, 1, "Meta's redelivery gets no second answer");
  assert.ok(!JSON.stringify(Object.keys(h)).includes("972"));

  const off = createWhatsappHandler({ env: {}, fetchImpl, magic: fakeMagic });
  res = fakeRes();
  await off({ method: "POST", url: "/api/store?mode=whatsapp", headers: { "x-hub-signature-256": sign(raw) }, rawBody: raw }, res);
  assert.equal(res.statusCode, 503, "without the owner's connection nothing is read or sent");
  assert.equal(signatureOk(raw, sign(raw), SECRET), true);
  assert.equal(signatureOk(raw, sign(raw), "other"), false);
});

test("whatsapp help says what it does", () => {
  assert.ok(WA_HELP.includes("מד ההייפ"));
});
