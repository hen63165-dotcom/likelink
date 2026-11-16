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

// "הרדאר נגד ישראל" (the owner, 2026-11-16): the radar plays on the same table, same rules.
test("the radar seals one pick a day from its own measurements, never PEAK or COOLING, never a concept it has open", async () => {
  const { addRadarPick, radarCandidates, RADAR_PLAYER } = await import("../src/lib/growth/radarPicks.js");
  const board = { at: "2026-11-17T05:40:00Z", concepts: [
    { id: "peak-thing", stage: "PEAK", today: { orders: 9000 }, alpha: { score: 99 } },
    { id: "steady-a", stage: "STEADY", today: { orders: 500 }, alpha: { score: 70 } },
    { id: "rising-b", stage: "RISING", today: { orders: 800 }, alpha: { score: 40 } },
    { id: "rising-c", stage: "RISING", today: { orders: 800 }, alpha: { score: 60 } },
    { id: "cooling", stage: "COOLING", today: { orders: 5000 } },
    { id: "nothing", stage: "EMERGING", today: { orders: 0 } },
  ] };
  assert.deepEqual(radarCandidates(board).map((c) => c.id), ["rising-c", "rising-b", "steady-a"]);
  const one = addRadarPick([], board);
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].userId, one[0].concept, one[0].at, one[0].due, one[0].base, one[0].show], [RADAR_PLAYER.userId, "rising-c", "2026-11-17", "2026-12-01", 800, true]);
  assert.equal(addRadarPick(one, board), one, "once a day");
  const next = addRadarPick(one, { ...board, at: "2026-11-18T05:40:00Z" });
  assert.equal(next.at(-1).concept, "rising-b", "never a concept it already has open");
  assert.equal(addRadarPick([], { at: "2026-11-17", concepts: [{ id: "peak-thing", stage: "PEAK", today: { orders: 1 } }] }).length, 0);
});

test("the duel: the radar against everyone else; a leader only once both sides have 3 graded picks", async () => {
  const { duelOf, beatsRadar, leaderboard } = await import("../src/lib/growth/radarPicks.js");
  const g = (userId, concept, result, growth, at = "2026-11-01") => ({ userId, concept, at, due: "2026-11-15", base: 100, show: userId === "radar" || userId === "u1", nick: userId === "radar" ? "הרדאר" : "dana", result, growth });
  const early = [g("radar", "a", "HIT", 20), g("u1", "b", "MISS", 3)];
  const d0 = duelOf(early);
  assert.equal(d0.leader, null);
  assert.deepEqual([d0.radar.hits, d0.radar.graded, d0.crowd.graded, d0.crowd.players], [1, 1, 1, 1]);
  const picks = [...early, g("radar", "c", "MISS", 1), g("radar", "d", "MISS", 2), g("u1", "e", "HIT", 30), g("u1", "f", "HIT", 40), { userId: "radar", concept: "open-one", at: "2026-11-16", due: "2026-11-30", base: 10 }];
  const d = duelOf(picks);
  assert.equal(d.leader, "crowd");
  assert.equal(d.firstDue, "2026-11-30");
  assert.equal(d.recent.some((r) => r.concept === "open-one"), false, "an open radar pick is named only while the board is open");
  assert.equal(duelOf(picks, { openPicks: true }).recent.some((r) => r.concept === "open-one"), true);
  assert.equal(beatsRadar(picks, "u1"), true);
  assert.equal(beatsRadar(picks, "radar"), false);
  assert.equal(leaderboard(picks).find((r) => r.nick === "הרדאר").bot, true);
});

test("the daily put adds the radar's pick to the table and seals it (read back)", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } }); };
  const data = {};
  const kv = { kvGet: async (k, fb) => (k in data ? data[k] : fb), kvSet: async (k, v) => { data[k] = v; } };
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0, 1, 2]).buffer });
  const h = createRadarBoardHandler({ kv, fetchImpl, now: () => Date.parse("2026-11-17T05:45:00Z") });
  process.env.AUTOPILOT_SECRET = "s3cret-for-test";
  try {
    const board = { v: 2, at: "2026-11-17T05:40:00Z", record: {}, concepts: [{ id: "rising-c", he: "משהו עולה", stage: "RISING", today: { orders: 800 } }] };
    const res = fakeRes();
    await h({ method: "POST", url: "/api/store?mode=radar-board&op=put", headers: { authorization: "Bearer s3cret-for-test" }, body: board }, res);
    assert.equal(res.code, 200);
    assert.equal(data["radar:picks"].length, 1);
    assert.equal(data["radar:picks"][0].userId, "radar");
    const lb = fakeRes();
    await h({ method: "GET", url: "/api/store?mode=radar-board&op=leaderboard", headers: { origin: "https://likelink2.vercel.app" } }, lb);
    assert.equal(lb.body.duel.radar.open, 1);
  } finally { delete process.env.AUTOPILOT_SECRET; }
});

// The sealed receipt (the owner, 2026-11-16: "make it one of a kind").
test("a receipt: the day, the product, the grade day and whether the morning seal holds it; never an id", async () => {
  const { receiptView } = await import("../src/lib/growth/radarPicks.js");
  const p = { id: "abcd1234-rising-c-2026-11-16", userId: "abcd1234-ffff", concept: "rising-c", at: "2026-11-16", due: "2026-11-30", base: 800, show: false, nick: "dana" };
  const r = receiptView(p, { he: "משהו עולה", sealText: "2026-11-16|rising-c|800|anon" });
  assert.deepEqual([r.concept, r.he, r.at, r.due, r.nick, r.sealed, r.bot], ["rising-c", "משהו עולה", "2026-11-16", "2026-11-30", null, true, false]);
  assert.equal(JSON.stringify(r).includes("abcd1234"), false, "no stored id or user id");
  assert.equal(receiptView(p, { sealText: "" }).sealed, false);
  assert.equal(receiptView({ ...p, userId: "radar" }, { revealConcept: false }).concept, null, "the radar's open pick stays hidden while the board is locked");
});

test("the server answers a receipt by its receipt id only, and hands each own pick its receipt id", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } }); };
  const data = { "radar:picks": [{ id: "radar-rising-c-2026-11-16", userId: "radar", bot: true, concept: "rising-c", nick: "הרדאר", show: true, at: "2026-11-16", due: "2026-11-30", base: 800 }], "radar:board": { at: "2026-11-16T05:40:00Z", concepts: [{ id: "rising-c", he: "משהו עולה" }] } };
  const kv = { kvGet: async (k, fb) => (k in data ? data[k] : fb), kvSet: async (k, v) => { data[k] = v; } };
  const h = createRadarBoardHandler({ kv, now: () => Date.parse("2026-11-16T12:00:00Z") });
  const lb = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=leaderboard", headers: { origin: "https://likelink2.vercel.app" } }, lb);
  const rid = lb.body.duel.recent[0].rid;
  assert.match(rid, /^[0-9a-f]{16}$/);
  assert.equal("id" in lb.body.duel.recent[0], false, "the stored id never leaves the server");
  const ok = fakeRes();
  await h({ method: "GET", url: `/api/store?mode=radar-board&op=receipt&r=${rid}`, headers: { origin: "https://likelink2.vercel.app" } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(ok.body.receipt.nick, "הרדאר");
  const bad = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=receipt&r=nothex", headers: { origin: "https://likelink2.vercel.app" } }, bad);
  assert.equal(bad.code, 400);
  const none = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=receipt&r=0123456789abcdef", headers: { origin: "https://likelink2.vercel.app" } }, none);
  assert.equal(none.code, 404);
});
