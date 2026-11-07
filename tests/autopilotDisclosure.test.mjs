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
