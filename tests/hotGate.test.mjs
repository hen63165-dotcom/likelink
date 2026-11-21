// Hot-only posting (src/lib/growth/hotGate.js; the owner, 2026-11-16): her channel posts only what the
// radar keeps today (8 criteria), strongest first; without a board or a kept product, nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hotOnlyPool } from "../src/lib/growth/hotGate.js";

const pool = [{ id: "p-old" }, { id: "p-hot" }, { id: "p-hotter" }];

test("hot-only: only the radar's KEEP products, strongest Alpha first", () => {
  const board = { site: { keep: [{ id: "p-hot", alpha: 60 }, { id: "p-hotter", alpha: 80 }] } };
  assert.deepEqual(hotOnlyPool(pool, board).pool.map((p) => p.id), ["p-hotter", "p-hot"]);
});

test("hot-only: no board or no kept product → nothing is posted", () => {
  assert.deepEqual(hotOnlyPool(pool, null), { pool: [], reason: "radar_board_missing" });
  assert.deepEqual(hotOnlyPool(pool, { site: { keep: [] } }), { pool: [], reason: "no_hot_product_today" });
});

test("hot-only: the owner's autopilot uses the gate before picking a product", () => {
  const src = readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  // 21.11: the board is read once, then the owner's rising-dupes gate (or another studio's KEEP gate) runs before the pick.
  assert.match(src, /const board = await kvGet\("radar:board"/);
  assert.match(src, /hotOnlyPool\(pool, board\)/);
  assert.ok(src.indexOf("lookPool(pool, board)") < src.indexOf("const product = pickProduct(cfg, pool);"));
  assert.match(src, /MARKETPLACE_SINGLE_OWNER_ID/);
});

// The owner, 21.11: "why does Telegram show the same product every time, and not what I asked (the
// trendiest dupes)". The real log showed four posts within a minute (20.11 20:01–20:02), the same
// product twice 79 s apart, and only generic KEEP products. These tests pin the cure.
test("the owner's channel: only her dupes rising on the radar, matched by the exact item", async () => {
  const { lookPool, risingLooks } = await import("../src/lib/growth/hotGate.js");
  const board = { concepts: [
    { id: "platform-fur-slippers", kind: "style", stage: "RISING", he: "נעלי בית פרווה", pick: { itemId: "1005009763188833" } },
    { id: "western-boots", kind: "style", stage: "STEADY", pick: { itemId: "1005000000000002" } },
    { id: "cable-tray", kind: "home", stage: "RISING", pick: { itemId: "1005000000000003" } },
  ] };
  assert.deepEqual(risingLooks(board).map((l) => l.id), ["platform-fur-slippers"], "a steady look or a non-look kind never qualifies");
  const pool = [{ id: "ae-1005009763188833", title: "נעלי בית" }, { id: "ae-1005000000000002", title: "מגפיים" }, { id: "ae-1005000000000003", title: "מגש כבלים" }];
  assert.deepEqual(lookPool(pool, board).pool.map((p) => p.id), ["ae-1005009763188833"]);
  // The UGG-look dupes found on 21.11, matched by the radar's own words for the look; a cable tray never.
  const slippers = { concepts: [{ id: "platform-fur-slippers", kind: "style", stage: "RISING", he: "נעלי בית פלטפורמה עם פרווה", hq: ["נעלי בית פרווה", "נעלי בית פלטפורמה"], pick: { itemId: "1005009763188833" } }] };
  const site = [{ id: "ae-1005009166187238", title: "סנדלי פלטפורמה רכים לנשים נעלי כותנה חמות ומפנקות" }, { id: "ae-1005013550635931", title: "מבצע כפכפי נשים מבד דמוי פרווה" }, { id: "ae-1005013205496649", title: "מגש אחסון כבלים USB עם 11 22 תאים" }];
  assert.deepEqual(lookPool(site, slippers).pool.map((p) => p.id), ["ae-1005009166187238", "ae-1005013550635931"]);
  assert.equal(lookPool(pool, { concepts: [] }).reason, "no_rising_look_today");
  assert.equal(lookPool(pool, null).reason, "radar_board_missing");
  assert.equal(lookPool([{ id: "ae-1" }], board).reason, "rising_look_not_on_site");
});

test("never twice and never in a burst: the publish log decides, by id and by title", async () => {
  const { freshForChannel } = await import("../src/lib/growth/hotGate.js");
  const now = Date.parse("2026-11-21T12:00:00Z");
  const log = [
    { channel: "telegram", status: "PUBLISHED", brandId: "b", productId: "ae-1", publishedAt: "2026-11-21T09:00:00Z", text: "#פרסומת · קישור שותפים\n🛍️ מגש אחסון כבלים USB\n…" },
    { channel: "telegram", status: "PUBLISHED", brandId: "b", productId: "ae-9", publishedAt: "2026-10-01T09:00:00Z" },
  ];
  const pool = [{ id: "ae-1", title: "x" }, { id: "ae-2", title: "מגש אחסון כבלים USB" }, { id: "ae-9", title: "y" }, { id: "ae-3", title: "z" }];
  const r = freshForChannel(pool, log, { brandId: "b", now });
  assert.deepEqual(r.pool.map((p) => p.id), ["ae-9", "ae-3"], "the same id, or the same title under another id, is never sent again within 14 days");
  assert.equal(freshForChannel(pool, log, { brandId: "b", now: Date.parse("2026-11-21T09:30:00Z") }).tooSoon, true, "a post 30 min after the last one is too soon");
  const run = (await import("node:fs")).readFileSync("api/autopilot.mjs", "utf8");
  assert.match(run, /ownerChannel && cfg\.channelMode !== "hot" \? lookPool\(pool, board\) : hotOnlyPool\(pool, board\)/);
  assert.match(run, /hotReason = "publish_log_unreadable"/, "an unreadable log sends nothing");
});
