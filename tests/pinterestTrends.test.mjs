// Pinterest's own trends (src/lib/growth/pinterestTrends.js; the owner, 2026-11-17: "Pinterest +
// YouTube"): the official API only, with the owner's token; Latin store words, no brand, no unlisted
// kind, fastest week first; without the token nothing is asked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PINTEREST, pinterestTerms, pinterestTrendsUrl } from "../src/lib/growth/pinterestTrends.js";

test("the official endpoint, fashion and beauty, no token in the address", () => {
  const url = pinterestTrendsUrl();
  assert.match(url, /^https:\/\/api\.pinterest\.com\/v5\/trends\/keywords\/US\/top\/growing\?/);
  assert.match(decodeURIComponent(url), /interests=womens_fashion,mens_fashion,beauty/);
  assert.doesNotMatch(url, /token|bearer/i);
  assert.equal(PINTEREST.region, "US");
});

test("keywords: Latin store words only, no brand or unlisted kind, fastest week first", () => {
  const terms = pinterestTerms({ trends: [
    { keyword: "Burgundy Outfit", pct_growth_wow: 40, pct_growth_mom: 90 },
    { keyword: "old money aesthetic", pct_growth_wow: 120 },
    { keyword: "chanel bag", pct_growth_wow: 500 },
    { keyword: "vape pen", pct_growth_wow: 300 },
    { keyword: "שמלה", pct_growth_wow: 900 },
    { keyword: "burgundy outfit", pct_growth_wow: 10 },
    { keyword: "boho skirt" },
  ] });
  assert.deepEqual(terms.map((t) => t.term), ["old money aesthetic", "burgundy outfit", "boho skirt"]);
  assert.equal(terms[2].wow, null, "a number Pinterest did not send stays null");
  assert.deepEqual(pinterestTerms({}), []);
  assert.deepEqual(pinterestTerms(null), []);
});

test("the run asks Pinterest only with the owner's token, never logs it, and keeps it apart from Google's trends", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /sources\.pinterest = env\.PINTEREST_TOKEN \? "NOT_ASKED" : "REQUIRES_CONNECTION"/);
  assert.doesNotMatch(run, /log\.push\([^)]*PINTEREST_TOKEN/);
  assert.doesNotMatch(run, /abroadTerms\.pinterest/, "Google's trending searches are the 'trends' finish line: Pinterest stays apart");
  assert.match(readFileSync(".github/workflows/trend-radar.yml", "utf8"), /PINTEREST_TOKEN: \$\{\{ secrets\.PINTEREST_TOKEN \}\}/);
});
