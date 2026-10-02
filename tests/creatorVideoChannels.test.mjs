// A creator's connected channels get the product's verified video, always with
// the animation disclosure, and captions carry real line breaks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { videoCaption, telegramVideoUrl, VIDEO_DISCLOSURE_HE } from "../api/autopilot.mjs";

test("every video caption carries the animation disclosure exactly once", () => {
  assert.ok(videoCaption("עגילים\nhttps://x").endsWith(VIDEO_DISCLOSURE_HE));
  const once = videoCaption(videoCaption("x"));
  assert.equal(once.split("אנימציה ממוחשבת").length - 1, 1);
});

test("Telegram sends a video only for an https video, else nothing", () => {
  assert.equal(telegramVideoUrl({ videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p/a.mp4" }), "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p/a.mp4");
  assert.equal(telegramVideoUrl({ videoUrl: "http://x/a.mp4" }), "");
  assert.equal(telegramVideoUrl({}), "");
});

test("Telegram tries sendVideo before the text post; captions use real newlines; disclosure survives the 1024 cut", () => {
  const src = readFileSync("api/autopilot.mjs", "utf8");
  const fn = src.slice(src.indexOf("async function sendTelegram("), src.indexOf("async function sendWebhook("));
  assert.ok(fn.indexOf("/sendVideo") > -1 && fn.indexOf("/sendVideo") < fn.indexOf("/sendMessage"));
  assert.match(fn, /1024 - VIDEO_DISCLOSURE_HE\.length/);
  assert.doesNotMatch(src, /\$\{text\}\\\\n\$\{link\}/, "no literal backslash-n in captions");
  assert.match(src, /case "telegram": return sendTelegram\(ch, text, mediaProduct \|\| product\);/);
});
