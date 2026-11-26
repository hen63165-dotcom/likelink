// 🔎 The radar's evidence (src/lib/growth/radarEvidence.js; the owner, 22.11: an outside check could not
// get the daily order history behind the radar's calls): every graded call with the store readings that
// graded it, an open call only while the board is open, and nothing that is not a store item.
import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE, evidenceOf } from "../src/lib/growth/radarEvidence.js";

const items = {
  "1005013201890326": [["2026-11-01", 10], ["2026-11-10", 60], ["2026-11-20", 178], ["2026-12-04", 300]],
  "1005010439451200": [["2026-11-16", 502], ["2026-11-22", 888]],
};
const calls = [
  { id: "1005013201890326", title: "pants", at: "2026-11-20", base: 178, due: "2026-12-04", result: "HIT", growth: 68.5, gradedAt: "2026-12-04", f: { secret: 1 } },
  { id: "1005010439451200", title: "watch", at: "2026-11-22", base: 888, due: "2026-12-06" },
  { id: "<script>", at: "2026-11-22", result: "HIT" },
];

test("evidence: graded calls always, with the readings from 14 days before the call", () => {
  const e = evidenceOf({ freshCalls: calls, items, open: false, today: "2026-12-04" });
  assert.equal(e.v, EVIDENCE.v);
  assert.deepEqual(e.calls.map((c) => c.id), ["1005013201890326"], "an open call stays hidden while the board is locked; junk ids never");
  const c = e.calls[0];
  assert.deepEqual(c.readings, [["2026-11-10", 60], ["2026-11-20", 178], ["2026-12-04", 300]]);
  assert.equal(c.result, "HIT");
  assert.equal(c.page, "https://www.aliexpress.com/item/1005013201890326.html");
  assert.equal(c.f, undefined, "the brain's private features never leave");
  assert.deepEqual(e.record, { calls: 1, graded: 1, hits: 1, open: 0 });
});

test("evidence: open calls too while the board is open", () => {
  const e = evidenceOf({ freshCalls: calls, items, open: true, today: "2026-11-22" });
  assert.deepEqual(e.calls.map((c) => c.id), ["1005013201890326", "1005010439451200"]);
  assert.equal(e.calls[1].result, null);
  assert.deepEqual(e.record, { calls: 2, graded: 1, hits: 1, open: 1 });
  assert.deepEqual(evidenceOf({}).calls, []);
});
