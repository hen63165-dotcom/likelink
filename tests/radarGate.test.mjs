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

test("access: the open launch trial, this user's subscription, or her own trial; nobody else", () => {
  assert.equal(boardAccess({ settings: trialOpen, now: NOW }).full, true);
  assert.equal(boardAccess({ settings: trialOver, now: NOW }).full, false);
  assert.equal(boardAccess({ settings: trialOver, sub: { status: "active" }, now: NOW }).full, true);
  assert.equal(boardAccess({ settings: trialOver, sub: { status: "pending" }, now: NOW }).full, false);
  assert.equal(boardAccess({ settings: trialOver, trial: { active: true, endsAt: "x", daysLeft: 2 }, signedIn: true, now: NOW }).reason, "trial");
  assert.equal(boardAccess({ settings: trialOver, now: NOW }).reason, "sign_in_for_trial");
  assert.equal(boardAccess({ settings: trialOver, signedIn: true, trial: { active: false }, now: NOW }).reason, "subscription_required");
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
  let clock = NOW;
  const h = createRadarBoardHandler({ kv: kvOf(data), verify: async (t) => (t === "good" ? { id: "u-paid" } : t === "other" ? { id: "u-free" } : null), now: () => clock });
  const ask = async (token) => { const res = fakeRes(); await h({ method: "GET", url: "/api/store?mode=radar-board", headers: { origin: "https://likelink2.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res); return res; };
  const anon = await ask();
  assert.equal(anon.code, 402);
  assert.equal(anon.body.error, "sign_in_for_trial");
  assert.doesNotMatch(JSON.stringify(anon.body), /tofu/, "an anonymous visitor never gets a live call");
  // her own trial (like Claude): it starts on her first signed-in visit, and is hers only
  const first = await ask("other");
  assert.deepEqual([first.code, first.body.access, first.body.daysLeft], [200, "trial", 7]);
  assert.equal(data["radar:trials"]["u-free"].startedAt, new Date(NOW).toISOString());
  clock = NOW + 3 * 86_400_000;
  assert.equal((await ask("other")).body.daysLeft, 4, "the same trial, never restarted");
  clock = NOW + 8 * 86_400_000;
  const after = await ask("other");
  assert.deepEqual([after.code, after.body.error], [402, "subscription_required"], "after her trial: subscribe");
  assert.doesNotMatch(JSON.stringify(after.body), /tofu/);
  clock = NOW;
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

test("who spotted it first: only a user with access picks; the table is public and nickname-only", async () => {
  const b2 = JSON.parse(JSON.stringify(board));
  b2.concepts[0].today = { orders: 1000 };
  const data = { [RADAR_BOARD_KEY]: b2, "marketplace:settings": trialOver, "radar:subscriptions": [{ id: "r1", userId: "u-paid", status: "active", env: "live" }], "radar:trials": { "u-old": { startedAt: "2026-11-01T00:00:00Z" } } };
  const h = createRadarBoardHandler({ kv: kvOf(data), verify: async (t) => ({ good: { id: "u-paid" }, old: { id: "u-old" } })[t] || null, now: () => NOW });
  const call = async (method, op, token, body) => { const res = fakeRes(); await h({ method, url: `/api/store?mode=radar-board&op=${op}`, headers: { origin: "https://likelink2.vercel.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }, res); return res; };
  assert.equal((await call("POST", "pick", null, { concept: "tofu-squishy" })).code, 401);
  assert.equal((await call("POST", "pick", "old", { concept: "tofu-squishy" })).code, 402, "a used-up trial cannot pick");
  const ok = await call("POST", "pick", "good", { concept: "tofu-squishy", nick: "מאיה", show: true });
  assert.equal(ok.code, 200);
  assert.equal(data["radar:picks"][0].base, 1000, "sealed with that day's orders");
  assert.equal((await call("POST", "pick", "good", { concept: "not-on-the-radar", nick: "מאיה", show: true })).code, 400);
  const table = await call("GET", "leaderboard");
  assert.deepEqual(table.body.table.map((r) => r.nick), ["מאיה"]);
  assert.doesNotMatch(JSON.stringify(table.body), /u-paid/);
  const mine = await call("GET", "mine", "good");
  assert.equal(mine.body.picks[0].concept, "tofu-squishy");
  assert.equal(mine.body.picks[0].userId, undefined);
});

test("the lock: 'room to make it' shows its record and fingerprint, never the kinds it named", async () => {
  const { teaserBoard: teaser } = await import("../src/lib/growth/radarGate.js");
  const t = teaser({ at: "2026-11-22T06:00:00Z", supply: { measured: 125, under: 14, over: 2, top: ["cable-knit-scarf"], record: { calls: 14, graded: 0, followed: 0 }, seal: { d: "2026-11-22", sha256: "a".repeat(64), count: 30, text: "cable-knit-scarf|2026-11-22|call|400|2026-12-06|-", ots: [] } } });
  assert.deepEqual(t.supply.top, []);
  assert.equal(t.supply.record.calls, 14);
  assert.equal(t.supply.seal.sha256, "a".repeat(64));
  assert.equal(t.supply.seal.text, undefined);
  assert.ok(!JSON.stringify(t).includes("cable-knit-scarf"));
});

test("the lock: every open call is a sealed envelope — the seal's facts, never what is inside", async () => {
  const { teaserBoard: teaser, envelopesOf } = await import("../src/lib/growth/radarGate.js");
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const board = {
    at: "2026-11-22T06:00:00Z", record: {}, concepts: [],
    early: { ledger: [{ concept: "secret-kind", at: "2026-11-20", due: "2026-12-04", dayN: 3, progress: 38 }, { concept: "done-kind", at: "2026-11-01", due: "2026-11-15", result: "HIT" }] },
    fresh: { watch: [{ id: "1005013201890326", title: "Secret pants", called: "2026-11-20", due: "2026-12-04", dayN: 3, progress: 21 }], risers: [{ id: "1005013201890326", title: "Secret pants", called: "2026-11-20", due: "2026-12-04" }, { id: "1005013000000009", title: "Secret lamp", called: "2026-11-22", due: "2026-12-06" }] },
  };
  const env = envelopesOf(board);
  assert.deepEqual(env.map((e) => [e.book, e.sealed, e.change]), [["fresh", "2026-11-22", null], ["early", "2026-11-20", 38], ["fresh", "2026-11-20", 21]], "graded calls are no envelope; one per call");
  const t = teaser(board);
  assert.equal(t.envelopes.length, 3);
  const clean = sanitizeBoard(t);
  assert.equal(clean.envelopes.length, 3);
  assert.ok(!/secret|Secret|1005013/.test(JSON.stringify(clean.envelopes)), "never what is inside");
});

test("✉️ envelopes carry true clues measured at the seal (area, pace, few sellers, countries), never what is inside", async () => {
  const { teaserBoard: teaser } = await import("../src/lib/growth/radarGate.js");
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const board = {
    at: "2026-11-22T06:00:00Z", record: {}, concepts: [],
    fresh: { risers: [{ id: "1005013201890326", title: "Secret Cloud Lamp", category: "home", weekPct: 84, called: "2026-11-22", due: "2026-12-06", known: { similar: 412, world: { state: "FIRST_SIGNS", measured: 51, searched: 2, where: ["US", "GB"] } } }], watch: [] },
    kinds: { list: [] }, early: { ledger: [] },
    trade: { latest: "2026-09", partners: [{ id: "CN", measured: 900, jumping: 1, top: [{ code: "33030090", label: "Toilet waters", value: 19e6, prev: 7.4e6, valuePct: 156, kgPct: 230 }] }] },
  };
  const clean = sanitizeBoard(teaser(board));
  assert.equal(clean.envelopes.length, 1);
  const e = clean.envelopes[0];
  assert.equal(e.area, "home");
  assert.equal(e.pace, 84);
  assert.equal(e.similar, 412);
  assert.equal(e.countries, 2);
  assert.equal(e.measured, 51);
  assert.ok(!/Secret|Cloud|1005013|US|GB/.test(JSON.stringify(clean.envelopes)), "never the name, the item or the countries");
  assert.equal(clean.trade.partners[0].top[0].code, "33030090", "the customs records are public behind the lock");
});
