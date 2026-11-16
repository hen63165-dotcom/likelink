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

// The scouts (the owner, 2026-11-16: "1+2"): every pick sealed in Bitcoin, a verified badge only
// from sealed and graded picks, and no user id or e-mail in what is sealed.
test("scouts: the sealed text has no user id; a verified scout needs 3 hits at 60%", async () => {
  const { picksSealText, SCOUT } = await import("../src/lib/growth/radarPicks.js");
  const picks = [
    { userId: "11111111-aaaa", concept: "cloud-light", at: "2026-11-16", base: 200, nick: "נועה", show: true },
    { userId: "22222222-bbbb", concept: "cloud-light", at: "2026-11-16", base: 200, nick: "secret", show: false },
  ];
  const text = picksSealText(picks);
  assert.equal(text, "2026-11-16|cloud-light|200|anon\n2026-11-16|cloud-light|200|נועה");
  assert.doesNotMatch(text, /11111111|22222222|secret/);
  const graded = (n, hits) => Array.from({ length: n }, (_, i) => ({ userId: "u9", concept: `c${i}`, at: "2026-11-01", nick: "שירה", show: true, result: i < hits ? "HIT" : "MISS" }));
  assert.equal(leaderboard(graded(4, 3))[0].verified, true);
  assert.equal(leaderboard(graded(4, 3))[0].accuracy, 75);
  assert.equal(leaderboard(graded(6, 3))[0].verified, false, "3 of 6 is 50%");
  assert.equal(leaderboard(graded(2, 2))[0].verified, false, "fewer than 3 hits");
  assert.equal(SCOUT.verifiedHits, 3);
});

test("scouts: the daily put seals the picks once (OpenTimestamps) and the leaderboard shows the proof", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  const { RADAR_PICKS_SEAL_KEY } = await import("../src/lib/growth/radarPicks.js");
  const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } }); };
  const data = { "radar:picks": [{ id: "x", userId: "u1", concept: "tofu-squishy", at: "2026-12-01", base: 100, nick: "נועה", show: true, due: "2026-12-15" }] };
  const kv = { kvGet: async (k, fb) => (k in data ? data[k] : fb), kvSet: async (k, v) => { data[k] = v; } };
  let calls = 0;
  const fetchImpl = async (url) => { calls++; assert.match(String(url), /^https:\/\/[ab]\.pool\.opentimestamps\.org\/digest$/); return { ok: true, arrayBuffer: async () => new Uint8Array([0xf0, 0x10, 1, 2, 3]).buffer }; };
  const board = { v: 2, at: "2026-12-05T05:37:00Z", record: { calls: 0, graded: 0, hits: 0, pending: 0 }, concepts: [{ id: "tofu-squishy", he: "סקווישי טופו", stage: "STEADY", today: { orders: 120 } }] };
  const h = createRadarBoardHandler({ kv, fetchImpl, now: () => Date.parse("2026-12-05T06:00:00Z") });
  process.env.AUTOPILOT_SECRET = "s3cret-for-test";
  try {
    const put = async () => { const res = fakeRes(); await h({ method: "POST", url: "/api/store?mode=radar-board&op=put", headers: { authorization: "Bearer s3cret-for-test" }, body: board }, res); return res; };
    assert.equal((await put()).code, 200);
    const seal = data[RADAR_PICKS_SEAL_KEY];
    assert.match(seal.sha256, /^[0-9a-f]{64}$/);
    assert.equal(seal.ots.length, 2);
    assert.equal(calls, 2);
    await put();
    assert.equal(calls, 2, "unchanged picks are not sealed again");
    const res = fakeRes();
    await h({ method: "GET", url: "/api/store?mode=radar-board&op=leaderboard", headers: { origin: "https://likelink2.vercel.app" } }, res);
    assert.equal(res.body.seal.sha256, seal.sha256);
    assert.doesNotMatch(JSON.stringify(res.body), /u1/);
  } finally { delete process.env.AUTOPILOT_SECRET; }
});
