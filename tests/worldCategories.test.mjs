// Every category in the world (src/lib/growth/worldCategories.js; the owner, 2026-11-16).
import test from "node:test";
import assert from "node:assert/strict";
import { WORLD, categoriesOf, needsRefresh, rotation } from "../src/lib/growth/worldCategories.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const answer = (cats, code = 200) => ({ aliexpress_affiliate_category_get_response: { resp_result: { resp_code: code, result: { categories: { category: cats } } } } });

test("the store's category tree is parsed; a refused answer is not an empty tree", () => {
  const list = categoriesOf(answer([{ category_id: 3, category_name: "Apparel" }, { category_id: 100, category_name: "Dresses", parent_category_id: 3 }, { category_id: 100, category_name: "dup" }, { category_name: "no id" }]));
  assert.deepEqual(list, [{ id: "3", name: "Apparel", parent: null }, { id: "100", name: "Dresses", parent: "3" }]);
  assert.equal(categoriesOf(answer([], 500)), null);
});

test("the rotation covers the whole tree, the specific kinds first, and wraps around", () => {
  const list = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: `c${i}`, parent: i < 5 ? null : "1" }));
  const a = rotation(list, 0, 12);
  assert.equal(a.slice.length, 12);
  assert.ok(a.slice.every((c) => c.parent), "second-level first");
  assert.equal(a.days, 3);
  const seen = new Set();
  let cur = 0;
  for (let d = 0; d < a.days; d++) { const r = rotation(list, cur, 12); r.slice.forEach((c) => seen.add(c.id)); cur = r.next; }
  assert.equal(seen.size, 30, "a full round reads every category");
  assert.deepEqual(rotation([], 5), { slice: [], next: 0, total: 0, days: 0 });
});

test("the list is read again once a week", () => {
  assert.equal(needsRefresh(null, "2026-11-16"), true);
  assert.equal(needsRefresh({ at: "2026-11-12", list: [{ id: "1" }] }, "2026-11-16"), false);
  assert.equal(needsRefresh({ at: "2026-11-09", list: [{ id: "1" }] }, "2026-11-16"), true);
  assert.equal(WORLD.perRun, 120, "17.11: 120 a day (the owner asked for the whole world faster)");
});

test("the board says how much of the world the radar reads, numbers only", () => {
  const b = sanitizeBoard({ v: 2, at: "2026-11-16T05:00:00Z", concepts: [], record: {}, world: { categories: 412, readToday: 12, fullRoundDays: 35, extra: "x" } });
  assert.deepEqual(b.world, { categories: 412, readToday: 12, fullRoundDays: 35 });
});

// 17.11: 12 a day brought a category back only every ~47 days, too late for a riser (3–14 days).
import { WORLD as W2, worldSlice } from "../src/lib/growth/worldCategories.js";

test("every fashion category every day, the rest in rotation, 120 a day", () => {
  const list = [
    { id: "100", name: "Women's Clothing", parent: null },
    { id: "101", name: "Dresses", parent: "100" },
    { id: "102", name: "Sweaters", parent: "100" },
    { id: "200", name: "Shoes", parent: null },
    { id: "201", name: "Sneakers", parent: "200" },
    { id: "300", name: "Home & Garden", parent: null },
    ...Array.from({ length: 300 }, (_, i) => ({ id: String(1000 + i), name: `Tools ${i}`, parent: "300" })),
  ];
  const a = worldSlice(list, 0);
  assert.equal(W2.perRun, 120);
  assert.equal(a.fashion, 3, "Dresses, Sweaters, Sneakers: by their own name or their parent's");
  assert.ok(["101", "102", "201"].every((id) => a.slice.slice(0, 3).some((c) => c.id === id)));
  assert.equal(a.slice.length, 120);
  const b = worldSlice(list, a.next);
  assert.ok(["101", "102", "201"].every((id) => b.slice.some((c) => c.id === id)), "fashion again the next day");
  assert.notEqual(b.slice[3].id, a.slice[3].id, "the rest moves on");
  assert.ok(a.days <= 7, "every other kind comes back within a week");
});
