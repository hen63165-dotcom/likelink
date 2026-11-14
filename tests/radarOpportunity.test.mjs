// "Hot now" and the opportunity check (src/lib/growth/radarOpportunity.js): an item is HOT only when
// AliExpress's own 30-day orders accelerate between two readings 3+ days apart; a check that was not
// measured never counts as passed; the recommendation follows the stage, the Israel gap and the
// item's own momentum. The seed (the server's readings of the site's items) is real and parses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIONS, actionOf, addItemReading, itemMomentum, momentumLine, opportunityOf, siteHotness } from "../src/lib/growth/radarOpportunity.js";

test("momentum: never from one reading or two readings too close", () => {
  assert.equal(itemMomentum([["2026-11-13", 4000]]).state, "UNVERIFIED");
  assert.equal(itemMomentum([["2026-11-12", 4000], ["2026-11-13", 4600]]).state, "UNVERIFIED", "one day apart says nothing");
  assert.match(momentumLine(itemMomentum([])), /נמדד פעם אחת/);
});

test("momentum: accelerating orders are HOT, big and flat POPULAR, falling COOLING", () => {
  const week = (a, b) => itemMomentum([["2026-11-06", a], ["2026-11-13", b]]);
  assert.deepEqual([week(4128, 4684).state, week(4128, 4684).weekPct], ["HOT", 13.5]);
  assert.equal(week(11581, 12314).state, "POPULAR", "+6% a week on 12k orders: sells a lot, not rising");
  assert.equal(week(1700, 1712).state, "SLOW");
  assert.equal(week(3405, 3200).state, "COOLING");
  assert.equal(week(100, 200).state, "SLOW", "under 300 orders is never HOT");
  const s = addItemReading(addItemReading([], ["2026-11-13", 10]), ["2026-11-13", 12]);
  assert.deepEqual(s, [["2026-11-13", 12]], "one reading a day");
  assert.match(momentumLine(week(4128, 4684)), /6\.11.*13\.11.*\+13\.5%/);
});

test("the opportunity checklist: unmeasured is never passed, the rating is never a number", () => {
  const pick = { itemId: "1005000000000001", title: "x", image: "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg", buy: "https://s.click.aliexpress.com/e/_a", price: 9, shipsIL: true, video: null, commission: true };
  const o = opportunityOf(pick, { momentum: null, gap: { state: "UNKNOWN" }, stage: "UNVERIFIED" });
  assert.equal(o.checks.find((c) => c.id === "video").ok, null);
  assert.equal(o.checks.find((c) => c.id === "hot").ok, null);
  assert.equal(o.measured, o.checks.filter((c) => c.ok !== null).length);
  assert.ok(o.score <= 100 && o.score > 0);
  assert.doesNotMatch(JSON.stringify(o), /\d+(\.\d+)?%(?! ומעלה)/, "no rating or rate number");
  assert.equal(opportunityOf(null), null);
});

test("the recommendation", () => {
  assert.equal(actionOf({ stage: "EMERGING", window: "OPEN", pick: {} }), "PUBLISH_NOW");
  assert.equal(actionOf({ stage: "RISING", window: "CLOSING", pick: {} }), "PUBLISH_FAST");
  assert.equal(actionOf({ stage: "RISING", gap: { state: "ARRIVED" }, pick: {} }), "ANGLE");
  assert.equal(actionOf({ stage: "PEAK", gap: { state: "ARRIVED" }, pick: {} }), "SATURATED");
  assert.equal(actionOf({ stage: "UNVERIFIED", pick: {}, momentum: { state: "HOT" } }), "HOT_ITEM");
  assert.equal(actionOf({ stage: "UNVERIFIED", pick: null }), "WAIT");
  assert.equal(actionOf({ stage: "STEADY", pick: null }), "NO_PICK");
  assert.equal(actionOf({ stage: "RISING", window: "OPEN", pick: {}, momentum: { state: "COOLING" } }), "NOT_NOW", "a cooling item is never pushed");
  for (const k of Object.keys(ACTIONS)) assert.doesNotMatch(ACTIONS[k], /בטוח|מובטח|יהיה להיט/);
});

test("the site's own products: the real seed parses and ranks hot items first", () => {
  const seed = JSON.parse(readFileSync("scripts/catalog/radar-seed/momentum-2026-11-13.json", "utf8"));
  assert.match(seed.source, /deals:momentum/);
  const items = seed.items;
  const products = Object.keys(items).map((id) => ({ id: `ae-${id}`, itemId: id, title: id }));
  const h = siteHotness(products, items);
  assert.equal(h.checked, Object.keys(items).length);
  assert.equal(h.rows[0].state, "HOT");
  assert.ok(h.counts.HOT >= 1 && h.counts.UNVERIFIED >= 1);
  assert.deepEqual(siteHotness([{ id: "../x", itemId: "1" }], items).checked, 0, "bad ids are skipped");
});
