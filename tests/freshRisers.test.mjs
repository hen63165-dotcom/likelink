// New listings that start to run (src/lib/growth/freshRisers.js; the owner, 2026-11-16: "what the
// radar lists, the market already knows"): only small new listings whose orders really grew, measured
// against an older reading; no own link, photo, brand or listed kind → never shown; the board keeps
// only the store's own fields.
import test from "node:test";
import assert from "node:assert/strict";
import { FRESH, freshEntry, freshKeywords, freshPhrase, freshRisers, mergeFreshPool, unknownCheck } from "../src/lib/growth/freshRisers.js";
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
    freshEntry(p("1005002222222", "Phone Holder Clip", 2000), { category: "tech", today: "2026-11-09" }),
    freshEntry(p("1005002222223", "Hair Claw Big", 9000), { category: "hair", today: "2026-11-09" }),
  ], { today: "2026-11-16" });
  for (const e of Object.values(pool)) e.seen = "2026-11-16";
  const items = {
    "1005002222221": [["2026-11-06", 150], ["2026-11-09", 200], ["2026-11-16", 400]], // +100% a week, held
    "1005002222222": [["2026-11-09", 2000], ["2026-11-16", 2200]], // +10%
    "1005002222223": [["2026-11-09", 6000], ["2026-11-16", 9000]], // too big
  };
  const f = freshRisers(pool, items);
  assert.equal(f.tracking, 3);
  assert.deepEqual(f.risers.map((r) => r.id), ["1005002222221"]);
  assert.equal(f.risers[0].weekPct, 100);
  assert.equal(f.risers[0].ordersBefore, 200);
  assert.ok(f.risers[0].orders <= FRESH.maxOrders);
  // one reading only → nothing claimed; a jump the reading before did not show → not held
  assert.equal(freshRisers(pool, { "1005002222221": [["2026-11-16", 400]] }).risers.length, 0);
  assert.equal(freshRisers(pool, { "1005002222221": [["2026-11-06", 200], ["2026-11-09", 200], ["2026-11-16", 400]] }).risers.length, 0);
});

test("fresh: listings not seen for three weeks leave the pool", () => {
  const pool = { "1005003333331": { id: "1005003333331", seen: "2026-10-20", first: "2026-10-20" }, "1005003333332": { id: "1005003333332", seen: "2026-11-15", first: "2026-11-01" } };
  assert.deepEqual(Object.keys(mergeFreshPool(pool, [], { today: "2026-11-16" })), ["1005003333332"]);
});

test("fresh: the browser keeps only safe fields", () => {
  const b = sanitizeBoard({ at: "2026-11-16T05:40:00Z", concepts: [], record: {}, fresh: { tracking: 5, since: "2026-11-16", risers: [
    { id: "1005004444441", title: "Cloud Light", image: "https://ae01.alicdn.com/kf/a.jpg", buy: "https://s.click.aliexpress.com/e/_abc", check: "/magic?u=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1005004444441.html", weekPct: 80, orders: 300, ordersBefore: 150, from: "2026-11-09", to: "2026-11-16", known: { phrase: "cloud light", similar: 420 } },
    { id: "1005004444444", title: "No check", image: "https://ae01.alicdn.com/kf/c.jpg", buy: "https://s.click.aliexpress.com/e/_abe", weekPct: 90, orders: 300 },
    { id: "1005004444442", title: "x", image: "https://evil.example/a.jpg", buy: "https://s.click.aliexpress.com/e/_abd", weekPct: 80, orders: 300 },
    { id: "1005004444443", title: "x", image: "https://ae01.alicdn.com/kf/b.jpg", buy: "javascript:alert(1)", weekPct: 80, orders: 300 },
  ] } });
  assert.equal(b.fresh.tracking, 5);
  assert.deepEqual(b.fresh.risers.map((r) => r.id), ["1005004444441"]);
});

test("fresh: every riser shown is a call graded after 14 days, never edited", async () => {
  const { recordFresh, gradeFresh, freshRecord } = await import("../src/lib/growth/freshRisers.js");
  let calls = recordFresh([], [{ id: "1005005555551", title: "A", orders: 200 }, { id: "1005005555552", title: "B", orders: 100 }], "2026-11-16");
  calls = recordFresh(calls, [{ id: "1005005555551", title: "A", orders: 260 }], "2026-11-17");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].due, "2026-11-30");
  const items = { "1005005555551": [["2026-11-30", 320]], "1005005555552": [["2026-11-30", 110]] };
  assert.deepEqual(gradeFresh(calls, items, "2026-11-29"), calls); // not due yet
  const graded = gradeFresh(calls, items, "2026-11-30");
  assert.deepEqual(graded.map((c) => c.result), ["HIT", "MISS"]);
  assert.deepEqual(gradeFresh(graded, { "1005005555552": [["2026-12-01", 500]] }, "2026-12-01").map((c) => c.result), ["HIT", "MISS"]);
  assert.deepEqual(freshRecord(graded), { calls: 2, graded: 2, hits: 1, accuracy: 50, pending: 0, nextDue: null });
});

test("fresh: shown only when nobody has heard of it yet — few sellers, no buzz abroad, both read", () => {
  assert.equal(freshPhrase("2026 New Cute Cloud Night Light for Kids"), "cloud night"); // the store's generic words are skipped
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 420, suggestions: ["cloud light for bedroom", "cloud light kids"] }).unknown, true);
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 9000, suggestions: [] }).reason, "SATURATED");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: ["cloud light tiktok"] }).reason, "BUZZ");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: ["cloud light amazon"] }).reason, "BUZZ");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: null, suggestions: [] }).reason, "NOT_CHECKED");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: null }).reason, "NOT_CHECKED");
});
