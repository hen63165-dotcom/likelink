import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAIJsonl, collectOpenAIProducts } from "../src/lib/openAiProductFeed.js";

const base = {
  id: "p-1", status: "approved", marketerId: "creator-1",
  title: "Product", description: "Factual description", brand: "Northline",
  sellerName: "Seller One", image: "https://cdn.example.com/item.jpg", price: 19.9,
};

test("OpenAI feed emits stable JSONL rows with required discovery and geo fields", () => {
  const result = buildOpenAIJsonl({ products: [base], marketers: [{ id: "creator-1" }] });
  assert.equal(result.count, 1);
  const row = JSON.parse(result.body.trim());
  assert.equal(row.item_id, "p-1");
  assert.equal(row.availability, "unknown");
  assert.equal(row.price, "19.90 ILS");
  assert.deepEqual(row.target_countries, ["IL"]);
  assert.equal(row.store_country, "IL");
  assert.equal(row.is_eligible_ads, false);
});

test("feed excludes rows with invented/missing seller or brand data", () => {
  const result = collectOpenAIProducts({
    products: [base, { ...base, id: "p-2", brand: "" }, { ...base, id: "p-3", sellerName: "" }],
    marketers: [{ id: "creator-1" }],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.skipped.missingBrand, 1);
  assert.equal(result.skipped.missingSeller, 1);
});

test("feed excludes unapproved, unattributed, invalid price and invalid image rows", () => {
  const result = collectOpenAIProducts({
    products: [
      { ...base, id: "p-2", status: "pending" },
      { ...base, id: "p-3", marketerId: "missing" },
      { ...base, id: "p-4", price: 0 },
      { ...base, id: "p-5", image: "javascript:alert(1)" },
    ],
    marketers: [{ id: "creator-1" }],
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.notApproved, 1);
  assert.equal(result.skipped.missingCreator, 1);
  assert.equal(result.skipped.missingPrice, 1);
  assert.equal(result.skipped.missingImage, 1);
});
