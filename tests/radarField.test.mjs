// 🏟️ One by one (radarField.js): every company in its own words with its source and the day it was read;
// the radar's side only from the board (never typed in); no "number one", "the only", "best" or a promise.
import test from "node:test";
import assert from "node:assert/strict";
import { FIELD, FIELD_CHECKED, fieldView, radarSide } from "../src/lib/growth/radarField.js";

test("every company has its own words, its source and an open door or none", () => {
  assert.match(FIELD_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(FIELD.length >= 12);
  assert.equal(new Set(FIELD.map((c) => c.id)).size, FIELD.length);
  for (const c of FIELD) {
    assert.match(c.src, /^https:\/\//, `${c.name}: a source`);
    assert.ok(c.he && c.en, `${c.name}: what it does, in both languages`);
    assert.ok([null, "google", "rivals"].includes(c.race));
    for (const t of [c.he, c.en, c.claimHe || "", c.claimEn || ""]) {
      assert.doesNotMatch(t, /מספר 1|היחיד|הכי טוב|מובטח|number one|the only|the best|guarantee/i, `${c.name}: never a ranking or a promise`);
    }
  }
  assert.ok(FIELD.some((c) => c.id === "google-trends") && FIELD.some((c) => c.id === "exploding-topics"));
});

test("the radar's side is read from the board, and an empty board says nothing", () => {
  const empty = radarSide({});
  assert.equal(empty.google, null);
  assert.equal(empty.rivals, null);
  assert.equal(empty.books, 0);
  const board = {
    at: "2026-11-27T05:40:00Z",
    ledger: { d: "2026-11-27", sha256: "a".repeat(64), text: `early=${"b".repeat(64)}\nfresh=${"c".repeat(64)}` },
    anchors: { days: 9, list: [{ d: "2026-11-26", height: 925000 }] },
    googleRace: { all: { read: 9, ahead: 0, googleFirst: 0, quiet: 4, lateRead: 5 }, since: { box: "2026-11-27" } },
    rivals: { all: { compared: 1, ahead: 0, rivalFirst: 0, quiet: 1, beforeTracking: 8 } },
  };
  const s = radarSide(board);
  assert.equal(s.books, 2);
  assert.equal(s.block, 925000);
  assert.equal(s.sealedDays, 9);
  assert.deepEqual(s.google, { read: 9, ahead: 0, googleFirst: 0, quiet: 4, lateRead: 5, since: "2026-11-27" });
  const v = fieldView(board);
  assert.equal(v.rows.find((r) => r.id === "google-trends").measured.quiet, 4);
  assert.equal(v.rows.find((r) => r.id === "fastmoss").measured.beforeTracking, 8);
  assert.equal(v.rows.find((r) => r.id === "wgsn").measured, null, "a closed company has no race");
});
