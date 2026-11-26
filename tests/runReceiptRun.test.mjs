// 🧾 The whole radar run against a network that fails (the owner, 2026-11-21: "add automated tests that
// prove the system never marks a source or a category as a success on an error"). The run is the real
// scripts/catalog/trend-radar.mjs; only the network is fake, answering with real Response objects the
// way each service answers its errors (AliExpress: HTTP 200 with an error_response or a resp_code).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../scripts/catalog/trend-radar.mjs";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { sourcesView } from "../src/lib/growth/radarCore.js";

const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t", RADAR_KINDS: "0", RADAR_OTS: "0" };
const NOW = Date.parse("2026-11-21T14:19:00Z");
const json = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const aeMethod = (init) => new URLSearchParams(String(init?.body || "")).get("method") || "";
const product = (id, orders) => ({ product_id: String(id), product_title: `Silicone Desk Organizer ${id}`, lastest_volume: orders, target_sale_price: "12.5", target_sale_price_currency: "ILS", product_main_image_url: `https://ae01.alicdn.com/kf/S${id}.jpg`, promotion_link: `https://s.click.aliexpress.com/e/_o${id}`, evaluate_rate: "97.0%" });

test("every service fails: no source, no kind, no category and no item is marked as a success", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-fail-"));
  writeFileSync(join(dir, "world-categories.json"), JSON.stringify({ at: "2026-11-21", list: [{ id: "100", name: "Rings" }, { id: "200", name: "Bags" }], cursor: 0 }));
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === "api-sg.aliexpress.com") return json({ error_response: { code: "ApiCallLimit", msg: "limited" } });
    if (u.pathname === "/robots.txt") return json("", 404); // no rules file: every service may be asked
    if (u.hostname === "suggestqueries.google.com") return json("", 500);
    if (u.hostname === "trends.google.com") return json("", 503);
    if (u.hostname.endsWith(".supabase.co")) return json({ message: "JWT expired" }, 401);
    return json("", 503);
  };
  const { board, sources } = await run(dir, { env: ENV, fetchImpl, now: NOW, politeMs: 0, budgetMs: 30_000, suggestBudgetMs: 30_000 });
  const s = board.sourcesToday;
  for (const k of ["aliexpress", "fresh", "discovery", "suggest", "youtube", "worldSearch", "trendsIL", "trendsWorld", "siteProducts", "siteVisitors"]) {
    assert.notEqual(s[k], "OK", `${k} is never OK on an error (claimed ${JSON.stringify(sources[k])})`);
  }
  assert.notEqual(s.world?.state, "OK");
  // The page shows each of them as a failure, a block or a missing connection — by name.
  const view = Object.fromEntries(sourcesView(sanitizeBoard(board).sourcesToday, board.receipt).map((x) => [x.key, x.state]));
  for (const k of ["aliexpress", "fresh", "discovery", "suggest", "trendsIL", "trendsWorld"]) assert.ok(["FAILED", "SKIPPED", "EMPTY"].includes(view[k]), `${k}: ${view[k]}`);
  for (const k of ["pinterest", "youtubeApi"]) assert.equal(view[k], "REQUIRES_CONNECTION", `${k} waits for a connection, named`);
  // Not one unit counted as scanned, and every failure carries its code.
  for (const k of ["concepts", "fresh"]) {
    const t = board.scan[k];
    assert.ok(t.asked > 0, `${k} were asked`);
    assert.equal(t.scanned, 0, `no ${k} unit is "scanned" on an error`);
    assert.equal(t.kept, 0);
    assert.ok(t.failed.length > 0 && t.failed.every((f) => f.code && f.code !== "unknown"), `${k} failures are named: ${JSON.stringify(t.failed.slice(0, 2))}`);
  }
  assert.match(board.scan.concepts.failed[0].code, /^err_ApiCallLimit$/);
  // The receipt says the same from the network itself.
  const ae = board.receipt.sources.aliexpress;
  assert.ok(ae.asked > 0);
  assert.equal(ae.answered, 0);
  assert.equal(ae.kept, 0);
  assert.equal(ae.codes.err_ApiCallLimit, ae.refused);
  assert.equal(board.receipt.sources.suggest.answered, 0);
  assert.ok(board.receipt.sources.suggest.codes.http_500 > 0);
});

test("partly failing: the category the store refused is counted as failed with its code, the one that answered as scanned", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-part-"));
  writeFileSync(join(dir, "world-categories.json"), JSON.stringify({ at: "2026-11-21", list: [{ id: "100", name: "Rings" }, { id: "200", name: "Bags" }, { id: "300", name: "Lamps" }], cursor: 0 }));
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === "api-sg.aliexpress.com") {
      const m = aeMethod(init);
      const p = new URLSearchParams(String(init?.body || ""));
      const cat = p.get("category_ids");
      if (m === "aliexpress.affiliate.product.query" && cat === "200") return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 402, resp_msg: "denied" } } });
      if (m === "aliexpress.affiliate.product.query" && cat === "300") return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 405, resp_msg: "no result" } } });
      if (m === "aliexpress.affiliate.product.query") return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { total_record_count: 900, products: { product: [product(1005000000000011, 640), product(1005000000000012, 310)] } } } } });
      if (m === "aliexpress.affiliate.hotproduct.query") return json({ aliexpress_affiliate_hotproduct_query_response: { resp_result: { resp_code: 200, result: { products: { product: [] } } } } });
      return json({ error_response: { code: "InvalidApiPath" } });
    }
    if (u.pathname === "/robots.txt") return json("", 404);
    if (u.hostname === "suggestqueries.google.com") return json([u.searchParams.get("q"), []]); // valid, nobody searches it: a measurement of 0
    if (u.hostname === "trends.google.com") return json("<rss><channel><item><title>x</title></item></channel></rss>");
    if (u.hostname.endsWith(".supabase.co")) return json([]);
    return json("", 503);
  };
  const { board } = await run(dir, { env: ENV, fetchImpl, now: NOW, politeMs: 0, budgetMs: 30_000, suggestBudgetMs: 5_000 });
  const w = board.scan.world;
  assert.equal(w.asked, 3);
  assert.equal(w.scanned, 2, "200 and 405 are valid answers; the refused one is not scanned");
  assert.equal(w.withData, 1);
  assert.equal(w.kept, 1);
  assert.deepEqual(w.failed, [{ id: "200", name: "Bags", code: "resp_402" }]);
  assert.deepEqual(w.empty, [{ id: "300", name: "Lamps" }]);
  assert.equal(board.sourcesToday.world.readToday, 2);
  assert.equal(board.sourcesToday.world.failed, 1);
  assert.equal(board.sourcesToday.aliexpress, "OK", "kinds were really read and kept");
  assert.ok(board.receipt.sources.aliexpress.kept > 0);
  assert.equal(board.receipt.sources.aliexpress.codes.resp_402, 1);
  // A valid empty suggestion list is a kept measurement (nobody searches it yet), never an error.
  assert.equal(board.sourcesToday.suggest, "OK");
  assert.ok(board.receipt.sources.suggest.empty > 0 && board.receipt.sources.suggest.kept > 0);
  // The site answered with no rows: its products are never "read".
  assert.notEqual(board.sourcesToday.siteProducts, "OK");
  // 📒 The health registry starts from this real run: one run, so reliability is still MEASURING.
  const { readFileSync: rf } = await import("node:fs");
  assert.equal(JSON.parse(rf(join(dir, "receipts.json"), "utf8")).length, 1);
  assert.equal(board.sourceHealth.runs, 1);
  assert.equal(board.sourceHealth.sources.aliexpress.level, "MEASURING");
  assert.ok(board.sourceHealth.sources.aliexpress.lastValid);
});

test("past the run's own deadline, the optional readings are skipped by name and the day is still saved", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-late-"));
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === "api-sg.aliexpress.com") return json({ error_response: { code: "ApiCallLimit", msg: "limited" } });
    if (u.pathname === "/robots.txt") return json("", 404);
    return json("", 503);
  };
  const { board, sources, log } = await run(dir, { env: { ...ENV, RADAR_DEADLINE_MIN: "0.000001" }, fetchImpl, now: NOW, politeMs: 0, budgetMs: 30_000, suggestBudgetMs: 30_000 });
  for (const k of ["trade", "news"]) {
    assert.equal(sources[k], "SKIPPED", `${k} is named as skipped`);
    assert.ok(log.some((l) => l.startsWith(`${k}: skipped, the run's time`)), `${k}: the log says why`);
  }
  assert.ok(board.ledger === null || typeof board.ledger === "object", "the run reached its end and built the board");
  assert.ok(board.receipt, "the receipt is still taken");
  const view = Object.fromEntries(sourcesView(sanitizeBoard(board).sourcesToday, board.receipt).map((x) => [x.key, x.state]));
  assert.equal(view.trade, "SKIPPED", "the page says skipped, never answered");
});
