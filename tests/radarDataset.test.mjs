// 📦 The radar as data (radarDataset.js, radarOpenData.js): the sealed history counted from the board
// and the public price index only (nothing estimated: what they did not carry is null), every open file
// listed, and the schema.org Dataset in /radar's head made of fixed, true facts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEDGER_SINCE, OPEN_FILES, datasetCard, datasetJsonLd, pricesOf, sealedBooks } from "../src/lib/growth/radarDataset.js";
import { anchorsBoard } from "../src/lib/growth/otsUpgrade.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { SECTION_TABS } from "../src/lib/growth/radarCore.js";
import { sectionSeo } from "../src/lib/publicSeo.js";

const H = (c) => c.repeat(64);
const BLOCK = "0".repeat(16) + "a".repeat(48);

test("the sealed history: days with a root, days inside Bitcoin, the latest block — from the run's own roots", () => {
  const a = anchorsBoard({
    "2026-11-20": { sha256: H("a"), anchor: { height: 977000, block: BLOCK, time: 1795000000, b64: "AAA=" } },
    "2026-11-21": { sha256: H("b"), anchor: { height: 977150, block: BLOCK, time: 1795100000, b64: "AAA=" } },
    "2026-11-22": { sha256: H("c"), ots: [] },
  });
  assert.equal(a.days, 3, "every day with a root, inside Bitcoin or still waiting");
  const board = sanitizeBoard({ at: "2026-11-22T06:00:00Z", concepts: [], record: {}, anchors: a });
  assert.equal(board.anchors.days, 3, "the count survives the sanitizer");
  const card = datasetCard(board);
  assert.deepEqual(card.sealed, { since: "2026-11-20", days: 3, inBitcoin: 2, pending: 1, latest: { d: "2026-11-21", height: 977150, block: BLOCK } });
  assert.equal(sanitizeBoard({ at: "2026-11-22T06:00:00Z", concepts: [], record: {}, anchors: { ...a, days: "many" } }).anchors.days, null);
});

test("today's books and records: a published text's lines, else the seal's own count; an unsealed book is out", () => {
  const board = {
    ledger: { d: "2026-11-26", sha256: H("f"), text: `stages=${H("1")}` },
    stagesSeal: { sha256: H("1"), text: "a|1\nb|2\nc|3", count: 3 },
    promise: { seal: { sha256: H("2"), count: 450 } },
    luck: { seal: { sha256: "not-a-hash", text: "x" } },
  };
  assert.deepEqual(sealedBooks(board), [{ book: "stages", records: 3 }, { book: "promise", records: 450 }]);
  const card = datasetCard(board);
  assert.deepEqual(card.today, { d: "2026-11-26", root: H("f"), books: 2, records: 453, perBook: [{ book: "stages", records: 3 }, { book: "promise", records: 450 }] });
  assert.equal(datasetCard({}).today, null, "no root, no today");
  assert.equal(datasetCard({}).proven, null);
});

test("the price ledger: only the index's own numbers, the honest tally only when it adds up", () => {
  const index = { at: "2026-11-26", first: "2026-11-16", items: 59653, days: 11, seals: { "2026-11-16": { sha256: H("a") }, "2026-11-17": { sha256: H("b") }, bad: { sha256: H("c") } }, tally: { d: "2026-11-26", sales: 338, real: 146, raised: 192 } };
  assert.deepEqual(pricesOf(index), { items: 59653, since: "2026-11-16", sealedDays: 2, tally: { d: "2026-11-26", sales: 338, real: 146, raised: 192 } });
  assert.equal(pricesOf({ ...index, tally: { d: "2026-11-26", sales: 10, real: 8, raised: 9 } }).tally, null, "a tally that does not add up is left out");
  assert.equal(pricesOf({ items: 0, first: "2026-11-16" }), null);
  assert.equal(pricesOf(null), null);
  assert.equal(datasetCard({}, index).prices.items, 59653);
});

test("every open file is https on our hosts; the card lists them; the head's Dataset is fixed and true", () => {
  assert.ok(OPEN_FILES.length >= 6);
  for (const f of OPEN_FILES) {
    assert.match(f.url, /^https:\/\/(likelink2\.vercel\.app|hen63165-dotcom\.github\.io\/likelink)\//, f.id);
    assert.ok(f.he && f.en && f.format, f.id);
  }
  assert.deepEqual(datasetCard({}).files.map((f) => f.id), OPEN_FILES.map((f) => f.id));
  const ld = datasetJsonLd();
  assert.equal(ld["@type"], "Dataset");
  assert.ok(ld.description.length >= 50 && ld.description.length <= 5000, "Google Dataset Search's description length");
  assert.equal(ld.temporalCoverage, `${LEDGER_SINCE}/..`);
  assert.ok(ld.distribution.every((d) => d["@type"] === "DataDownload" && /^https:\/\//.test(d.contentUrl)));
  assert.equal(ld.license, undefined, "no licence is invented: the repository grants none");
  const seo = sectionSeo("radar");
  const lds = typeof seo.jsonLd === "function" ? seo.jsonLd("https://likelink2.vercel.app/radar") : seo.jsonLd;
  assert.ok((Array.isArray(lds) ? lds : [lds]).some((x) => x?.["@type"] === "Dataset"), "/radar's head carries the Dataset");
});

test("wiring: the build writes /radar/dataset.json, the page shows the pool in the proof tab, llms.txt names it", () => {
  const build = readFileSync("scripts/prerender-products.mjs", "utf8");
  assert.match(build, /dist\/radar\/dataset\.json/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<DataPool board=\{board\} \/>/);
  assert.match(page, /id="data"/);
  assert.equal(SECTION_TABS.data, "proof");
  assert.match(readFileSync("public/llms.txt", "utf8"), /radar\/dataset\.json/);
  const pub = readFileSync("src/lib/publicSeo.js", "utf8");
  assert.doesNotMatch(pub, /radarDataset\.js/, "publicSeo stays light: it imports radarOpenData.js only");
});

test("the record per instrument and the auditor's lines: graded first with numbers, waiting books with their grading day", async () => {
  const { recordOf, auditLines, withAuditLines } = await import("../src/lib/growth/radarDataset.js");
  const board = {
    at: "2026-11-26T21:00:00Z",
    ledger: { d: "2026-11-26", sha256: H("f"), text: `stages=${H("1")}\nversus=${H("2")}` },
    record: { calls: 3, graded: 0, hits: 0, pending: 3, nextDue: "2026-12-05" },
    versus: { sheets: 12, horizons: [{ h: 3, nextDue: "2026-11-29", pick: { of: 0, hits: 0 }, rank: { of: 0, hits: 0 } }], seal: { sha256: H("2"), count: 12 } },
    promise: { coverage: [{ h: 3, level: 90, n: 470, held: 421, rate: 89.6 }], open: 450, nextDue: "2026-11-27" },
    anchors: { list: [{ d: "2026-11-25", sha256: H("a"), height: 977538, block: BLOCK }], pending: 1, since: "2026-11-20", days: 7 },
  };
  const rec = recordOf(board);
  assert.equal(rec.day, "2026-11-26");
  const stages = rec.rows.find((r) => r.id === "stages");
  assert.deepEqual([stages.said, stages.graded, stages.result, stages.nextGrading], [3, 0, null, "2026-12-05"]);
  const card = datasetCard(board, { first: "2026-11-16", items: 60425, seals: { "2026-11-26": { sha256: H("b") } } });
  const lines = auditLines(card);
  assert.match(lines[0], /^- The record as of 2026-11-26/);
  assert.ok(lines.some((l) => /421 of 470 3-day order ranges held when the radar said 90%/.test(l)), "the graded record, with its numbers");
  assert.ok(lines.some((l) => /Rising calls: 3 sealed, first grading on 2026-12-05/.test(l)), "a waiting book, with its day");
  assert.ok(lines.some((l) => /sealed head-to-head: 12 sealed, first grading on 2026-11-29/.test(l)));
  assert.ok(lines.some((l) => /Sealed every day since 2026-11-20; 1 days already verified inside Bitcoin blocks \(latest block 977538\)/.test(l)));
  assert.ok(lines.some((l) => /60425 items recorded daily since 2026-11-16, 1 days sealed/.test(l)));
  const txt = "a\n<!-- radar:record -->\nb";
  assert.equal(withAuditLines(txt, null), "a\n\nb", "without a board the marker goes");
  assert.match(withAuditLines(txt, card), /^a\n- The record as of 2026-11-26/);
  assert.match(readFileSync("public/llms.txt", "utf8"), /<!-- radar:record -->/);
  assert.match(readFileSync("scripts/prerender-products.mjs", "utf8"), /withAuditLines\(readFileSync\(llms, "utf8"\), radarCard\)/);
});
