// 🧾 The run receipt (src/lib/growth/runReceipt.js; the owner, 2026-11-21: "the transparency area must
// show real data from actual runs, never numbers the system shows by itself when the scan did not
// happen"). The audit that day found three states set without an answer: AliExpress "OK" once its keys
// existed, Google's search "OK" from its robots.txt alone, and a world category "read" when the store
// answered an error. These tests pin the cure: one metered fetch counts every real answer, and a
// source is "read" only when its own host answered in this run.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  aeOutcome, cleanReceipt, measuredStates, meterFetch, newMeter, receiptOf, receiptText, receiptTotals, runOf, searchCountries, sourceOf,
} from "../src/lib/growth/runReceipt.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { sourcesView } from "../src/lib/growth/radarCore.js";

const AE = "https://api-sg.aliexpress.com/sync";
const aeBody = (code) => JSON.stringify({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: code, result: { products: { product: [] } } } } });
const form = (method) => new URLSearchParams({ method: `aliexpress.affiliate.${method}` }).toString();

test("every request belongs to one source, read from its address alone", () => {
  assert.equal(sourceOf(AE), "aliexpress");
  assert.equal(sourceOf("https://suggestqueries.google.com/complete/search?client=firefox&hl=he&gl=il&q=x"), "suggest");
  assert.equal(sourceOf("https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=he&gl=il&q=x"), "youtube");
  assert.equal(sourceOf("https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&q=x"), "worldSearch");
  assert.equal(sourceOf("https://suggestqueries.google.com/robots.txt"), "rules", "reading the rules is a check, never an answer of the source");
  assert.equal(sourceOf("https://trends.google.com/trending/rss?geo=IL"), "trendsIL");
  assert.equal(sourceOf("https://trends.google.com/trending/rss?geo=US"), "trendsWorld");
  assert.equal(sourceOf("https://www.googleapis.com/youtube/v3/search?q=x"), "youtubeApi");
  assert.equal(sourceOf("https://vjitiuirqfysexsxdxqx.supabase.co/rest/v1/kv"), "site");
  assert.equal(sourceOf("https://a.pool.opentimestamps.org/digest"), "seal");
  assert.equal(sourceOf("https://mempool.space/api/block/x"), "bitcoin");
  assert.equal(sourceOf("not a url"), null);
});

test("an AliExpress answer is counted by the store's own code: HTTP 200 carries its errors too", () => {
  assert.equal(aeOutcome(JSON.parse(aeBody(200))), "answered");
  assert.equal(aeOutcome(JSON.parse(aeBody(405))), "empty");
  assert.equal(aeOutcome(JSON.parse(aeBody(402))), "refused");
  assert.equal(aeOutcome({ error_response: { code: "ApiCallLimit" } }), "refused");
  assert.equal(aeOutcome(null), "failed");
});

test("the metered fetch returns the same answer and counts what really came back", async () => {
  const meter = newMeter();
  const answers = [
    () => new Response(aeBody(200), { status: 200 }),
    () => new Response(aeBody(405), { status: 200 }),
    () => new Response(JSON.stringify({ error_response: { code: "x" } }), { status: 200 }),
    () => { throw new Error("network"); },
    () => new Response("[]", { status: 200 }),
    () => new Response("", { status: 429 }),
    () => new Response("User-agent: *", { status: 200 }),
  ];
  let i = 0;
  const f = meterFetch(async () => answers[i++](), meter);
  const r1 = await f(AE, { method: "POST", body: form("product.query") });
  assert.equal(JSON.parse(await r1.text()).aliexpress_affiliate_product_query_response.resp_result.resp_code, 200, "the caller still reads the whole body");
  await f(AE, { method: "POST", body: form("product.query") });
  await f(AE, { method: "POST", body: form("hotproduct.query") });
  await assert.rejects(f(AE, { method: "POST", body: form("productdetail.get") }), /network/);
  await f("https://suggestqueries.google.com/complete/search?hl=ja&gl=jp&q=a");
  await f("https://suggestqueries.google.com/complete/search?hl=ko&gl=kr&q=a");
  await f("https://suggestqueries.google.com/robots.txt");
  const env = { GITHUB_RUN_ID: "44847192706", GITHUB_RUN_ATTEMPT: "1", GITHUB_REPOSITORY: "hen63165-dotcom/likelink", GITHUB_SERVER_URL: "https://github.com", GITHUB_SHA: "a".repeat(40), GITHUB_EVENT_NAME: "schedule" };
  const receipt = receiptOf(meter, { env, started: Date.parse("2026-11-21T14:19:00Z"), finished: Date.parse("2026-11-21T14:50:00Z") });
  assert.deepEqual(receipt.sources.aliexpress, {
    asked: 4, answered: 1, empty: 1, refused: 1, failed: 1,
    methods: { "product.query": { asked: 2, answered: 1, empty: 1, refused: 0, failed: 0 }, "hotproduct.query": { asked: 1, answered: 0, empty: 0, refused: 1, failed: 0 }, "productdetail.get": { asked: 1, answered: 0, empty: 0, refused: 0, failed: 1 } },
  });
  assert.deepEqual(receipt.sources.worldSearch, { asked: 2, answered: 1, empty: 0, refused: 1, failed: 0, countries: ["jp"] }, "a country counts only when it answered");
  assert.deepEqual(searchCountries(receipt), ["jp"]);
  assert.equal(receipt.sources.rules.answered, 1);
  assert.deepEqual(receiptTotals(receipt), { asked: 6, answered: 2, empty: 1, refused: 2, failed: 1 }, "robots.txt, the seal and Bitcoin are checks, counted apart");
  assert.equal(receipt.run.url, "https://github.com/hen63165-dotcom/likelink/actions/runs/44847192706");
  const text = receiptText(receipt);
  assert.equal(text.split("\n")[0], `run|44847192706|1|${"a".repeat(40)}|schedule|2026-11-21T14:19:00.000Z|2026-11-21T14:50:00.000Z`);
  assert.match(text, /^aliexpress\|4\|1\|1\|1\|1$/m);
  assert.match(text, /^aliexpress\.product\.query\|2\|1\|1\|0\|0$/m);
  assert.match(text, /^worldSearch\.countries\|jp$/m);
  assert.equal(receiptText(receipt), text, "the same counts always give the same text (and so the same hash)");
});

test("a claimed state stands only on a real answer from its own host", () => {
  const receipt = { sources: { aliexpress: { asked: 10, answered: 0, empty: 0, refused: 10, failed: 0 }, rules: { asked: 1, answered: 1 }, trendsIL: { asked: 1, answered: 1 } } };
  const claimed = { aliexpress: "OK", world: { categories: 564, readToday: 120 }, fresh: "OK", suggest: "OK", youtube: "OK", trendsIL: "OK", kinds: "OK", promise: "OK", pinterest: "REQUIRES_CONNECTION", engine_baidu: "ROBOTS_DISALLOW_OR_FAILED" };
  assert.deepEqual(measuredStates(claimed, receipt), {
    aliexpress: "FAILED", world: "FAILED", fresh: "FAILED", // asked, the store refused every request
    suggest: "NOT_ASKED", youtube: "NOT_ASKED", // only its robots.txt was read
    trendsIL: "OK", kinds: "OK", promise: "OK", // a real answer; the radar's own computations
    pinterest: "REQUIRES_CONNECTION", engine_baidu: "ROBOTS_DISALLOW_OR_FAILED",
  });
  const view = Object.fromEntries(sourcesView(measuredStates(claimed, receipt), receipt).map((x) => [x.key, x.state]));
  assert.equal(view.aliexpress, "FAILED");
  assert.equal(view.suggest, "SKIPPED");
});

test("the board keeps only the receipt's counts, a strict run link and a sealed text; public behind the lock", () => {
  const text = "run|1|1|-|schedule|2026-11-21T14:19:00.000Z|2026-11-21T14:50:00.000Z\naliexpress|4|1|1|1|1";
  const sha = createHash("sha256").update(text).digest("hex");
  const board = sanitizeBoard({ v: 2, at: "2026-11-21T14:50:00Z", record: {}, concepts: [], receipt: {
    v: 1, started: "2026-11-21T14:19:00.000Z", finished: "2026-11-21T14:50:00.000Z",
    run: { id: "1", url: "https://github.com/hen63165-dotcom/likelink/actions/runs/1", sha: "b".repeat(40), event: "schedule" },
    sources: { aliexpress: { asked: 4, answered: 1, empty: 1, refused: 1, failed: 1, methods: { "product.query": { asked: 4, answered: 1 }, "<x>": { asked: 1 } } }, worldSearch: { asked: 2, answered: 1, countries: ["jp", "zz", "<b>"] }, evil: { asked: 9 } },
    seal: { d: "2026-11-21", sha256: sha, count: 2, text, ots: [] },
  } });
  assert.deepEqual(Object.keys(board.receipt.sources), ["aliexpress", "worldSearch"]);
  assert.deepEqual(Object.keys(board.receipt.sources.aliexpress.methods), ["product.query"]);
  assert.deepEqual(board.receipt.sources.worldSearch.countries, ["jp"]);
  assert.equal(board.receipt.seal.text, text);
  assert.equal(createHash("sha256").update(board.receipt.seal.text).digest("hex"), board.receipt.seal.sha256, "anyone recomputes the fingerprint from the published text");
  assert.equal(cleanReceipt({ ...board.receipt, run: { id: "1", url: "https://evil.example/actions/runs/1" } }).run, null, "only this repository's public log");
  assert.equal(cleanReceipt({ started: "yesterday" }), null);
  assert.equal(cleanReceipt({ ...board.receipt, seal: { ...board.receipt.seal, text: "<script>" } }).seal.text, null);
  assert.deepEqual(teaserBoard(board).receipt, board.receipt, "counts only: public behind the lock");
  assert.equal(runOf({ GITHUB_RUN_ID: "1", GITHUB_REPOSITORY: "someone/else" }), null);
});

test("the run meters every request, counts world categories from real answers, and seals the receipt as a book", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /fetchImpl = meterFetch\(fetchImpl, meter\);/);
  assert.match(run, /board\.sourcesToday = measuredStates\(sources, receipt\);/);
  assert.match(run, /const rootText = ledgerText\(\{ run: board\.receipt\?\.seal\?\.sha256,/);
  assert.match(run, /const answered = code === 200 \|\| code === 405;/, "a store error is never a category read");
  assert.doesNotMatch(run, /read\+\+;\n\s*if \(!rot\.slice/, "the old unconditional count is gone");
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<SourcesToday sources=\{board\.sourcesToday\} receipt=\{board\.receipt \|\| null\} \/>/);
  assert.match(page, /היומן הציבורי של הריצה, מ־GitHub:/);
  // No fixed claim of what is read: Baidu and Naver are closed by their own rules today.
  assert.doesNotMatch(page, /באידו בסין|נייבר בקוריאה|גוגל ב־8 מדינות|ב־10 מדינות/);
  assert.doesNotMatch(readFileSync("public/llms.txt", "utf8"), /564 categories|in 15 countries|each of 15 countries/);
});
