// 🔎 Who knew it first: the radar or Google (googleRace.js). Pinned: a call counts as ahead only when
// Google was read quiet on or after its seal and showed it later, at the low end of the range; Google
// first on any line wins; a first reading that already shows it is counted apart; no suggestion text
// is kept and the trending terms stay out of the browser's copy; the locked copy names no phrase.
import test from "node:test";
import assert from "node:assert/strict";
import { GRACE, cleanGoogleRace, googleRace, googleRaceBoard, lineReadings, phraseKey, raceLine, raceQueue, recordBox, recordTrends, termNames } from "../src/lib/growth/googleRace.js";

const quiet = { searched: 0, measured: 13, echo: false };
const known = { searched: 5, measured: 13, echo: false };
const buzz = { searched: 1, measured: 13, echo: true };

test("box readings: one per day, a reading needs enough countries, the phrase is normalised", () => {
  let s = recordBox({}, "Butter Squishy!", quiet, "2026-11-20");
  s = recordBox(s, "butter squishy", known, "2026-11-20");
  assert.deepEqual(s.box["butter squishy"], [["2026-11-20", 5, 13, 0]], "the newest of a day wins");
  assert.equal(recordBox({}, "x", quiet, "2026-11-20").box.x, undefined, "too short a phrase");
  assert.deepEqual(recordBox({}, "butter squishy", { searched: 0, measured: 4 }, "2026-11-20").box, {}, "under 10 countries answered: no reading");
  assert.equal(phraseKey("  Cable-Knit   Scarf "), "cable knit scarf");
  assert.equal(s.since.box, "2026-11-20");
});

test("the lines: Google's box shows it from 3 countries or half; the echo; the trending terms", () => {
  let s = recordBox({}, "butter squishy", quiet, "2026-11-20");
  s = recordBox(s, "butter squishy", buzz, "2026-11-23");
  s = recordBox(s, "butter squishy", known, "2026-11-26");
  assert.deepEqual(lineReadings("butter squishy", s, "box").map((r) => r.shown), [false, false, true]);
  assert.deepEqual(lineReadings("butter squishy", s, "echo").map((r) => r.shown), [false, true, false]);
  s = recordTrends(s, { US: ["Butter Squishies", "cowboys vs giants"], il: [{ term: "גשם" }] }, "2026-11-25");
  assert.equal(termNames("butter squishy", "butter squishies"), true, "singular and plural are one word");
  assert.equal(termNames("butter squishy", "squishy"), false, "every two-word part must be there");
  assert.deepEqual(lineReadings("butter squishy", s, "trending"), [{ d: "2026-11-25", shown: true }]);
  const old = recordTrends(s, { us: ["x y"] }, "2027-03-01");
  assert.equal(Object.keys(old.trends).includes("2026-11-25"), false, `trending days older than ${GRACE.trendDays} are dropped`);
});

test("one line: ahead only after a quiet reading on or after the seal, as a range; never in the radar's favour", () => {
  assert.equal(raceLine("2026-11-20", []).state, "UNREAD");
  assert.equal(raceLine("2026-11-20", [{ d: "2026-11-10", shown: false }]).state, "UNREAD", "only readings before the seal");
  assert.deepEqual(raceLine("2026-11-20", [{ d: "2026-11-18", shown: true }, { d: "2026-11-24", shown: false }]), { state: "GOOGLE_FIRST", d: "2026-11-18", days: 2 }, "shown before the seal, even if quiet later");
  assert.equal(raceLine("2026-11-20", [{ d: "2026-11-20", shown: true }]).state, "GOOGLE_FIRST", "the seal's own day is Google's");
  assert.deepEqual(raceLine("2026-11-20", [{ d: "2026-11-23", shown: true }]), { state: "LATE_READ", d: "2026-11-23" }, "first read already showing it: order unknown");
  assert.deepEqual(raceLine("2026-11-20", [{ d: "2026-11-20", shown: false }, { d: "2026-11-23", shown: false }, { d: "2026-11-26", shown: true }]), { state: "AHEAD", d: "2026-11-26", quiet: "2026-11-23", minDays: 4, maxDays: 6 });
  assert.deepEqual(raceLine("2026-11-20", [{ d: "2026-11-20", shown: false }, { d: "2026-11-29", shown: false }]), { state: "QUIET", last: "2026-11-29", quietDays: 9 });
});

test("all lines together: Google first on any line wins, a late read leaves it unknown, ahead at the smallest lead", () => {
  let s = recordBox({}, "butter squishy", quiet, "2026-11-20");
  s = recordBox(s, "butter squishy", buzz, "2026-11-26");
  s = recordTrends(s, { us: ["nothing here"] }, "2026-11-20");
  const r = googleRace("2026-11-20", "butter squishy", s);
  assert.equal(r.state, "AHEAD");
  assert.equal(r.line, "echo");
  assert.equal(r.minDays, 1);
  assert.equal(r.lines.box.state, "QUIET");
  const first = recordTrends(s, { gb: ["butter squishy"] }, "2026-11-19");
  assert.equal(googleRace("2026-11-20", "butter squishy", first).state, "GOOGLE_FIRST", "trending before the seal");
  const late = recordBox({}, "cable knit scarf", known, "2026-11-26");
  assert.equal(googleRace("2026-11-20", "cable knit scarf", late).state, "LATE_READ");
});

test("the queue: open calls only, every 3 days, unread first, finished phrases out", () => {
  let s = recordBox({}, "read recently", quiet, "2026-11-26");
  s = recordBox(s, "read long ago", quiet, "2026-11-20");
  s = recordBox(s, "all crossed", known, "2026-11-20");
  s = recordBox(s, "all crossed", buzz, "2026-11-21");
  const entries = [
    { phrase: "read recently", called: "2026-11-20" }, { phrase: "read long ago", called: "2026-11-15" },
    { phrase: "never read", called: "2026-11-25" }, { phrase: "too old", called: "2026-08-01" },
    { phrase: "all crossed", called: "2026-11-19" }, { phrase: "future", called: "2026-12-30" },
  ];
  assert.deepEqual(raceQueue(entries, s, "2026-11-27"), ["never read", "read long ago"]);
});

test("the board: per line, per book, named calls; the locked copy keeps counts only", () => {
  let s = recordBox({}, "butter squishy", quiet, "2026-11-20");
  s = recordBox(s, "butter squishy", known, "2026-11-24");
  s = recordBox(s, "cable knit scarf", known, "2026-11-10");
  const entries = [
    { book: "fresh", phrase: "butter squishy", called: "2026-11-20" },
    { book: "fresh", phrase: "butter squishy", called: "2026-11-20" },
    { book: "stages", phrase: "cable knit scarf", called: "2026-11-15" },
    { book: "noise", phrase: "never read", called: "2026-11-25" },
    { book: "bogus", phrase: "x y z", called: "2026-11-25" },
  ];
  const b = googleRaceBoard(entries, s, "2026-11-27", { doors: { box: "OK", trending: "OK" }, readToday: 2 });
  assert.equal(b.all.calls, 3, "duplicates and unknown books out");
  assert.equal(b.all.ahead, 1);
  assert.equal(b.all.googleFirst, 1);
  assert.equal(b.all.unread, 1);
  assert.equal(b.all.medianAheadMinDays, 1);
  assert.equal(b.books.fresh.ahead, 1);
  assert.equal(b.named.length, 2);
  const c = cleanGoogleRace(b);
  assert.equal(c.named[0].phrase, "butter squishy");
  assert.equal(JSON.stringify(c).includes("trends\":{\"20"), false, "no trending term ever reaches the browser");
  const locked = cleanGoogleRace(b, { full: false });
  assert.deepEqual(locked.named, []);
  assert.equal(locked.all.ahead, 1);
  assert.equal(JSON.stringify(locked).includes("squishy"), false, "behind the lock: no phrase");
  assert.equal(cleanGoogleRace({ d: "bad" }), null);
  assert.equal(cleanGoogleRace({ ...b, named: [{ ...b.named[0], phrase: "<script>" }] }).named.length, 0);
});
