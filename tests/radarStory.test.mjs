// The radar's morning story (src/lib/growth/radarStory.js; the owner, 2026-11-16: "כן לסטורי"):
// built only from the public board, never a promise or forecast wording, the teaser never names an
// open call, and the link sticker goes to /radar tagged per day.
import test from "node:test";
import assert from "node:assert/strict";
import { radarStoryOf, STORY_FORBIDDEN, storyLink } from "../src/lib/growth/radarStory.js";
import { storyHtml, pageHtml } from "../scripts/marketing/radar-story.mjs";

const concept = (id, he, early = {}, factory = null) => ({ id, he, early: { level: "NONE", count: 0, ...early }, factory });

test("radar story: a call sealed today is the story, with the seal and the grade day", () => {
  const board = {
    at: "2026-11-20T05:40:00Z",
    concepts: [concept("a", "סקווישי חמאה", { level: "CALL", count: 4 }), concept("b", "מחזיק טלפון", { level: "WATCH", count: 3 })],
    early: { ledger: [{ concept: "a", at: "2026-11-20", due: "2026-12-04" }] },
  };
  const s = radarStoryOf(board);
  assert.equal(s.kind, "call");
  assert.equal(s.title, "סקווישי חמאה");
  assert.ok(s.items.some((i) => i.text.includes("חתומה מראש")));
  assert.ok(s.items.some((i) => i.text.includes("4.12") && i.text.includes("בפומבי")));
  assert.equal(s.link, "https://likelink2.vercel.app/radar?utm_source=instagram&utm_medium=story&utm_campaign=radar_20261120");
  assert.equal(s.disclosure, "#פרסומת · באתר יש קישורי שותפים");
});

test("radar story: no call says so plainly, with only measured items", () => {
  const board = {
    at: "2026-11-21T05:40:00Z",
    concepts: [
      concept("a", "מנורת ירח", { level: "WATCH", count: 3 }),
      concept("b", "כרית צוואר", { level: "WATCH", count: 2 }, { born: true, weekPct: 31.6 }),
      concept("c", "בקבוק", {}),
    ],
    early: { ledger: [] },
  };
  const s = radarStoryOf(board);
  assert.equal(s.kind, "quiet");
  // The owner, 2026-11-16: "the word לא already pushes away": a quiet day says what comes next, plainly.
  assert.match(s.title, /במעקב צמוד/);
  assert.match(s.sub, /הקביעה הבאה תיחתם/);
  const texts = s.items.map((i) => i.text);
  assert.ok(texts.includes("על סף קביעה: מנורת ירח"));
  assert.ok(texts.includes("נולד עכשיו: כרית צוואר (+32% מוכרים בשבוע)"));
  assert.ok(texts.includes("במעקב צמוד: 2 סוגים עם 2 סימנים ומעלה"));
  assert.ok(texts.includes("נבדקו היום 3 סוגי מוצרים"));
});

test("radar story: the teaser board never names an open call", () => {
  const s = radarStoryOf({ at: "2026-12-01T05:40:00Z", early: { open: 2, ledger: [] } });
  assert.equal(s.kind, "locked");
  assert.match(s.title, /2 קביעות פתוחות/);
  assert.equal(s.items.length, 0);
  assert.equal(radarStoryOf(null), null);
  assert.equal(radarStoryOf({}), null);
});

test("radar story: no promise, certainty or forecast wording reaches the picture", () => {
  const board = { at: "2026-11-20T05:40:00Z", concepts: [concept("a", "להיט מובטח", { level: "CALL", count: 4 })], early: { ledger: [{ concept: "a", at: "2026-11-20", due: "2026-12-04" }] } };
  assert.equal(radarStoryOf(board), null);
  for (const b of [
    { at: "2026-11-21T05:40:00Z", concepts: [concept("a", "מנורה")], early: { ledger: [] } },
    { at: "2026-12-01T05:40:00Z", early: { open: 1 } },
  ]) {
    const s = radarStoryOf(b);
    // What a person reads: the text without the markup and the styles.
    const visible = (storyHtml(s) + pageHtml(s, "x.png")).replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    assert.ok(!STORY_FORBIDDEN.test(visible), `forbidden wording on the story: ${visible.match(STORY_FORBIDDEN)}`);
  }
  assert.ok(storyLink("2026-11-20").startsWith("https://likelink2.vercel.app/radar?"));
});
