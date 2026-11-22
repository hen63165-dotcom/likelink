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
