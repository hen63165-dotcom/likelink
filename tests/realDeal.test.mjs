// 🏷️ המבצע האמיתי (the owner, 2026-11-16: "תחשוב ותבצע"): prices only as the store answered them,
// one per item per day, each day sealed by its exact text; a sale is "real" only under the usual
// recorded price; a sale that only undoes a recent raise says so; too little history says since when.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addPrice, dayText, dealLines, dealShareText, dealVerdict, honestTally, priceShard, shardsOf, sniffPrices } from "../src/lib/growth/realDeal.js";
import { writeLedger } from "../scripts/catalog/price-ledger.mjs";

const answer = (products) => ({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: products } } } } });

test("only shekel prices from the store's own answers, one per item per day", () => {
  const ledger = {};
  const n = sniffPrices(answer([
    { product_id: "1005000000000001", target_sale_price: "19.9", target_sale_price_currency: "ILS" },
    { product_id: "1005000000000002", target_sale_price: "5", target_sale_price_currency: "USD" },
    { product_id: "bad", target_sale_price: "5", target_sale_price_currency: "ILS" },
  ]), "2026-11-17", ledger);
  assert.equal(n, 1);
  assert.deepEqual(ledger["1005000000000001"], [["2026-11-17", 19.9]]);
  sniffPrices(answer([{ product_id: "1005000000000001", target_sale_price: "18", target_sale_price_currency: "ILS" }]), "2026-11-17", ledger);
  assert.deepEqual(ledger["1005000000000001"], [["2026-11-17", 18]], "the latest the same day wins");
  assert.equal(sniffPrices(null, "2026-11-17", ledger), 0);
});

const s = (pairs) => pairs.reduce((acc, [d, p]) => addPrice(acc, [d, p]), []);
const steady = s([["2026-11-10", 40], ["2026-11-12", 40], ["2026-11-14", 41], ["2026-11-16", 40]]);

test("verdicts from the recorded history only", () => {
  assert.equal(dealVerdict([], { price: 30 }).state, "UNTRACKED");
  assert.equal(dealVerdict(s([["2026-11-16", 40]]), { price: 30, today: "2026-11-17" }).state, "SHORT");
  assert.equal(dealVerdict(steady, { price: 30, today: "2026-11-27" }).state, "REAL_LOW");
  assert.equal(dealVerdict(s([["2026-11-10", 40], ["2026-11-12", 30], ["2026-11-14", 41], ["2026-11-16", 40]]), { price: 36, today: "2026-11-27" }).state, "LOWER");
  const raised = s([["2026-11-10", 40], ["2026-11-12", 40], ["2026-11-14", 40], ["2026-11-20", 55], ["2026-11-22", 56]]);
  const v = dealVerdict(raised, { price: 40, today: "2026-11-27" });
  assert.equal(v.state, "RAISED");
  assert.equal(v.high.p, 56);
  assert.equal(dealVerdict(steady, { price: 40, today: "2026-11-27" }).state, "SAME");
  assert.equal(dealVerdict(steady, { price: 50, today: "2026-11-27" }).state, "HIGHER");
});

test("words say what IS, with the recorded numbers; nothing to share without a measured verdict", () => {
  const v = dealVerdict(s([["2026-11-10", 40], ["2026-11-12", 40], ["2026-11-14", 40], ["2026-11-20", 55]]), { price: 40, today: "2026-11-27" });
  const w = dealLines(v);
  assert.ok(w.text.includes("₪55") && w.text.includes("20.11"));
  assert.ok(!/\bלא\b|\bאין\b|מבטיח/.test(Object.values(dealLines(dealVerdict(steady, { price: 30, today: "2026-11-27" }))).join(" ")));
  assert.ok(dealShareText(v, "מתקן סבון").includes("חתומים בביטקוין"));
  assert.equal(dealShareText({ state: "SHORT" }), "");
});

test("the sealed day text, the shards and the public tally", () => {
  const ledger = { "1005000000000001": steady, "1005000000000002": s([["2026-11-16", 9.5]]) };
  assert.equal(dayText(ledger, "2026-11-16"), "1005000000000001|40\n1005000000000002|9.5");
  assert.equal(priceShard("1005000000000002"), "02");
  assert.deepEqual(Object.keys(shardsOf(ledger)).sort(), ["01", "02"]);
  const day = "2026-11-27";
  const withSales = {
    a: addPrice(steady, [day, 30]),
    b: addPrice(s([["2026-11-10", 40], ["2026-11-12", 40], ["2026-11-14", 40], ["2026-11-20", 55]]), [day, 40]),
    c: addPrice(steady, [day, 40]),
  };
  assert.deepEqual(honestTally(withSales, day), { d: day, sales: 2, real: 1, raised: 1 }, "a: a real sale under the usual price; b: back to normal after a raise; c: no sale");
});

test("the deploy writes 100 shards, the sealed day texts and the index", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const src = join(dir, "prices-public.json");
  const ledger = { "1005000000000001": steady };
  writeFileSync(src, JSON.stringify({ ledger, seals: { "2026-11-16": { sha256: "a".repeat(64), n: 1, ots: [] } } }));
  const index = writeLedger(src, join(dir, "out"));
  assert.equal(index.items, 1);
  assert.equal(readFileSync(join(dir, "out", "days", "2026-11-16.txt"), "utf8"), dayText(ledger, "2026-11-16"));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "out", "01.json"), "utf8"))["1005000000000001"], steady);
  assert.equal(JSON.parse(readFileSync(join(dir, "out", "00.json"), "utf8"))["x"], undefined);
});
