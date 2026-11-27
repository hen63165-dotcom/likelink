// 🚀 The takeoff (src/lib/growth/radarTakeoff.js): small new listings nobody has heard of, sealed every
// morning with the simple ranking's and chance's picks, graded by the store's own orders after 7 days.
import test from "node:test";
import assert from "node:assert/strict";
import { TAKEOFF, TAKEOFF_LAB, TAKEOFF_LINE, cleanTakeoff, gradeTakeoff, recordTakeoff, takeoffOpenIds, takeoffOrders, takeoffPool, takeoffRecord, takeoffSealText, takeoffSheet } from "../src/lib/growth/radarTakeoff.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { BOOKS, INSTRUMENTS } from "../src/lib/growth/radarCore.js";

const IMG = "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg";
const BUY = "https://s.click.aliexpress.com/e/_abc";
const day = (n) => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10);

// 80 small listings: 1005000…: a steady pace; a few run fast.
function world() {
  const items = {};
  const pool = {};
  for (let i = 0; i < 80; i++) {
    const id = `10050000${String(i).padStart(4, "0")}`;
    const start = 20 + i;
    const g = i < 6 ? 1.6 : 1.02;
    items[id] = [[day(13), start], [day(20), Math.round(start * g)], [day(27), Math.round(start * g * (i < 6 ? 2.2 : 1.05))]];
    pool[id] = { title: `New silicone thing model ${i}`, image: IMG, link: BUY, price: 12.5 };
  }
  pool["100500009999"] = { title: "Christmas tree ornament set", image: IMG, link: BUY };
  items["100500009999"] = [[day(13), 30], [day(20), 90]];
  pool["100500009998"] = { title: "Big seller", image: IMG, link: BUY };
  items["100500009998"] = [[day(13), 900], [day(20), 1200]];
  return { items, pool };
}

test("the pool holds only small new listings with a measured pace, never a holiday listing", () => {
  const { items, pool } = world();
  const p = takeoffPool(pool, items, day(20));
  assert.equal(p.length, 80);
  assert.ok(p.every((x) => x.o >= TAKEOFF.minO && x.o <= TAKEOFF.maxO));
  assert.ok(!p.some((x) => x.id === "100500009999"), "a holiday listing is never a takeoff candidate");
  assert.ok(!p.some((x) => x.id === "100500009998"), "a big seller is not small");
});

test("the radar's pick keeps only what nobody has heard of; the ranking and chance pick from the same pool", () => {
  const { items, pool } = world();
  const p = takeoffPool(pool, items, day(20));
  const order = takeoffOrders(p, day(20)).radar;
  const checks = Object.fromEntries(order.slice(0, 8).map((x, i) => [x.id, { unknown: i % 2 === 0, phrase: "silicone thing", similar: 120 + i }]));
  const sheet = takeoffSheet(p, day(20), checks);
  assert.equal(sheet.picks.radar.length, 4);
  assert.ok(sheet.picks.radar.every((id) => checks[id].unknown));
  assert.equal(sheet.picks.rank.length, TAKEOFF.k);
  assert.equal(sheet.picks.random.length, TAKEOFF.k);
  for (const id of Object.values(sheet.picks).flat()) assert.ok(Number.isFinite(sheet.base[id]));
  assert.equal(sheet.info[sheet.picks.radar[0]].phrase, "silicone thing");
  // No check said unknown → no sheet (a quiet day stays quiet).
  assert.equal(takeoffSheet(p, day(20), {}), null);
});

test("the sealed text is item numbers and base orders only, and matches the sanitizer's book rule", () => {
  const { items, pool } = world();
  const p = takeoffPool(pool, items, day(20));
  const checks = Object.fromEntries(p.map((x) => [x.id, { unknown: true }]));
  const text = takeoffSealText(takeoffSheet(p, day(20), checks));
  assert.match(text, new RegExp(`^${TAKEOFF_LINE}(\\n${TAKEOFF_LINE})*$`));
  assert.ok(!/silicone|https?:/.test(text));
});

test("a pick is graded after 7 days by a doubling of its orders; a missing reading waits, then is left out", () => {
  const { items, pool } = world();
  const p = takeoffPool(pool, items, day(20));
  const checks = Object.fromEntries(p.map((x) => [x.id, { unknown: true }]));
  let st = recordTakeoff({}, takeoffSheet(p, day(20), checks), day(20));
  assert.deepEqual(takeoffOpenIds(st).length > 0, true);
  st = gradeTakeoff(st, items, day(26));
  assert.equal(st.days[day(20)].graded, null, "not before its day");
  st = gradeTakeoff(st, items, day(27));
  const g = st.days[day(20)].graded;
  assert.ok(g, "graded on its day");
  // The six fast listings doubled in the last week; the radar's z order puts five of them first.
  assert.equal(g.radar.hits, 5);
  assert.equal(g.radar.of, TAKEOFF.k);
  const again = gradeTakeoff(st, { ...items, [Object.keys(items)[0]]: [] }, day(28));
  assert.deepEqual(again.days[day(20)].graded, g, "a grade is never edited");
  assert.equal(takeoffOpenIds(st).length, 0);
  // A pick with no reading on its day waits up to unreadDays.
  const missing = { ...items };
  for (const id of st.days[day(20)].picks.radar) missing[id] = missing[id].slice(0, 2);
  let st2 = recordTakeoff({}, takeoffSheet(p, day(20), checks), day(20));
  st2 = gradeTakeoff(st2, missing, day(27));
  assert.equal(st2.days[day(20)].graded, null);
  st2 = gradeTakeoff(st2, missing, day(30));
  assert.equal(st2.days[day(20)].graded.radar.of, 0);
});

test("the record gives each side's takeoffs and the live scoreboard of the radar's picks", () => {
  const { items, pool } = world();
  const p = takeoffPool(pool, items, day(20));
  const checks = Object.fromEntries(p.map((x) => [x.id, { unknown: true, phrase: "silicone thing", similar: 140 }]));
  const st = gradeTakeoff(recordTakeoff({}, takeoffSheet(p, day(20), checks), day(20)), items, day(27));
  const r = takeoffRecord(st, items, day(27));
  assert.equal(r.graded, 1);
  assert.equal(r.radar.hits, 5);
  assert.equal(r.live.length, TAKEOFF.k);
  const top = r.live[0];
  assert.equal(top.called, day(20));
  assert.equal(top.due, day(27));
  assert.equal(top.open, false);
  assert.ok(top.mult >= 2);
  // Open sheets show day N and no grade.
  const open = takeoffRecord(recordTakeoff({}, takeoffSheet(p, day(20), checks), day(20)), items, day(23));
  assert.equal(open.live[0].open, true);
  assert.equal(open.live[0].dayN, 3);
  assert.equal(open.nextDue, day(27));
});

test("the browser's copy keeps only store links and store photos; the lock hides open picks", () => {
  const dirty = cleanTakeoff({ sheets: 1, live: [{ id: "1005000000001", called: day(20), due: day(27), open: true, buy: "https://evil.example/x", image: "javascript:alert(1)", title: "x" }, { id: "1005000000002", called: day(20), due: day(27), open: false, buy: BUY, image: IMG, title: "y", mult: 2.3 }] });
  assert.equal(dirty.live[0].buy, null);
  assert.equal(dirty.live[0].image, null);
  assert.equal(dirty.live[1].buy, BUY);
  const board = { at: `${day(27)}T06:00:00Z`, concepts: [], record: { calls: 0, graded: 0, hits: 0, recent: [] }, takeoff: { sheets: 1, graded: 1, radar: { hits: 1, of: 5 }, rank: { hits: 0, of: 5 }, random: { hits: 0, of: 5 }, live: [{ id: "1005000000001", called: day(27), due: day(34), open: true, title: "secret", buy: BUY, image: IMG }, { id: "1005000000002", called: day(20), due: day(27), open: false, title: "graded", buy: BUY, image: IMG, mult: 2.1 }], seal: { d: day(27), sha256: "a".repeat(64), count: 4, text: "takeoff|2026-11-27|v1|h7|n80" } } };
  const teaser = teaserBoard(board);
  assert.equal(teaser.takeoff.openCount, 1);
  assert.ok(!JSON.stringify(teaser.takeoff).includes("secret"), "an open pick never reaches a locked visitor");
  assert.ok(JSON.stringify(teaser.takeoff).includes("graded"));
  const clean = sanitizeBoard(board);
  assert.equal(clean.takeoff.live.length, 2);
});

test("the takeoff is an instrument with its own sealed book, and the lab's numbers are the run's", () => {
  assert.ok(INSTRUMENTS.some((i) => i.id === "takeoff" && i.tab === "today"));
  assert.ok(BOOKS.includes("takeoff"));
  assert.equal(TAKEOFF_LAB.caught <= TAKEOFF_LAB.doubled, true);
  assert.equal(TAKEOFF_LAB.doubled, 6);
  assert.equal(TAKEOFF_LAB.pool, 1529);
});
