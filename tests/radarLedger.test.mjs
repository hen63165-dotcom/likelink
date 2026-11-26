// The complete sealed ledger (src/lib/growth/radarLedger.js; the owner, 2026-11-17: "a million levels
// above everyone"). The worldwide check that day: the big trend companies publish accuracy they
// measured themselves; a timestamp means something only when every call, misses included, is sealed.
// Every book of calls is sealed daily under one root, and anyone can recompute it.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LEDGER_BOOKS, freshSealText, ledgerText, parseLedgerText, stagesSealText } from "../src/lib/growth/radarLedger.js";
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
  // 21.11: the run receipt (runReceipt.js) joined as the last book, so the order of every earlier book is kept.
  assert.deepEqual(LEDGER_BOOKS, ["early", "stages", "luck", "baseline", "versus", "fresh", "kinds", "prelaunch", "noise", "supply", "brain", "promise", "window", "globe", "prices", "run"]);
  assert.deepEqual(ledgerText({ fresh: sha("f"), stages: sha("s"), early: sha("e") }).split("\n").map((l) => l.split("=")[0]), ["early", "stages", "fresh"]);
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

test("the page keeps a root over every book, the brain and the new kinds included", () => {
  // 20.11: the root carried brain= and the sanitizer dropped its text, so the page showed no root to recompute.
  const books = Object.fromEntries(LEDGER_BOOKS.map((k) => [k, sha(k)]));
  const root = ledgerText(books);
  assert.deepEqual(root.split("\n").map((l) => l.split("=")[0]), LEDGER_BOOKS);
  const board = sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], ledger: { d: "2026-11-20", sha256: sha(root), count: LEDGER_BOOKS.length, text: root, ots: [] } });
  assert.equal(board.ledger.text, root);
  for (const k of LEDGER_BOOKS) {
    const one = ledgerText({ [k]: sha(k) });
    assert.equal(sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], ledger: { d: "2026-11-20", sha256: sha(one), count: 1, text: one, ots: [] } }).ledger.text, one, k);
  }
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

test("every stage call is a line in its own book, misses included; early calls stay in theirs", () => {
  const calls = [
    { concept: "capybara-plush", stage: "RISING", at: "2026-11-16", base: 15787.4, due: "2026-11-30" },
    { concept: "cat-window-perch", stage: "EMERGING", at: "2026-11-03", base: 900, due: "2026-11-17", result: "MISS", growth: 4 },
    { concept: "auto-cloud-slides", stage: "RISING", at: "2026-11-01", base: 300, due: "2026-11-15", result: "HIT", growth: 22 },
    { concept: "squishy", kind: "early", stage: "EMERGING", at: "2026-11-16", base: 40, due: "2026-11-30", signals: ["world"] },
    { concept: "Bad Id", stage: "RISING", at: "2026-11-16", base: 10, due: "2026-11-30" },
    { concept: "steady-thing", stage: "STEADY", at: "2026-11-16", base: 10, due: "2026-11-30" },
  ];
  const text = stagesSealText(calls);
  assert.equal(text, [
    "auto-cloud-slides|2026-11-01|RISING|300|2026-11-15|HIT",
    "capybara-plush|2026-11-16|RISING|15787|2026-11-30|-",
    "cat-window-perch|2026-11-03|EMERGING|900|2026-11-17|MISS",
  ].join("\n"));
  assert.equal(stagesSealText([...calls].reverse()), text, "the same book always gives the same text");
  const board = sanitizeBoard({ v: 2, at: "2026-11-18T06:00:00Z", record: {}, concepts: [], stagesSeal: { d: "2026-11-18", sha256: sha(text), count: 3, text, ots: [] } });
  assert.equal(board.stagesSeal.text, text);
  assert.equal(sanitizeBoard({ v: 2, at: "2026-11-18T06:00:00Z", record: {}, concepts: [], stagesSeal: { d: "2026-11-18", sha256: sha(text), text: "<img src=x>", ots: [] } }).stagesSeal.text, null);
  assert.equal(teaserBoard({ v: 2, at: "2026-11-18T06:00:00Z", stagesSeal: { d: "2026-11-18", sha256: sha(text), text } }).stagesSeal, undefined, "the stage book names open calls: never behind the lock");
});

test("the run seals the stage book into the root; the page explains how anyone checks it", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /board\.stagesSeal = await sealBook\(/);
  assert.match(run, /stages: board\.stagesSeal\?\.sha256/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<Proof record=\{board\?\.record\}/);
  assert.match(page, /L\(RADAR_CLAIM\.he, RADAR_CLAIM\.en\)/, "the page and the static HTML say the one sentence");
  assert.match(page, /לפי בדיקה עולמית מ־\$\{dmy\(RADAR_CLAIM\.checked\)\}/);
});
