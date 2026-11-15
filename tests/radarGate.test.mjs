// The radar's lock (src/lib/growth/radarGate.js, api/_utils/radarBoardHandler.mjs): the full board
// only while the trial is open or to a signed-in subscriber; everyone else gets the proof only.
import test from "node:test";
import assert from "node:assert/strict";
import { boardAccess, teaserBoard, RADAR_BOARD_KEY } from "../src/lib/growth/radarGate.js";
import { createRadarBoardHandler } from "../api/_utils/radarBoardHandler.mjs";

const NOW = Date.parse("2026-12-05T10:00:00Z");
const billing = { enabled: true, approvedAt: "2026-11-15T05:33:08Z", approvedPrices: { radar_basic: { monthly: 29, yearly: 290 } } };
const trialOver = { radarBilling: billing, radarAccess: { trial: true, startedAt: "2026-11-15T00:00:00Z", trialDays: 14 } };
const trialOpen = { radarBilling: billing, radarAccess: { trial: true, startedAt: "2026-12-01T00:00:00Z", trialDays: 14 } };
const board = {
  v: 1, at: "2026-12-05T05:37:00Z", record: { calls: 3, graded: 1, hits: 1, accuracy: 100, pending: 2 },
  concepts: [{ id: "tofu-squishy", he: "סקווישי טופו", en: "tofu squishy", stage: "RISING", early: { level: "CALL", count: 4, signals: { world: true, demand: true, supply: true, israel: true } } }],
  early: { need: 4, record: { graded: 1, hits: 1, accuracy: 100, pending: 1, calls: 2 },
    ledger: [{ concept: "tofu-squishy", at: "2026-12-05", due: "2026-12-19" }, { concept: "cat-perch", at: "2026-11-16", due: "2026-11-30", result: "HIT", growth: 22 }],
    seal: { d: "2026-12-05", sha256: "a".repeat(64), count: 2, text: "tofu-squishy|2026-12-05|world,demand,supply,israel", ots: [] } },
};

test("access: the open trial, or this user's active subscription; nobody else", () => {
  assert.equal(boardAccess({ settings: trialOpen, now: NOW }).full, true);
  assert.equal(boardAccess({ settings: trialOver, now: NOW }).full, false);
  assert.equal(boardAccess({ settings: trialOver, sub: { status: "active" }, now: NOW }).full, true);
  assert.equal(boardAccess({ settings: trialOver, sub: { status: "pending" }, now: NOW }).full, false);
});

test("the teaser keeps the proof and seals the live calls", () => {
  const t = teaserBoard(board);
  assert.equal(t.concepts.length, 0, "no live concept");
  assert.deepEqual(t.early.ledger.map((x) => x.concept), ["cat-perch"], "graded calls only");
  assert.equal(t.early.open, 1);
  assert.equal(t.early.seal.text, undefined, "the seal's text stays sealed");
  assert.equal(t.early.seal.sha256, "a".repeat(64));
  assert.doesNotMatch(JSON.stringify(t), /tofu/, "an open call's concept is nowhere in it");
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } });
}
const kvOf = (data) => ({ kvGet: async (k, fb) => (k in data ? data[k] : fb), kvSet: async (k, v) => { data[k] = v; } });

test("the handler serves the full board only to a subscriber once the trial is over", async () => {
  const data = { [RADAR_BOARD_KEY]: board, "marketplace:settings": trialOver, "radar:subscriptions": [{ id: "r1", userId: "u-paid", status: "active", env: "live" }] };
  const h = createRadarBoardHandler({ kv: kvOf(data), verify: async (t) => (t === "good" ? { id: "u-paid" } : t === "other" ? { id: "u-free" } : null), now: () => NOW });
  const ask = async (token) => { const res = fakeRes(); await h({ method: "GET", url: "/api/store?mode=radar-board", headers: { origin: "https://likelink2.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res); return res; };
  const anon = await ask();
  assert.equal(anon.code, 402);
  assert.doesNotMatch(JSON.stringify(anon.body), /tofu/, "an anonymous visitor never gets a live call");
  assert.equal((await ask("other")).code, 402, "a signed-in user without a subscription neither");
  const paid = await ask("good");
  assert.equal(paid.code, 200);
  assert.equal(paid.body.board.concepts[0].id, "tofu-squishy");
  data["marketplace:settings"] = trialOpen;
  assert.equal((await ask()).code, 200, "while the trial is open, everyone");
});

test("only the radar run may store the board", async () => {
  const data = {};
  const h = createRadarBoardHandler({ kv: kvOf(data), now: () => NOW });
  const put = async (auth) => { const res = fakeRes(); await h({ method: "POST", url: "/api/store?mode=radar-board&op=put", headers: auth ? { authorization: `Bearer ${auth}` } : {}, body: board }, res); return res; };
  assert.equal((await put()).code, 401);
  assert.equal(data[RADAR_BOARD_KEY], undefined);
  process.env.AUTOPILOT_SECRET = "s3cret-for-test";
  const ok = await put("s3cret-for-test");
  delete process.env.AUTOPILOT_SECRET;
  assert.equal(ok.code, 200);
  assert.equal(data[RADAR_BOARD_KEY].concepts[0].id, "tofu-squishy");
});
