// The crowd sensor (src/lib/growth/crowdSensor.js; the owner, 2026-11-16: "כן לחיישן של הקהל"):
// what different people check in the magic button this week, counts only, nothing about a person.
import test from "node:test";
import assert from "node:assert/strict";
import { CROWD, crowdCard, crowdOf, firstCheckThisSession } from "../src/lib/growth/crowdSensor.js";
import { applyStoreWritePolicy } from "../api/_utils/storeWritePolicy.mjs";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const now = Date.parse("2026-11-16T12:00:00Z");
let n = 0;
const ev = (item, daysAgo = 0) => ({ id: `m${n++}`, type: "magic_check", ts: now - daysAgo * 86_400_000, item });

test("an item needs two different sessions this week; nothing else counts", () => {
  const funnel = [ev("1005001"), ev("1005001", 2), ev("1005002"), ev("1005003", 9), ev("1005003", 8), { type: "landing", ts: now, item: "1005004" }, { type: "magic_check", ts: now }];
  const c = crowdOf(funnel, { now });
  assert.deepEqual(c.map((x) => [x.item, x.people]), [["1005001", 2]]);
});

test("a browser session sends an item's number only on its first check of that item", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(firstCheckThisSession("1005001", store), true);
  assert.equal(firstCheckThisSession("1005001", store), false);
  assert.equal(firstCheckThisSession("1005002", store), true);
  assert.equal(firstCheckThisSession("not-an-id", store), false);
  assert.equal(firstCheckThisSession("1005001", null), false);
});

test("the funnel keeps a magic check's item number, and nothing else new", () => {
  const ctx = { now: Date.now(), actorEmail: "", ownedMarketerIds: new Set() };
  const next = JSON.stringify([{ id: "m1", type: "magic_check", ts: Date.now(), place: "own", item: "1005001", sid: "s_abc123x", email: "x@y.z" }, { id: "m2", type: "landing", ts: Date.now(), item: "1005001" }]);
  const r = applyStoreWritePolicy("marketplace:funnel", "[]", next, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value[0], { id: "m1", type: "magic_check", ts: r.value[0].ts, place: "own", item: "1005001" });
  assert.equal("item" in r.value[1], false, "only a magic check carries an item");
  const bad = applyStoreWritePolicy("marketplace:funnel", "[]", JSON.stringify([{ id: "m3", type: "magic_check", ts: Date.now(), item: "abc" }]), ctx);
  assert.equal("item" in bad.value[0], false);
});

test("a crowd card: the store's facts; a brand or hacking tool has no buy button; unlisted kinds are dropped", () => {
  const p = { product_title: "Cute plush keychain", product_main_image_url: "https://ae01.alicdn.com/kf/x.jpg", promotion_link: "https://s.click.aliexpress.com/e/_abc", target_sale_price: "19.9", lastest_volume: 850 };
  const c = { item: "1005001", people: 3, checks: 4, first: "2026-11-14", last: "2026-11-16" };
  const card = crowdCard(c, p, { momentum: { weekPct: 22 } });
  assert.equal(card.buy, "https://s.click.aliexpress.com/e/_abc");
  assert.equal(card.people, 3);
  assert.equal(crowdCard(c, { ...p, product_title: "Flipper Zero gadget" }).buy, null);
  assert.equal(crowdCard(c, { ...p, product_title: "Labubu plush" }).blocked, "BRAND");
  assert.equal(crowdCard(c, { ...p, product_title: "vape pen" }), null);
  const board = sanitizeBoard({ v: 2, at: "2026-11-16T05:00:00Z", concepts: [], record: {}, crowd: { at: "2026-11-16", days: 7, list: [card, { ...card, id: "1005009", people: 1 }] } });
  assert.equal(board.crowd.list.length, 1, "one person is not a crowd");
  assert.equal(CROWD.minPeople, 2);
});

test("the server gives the counts only to the radar run (cron auth)", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } }); };
  const data = { "marketplace:funnel": [ev("1005001"), ev("1005001", 1)] };
  const kv = { kvGet: async (k, fb) => (k in data ? data[k] : fb), kvSet: async (k, v) => { data[k] = v; } };
  const h = createRadarBoardHandler({ kv, now: () => now });
  process.env.AUTOPILOT_SECRET = "s3cret-for-test";
  try {
    const open = fakeRes();
    await h({ method: "GET", url: "/api/store?mode=radar-board&op=crowd", headers: { origin: "https://likelink2.vercel.app" } }, open);
    assert.equal(open.code, 401);
    const ok = fakeRes();
    await h({ method: "GET", url: "/api/store?mode=radar-board&op=crowd", headers: { authorization: "Bearer s3cret-for-test" } }, ok);
    assert.equal(ok.code, 200);
    assert.deepEqual(ok.body.crowd.map((c) => [c.item, c.people]), [["1005001", 2]]);
  } finally { delete process.env.AUTOPILOT_SECRET; }
});
