// 🔁 Check it yourself (radarVerify.js): the visitor's browser recomputes every book against the root and
// grades every graded call again from the open evidence. A changed byte, a moved grade, a missing reading:
// each is caught and named, never counted as checked.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BOOK_SEALS, regradeCall, regradeEvidence, sha256Hex, verifyBooks } from "../src/lib/growth/radarVerify.js";
import { ledgerText } from "../src/lib/growth/radarLedger.js";
import { evidenceOf } from "../src/lib/growth/radarEvidence.js";
import { BOOKS } from "../src/lib/growth/radarCore.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");

test("the browser's hash is SHA-256, the same as the run's", async () => {
  assert.equal(await sha256Hex("radar"), sha("radar"));
  assert.deepEqual(Object.keys(BOOK_SEALS).filter((k) => !BOOKS.includes(k)), [], "every checked book is a book of the root");
});

test("every book against its fingerprint and the root; a changed byte is named", async () => {
  const fresh = "1005|2026-11-20|82|2026-12-04|-";
  const luck = `cat|2026-11-20|900|2026-12-04|-|${"a".repeat(64)}`;
  const root = ledgerText({ luck: sha(luck), fresh: sha(fresh), baseline: sha("x") });
  const board = { ledger: { d: "2026-11-26", sha256: sha(root), text: root }, fresh: { seal: { sha256: sha(fresh), text: fresh } }, luck: { seal: { sha256: sha(luck), text: luck } }, baseline: { seal: { sha256: sha("x"), text: null } } };
  const ok = await verifyBooks(board);
  assert.equal(ok.root.ok, true);
  assert.equal(ok.checked, 2);
  assert.equal(ok.matched, 2);
  assert.deepEqual(ok.broken, []);
  assert.deepEqual(ok.unpublished, ["baseline"], "a text too long to publish is said so, never counted as checked");
  const tampered = await verifyBooks({ ...board, fresh: { seal: { sha256: sha(fresh), text: fresh.replace("82", "83") } } });
  assert.deepEqual(tampered.broken, ["fresh"]);
  const moved = await verifyBooks({ ...board, ledger: { ...board.ledger, text: root.replace(sha(fresh), sha("other")) } });
  assert.equal(moved.root.ok, false, "the root's own text must hash to its seal");
  assert.deepEqual(moved.broken, ["fresh"], "a book whose fingerprint is off the root is named");
});

test("every graded call is graded again from the store's readings, by the file's own rule", () => {
  assert.deepEqual(regradeCall({ base: 100, due: "2026-12-04", readings: [["2026-12-01", 140], ["2026-12-05", 151], ["2026-12-04", 149]] }, 50), { state: "GRADED", result: "MISS", growth: 49, on: "2026-12-04" });
  assert.equal(regradeCall({ base: 100, due: "2026-12-04", readings: [["2026-12-01", 200]] }, 50).state, "UNREADABLE");
  const items = { 1000001: [["2026-11-20", 82], ["2026-12-04", 200]], 1000002: [["2026-11-20", 100], ["2026-12-04", 110]], 2000001: [["2026-11-20", 50], ["2026-12-04", 90]] };
  const ev = evidenceOf({
    freshCalls: [{ id: "1000001", at: "2026-11-20", due: "2026-12-04", base: 82, result: "HIT", growth: 143.9 }, { id: "1000002", at: "2026-11-20", due: "2026-12-04", base: 100, result: "HIT", growth: 10 }],
    items, today: "2026-12-04",
    baseline: { naive: [{ id: "2000001", at: "2026-11-20", due: "2026-12-04", base: 50, result: "HIT", rebuilt: "2026-11-26" }], random: [] },
  });
  assert.equal(ev.baseline.naive[0].rebuilt, "2026-11-26", "a rebuilt pick says so in the evidence");
  const r = regradeEvidence(ev);
  assert.equal(r.hitPct, 50);
  assert.deepEqual(r.books.fresh, { graded: 2, matched: 1, differ: ["1000002"], unreadable: 0, hits: 2 }, "a grade the readings do not support is named");
  assert.deepEqual(r.books.naive, { graded: 1, matched: 1, differ: [], unreadable: 0, hits: 1 });
  assert.equal(regradeEvidence({ calls: [] }), null, "no rule in the file: nothing is graded");
});

test("the page runs it in the proof tab and the deploy publishes the evidence next to the board", () => {
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<VerifyYourself board=\{board\} \/>/);
  assert.match(page, /id="verify"/);
  const deploy = readFileSync(".github/workflows/deploy-frontend.yml", "utf8");
  assert.match(deploy, /evidence-public\.json dist\/radar\/evidence\.json/);
  const state = readFileSync("scripts/catalog/radar-state.mjs", "utf8");
  assert.match(state, /baseline: files\["baseline\.json"\]/);
});
