// "מי זיהתה ראשונה" (src/lib/growth/radarPicks.js): picks graded like the radar's own calls; the
// table shows only those who chose to appear, by nickname.
import test from "node:test";
import assert from "node:assert/strict";
import { addPick, gradePicks, leaderboard, myPicks, cleanNick } from "../src/lib/growth/radarPicks.js";

const NOW = Date.parse("2026-12-01T10:00:00Z");

test("a pick needs a measured concept, a valid nickname to appear, and at most 3 open", () => {
  let picks = [];
  assert.equal(addPick(picks, { concept: "a1", base: 10 }).error, "unauthenticated");
  assert.equal(addPick(picks, { userId: "u1", concept: "a1", base: 0 }).error, "concept_not_measured");
  assert.equal(addPick(picks, { userId: "u1", concept: "a1", base: 10, show: true, nick: "<b>" }).error, "invalid_nickname");
  for (const c of ["tofu-squishy", "cloud-slides", "cat-perch"]) picks = addPick(picks, { userId: "u1", concept: c, base: 100, show: true, nick: "נועה ✨".replace(" ✨", ""), now: NOW }).picks;
  assert.equal(addPick(picks, { userId: "u1", concept: "tofu-squishy", base: 100, now: NOW }).error, "already_picked");
  assert.equal(addPick(picks, { userId: "u1", concept: "dim-sum", base: 100, now: NOW }).error, "too_many_open");
  assert.equal(picks[0].due, "2026-12-15");
  assert.equal(cleanNick("  שירה   ק. "), "שירה ק.");
  assert.equal(cleanNick("a"), null);
});

test("graded after 14 days like the radar's calls, never changed after", () => {
  const picks = addPick([], { userId: "u1", concept: "tofu-squishy", base: 1000, show: true, nick: "נועה", now: NOW }).picks;
  assert.equal(gradePicks(picks, { "tofu-squishy": 2000 }, "2026-12-10")[0].result, undefined, "not before its day");
  const g = gradePicks(picks, { "tofu-squishy": 1160 }, "2026-12-15");
  assert.deepEqual([g[0].result, g[0].growth], ["HIT", 16]);
  assert.deepEqual(gradePicks(g, { "tofu-squishy": 500 }, "2026-12-20")[0].result, "HIT", "a grade is final");
  assert.equal(gradePicks(picks, { "tofu-squishy": 1100 }, "2026-12-15")[0].result, "MISS");
});

test("the table: only those who chose to appear, hits first then the earliest hit; nobody's id or e-mail", () => {
  const picks = [
    { userId: "u1", nick: "נועה", show: true, concept: "a", at: "2026-11-20", result: "HIT" },
    { userId: "u1", nick: "נועה", show: true, concept: "b", at: "2026-11-25", result: "MISS" },
    { userId: "u2", nick: "מאיה", show: true, concept: "a", at: "2026-11-18", result: "HIT" },
    { userId: "u3", nick: null, show: false, concept: "a", at: "2026-11-10", result: "HIT" },
    { userId: "u4", nick: "טל", show: true, concept: "c", at: "2026-11-30" },
  ];
  const t = leaderboard(picks);
  assert.deepEqual(t.map((r) => r.nick), ["מאיה", "נועה", "טל"], "same hits: the earlier hit first; hidden users never shown");
  assert.doesNotMatch(JSON.stringify(t), /u1|u2|u3|u4/);
  assert.deepEqual(myPicks(picks, "u1").map((p) => p.concept), ["a", "b"]);
  assert.equal(myPicks(picks, "u1")[0].userId, undefined);
});
