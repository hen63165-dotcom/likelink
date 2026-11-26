// 🏪 The shops opening (src/lib/growth/shopSignal.js; the owner, 22.11: "for every door that closes, ten
// open"): new domains named for a kind, from the free public daily list, this week against the last.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanShops, mergeShops, nrdUrl, shopNames, shopsOf, shopsToday } from "../src/lib/growth/shopSignal.js";

test("shops: the free daily list, a kind's names in a domain, counted per day", () => {
  assert.equal(nrdUrl("2026-11-21"), `https://www.whoisds.com//whois-database/newly-registered-domains/${Buffer.from("2026-11-21.zip").toString("base64")}/nrd`);
  assert.deepEqual(shopNames("butter stick squishy"), ["buttersticksquishy", "butter-stick-squishy", "sticksquishy", "stick-squishy"]);
  assert.deepEqual(shopNames("lip oil"), [], "too short to mean anything inside a domain");
  const counts = shopsToday(["buttersticksquishy.com", "best-butter-stick-squishy.shop", "mysticksquishy.store", "squishy.com", "random.net"], [{ id: "butter-squishy", en: "butter stick squishy" }, { id: "lip-oil", en: "lip oil" }]);
  assert.deepEqual(counts, { "butter-squishy": 3 });
});

test("shops: this week against the week before; a read day with none is a measured zero", () => {
  let s = {};
  for (const [d, n] of [["2026-11-08", 0], ["2026-11-12", 1], ["2026-11-17", 2], ["2026-11-20", 3]]) s = mergeShops(s, { a: n }, d, ["a", "b"]);
  assert.deepEqual(shopsOf(s.a, "2026-11-20"), { week: 5, prev: 1, days: 2, rising: true });
  assert.deepEqual(shopsOf(s.b, "2026-11-20"), { week: 0, prev: 0, days: 2, rising: false });
  assert.equal(shopsOf({}, "2026-11-20"), null, "no read day, no measurement");
  assert.equal(mergeShops(s, {}, "2026-12-20", [])["a"], undefined, "older than three weeks leaves");
  assert.deepEqual(cleanShops({ week: 5, prev: 1, days: 2, rising: true, domains: ["x.com"] }), { week: 5, prev: 1, days: 2, rising: true });
});

// 🔤 The names new shops pick, with no list: product words cut out of every new domain name.
import { domainWords, mergeShopWords, poissonTail, productVocab, risingShopWords, wordsToday } from "../src/lib/growth/shopSignal.js";

test("shop words: product words from the new listings' titles, never a generic shop word", () => {
  const v = productVocab(["Butter Squishy toy", "squishy butter stick", "Butter squishy mochi", "Official store online shop", "official store best", "store official"]);
  assert.deepEqual([...v].sort(), ["butter", "squishy"]);
  assert.deepEqual(domainWords("buttersquishy.com", v), { words: ["butter", "squishy"], pairs: ["butter squishy"] });
  assert.deepEqual(domainWords("my-butter-squishy.shop", v), { words: ["butter", "squishy"], pairs: ["butter squishy"] });
  assert.deepEqual(domainWords("butterandsquishy.com", v), { words: ["butter", "squishy"], pairs: [] }); // not side by side
  assert.deepEqual(wordsToday(["buttersquishy.com", "squishyland.net", "garden.org"], v), { butter: 1, squishy: 2, "butter squishy": 1 });
});

test("shop words: a pair many more new shops took this week rises; a steady word stays; under 10 days it is measuring", () => {
  let s = { days: [], w: {} };
  const day = (n) => new Date(Date.parse("2026-11-22T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);
  for (let n = 14; n >= 1; n--) {
    const counts = { garden: 20, "butter squishy": n <= 7 ? 3 : 0, butter: n <= 7 ? 3 : 1 };
    s = mergeShopWords(s, counts, day(n));
    if (n === 6) assert.equal(risingShopWords(s, day(n)).measuring, true);
  }
  const r = risingShopWords(s, day(1));
  assert.equal(r.measuring, false);
  assert.deepEqual(r.rising.map((x) => x.key), ["butter squishy"]); // the pair shows its word; the steady word stays out
  assert.equal(r.rising[0].week, 21);
  assert.ok(poissonTail(21, 1) < 1e-15);
  assert.deepEqual(risingShopWords(s, day(1), { skip: (k) => k.includes("squishy") }).rising.map((x) => x.key), ["butter"]);
});
