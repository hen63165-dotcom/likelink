// New listings that start to run (src/lib/growth/freshRisers.js; the owner, 2026-11-16: "what the
// radar lists, the market already knows"): only small new listings whose orders really grew, measured
// against an older reading; no own link, photo, brand or listed kind → never shown; the board keeps
// only the store's own fields.
import test from "node:test";
import assert from "node:assert/strict";
import { FRESH, freshEntry, freshKeywords, freshRisers, mergeFreshPool } from "../src/lib/growth/freshRisers.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const p = (id, title, orders, extra = {}) => ({ product_id: id, product_title: title, lastest_volume: orders, promotion_link: `https://s.click.aliexpress.com/e/_x${id}`, product_main_image_url: `https://ae01.alicdn.com/kf/${id}.jpg`, target_sale_price: "12.5", ...extra });

test("fresh: the search asks for this year's new listings", () => {
  assert.equal(freshKeywords({ keywords: "kitchen gadgets" }, Date.parse("2026-11-16")), "kitchen gadgets 2026 new");
});

test("fresh: an entry needs the owner's own link, a store photo, and no brand or unlisted kind", () => {
  assert.ok(freshEntry(p("1005001111111", "Mini Desk Lamp Cute", 120), { category: "home", today: "2026-11-16" }));
  assert.equal(freshEntry(p("1005001111112", "Lamp", 10, { promotion_link: "https://www.aliexpress.com/item/1.html" })), null);
  assert.equal(freshEntry(p("1005001111113", "Lamp", 10, { product_main_image_url: "http://evil.example/x.jpg" })), null);
  assert.equal(freshEntry(p("1005001111114", "Nike style sneakers", 10)), null);
});

test("fresh: a small listing whose orders grew ≥ 40% a week is a riser; a big or slow one is not", () => {
  const pool = mergeFreshPool({}, [
    freshEntry(p("1005002222221", "Cloud Night Light", 200), { category: "home", today: "2026-11-09" }),
    freshEntry(p("1005002222222", "Phone Holder Clip", 3000), { category: "tech", today: "2026-11-09" }),
    freshEntry(p("1005002222223", "Hair Claw Big", 9000), { category: "hair", today: "2026-11-09" }),
  ], { today: "2026-11-16" });
  for (const e of Object.values(pool)) e.seen = "2026-11-16";
  const items = {
    "1005002222221": [["2026-11-09", 200], ["2026-11-16", 400]], // +100% a week
    "1005002222222": [["2026-11-09", 3000], ["2026-11-16", 3300]], // +10%
    "1005002222223": [["2026-11-09", 6000], ["2026-11-16", 9000]], // too big
  };
  const f = freshRisers(pool, items);
  assert.equal(f.tracking, 3);
  assert.deepEqual(f.risers.map((r) => r.id), ["1005002222221"]);
  assert.equal(f.risers[0].weekPct, 100);
  assert.equal(f.risers[0].ordersBefore, 200);
  assert.ok(f.risers[0].orders <= FRESH.maxOrders);
  // one reading only → nothing claimed
  assert.equal(freshRisers(pool, { "1005002222221": [["2026-11-16", 400]] }).risers.length, 0);
});

test("fresh: listings not seen for three weeks leave the pool", () => {
  const pool = { "1005003333331": { id: "1005003333331", seen: "2026-10-20", first: "2026-10-20" }, "1005003333332": { id: "1005003333332", seen: "2026-11-15", first: "2026-11-01" } };
  assert.deepEqual(Object.keys(mergeFreshPool(pool, [], { today: "2026-11-16" })), ["1005003333332"]);
});

test("fresh: the browser keeps only safe fields", () => {
  const b = sanitizeBoard({ at: "2026-11-16T05:40:00Z", concepts: [], record: {}, fresh: { tracking: 5, since: "2026-11-16", risers: [
    { id: "1005004444441", title: "Cloud Light", image: "https://ae01.alicdn.com/kf/a.jpg", buy: "https://s.click.aliexpress.com/e/_abc", check: "/magic?u=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1005004444441.html", weekPct: 80, orders: 300, ordersBefore: 150, from: "2026-11-09", to: "2026-11-16" },
    { id: "1005004444442", title: "x", image: "https://evil.example/a.jpg", buy: "https://s.click.aliexpress.com/e/_abd", weekPct: 80, orders: 300 },
    { id: "1005004444443", title: "x", image: "https://ae01.alicdn.com/kf/b.jpg", buy: "javascript:alert(1)", weekPct: 80, orders: 300 },
  ] } });
  assert.equal(b.fresh.tracking, 5);
  assert.deepEqual(b.fresh.risers.map((r) => r.id), ["1005004444441"]);
});
