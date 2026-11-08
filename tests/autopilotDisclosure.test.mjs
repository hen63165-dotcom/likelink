// Every post the creator AutoPilot sends about a product (scheduled, new
// product, price drop) opens with "#פרסומת · קישור שותפים", whatever the
// creator's template or the caption engine wrote. The default template carries
// it too and makes no price promise ("במחיר מיוחד" with no disclosure, until
// 2026-11-07, when the owner connected her first Telegram channel).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withAdDisclosure, AD_DISCLOSURE_LINE_HE } from "../api/autopilot.mjs";
import { defaultTemplate } from "../src/lib/autoPilot.js";

test("a post without the disclosure gets it on its first line, once", () => {
  const out = withAdDisclosure("🛍️ עגילים\nhttps://likelink2.vercel.app/u/x");
  assert.equal(out.split("\n")[0], AD_DISCLOSURE_LINE_HE);
  assert.equal(withAdDisclosure(out), out);
  assert.equal(withAdDisclosure("#פרסומת\nעגילים"), "#פרסומת\nעגילים");
  assert.equal(withAdDisclosure(""), "");
});

test("all three creator paths send the text through withAdDisclosure", () => {
  const src = readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  const chTexts = src.match(/const chText = .*$/gm) || [];
  assert.equal(chTexts.length, 3);
  for (const line of chTexts) assert.match(line, /withAdDisclosure\(/);
  assert.doesNotMatch(src, /כמות מוגבלת|לפני שהמחיר חוזר|במחיר מיוחד/);
});

test("the default template opens with the disclosure and promises no price", () => {
  const tpl = defaultTemplate();
  assert.equal(tpl.split("\n")[0], AD_DISCLOSURE_LINE_HE);
  assert.doesNotMatch(tpl, /מחיר מיוחד|\{price\}/);
  assert.match(tpl, /\{link\}/);
});

// 2026-11-08: the owner's channel name was saved with an invisible U+200E
// copied from a Hebrew message, and Telegram would answer "chat not found".
test("a Telegram channel name loses invisible direction marks and spaces", async () => {
  const { cleanChatId } = await import("../api/autopilot.mjs");
  assert.equal(cleanChatId("\u200e@likelink_deals"), "@likelink_deals");
  assert.equal(cleanChatId(" @likelink_deals\u200f "), "@likelink_deals");
  assert.equal(cleanChatId("\u2066-1001234567890\u2069"), "-1001234567890");
  assert.equal(cleanChatId(""), "");
  const src = readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /chat_id: ch\.chatId/);
});

test("the discovery Telegram publisher sends the cleaned channel name", async () => {
  const { publishToTelegram } = await import("../src/lib/discovery/publishers/telegram.js");
  let sent = null;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 7, chat: { username: "likelink_deals" } } }) };
  };
  await publishToTelegram({ botToken: "123456:" + "a".repeat(35), chatId: "\u200e@likelink_deals", text: "x", fetchImpl });
  assert.equal(sent.chat_id, "@likelink_deals");
});

// 2026-11-08: the first Telegram post named a ring and linked to the whole
// store, so Telegram's preview showed the store page's picture.
test("a post about a product links to that product's page, unless the creator set her own link", async () => {
  const { productPostLink } = await import("../api/autopilot.mjs");
  const o = "https://likelink2.vercel.app";
  assert.equal(productPostLink({}, o, { id: "p-live-01" }, "alyostyle"), `${o}/p/p-live-01`);
  assert.equal(productPostLink({ storeUrl: " https://example.com/me " }, o, { id: "p-live-01" }, "alyostyle"), "https://example.com/me");
  assert.equal(productPostLink({}, o, null, "alyostyle"), `${o}/u/alyostyle`);
  const src = readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /const baseLink = cfg\.storeUrl/);
});

test("Telegram gets the store's own photo of the item, never a stock or generated picture", async () => {
  const { telegramPhotoUrl } = await import("../api/autopilot.mjs");
  const store = "https://ae-pic-a1.aliexpress-media.com/kf/S13c6f7c7d04c497384e5c77d517c376cF.png";
  assert.equal(telegramPhotoUrl({ image: store }), store);
  assert.equal(telegramPhotoUrl({ image: "http://ae-pic-a1.aliexpress-media.com/x.jpg" }), "");
  assert.equal(telegramPhotoUrl({ image: "https://images.unsplash.com/photo-1.jpg" }), "");
  assert.equal(telegramPhotoUrl({ image: "https://x/ugc.jpg", ugcImage: "https://x/ugc.jpg" }), "");
  assert.equal(telegramPhotoUrl({}), "");
});
