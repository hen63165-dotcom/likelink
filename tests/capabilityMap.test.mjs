// 🗺️ The capability map (radarCore.js capabilityMap; the owner's mission, 21.11, phase 2): five classes,
// computed from the latest run's board only. A source is "working and verified" only when its state,
// checked against the run receipt, is OK with errors under a tenth of its requests; an instrument only
// when its calls have been graded; nothing in the map is declared by hand.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAPABILITY_CLASSES, SOURCES, capabilityMap } from "../src/lib/growth/radarCore.js";
import { METERED } from "../src/lib/growth/runReceipt.js";

const board = {
  at: "2026-11-21T14:50:00Z",
  sourcesToday: { aliexpress: "OK", suggest: "OK", worldSearch: "OK", pinterest: "REQUIRES_CONNECTION", engine_baidu: "ROBOTS_DISALLOW_OR_FAILED", trendsIL: "FAILED", youtube: "EMPTY", world: { categories: 564, asked: 120, readToday: 117, withItems: 96, verified: 90, empty: 21, failed: 3 } },
  receipt: { started: "2026-11-21T14:19:00.000Z", sources: { aliexpress: { asked: 1000, answered: 950, empty: 30, refused: 15, failed: 5, kept: 4000 }, worldSearch: { asked: 100, answered: 70, empty: 0, refused: 30, failed: 0 }, suggest: { asked: 50, answered: 50, empty: 0, refused: 0, failed: 0, kept: 50 } } },
  record: { calls: 3, graded: 2, hits: 1, pending: 1 },
  fresh: { record: { calls: 4, graded: 0, hits: 0, pending: 4, nextDue: "2026-12-04" } },
  ledger: { d: "2026-11-21", sha256: "a".repeat(64), text: `stages=${"b".repeat(64)}\nfresh=${"c".repeat(64)}\nprices=${"d".repeat(64)}\nrun=${"e".repeat(64)}` },
};

test("five classes, each source and instrument placed by the run's own evidence", () => {
  const map = capabilityMap(board);
  const cls = Object.fromEntries(map.rows.map((r) => [`${r.kind}:${r.key}`, r.cls]));
  assert.equal(cls["source:aliexpress"], "LIVE", "OK and 2% errors");
  assert.equal(cls["source:suggest"], "LIVE");
  assert.equal(cls["source:worldSearch"], "PARTIAL", "OK, but 30% of its requests were refused");
  assert.equal(cls["source:world"], "LIVE");
  assert.equal(cls["source:pinterest"], "NOT_CONNECTED");
  assert.equal(cls["source:engine_baidu"], "UNRELIABLE", "closed by its own rules");
  assert.equal(cls["source:trendsIL"], "UNRELIABLE");
  assert.equal(cls["source:youtube"], "UNRELIABLE", "answered empty");
  assert.equal(cls["instrument:stages"], "LIVE", "graded calls exist");
  assert.equal(cls["instrument:fresh"], "PARTIAL", "running and sealed, no grade yet");
  assert.deepEqual(map.rows.find((r) => r.key === "fresh" && r.kind === "instrument").why, { firstCheck: "2026-12-04" });
  assert.equal(cls["instrument:run"], "LIVE", "the receipt is sealed in today's root");
  for (const d of ["tiktok", "amazon", "reddit", "shopify"]) assert.equal(cls[`door:${d}`], "MISSING");
  assert.equal(Object.values(map.counts).reduce((a, b) => a + b, 0), map.rows.length);
  assert.deepEqual(Object.keys(CAPABILITY_CLASSES), ["LIVE", "NOT_CONNECTED", "UNRELIABLE", "PARTIAL", "MISSING"]);
});

test("an empty board proves nothing: no source is LIVE without a run", () => {
  const map = capabilityMap({});
  assert.equal(map.rows.filter((r) => r.cls === "LIVE").length, 0);
});

test("one registry for the sources: every data host the run meters is a source the page names", () => {
  const named = new Set(SOURCES.map((s) => s.key));
  const helpers = new Set(["site", "seal", "bitcoin", "rules", "other"]);
  for (const k of METERED) assert.ok(named.has(k) || helpers.has(k), `${k} is metered and named on the page`);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<CapabilityMap board=\{board\} \/>/);
});
