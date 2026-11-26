// 🏭 Before the first sale (listingWave.js): the store's newest listings nobody has bought yet, counted
// by DIFFERENT stores per product phrase. A phrase many stores start listing this week, far above their
// pace before, is a wave; a wave still before its sales is sealed and graded by the store's own orders.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRELAUNCH, cleanPrelaunch, gradeWaveCalls, listingWaves, mergeListings, phraseDemand, phrasesFor, prelaunchBoard, prelaunchEntry, prelaunchSealText, prunePrelaunch, recordWaveCalls, waveDueQueue, waveRecord, waveSkip } from "../src/lib/growth/listingWave.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { feedEntries } from "../src/lib/growth/radarFeed.js";
import { BOOKS, INSTRUMENTS, SECTION_TABS } from "../src/lib/growth/radarCore.js";

const day = (n) => new Date(Date.parse("2026-11-01T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const item = (id, title, shop, orders = 0) => ({ product_id: String(1_000_000_000 + Number(id)), product_title: title, shop_id: String(shop), lastest_volume: orders });

test("a listing before its first sales: under 10 orders, its store's id, never a brand or a holiday", () => {
  assert.deepEqual(prelaunchEntry(item(1, "2026 New Jelly Ring Cute Resin", 9001, 0)), { id: "1000000001", title: "2026 New Jelly Ring Cute Resin", shop: "9001", orders: 0 });
  assert.equal(prelaunchEntry(item(1000000002, "Jelly Ring", 9001, 10)), null, "ten orders are already sales");
  assert.equal(prelaunchEntry(item(1000000003, "Christmas Tree Jelly Ring", 9001, 0)), null, "a holiday listing returns every year");
  assert.equal(prelaunchEntry(item(1000000004, "Nike Style Jelly Ring", 9001, 0)), null);
  assert.equal(prelaunchEntry({ product_id: "1000000005", product_title: "Jelly Ring", lastest_volume: 0 }).shop, null, "no store id: kept, never counted as a store");
});

test("the product phrases leave out the area's own search words", () => {
  assert.deepEqual(phrasesFor("Women Rings 2026 New Jelly Ring Cute", "women rings"), ["rings jelly", "jelly ring"], "filler words (women, new, cute) never make a phrase");
  assert.ok(!phrasesFor("Women Rings Jelly", "women ring").includes("women rings"));
});

test("a store counts once per phrase, on the first day it listed it; an area's first reading only seeds", () => {
  let s = {};
  s = mergeListings(s, [prelaunchEntry(item(1, "Jelly Ring Cute", 111)), prelaunchEntry(item(2, "Jelly Ring Cute", 112))], { today: day(0), area: "rings" }).state;
  assert.deepEqual(s.ps, {}, "everything looks new on the first day: nothing counted");
  assert.equal(Object.keys(s.seen).length, 2);
  const m = mergeListings(s, [prelaunchEntry(item(3, "Jelly Ring Cute", 113)), prelaunchEntry(item(4, "Jelly Ring Bold", 113)), prelaunchEntry(item(1, "Jelly Ring Cute", 111))], { today: day(1), area: "rings" });
  assert.equal(m.fresh, 2, "a listing already seen is not new again");
  assert.deepEqual(m.state.ps["jelly ring"], { 113: day(1) }, "one store with two listings counts once");
  const n = mergeListings(m.state, [prelaunchEntry(item(5, "Jelly Ring Cute", 113))], { today: day(2), area: "rings" });
  assert.deepEqual(n.state.ps["jelly ring"], { 113: day(1) }, "the store's first day is kept");
});

function grow(stores, start, end) {
  // `stores` new stores a day list "jelly ring" from day `start` to `end`; "phone case" every day at a steady pace.
  let s = {};
  let id = 100;
  for (let d = 0; d <= end; d++) {
    const list = [];
    for (let k = 0; k < 2; k++) list.push(prelaunchEntry(item(id++, "Phone Case Clear", 5000 + d * 2 + k)));
    if (d >= start) for (let k = 0; k < stores; k++) list.push(prelaunchEntry(item(id++, "Jelly Ring Cute", 7000 + d * 10 + k)));
    s = mergeListings(s, list, { today: day(d), area: "all" }).state;
  }
  return s;
}

test("a wave: many different stores this week, far above their pace before; a steady phrase is no wave", () => {
  const s = grow(2, 14, 17);
  const w = listingWaves(s, day(17));
  assert.equal(w.measuring, false);
  const jelly = w.waves.find((x) => x.phrase === "jelly ring");
  assert.ok(jelly, "8 new stores in 4 days, none before");
  assert.equal(jelly.week, 8);
  assert.equal(jelly.before, 0);
  assert.ok(!w.waves.some((x) => x.phrase === "phone case"), "two new stores a day, every day: its usual pace");
  assert.equal(listingWaves(grow(2, 3, 6), day(6)).measuring, true, "under 10 days read: measuring, never a wave");
  assert.ok(!listingWaves(s, day(17), { skip: waveSkip([{ en: "jelly ring" }]) }).waves.some((x) => x.phrase === "jelly ring"), "a kind the radar watches is skipped");
});

test("one store listing a phrase many times is never a wave", () => {
  let s = {};
  let id = 1;
  for (let d = 0; d <= 16; d++) {
    const list = [prelaunchEntry(item(id++, "Phone Case Clear", 5000 + d))];
    if (d >= 12) for (let k = 0; k < 10; k++) list.push(prelaunchEntry(item(id++, "Jelly Ring Cute", 7777)));
    s = mergeListings(s, list, { today: day(d), area: "all" }).state;
  }
  assert.ok(!listingWaves(s, day(16)).waves.some((x) => x.phrase === "jelly ring"));
});

test("the store's own orders for a phrase count only listings that name both its words", () => {
  assert.deepEqual(phraseDemand("jelly ring", [{ product_title: "Jelly Rings Set", lastest_volume: 40 }, { product_title: "Jelly Bracelet", lastest_volume: 900 }, { product_title: "Cute jelly ring", lastest_volume: "12" }]), { items: 2, orders: 52 });
});

test("a call only for a wave still before its sales; one open call per phrase; graded by the sales, never edited", () => {
  const today = day(17);
  const waves = [
    { phrase: "jelly ring", week: 8, before: 0, demand: { items: 4, orders: 60 }, check: { unknown: true, reason: "UNKNOWN", similar: 120 } },
    { phrase: "phone strap", week: 9, before: 1, demand: { items: 30, orders: 4000 }, check: { unknown: true, reason: "UNKNOWN", similar: 900 } },
    { phrase: "cloud lamp", week: 7, before: 0, demand: { items: 3, orders: 20 }, check: { unknown: false, reason: "BUZZ", similar: 300 } },
    { phrase: "foam slide", week: 6, before: 0, demand: null, check: { unknown: false, reason: "NOT_CHECKED", similar: null } },
  ];
  let calls = recordWaveCalls([], waves, { today });
  assert.deepEqual(calls.map((c) => c.phrase), ["jelly ring"], "already selling, buzzing or unread: no call");
  assert.equal(calls[0].due, day(38));
  assert.equal(calls[0].base, 60);
  assert.equal(recordWaveCalls(calls, waves, { today: day(18) }).length, 1, "one open call per phrase");
  assert.deepEqual(waveDueQueue(calls, day(37)), []);
  assert.deepEqual(waveDueQueue(calls, day(38)), ["jelly ring"]);
  const hit = gradeWaveCalls(calls, { "jelly ring": { items: 9, orders: 310 } }, { today: day(38) });
  assert.equal(hit[0].result, "HIT", "300 orders at least, and 3 times the base of 60");
  assert.equal(hit[0].target, 300);
  assert.equal(gradeWaveCalls(hit, { "jelly ring": { orders: 0 } }, { today: day(39) })[0].result, "HIT", "a grade is never edited");
  const big = [{ ...calls[0], base: 200 }];
  assert.equal(gradeWaveCalls(big, { "jelly ring": { orders: 500 } }, { today: day(38) })[0].result, "MISS", "under 3 times its base of 200");
  assert.equal(gradeWaveCalls(calls, {}, { today: day(41) })[0].result ?? null, null, "unread: tried again up to three days past due");
  assert.equal(gradeWaveCalls(calls, {}, { today: day(42) })[0].result, "UNREAD");
  const rec = waveRecord(gradeWaveCalls(calls, {}, { today: day(42) }));
  assert.equal(rec.graded, 0, "an unread call is never counted");
  assert.equal(rec.unread, 1);
  const many = recordWaveCalls([], Array.from({ length: 6 }, (_, i) => ({ phrase: `jelly ring${"x".repeat(i)}`, week: 6, before: 0, demand: { items: 3, orders: 10 }, check: { unknown: true, similar: 10 } })), { today });
  assert.equal(many.length, PRELAUNCH.perDay);
});

test("every call is sealed, misses included; the board keeps it, behind the lock only counts and the record", () => {
  const calls = [{ phrase: "jelly ring", at: day(17), stores: 8, before: 0, base: 60, similar: 120, due: day(38) }, { phrase: "cloud lamp", at: day(10), stores: 5, before: 0, base: 20, similar: 40, due: day(31), result: "MISS", orders: 90, target: 300, graded: day(31) }];
  const text = prelaunchSealText(calls);
  assert.equal(text, `cloud lamp|${day(10)}|5|0|20|40|${day(31)}|MISS\njelly ring|${day(17)}|8|0|60|120|${day(38)}|-`);
  const doc = prelaunchBoard({ calls, ps: { "jelly ring": {} }, days: [day(17)] }, { day: day(17), waves: { days: 17, measuring: false, waves: [{ phrase: "jelly ring", week: 8, before: 0, times: 16 }] }, checked: [{ phrase: "jelly ring", demand: { orders: 60 }, check: { reason: "UNKNOWN", similar: 120 } }], areas: 41, read: 41, answered: 40, listings: 1900, fresh: 300, stores: 210, seal: { d: day(17), sha256: "b".repeat(64), count: 2, text, ots: [] } });
  const board = sanitizeBoard({ at: `${day(17)}T05:00:00Z`, concepts: [], record: {}, prelaunch: doc });
  assert.equal(board.prelaunch.waves[0].state, "UNKNOWN");
  assert.equal(board.prelaunch.waves[0].demand, 60);
  assert.equal(board.prelaunch.seal.text, text, "the sealed text is kept so anyone can recompute it");
  assert.equal(board.prelaunch.record.graded, 1);
  assert.equal(board.prelaunch.open[0].phrase, "jelly ring");
  const teaser = teaserBoard(board);
  assert.deepEqual(teaser.prelaunch.open, [], "behind the lock an open call's phrase stays sealed");
  assert.deepEqual(teaser.prelaunch.waves, []);
  assert.equal(teaser.prelaunch.wavesToday, 1);
  assert.equal(teaser.prelaunch.seal.text, undefined);
  assert.equal(teaser.prelaunch.graded[0].phrase, "cloud lamp", "a graded call is public, misses included");
  assert.equal(cleanPrelaunch({ waves: [{ phrase: "<b>x</b> y" }] }).waves.length, 0);
  const feed = feedEntries({ at: `${day(17)}T05:00:00Z`, concepts: [], record: {}, prelaunch: doc });
  assert.ok(feed.some((e) => e.id === `prelaunch/jelly ring/${day(17)}`), "the public feed says it the day it is sealed");
  assert.ok(feed.some((e) => e.title === "Graded MISS: before the first sale, cloud lamp"), "misses included");
  assert.ok(!feedEntries(teaserBoard(board)).some((e) => e.id.startsWith("prelaunch/")), "behind the lock the feed names no open call");
});

test("old store dates leave; a phrase only one store listed leaves after a week", () => {
  const s = prunePrelaunch({ seen: { 1: day(0), 2: day(30) }, ps: { "jelly ring": { 1: day(25), 2: day(29) }, "cloud lamp": { 3: day(20) }, "old one": { 4: day(1), 5: day(2) } }, days: [day(0), day(30)] }, day(30));
  assert.deepEqual(Object.keys(s.seen), ["2"]);
  assert.deepEqual(Object.keys(s.ps), ["jelly ring"]);
  assert.deepEqual(s.days, [day(30)]);
});

test("the run reads it, the root seals it, the page shows it in today's tab", () => {
  assert.ok(BOOKS.includes("prelaunch"));
  assert.equal(SECTION_TABS.prelaunch, "today");
  assert.ok(INSTRUMENTS.find((i) => i.id === "prelaunch").whatHe);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_PRELAUNCH !== "0"/);
  assert.match(run, /sort: "LAST_VOLUME_ASC"/);
  assert.match(run, /prelaunch: board\.prelaunch\?\.seal\?\.sha256/);
  assert.match(run, /late\("prelaunch"/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<Prelaunch p=\{board\.prelaunch\} gated=\{gated\} \/>/);
  assert.match(page, /id="prelaunch"/);
});
