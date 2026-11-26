// 🏭 The factories that jump (src/lib/growth/factorySignal.js; the owner, 22.11: "the jumps of the big
// factories, without registering"): the store each listing belongs to, the median growth of its new
// listings (one viral listing cannot fake a factory), never a holiday listing.
import test from "node:test";
import assert from "node:assert/strict";
import { factoryJumps } from "../src/lib/growth/factorySignal.js";
import { freshEntry } from "../src/lib/growth/freshRisers.js";

const day = (i) => new Date(Date.parse("2026-11-08T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
const series = (start, rate) => Array.from({ length: 15 }, (_, i) => [day(i), Math.round(start * rate ** i)]);

test("factories: the store's id is kept from the store's own answer", () => {
  const p = { product_id: "1005013000000101", promotion_link: "https://s.click.aliexpress.com/e/_x", product_main_image_url: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg", product_title: "Cloud Slides Soft", lastest_volume: 120, shop_id: 912345678 };
  assert.equal(freshEntry(p, { category: "home", today: "2026-11-22" }).shop, "912345678");
  assert.equal(freshEntry({ ...p, shop_id: "x" }, { category: "home", today: "2026-11-22" }).shop, undefined);
});

test("factories: new listings running together jump; one viral listing or a holiday never makes a factory", () => {
  const pool = {}, items = {};
  const add = (id, shop, title, start, rate) => { pool[id] = { id, shop, title, image: "https://ae-pic-a1.aliexpress-media.com/kf/S.jpg", link: "https://s.click.aliexpress.com/e/_x" }; items[id] = series(start, rate); };
  // Factory A: three new listings all running (~+12%/day).
  add("1005013000000001", "111", "Cloud slides soft", 40, 1.12); add("1005013000000002", "111", "Cloud slides kids", 50, 1.12); add("1005013000000003", "111", "Cloud slides men", 60, 1.1);
  // Factory B: one viral listing and two flat ones.
  add("1005013000000004", "222", "Desk lamp", 40, 1.3); add("1005013000000005", "222", "Desk lamp mini", 200, 1.0); add("1005013000000006", "222", "Desk lamp clip", 200, 1.0);
  // Factory C: Christmas.
  add("1005013000000007", "333", "Christmas tree balls", 60, 1.12); add("1005013000000008", "333", "Christmas ornaments", 60, 1.12); add("1005013000000009", "333", "Santa costume", 60, 1.12);
  const f = factoryJumps(pool, items);
  assert.deepEqual(f.top.map((r) => r.shop), ["111"]);
  assert.equal(f.top[0].listings, 3);
  assert.ok(f.top[0].medianWeekPct >= 25);
  assert.equal(f.top[0].lead.id, "1005013000000001");
  assert.equal(f.withShop, 6, "holiday listings are set apart before counting");
});
