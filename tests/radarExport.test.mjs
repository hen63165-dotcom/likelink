// ⬇️ From the radar's find to a Wix store (src/lib/growth/radarExport.js) and 🚪 the exit signal
// (radarCore.js exitSignal; the owner, 2026-11-20: "go around Modalyst and everyone"). The file follows
// Wix's own import table (support.wix.com, updated 2026-02-09): Wix's columns in Wix's order, the four
// mandatory fields, images separated by ";", every product hidden until the merchant checks it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXPORT, WIX_COLUMNS, csvCell, exportable, wixCsv, wixRow } from "../src/lib/growth/radarExport.js";
import { EXIT, EXIT_LABELS, exitSignal } from "../src/lib/growth/radarCore.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { MODALYST_URL, WIX_PRODUCTS_URL, searchWords, watchOf } from "../src/lib/growth/wixRadar.js";

const IMG = "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg";
const find = { id: "1005013201890326", title: 'FSLE Women\'s Wide-leg, "Slim" Pants', image: IMG, price: 172.03 };

test("Wix's columns, in Wix's order, with every mandatory field and the numbered option groups", () => {
  for (const c of ["handleId", "fieldType", "name", "price", "productImageUrl", "visible", "cost"]) assert.ok(WIX_COLUMNS.includes(c), c);
  assert.deepEqual(WIX_COLUMNS.slice(0, 16), ["handleId", "fieldType", "name", "description", "productImageUrl", "collection", "sku", "ribbon", "price", "surcharge", "visible", "discountMode", "discountValue", "inventory", "weight", "cost"]);
  assert.equal(WIX_COLUMNS.filter((c) => /^productOption/.test(c)).length, 18);
  assert.equal(WIX_COLUMNS.filter((c) => /^additionalInfo/.test(c)).length, 12);
  assert.equal(WIX_COLUMNS.filter((c) => /^customText/.test(c)).length, 6);
  assert.equal(new Set(WIX_COLUMNS).size, WIX_COLUMNS.length);
});

test("a find becomes a hidden Wix product: cost is the store's price, price is cost × markup", () => {
  const r = wixRow(find, { markup: 2.5 });
  assert.equal(r.handleId, "radar-1005013201890326");
  assert.equal(r.fieldType, "Product");
  assert.equal(r.visible, "FALSE", "nothing goes live before the merchant checks it");
  assert.equal(r.cost, 172.03);
  assert.equal(r.price, Math.ceil(172.03 * 2.5));
  assert.equal(r.sku, "AE-1005013201890326");
  assert.equal(r.productImageUrl, IMG);
  assert.ok(r.name.length <= 80);
  assert.equal(wixRow(find, { markup: 99 }).price, Math.ceil(172.03 * EXPORT.maxMarkup), "the markup is capped");
  assert.equal(wixRow({ ...find, image: "javascript:alert(1)" }).productImageUrl, "", "only the store's own image hosts");
});

test("the file quotes what it must, skips what it cannot carry, and never repeats a product", () => {
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(exportable({ ...find, price: null }), false);
  assert.equal(exportable({ ...find, id: "x" }), false);
  const { csv, count } = wixCsv([find, find, { ...find, id: "1005000000000001", price: 0 }], { markup: 2 });
  assert.equal(count, 1);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], WIX_COLUMNS.join(","));
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^radar-1005013201890326,Product,"FSLE Women's Wide-leg, ""Slim"" Pants",/);
});

test("the exit signal comes from the find's own numbers: running, slowing, or time to exit", () => {
  assert.deepEqual(exitSignal({ momentum: { state: "SLOW", weekPct: 25 } }), { state: "RUNNING", why: null });
  assert.deepEqual(exitSignal({ momentum: { state: "SLOW", weekPct: 4 } }), { state: "SLOWING", why: null });
  assert.deepEqual(exitSignal({ momentum: { state: "COOLING", weekPct: -9 } }), { state: "EXIT", why: "cooling" });
  assert.deepEqual(exitSignal({ momentum: { state: "HOT", weekPct: 30 }, window: { state: "CLOSED", o: 2400, line: 2000 } }), { state: "EXIT", why: "window" });
  assert.deepEqual(exitSignal({ momentum: { state: "HOT", weekPct: 30 }, window: { state: "READY", h: 3, p: EXIT.closeChance } }), { state: "EXIT", why: "closing" });
  assert.deepEqual(exitSignal({ momentum: { state: "UNVERIFIED", weekPct: null } }), { state: "MEASURING", why: null });
  for (const v of Object.values(EXIT_LABELS)) assert.doesNotMatch(v.he, /(^|\s)(לא|אין)(\s|$)|בטוח|מובטח/);
});

test("the board keeps the tracked finds, the Wix page shows them with the plain item page", () => {
  const board = sanitizeBoard({ v: 2, at: "2026-11-24T06:00:00Z", record: {}, concepts: [], fresh: { risers: [], watch: [
    { id: "1005013201890326", title: "Wide-leg", image: IMG, buy: "https://s.click.aliexpress.com/e/_oAbC", price: 172, called: "2026-11-20", due: "2026-12-04", dayN: 4, base: 156, orders: 190, on: "2026-11-24", progress: 21.8, weekPct: 30, exit: "RUNNING", why: null },
    { id: "1005013201890327", title: "Bad", called: "2026-11-20", exit: "SELL_NOW" },
  ] } });
  assert.deepEqual(board.fresh.watch.map((w) => w.exit), ["RUNNING"], "an unknown state never reaches the page");
  const [w] = watchOf(board);
  assert.equal(w.page, "https://www.aliexpress.com/item/1005013201890326.html");
  assert.equal("buy" in w, false, "the Wix page never carries the owner's tracked link");
});

test("the run tracks every earlier find, the page and the Wix page show the exit list and the file", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /board\.fresh\.watch = freshCalls/);
  assert.match(run, /exitSignal\(\{ momentum, window \}\)/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<FindsWatch watch=\{fresh\.watch \|\| \[\]\} \/>/);
  assert.match(page, /<StoreExport finds=/);
  const wix = readFileSync("src/wix/WixRadar.jsx", "utf8");
  assert.match(wix, /wixCsv\(exportList/);
  assert.doesNotMatch(wix, /s\.click|\.buy\b/);
});

test("the Wix dropshipping button: Modalyst's and the store's addresses as Wix's Help Center links them, and plain search words", () => {
  assert.equal(MODALYST_URL, "https://www.modalyst.co/");
  assert.match(WIX_PRODUCTS_URL, /^https:\/\/www\.wix\.com\/my-account\/site-selector\/\?.*actionUrl=https:%2F%2Fwww\.wix\.com%2Fdashboard%2F%7B%7BmetaSiteId%7D%7D%2Fstore%2Fproducts/);
  assert.equal(searchWords({ phrase: "wide leg", title: "x" }), "wide leg");
  assert.equal(searchWords({ title: "FSLE Women's Wide-leg Straight-leg Slim-fit Casual Pants 2026 New" }), "fsle wide leg straight");
  assert.equal(searchWords({ phrase: "<b>", title: "Cat Window Perch for Large Cats" }), "cat window perch large");
  const wix = readFileSync("src/wix/WixRadar.jsx", "utf8");
  assert.match(wix, /window\.open\(MODALYST_URL/);
  assert.match(wix, /searchWords\(r\)/);
});
