// Shopping moments: the home page re-themes itself by the Israeli calendar.
// A moment is a fact about the date, never a demand claim, and products are
// matched only by their own fields.
import test from "node:test";
import assert from "node:assert/strict";
import { currentMoment, momentProducts, MOMENTS } from "../src/lib/moments.js";

const at = (iso) => Date.parse(`${iso}T09:00:00Z`);

test("Jewish holidays follow the Hebrew calendar", () => {
  assert.equal(currentMoment(at("2026-09-20")).id, "tishrei"); // Sukkot week 5787
  assert.equal(currentMoment(at("2026-12-07")).id, "hanukkah");
  assert.equal(currentMoment(at("2027-03-20")).id, "purim"); // Adar II 11
  assert.equal(currentMoment(at("2027-04-20")).id, "pesach");
});

test("fixed shopping dates and seasons", () => {
  assert.equal(currentMoment(at("2026-11-05")).id, "singles_day");
  assert.equal(currentMoment(at("2026-11-27")).id, "black_friday");
  assert.equal(currentMoment(at("2027-02-10")).id, "valentines");
  assert.equal(currentMoment(at("2027-08-20")).id, "back_to_school");
  assert.equal(currentMoment(at("2027-07-01")).id, "summer");
  assert.equal(currentMoment(at("2026-10-15")).id, "autumn");
  assert.equal(currentMoment(at("2027-05-10")).id, "spring");
});

test("every moment says it comes from the calendar and makes no demand claim", () => {
  const banned = /(חם עכשיו|הכי נמכר|רב[\s-]?מכר|כולם קונים|best[\s-]?sell|trending)/i;
  for (const m of MOMENTS) {
    assert.doesNotMatch(`${m.he.title} ${m.he.line} ${m.en.title} ${m.en.line}`, banned, m.id);
  }
  assert.equal(currentMoment(at("2026-10-15")).basis, "calendar");
});

test("products match by their own category and words only", () => {
  const products = [
    { id: "a", category: "Tech", title: "אוזניות" },
    { id: "b", category: "Fashion", title: "מעיל חורף" },
    { id: "c", category: "Pets", title: "צעצועים לכלבים" },
  ];
  const ids = momentProducts(currentMoment(at("2026-10-15")), products).map((p) => p.id);
  assert.deepEqual(ids, ["b"]); // category + "מעיל"; a plural ending alone ("ים") never matches
  assert.deepEqual(momentProducts(null, products), []);
});
