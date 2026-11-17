// The complete sealed ledger (src/lib/growth/radarLedger.js; the owner, 2026-11-17: "a million levels
// above everyone"). The worldwide check that day: the big trend companies publish accuracy they
// measured themselves; a timestamp means something only when every call, misses included, is sealed.
// Every book of calls is sealed daily under one root, and anyone can recompute it.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LEDGER_BOOKS, freshSealText, ledgerText, parseLedgerText } from "../src/lib/growth/radarLedger.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");

test("every new product shown is a line in the fresh book, misses included, sorted and stable", () => {
  const calls = [
    { id: "1005009000000002", at: "2026-11-17", base: 120.4, due: "2026-12-01" },
    { id: "1005009000000001", at: "2026-11-03", base: 80, due: "2026-11-17", result: "MISS", growth: 12 },
    { id: "1005009000000003", at: "2026-11-02", base: 50, due: "2026-11-16", result: "HIT", growth: 70 },
    { id: "not-an-item", at: "2026-11-17", base: 9, due: "2026-12-01" },
    { id: "1005009000000004", at: "2026-11-17", base: 0, due: "2026-12-01" },
  ];
  const text = freshSealText(calls);
  assert.equal(text, [
    "1005009000000001|2026-11-03|80|2026-11-17|MISS",
    "1005009000000002|2026-11-17|120|2026-12-01|-",
    "1005009000000003|2026-11-02|50|2026-11-16|HIT",
  ].join("\n"));
  assert.equal(freshSealText([...calls].reverse()), text, "the same book always gives the same text");
  assert.equal(freshSealText([]), "");
});

test("one root over every sealed book, in a fixed order; anyone can read it back", () => {
  const parts = { prices: sha("p"), early: sha("e"), fresh: sha("f") };
  const root = ledgerText(parts);
  assert.deepEqual(root.split("\n").map((l) => l.split("=")[0]), ["early", "fresh", "prices"]);
  assert.deepEqual(parseLedgerText(root), parts);
  assert.equal(ledgerText({ early: "not-a-hash" }), null);
  assert.equal(ledgerText({}), null);
  assert.deepEqual(LEDGER_BOOKS, ["early", "fresh", "globe", "prices"]);
});

test("the board keeps the sealed books and drops anything else", () => {
  const fresh = "1005009000000002|2026-11-17|120|2026-12-01|-";
  const root = ledgerText({ fresh: sha(fresh) });
  const ots = [{ cal: "a.pool.opentimestamps.org", b64: "AE9wZW4=" }, { cal: "evil.example", b64: "AA==" }];
  const board = sanitizeBoard({ v: 2, at: "2026-11-17T06:00:00Z", record: {}, concepts: [], fresh: { tracking: 5, risers: [], seal: { d: "2026-11-17", sha256: sha(fresh), count: 1, text: fresh, ots } }, ledger: { d: "2026-11-17", sha256: sha(root), count: 1, text: root, ots } });
  assert.equal(board.fresh.seal.text, fresh);
  assert.deepEqual(board.fresh.seal.ots.map((o) => o.cal), ["a.pool.opentimestamps.org"]);
  assert.equal(board.ledger.text, root);
  const bad = sanitizeBoard({ v: 2, at: "2026-11-17T06:00:00Z", record: {}, concepts: [], ledger: { d: "2026-11-17", sha256: sha(root), text: "<script>", ots: [] }, fresh: { risers: [], seal: { sha256: "nope" } } });
  assert.equal(bad.ledger.text, null, "a text that is not a root is never shown");
  assert.equal(bad.fresh.seal, null);
});

test("the root is public behind the lock: it names no call", () => {
  const root = ledgerText({ early: sha("e") });
  const teaser = teaserBoard({ v: 2, at: "2026-11-17T06:00:00Z", ledger: { d: "2026-11-17", sha256: sha(root), count: 1, text: root, ots: [] }, fresh: { risers: [{ id: "1005009000000002" }] } });
  assert.equal(teaser.ledger.text, root);
  assert.equal(teaser.fresh, undefined, "an open call never reaches a locked visitor");
});

test("the run seals the fresh book and the root; the page shows the ledger", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /board\.fresh\.seal = await sealBook\(/);
  assert.match(run, /board\.ledger = await sealBook\(/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<Ledger ledger=\{board\.ledger\}/);
});
