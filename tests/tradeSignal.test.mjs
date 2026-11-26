// 🚢 The factories' shipments (src/lib/growth/tradeSignal.js): Eurostat's open customs records, every EU
// import line from each partner, the last three months against the same three a year earlier. A line is
// "doubled" only when its value at least doubled AND its weight grew (more goods, not dearer goods), only
// for a shop's goods (never turbojets or scrap, which topped the first real China read on 22.11), and
// never for a line that was new or renamed a year earlier (CN codes change every January).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRADE, cleanTrade, isConsumerLine, latestPeriod, monthBack, parseComext, tradeJumps, tradeUrl, windowsOf } from "../src/lib/growth/tradeSignal.js";

// A JSON-stat answer shaped like Eurostat's (dims freq, reporter, partner, product, flow, indicators, time).
function answer(lines, periods) {
  const products = Object.keys(lines);
  const ind = ["VALUE_IN_EUROS", "QUANTITY_IN_100KG"];
  const value = {};
  products.forEach((code, p) => ind.forEach((which, i) => periods.forEach((per, t) => {
    const v = lines[code][which === "VALUE_IN_EUROS" ? "v" : "kg"]?.[per];
    if (v !== undefined) value[(p * ind.length + i) * periods.length + t] = v;
  })));
  return {
    updated: "2026-11-13T11:00:00+0100",
    id: ["freq", "reporter", "partner", "product", "flow", "indicators", "time"],
    size: [1, 1, 1, products.length, 1, ind.length, periods.length],
    value,
    dimension: {
      product: { category: { index: Object.fromEntries(products.map((c, i) => [c, i])), label: Object.fromEntries(products.map((c) => [c, `label ${c}`])) } },
      indicators: { category: { index: Object.fromEntries(ind.map((c, i) => [c, i])) } },
      time: { category: { index: Object.fromEntries(periods.map((c, i) => [c, i])) } },
    },
  };
}

test("months and windows: the last three against the same three a year earlier", () => {
  assert.equal(monthBack("2026-01", 1), "2025-12");
  assert.equal(monthBack("2026-09", 12), "2025-09");
  assert.deepEqual(windowsOf("2026-09"), { now: ["2026-09", "2026-08", "2026-07"], before: ["2025-09", "2025-08", "2025-07"] });
  const u = tradeUrl("CN", "2026-09");
  assert.match(u, /^https:\/\/ec\.europa\.eu\/eurostat\/api\/comext\/dissemination\/statistics\/1\.0\/data\/DS-045409\?/);
  assert.match(u, /partner=CN/);
  for (const p of ["2026-07", "2026-08", "2026-09", "2025-07", "2025-08", "2025-09"]) assert.match(u, new RegExp(`time=${p}`));
});

test("only a shop's goods count: perfume and toys yes, turbojets and silver scrap never", () => {
  assert.equal(isConsumerLine("33030090"), true);
  assert.equal(isConsumerLine("95030070"), true);
  assert.equal(isConsumerLine("85437007"), true);
  assert.equal(isConsumerLine("84111280"), false); // turbojets
  assert.equal(isConsumerLine("71129900"), false); // silver scrap
  assert.equal(isConsumerLine("950300XX"), false); // never a confidential or aggregate line
});

test("doubled in value and weight → shown; dearer only, renamed or industry → never", () => {
  const P = ["2025-07", "2025-08", "2025-09", "2026-07", "2026-08", "2026-09"];
  const m = (a, b) => ({ "2025-07": a, "2025-08": a, "2025-09": a, "2026-07": b, "2026-08": b, "2026-09": b });
  const json = answer({
    "33030090": { v: m(2_500_000, 6_300_000), kg: m(1000, 3300) }, // perfume: +152% value, +230% weight
    "95030070": { v: m(5_000_000, 11_000_000), kg: m(1000, 1100) }, // toys: dearer, barely more → price only
    "85437007": { v: m(10_000, 2_000_000) }, // new code: under €200k a year earlier
    "84111280": { v: m(300_000, 23_000_000), kg: m(10, 300) }, // turbojets: industry
    "61091000": { v: m(9_000_000, 9_500_000), kg: m(100, 105) }, // T-shirts: steady
  }, P);
  const parsed = parseComext(json);
  assert.equal(parsed.lines.size, 5);
  const t = tradeJumps(parsed, "2026-09");
  assert.equal(t.measured, 4); // the four consumer lines at ≥ €2M now
  assert.equal(t.renamed, 1);
  assert.equal(t.priceOnly, 1);
  assert.equal(t.jumping, 1);
  assert.equal(t.top[0].code, "33030090");
  assert.equal(t.top[0].valuePct, 152);
  assert.equal(t.top[0].kgPct, 230);
  assert.ok(!t.top.some((r) => r.code === "84111280"));
});

test("the newest month is the latest with a value", () => {
  const json = answer({ "95": { v: { "2026-07": 1, "2026-08": 2, "2026-09": 3 } } }, ["2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.equal(latestPeriod(json), "2026-09");
});

test("the browser's copy: CN8 codes only, known partners, text capped", () => {
  const c = cleanTrade({ latest: "2026-09", updated: "2026-11-13T11:00:00+0100", months: ["2026-09", "x"], partners: [
    { id: "CN", measured: 900, jumping: 2, top: [{ code: "33030090", label: "<b>Toilet waters</b>", value: 19e6, prev: 7.4e6, valuePct: 156, kgPct: 230 }, { code: "33XX", valuePct: 1 }] },
    { id: "ZZ", measured: 1, top: [] },
  ] });
  assert.equal(c.partners.length, 1);
  assert.equal(c.partners[0].top.length, 1);
  assert.equal(c.partners[0].top[0].label, "bToilet waters/b");
  assert.deepEqual(c.months, ["2026-09"]);
  assert.equal(cleanTrade({ latest: "soon" }), null);
  assert.equal(TRADE.partners.includes("CN") && TRADE.partners.includes("KR") && TRADE.partners.includes("JP"), true);
});
