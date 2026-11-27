// 📰 Who said it first (src/lib/growth/newsSignal.js): every sealed call's phrase against GDELT's open
// news timeline; the first day with ≥ minPerDay articles is stamped once and never moved; a call is
// AHEAD only when the news named it after the seal, NEWS_FIRST on or before it, QUIET while unnamed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEWS, cleanNews, firstNews, mergeNews, newsBoard, newsQueue, newsRace, newsUrl, parseTimeline } from "../src/lib/growth/newsSignal.js";

const answer = (pts) => ({ query_details: {}, timeline: [{ series: "Article Count", data: pts.map(([d, v]) => ({ date: `${d.replace(/-/g, "")}T000000Z`, value: v })) }] });

test("the timeline is read from GDELT's own shape; anything else is no reading", () => {
  assert.deepEqual(parseTimeline(answer([["2026-11-20", 1], ["2026-11-21", 4]])), [{ d: "2026-11-20", n: 1 }, { d: "2026-11-21", n: 4 }]);
  assert.equal(parseTimeline({ error: "x" }), null);
  assert.deepEqual(parseTimeline({ timeline: [] }), []);
  assert.match(newsUrl('butter "squishy'), /query=%22butter%20squishy%22&mode=timelinevolraw&format=json&timespan=3m$/);
  assert.equal(firstNews([{ d: "2026-11-20", n: 2 }, { d: "2026-11-22", n: 3 }, { d: "2026-11-21", n: 5 }]), "2026-11-21");
});

test("ahead, the news first, quiet, unread — and a stamped first day never moves", () => {
  let st = mergeNews({}, "butter squishy", parseTimeline(answer([["2026-11-25", 6]])), "2026-11-26");
  assert.deepEqual(newsRace("2026-11-20", st["butter squishy"]), { state: "AHEAD", days: 5, first: "2026-11-25" });
  assert.deepEqual(newsRace("2026-11-27", st["butter squishy"]), { state: "NEWS_FIRST", days: 2, first: "2026-11-25" });
  st = mergeNews(st, "butter squishy", parseTimeline(answer([["2026-11-10", 9]])), "2026-11-28");
  assert.equal(st["butter squishy"].first, "2026-11-25", "stamped once");
  const q = mergeNews({}, "tofu squishy", parseTimeline(answer([["2026-11-25", 1]])), "2026-11-26");
  assert.equal(newsRace("2026-11-20", q["tofu squishy"]).state, "QUIET");
  assert.equal(newsRace("2026-11-20", undefined).state, "UNREAD");
});

test("the queue asks unread phrases first, re-asks quiet ones after refreshDays, never one already named", () => {
  const st = { a: { read: "2026-11-25", first: null }, b: { read: "2026-11-20", first: "2026-11-21" }, c: { read: "2026-11-22", first: null } };
  const entries = ["a", "b", "c", "dddd", "cccc"].map((p) => ({ phrase: p.length < 4 ? p.repeat(4) : p }));
  const q = newsQueue([{ phrase: "fresh one" }, { phrase: "aaaa" }], { "aaaa": { read: "2026-11-25", first: null } }, "2026-11-26");
  assert.deepEqual(q, ["fresh one"]);
  assert.ok(entries.length && st);
  assert.equal(newsQueue([{ phrase: "named" }], { named: { read: "2026-11-01", first: "2026-11-02" } }, "2026-11-26").length, 0);
  assert.ok(NEWS.politeMs >= 5000, "GDELT asks for one request every 5 seconds");
});

test("the board counts per book and the browser keeps counts only", () => {
  const st = { "x one": { read: "2026-11-26", first: "2026-11-30" }, "y two": { read: "2026-11-26", first: null }, "z three": { read: "2026-11-26", first: "2026-11-01" } };
  const b = newsBoard([{ book: "fresh", phrase: "x one", called: "2026-11-20" }, { book: "fresh", phrase: "y two", called: "2026-11-20" }, { book: "stages", phrase: "z three", called: "2026-11-20" }, { book: "kinds", phrase: "w four", called: "2026-11-20" }], st, "2026-11-26");
  assert.deepEqual(b.all, { calls: 4, read: 3, quiet: 1, ahead: 1, newsFirst: 1, medianAheadDays: 10 });
  const c = cleanNews({ ...b, books: { ...b.books, evil: { calls: 1 } } });
  assert.deepEqual(Object.keys(c.books).sort(), ["fresh", "kinds", "stages"]);
  assert.ok(!JSON.stringify(c).includes("x one"), "never a call's phrase");
});

test("GDELT's empty answer is a quiet phrase, never a failed read (27.11's branch run)", () => {
  assert.deepEqual(parseTimeline({}), []);
  assert.equal(parseTimeline(null), null);
  assert.equal(parseTimeline({ error: "x" }), null);
  assert.ok(NEWS.backoffMs >= 10_000 && NEWS.budgetMs <= 300_000);
});
