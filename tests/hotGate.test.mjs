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
  assert.match(src, /hotOnlyPool\(pool, await kvGet\("radar:board"/);
  assert.match(src, /MARKETPLACE_SINGLE_OWNER_ID/);
});
