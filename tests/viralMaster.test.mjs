// "המאסטר" (src/lib/growth/viralMaster.js): the one rulebook every story and
// reel is checked against before it is offered (the owner, 2026-10-23:
// "gather everything that really explodes and make it a master"). These tests
// keep the rules honest (readiness, never a promise) and hold Luna's stories
// to them: a hook in the first second, short, a new picture every few seconds,
// a reason to send, one comment keyword, the disclosure first, the AI label.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { MASTER_LIMITS, MASTER_RULES, MASTER_SOURCES, enablesAiLabel, masterCheck } from "../src/lib/growth/viralMaster.js";
import { DROP_AD } from "../src/lib/growth/dailyDrop.js";
import { STORY_STEPS } from "../src/lib/growth/instagramGrid.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const DIR = new URL("../scripts/luna_reels/episodes/", import.meta.url);
const stories = readdirSync(DIR).filter((f) => /^story-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const said = (x) => (typeof x === "string" ? x : x.say);
const captionOf = (x) => (typeof x === "string" ? x : x.caption || x.say);

// The voice reads about 2.8 words a second; every line adds a short breath (compose.PAD).
const WPS = 2.8;
const PAD = 0.35;
const END = 3; // the end card ("כתבי רוצה", compose.END_SECONDS) is part of the video

/** A story episode as the plan the engine renders: each line a new shot (its scene, or a new camera move). */
function planOf(e) {
  const lines = [e.hook, ...e.lines];
  let t = 0;
  const beats = lines.map((l, i) => {
    const b = { start: t, scene: `${i}:${(typeof l === "object" && l.scene) || "same"}` };
    t += said(l).split(/\s+/).length / WPS + PAD;
    return b;
  });
  const caption = [DROP_AD, said(e.hook), "", ...e.lines.map((l) => `• ${captionOf(l).replace(/\*/g, "")}`), "", `👇 ${e.cta.title.replace(/\*/g, "")} ${e.cta.sub || ""}`, `📩 ${e.send}`, "🎬 דמות וקול שנוצרו בבינה מלאכותית"].join("\n");
  return { format: "story", hook: captionOf(e.hook), seconds: t + END, beats: [...beats, { start: t, scene: "end" }], caption,
    captions: true, series: e.presenter, productAt: e.product.at, source: "own_render", product: true, aiCharacter: true, onScreenLabels: ["דמות וקול AI", DROP_AD],
    publishSteps: STORY_STEPS };
}

test("the master: twelve rules a person can read, each with the signal it serves, and no promise", () => {
  assert.equal(MASTER_RULES.length, 12);
  for (const r of MASTER_RULES) assert.ok(r.id && r.he && r.why, r.id);
  assert.ok(MASTER_SOURCES.some((s) => /Mosseri/.test(s.source)), "the signals come from Instagram itself");
  assert.doesNotMatch(read("src/lib/growth/viralMaster.js").replace(/^\/\/.*$/gm, ""), /מובטח|guaranteed|בוודאות/, "nothing promises a viral reel");
});

test("every Luna story passes the master before it is rendered", () => {
  assert.ok(stories.length >= 4);
  for (const e of stories) {
    const r = masterCheck(planOf(e));
    assert.deepEqual(r.failed, [], `${e.id}: ${r.failed.join(", ")}`);
    assert.deepEqual([...r.checked].sort(), MASTER_RULES.map((x) => x.id).sort(), `${e.id}: all twelve rules are checked`);
  }
});

test("the master catches what would sink a reel", () => {
  const good = planOf(stories[0]);
  assert.ok(masterCheck(good).ok);
  assert.ok(masterCheck({ ...good, hook: "ברוכות הבאות לערוץ שלי היום אני רוצה לספר לכן על משהו מיוחד" }).failed.includes("hook_1s"));
  assert.ok(masterCheck({ ...good, seconds: 70 }).failed.includes("short"));
  assert.ok(masterCheck({ ...good, beats: [{ start: 0, scene: "a" }], seconds: 30 }).failed.includes("change_4s"));
  assert.ok(masterCheck({ ...good, caption: good.caption.replace(/📩.*\n/, "") }).failed.includes("send_line"));
  assert.ok(masterCheck({ ...good, caption: good.caption.replace(DROP_AD, "") }).failed.includes("disclosure"));
  assert.ok(masterCheck({ ...good, caption: `${good.caption}\nנשארו רק 2!` }).failed.includes("true_only"));
  assert.ok(masterCheck({ ...good, onScreenLabels: [DROP_AD] }).failed.includes("ai_label"));
  // Missing evidence never passes.
  assert.ok(masterCheck({ ...good, seconds: undefined }).failed.includes("short"));
  assert.ok(masterCheck({ ...good, beats: undefined }).failed.includes("change_4s"));
  assert.ok(masterCheck({ ...good, format: "carousel" }).failed.includes("short"));
  assert.ok(masterCheck({ ...good, captions: undefined }).failed.includes("captions"));
  assert.ok(masterCheck({ ...good, series: "" }).failed.includes("one_face"));
  assert.ok(masterCheck({ ...good, productAt: 1 }).failed.includes("teach_first"), "the product comes after a tip");
  assert.ok(masterCheck({ ...good, source: "repost" }).failed.includes("original"));
  // Whether it shows a product is stated, never assumed: a missing value fails the rules that depend on it.
  const unknown = masterCheck({ ...good, product: undefined, caption: good.caption.replace(DROP_AD, "") });
  assert.ok(unknown.failed.includes("disclosure") && unknown.failed.includes("teach_first"));
  assert.ok(masterCheck({ ...good, aiCharacter: undefined }).failed.includes("ai_label"));
  // Instagram's own AI label: the posting steps must switch it on; the picture and caption alone are not enough.
  assert.ok(masterCheck({ ...good, publishSteps: undefined }).failed.includes("ai_label"));
  assert.ok(masterCheck({ ...good, publishSteps: STORY_STEPS.filter((s) => !/תווית AI/.test(s)) }).failed.includes("ai_label"));
  // The step turns the label on; a step that leaves it off, or only names it, does not count.
  assert.ok(STORY_STEPS.some(enablesAiLabel));
  for (const off of ["אל תפעילי תווית AI", "לא מפעילים „תווית AI”", "בלי תווית AI, מפעילים רק את הכיתוב", "„תווית AI” נמצאת בהגדרות", "כבי את תווית AI"]) {
    assert.equal(enablesAiLabel(off), false, off);
    assert.ok(masterCheck({ ...good, publishSteps: [off] }).failed.includes("ai_label"), off);
  }
  // The last word on the label decides: turned on, then turned off, is off.
  assert.ok(masterCheck({ ...good, publishSteps: [...STORY_STEPS, "לפני הפרסום כבי את תווית AI."] }).failed.includes("ai_label"));
  assert.ok(!masterCheck({ ...good, publishSteps: ["כבי את תווית AI.", ...STORY_STEPS] }).failed.includes("ai_label"), "turned back on later");
  // A tip without a product or an AI character passes those rules only when it says so.
  const tip = masterCheck({ ...good, product: false, aiCharacter: false, caption: good.caption.replace(DROP_AD, ""), publishSteps: [] });
  assert.ok(!tip.failed.includes("disclosure") && !tip.failed.includes("ai_label") && !tip.failed.includes("teach_first"));
  assert.deepEqual(masterCheck({}).ok, false);
  assert.equal(MASTER_LIMITS.hookWords, 8);
});

test("the Instagram page prints the master for the owner", () => {
  assert.match(read("scripts/marketing/instagram-grid.mjs"), /MASTER_RULES/);
});
